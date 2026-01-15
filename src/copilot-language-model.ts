import type {
    LanguageModelV3,
    LanguageModelV3CallOptions,
    LanguageModelV3GenerateResult,
    LanguageModelV3StreamResult,
    LanguageModelV3Content,
    LanguageModelV3FinishReason,
    LanguageModelV3Usage,
    SharedV3Warning,
} from '@ai-sdk/provider';
import {
    CopilotClient,
    CopilotSession,
    type SessionEvent,
} from '@github/copilot-sdk';
import { mapPromptToCopilotFormat } from './message-mapper.js';
import { mapCopilotError } from './error.js';
import {
    mapEventToStreamParts,
    createStreamContext,
    mapFinishReason,
    getDefaultUsage,
} from './event-mapper.js';
import type { CopilotProviderOptions, CopilotModelSettings } from './types.js';

export interface CopilotLanguageModelOptions {
    modelId: string;
    providerOptions: CopilotProviderOptions;
    settings?: CopilotModelSettings;
}

/**
 * AI SDK V3 Language Model implementation for GitHub Copilot.
 *
 * Bridges the stateless AI SDK model interface to the session-based
 * Copilot SDK by lazily initializing and managing persistent sessions.
 */
export class CopilotLanguageModel implements LanguageModelV3 {
    readonly specificationVersion = 'v3' as const;
    readonly provider = 'copilot';
    readonly modelId: string;
    readonly supportedUrls = {};

    private client?: CopilotClient;
    private session?: CopilotSession;
    private sessionPromise?: Promise<CopilotSession>;

    constructor(private options: CopilotLanguageModelOptions) {
        this.modelId = options.modelId;
    }

    /**
     * Ensures a client exists, creating one if necessary.
     */
    private ensureClient(): CopilotClient {
        if (!this.client) {
            this.client = new CopilotClient({
                cliPath: this.options.providerOptions.cliPath,
                cliUrl: this.options.providerOptions.cliUrl,
                cwd: this.options.providerOptions.cwd,
                cliArgs: this.options.providerOptions.cliArgs,
                useStdio: this.options.providerOptions.useStdio,
                env: this.options.providerOptions.env,
                logLevel: this.options.providerOptions.logLevel ?? 'info',
            });
        }
        return this.client;
    }

    /**
     * Ensures a session exists, creating one if necessary.
     */
    private async ensureSession(streaming = false): Promise<CopilotSession> {
        // For simplicity in Phase 1, we create a fresh session for each call
        // to ensure stateless behavior per the AI SDK pattern.
        // We may optimize this in Phase 5 with session pooling.
        const client = this.ensureClient();

        const session = await client.createSession({
            model: this.modelId,
            provider: this.options.providerOptions.provider,
            systemMessage: this.options.settings?.systemMessage,
            availableTools: this.options.settings?.availableTools,
            excludedTools: this.options.settings?.excludedTools,
            streaming,
        });

        return session;
    }

    async doGenerate(
        options: LanguageModelV3CallOptions
    ): Promise<LanguageModelV3GenerateResult> {
        const session = await this.ensureSession(false);
        const warnings: SharedV3Warning[] = [];

        // Map AI SDK prompt to Copilot format
        const prompt = mapPromptToCopilotFormat(options.prompt);

        // Set up abort signal handling
        if (options.abortSignal) {
            options.abortSignal.addEventListener(
                'abort',
                async () => {
                    try {
                        await session.abort();
                    } catch {
                        // Ignore abort errors
                    }
                },
                { once: true }
            );
        }

        // Collect response via events
        return new Promise<LanguageModelV3GenerateResult>((resolve, reject) => {
            const content: LanguageModelV3Content[] = [];
            let usage: LanguageModelV3Usage | undefined;
            let finishReason: LanguageModelV3FinishReason | undefined;
            let responseId: string | undefined;
            let responseTimestamp: Date | undefined;
            const textParts: string[] = [];

            const unsubscribe = session.on((event: SessionEvent) => {
                switch (event.type) {
                    case 'assistant.message':
                        // Accumulate text content
                        if ('content' in event.data && typeof event.data.content === 'string') {
                            textParts.push(event.data.content);
                        }
                        responseId = event.id;
                        responseTimestamp = new Date(event.timestamp);
                        break;

                    case 'turn.end':
                        // Turn complete - finalize response
                        unsubscribe();

                        // Combine all text parts into single content
                        if (textParts.length > 0) {
                            content.push({ type: 'text', text: textParts.join('') });
                        }

                        finishReason = { unified: 'stop', raw: 'complete' };

                        // Cleanup session after this turn
                        session.destroy().catch(() => {
                            // Ignore cleanup errors
                        });

                        resolve({
                            content,
                            finishReason: finishReason ?? {
                                unified: 'stop',
                                raw: 'unknown',
                            },
                            usage: usage ?? {
                                inputTokens: {
                                    total: undefined,
                                    noCache: undefined,
                                    cacheRead: undefined,
                                    cacheWrite: undefined,
                                },
                                outputTokens: {
                                    total: undefined,
                                    text: undefined,
                                    reasoning: undefined,
                                },
                            },
                            warnings,
                            request: { body: prompt },
                            response: {
                                id: responseId ?? crypto.randomUUID(),
                                timestamp: responseTimestamp ?? new Date(),
                                modelId: this.modelId,
                            },
                        });
                        break;

                    case 'session.error':
                        unsubscribe();
                        session.destroy().catch(() => {
                            // Ignore cleanup errors
                        });

                        if ('message' in event.data) {
                            reject(mapCopilotError(new Error(event.data.message as string)));
                        } else {
                            reject(mapCopilotError(new Error('Unknown session error')));
                        }
                        break;
                }
            });

            // Send the prompt
            session.send({ prompt }).catch((error) => {
                unsubscribe();
                session.destroy().catch(() => {
                    // Ignore cleanup errors
                });
                reject(mapCopilotError(error));
            });
        });
    }

    async doStream(
        options: LanguageModelV3CallOptions
    ): Promise<LanguageModelV3StreamResult> {
        const session = await this.ensureSession(true);
        const warnings: SharedV3Warning[] = [];

        // Map AI SDK prompt to Copilot format
        const prompt = mapPromptToCopilotFormat(options.prompt);

        // Create stream context for tracking state
        const context = createStreamContext(warnings);

        // Capture references for closure
        const modelId = this.modelId;

        // Track abort listener for cleanup
        let abortListener: (() => void) | undefined;

        // Create the ReadableStream
        const stream = new ReadableStream<import('@ai-sdk/provider').LanguageModelV3StreamPart>({
            start: (controller) => {
                // Set up abort signal handling
                if (options.abortSignal) {
                    if (options.abortSignal.aborted) {
                        const abortError = new Error('Request aborted');
                        abortError.name = 'AbortError';
                        controller.error(abortError);
                        return;
                    }

                    abortListener = () => {
                        session.abort().catch(() => { });
                        const abortError = new Error('Request aborted');
                        abortError.name = 'AbortError';
                        controller.error(abortError);
                    };
                    options.abortSignal.addEventListener('abort', abortListener, { once: true });
                }

                // Emit stream-start with warnings
                controller.enqueue({
                    type: 'stream-start',
                    warnings: context.warnings,
                });

                // Subscribe to session events
                const unsubscribe = session.on((event: SessionEvent) => {
                    try {
                        if (options.abortSignal?.aborted) return;

                        switch (event.type) {
                            case 'assistant.message_delta':
                            case 'assistant.message':
                            case 'assistant.reasoning_delta':
                            case 'assistant.reasoning':
                            case 'assistant.usage':
                            case 'assistant.turn_start': {
                                const parts = mapEventToStreamParts(event, context);
                                for (const part of parts) {
                                    controller.enqueue(part);
                                }
                                break;
                            }

                            case 'turn.end': {
                                // Close any open blocks that weren't explicitly closed
                                if (context.textStarted && context.textBlockId) {
                                    controller.enqueue({ type: 'text-end', id: context.textBlockId });
                                }
                                if (context.reasoningStarted && context.reasoningBlockId) {
                                    controller.enqueue({ type: 'reasoning-end', id: context.reasoningBlockId });
                                }

                                // Emit response metadata and finish
                                controller.enqueue({
                                    type: 'response-metadata',
                                    id: event.id,
                                    timestamp: new Date(event.timestamp),
                                    modelId: modelId,
                                });
                                controller.enqueue({
                                    type: 'finish',
                                    finishReason: mapFinishReason(),
                                    usage: context.usage ?? getDefaultUsage(),
                                });

                                // Cleanup and close
                                unsubscribe();
                                if (options.abortSignal && abortListener) {
                                    options.abortSignal.removeEventListener('abort', abortListener);
                                }
                                session.destroy().catch(() => { });
                                controller.close();
                                break;
                            }

                            case 'session.error': {
                                const errorMessage = 'message' in event.data
                                    ? (event.data.message as string)
                                    : 'Unknown session error';
                                controller.enqueue({ type: 'error', error: new Error(errorMessage) });

                                const errorType = event.data.errorType as string | undefined;
                                if (errorType === 'fatal') {
                                    unsubscribe();
                                    if (options.abortSignal && abortListener) {
                                        options.abortSignal.removeEventListener('abort', abortListener);
                                    }
                                    session.destroy().catch(() => { });
                                    controller.error(mapCopilotError(new Error(errorMessage)));
                                }
                                break;
                            }

                            case 'abort': {
                                unsubscribe();
                                if (options.abortSignal && abortListener) {
                                    options.abortSignal.removeEventListener('abort', abortListener);
                                }
                                const reason = event.data.reason as string | undefined;
                                const abortError = new Error(reason || 'Request aborted');
                                abortError.name = 'AbortError';
                                session.destroy().catch(() => { });
                                controller.error(abortError);
                                break;
                            }
                        }
                    } catch (error) {
                        unsubscribe();
                        if (options.abortSignal && abortListener) {
                            options.abortSignal.removeEventListener('abort', abortListener);
                        }
                        session.destroy().catch(() => { });
                        controller.error(mapCopilotError(error));
                    }
                });

                // Send the prompt
                session.send({ prompt }).catch((error) => {
                    unsubscribe();
                    if (options.abortSignal && abortListener) {
                        options.abortSignal.removeEventListener('abort', abortListener);
                    }
                    session.destroy().catch(() => { });
                    controller.error(mapCopilotError(error));
                });
            },

            cancel: () => {
                if (options.abortSignal && abortListener) {
                    options.abortSignal.removeEventListener('abort', abortListener);
                }
                session.abort().catch(() => { });
                session.destroy().catch(() => { });
            },
        });

        return {
            stream,
            request: { body: prompt },
        };
    }

    /**
     * Cleanup resources.
     * Call this when you're done using the model to free up CLI resources.
     */
    async dispose(): Promise<void> {
        if (this.session) {
            await this.session.destroy();
            this.session = undefined;
            this.sessionPromise = undefined;
        }
        if (this.client) {
            await this.client.stop();
            this.client = undefined;
        }
    }
}
