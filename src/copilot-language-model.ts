/**
 * Copilot Language Model implementation for the Vercel AI SDK V3.
 * 
 * Bridges the stateless AI SDK model interface to the session-based
 * Copilot SDK, providing both streaming and non-streaming generation.
 * 
 * @module copilot-language-model
 */

import type {
    LanguageModelV3,
    LanguageModelV3CallOptions,
    LanguageModelV3GenerateResult,
    LanguageModelV3StreamResult,
    LanguageModelV3Content,
    LanguageModelV3FinishReason,
    LanguageModelV3Usage,
    SharedV3Warning,
    LanguageModelV3ToolCall,
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
    type ToolRequest,
} from './event-mapper.js';
import { mapToolChoiceToCopilotFormat } from './tool-mapper.js';
import { processStructuredOutput } from './structured-output.js';
import { createReasoningContext, createReasoningContent } from './reasoning-mapper.js';
import { mergeMcpConfigs } from './mcp-config.js';
import { isAgentModelId, resolveAgent, buildAgentSystemMessage, getAgentModelId } from './agent-resolver.js';
import type { ClientManager } from './client-manager.js';
import { withRetry, mergeRetryOptions } from './retry.js';
import { createRequestContext, withTiming } from './telemetry.js';
import type { CopilotProviderOptions, CopilotModelSettings, CopilotCallOptions, Logger } from './types.js';

/**
 * Options for creating a CopilotLanguageModel instance.
 */
export interface CopilotLanguageModelOptions {
    /** The model ID to use */
    modelId: string;
    /** Provider-level configuration options */
    providerOptions: CopilotProviderOptions;
    /** Model-specific settings */
    settings?: CopilotModelSettings;
    /** Shared client manager from provider (Phase 5) */
    clientManager?: ClientManager;
    /** Logger instance from provider (Phase 5) */
    logger?: Logger;
}

/**
 * No-op logger for when none is provided.
 */
const noopLogger: Logger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};

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
    private clientManager?: ClientManager;
    private logger: Logger;

    constructor(private options: CopilotLanguageModelOptions) {
        this.modelId = options.modelId;
        this.clientManager = options.clientManager;
        this.logger = options.logger ?? noopLogger;
    }

    /**
     * Ensures a client exists, creating one if necessary.
     * Uses shared client manager if available, otherwise creates new client.
     */
    private async ensureClient(): Promise<CopilotClient> {
        // Use shared client manager if available (Phase 5)
        if (this.clientManager) {
            return this.clientManager.acquire();
        }

        // Fallback to creating own client (backward compatibility)
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
     * Releases client reference when using shared client manager.
     */
    private releaseClient(): void {
        if (this.clientManager) {
            this.clientManager.release();
        }
    }

    /**
     * Ensures a session exists, creating one if necessary.
     * Supports Phase 4 features: BYOK, MCP servers, custom agents, structured output.
     */
    private async ensureSession(
        client: CopilotClient,
        streaming = false,
        callOptions?: CopilotCallOptions,
        structuredOutputAppend?: string
    ): Promise<CopilotSession> {
        // Check if this is an agent model or agent specified via call options
        let agent = resolveAgent(this.modelId, this.options.providerOptions.customAgents);

        // Call-level agent selection takes precedence
        if (callOptions?.agent && !agent) {
            agent = this.options.providerOptions.customAgents?.find(a => a.name === callOptions.agent) ?? null;
            if (!agent) {
                const availableAgents = this.options.providerOptions.customAgents?.map(a => a.name).join(', ') || 'none';
                throw new Error(`Custom agent '${callOptions.agent}' not found. Available agents: ${availableAgents}`);
            }
        }

        // Determine actual model ID
        const actualModelId = agent
            ? getAgentModelId(agent)
            : (isAgentModelId(this.modelId) ? undefined : this.modelId);

        // Determine system message (agent overrides settings)
        let systemMessage = agent
            ? buildAgentSystemMessage(agent)
            : this.options.settings?.systemMessage;

        // Append structured output instructions if needed
        if (structuredOutputAppend && systemMessage) {
            if (systemMessage.mode === 'replace') {
                systemMessage = {
                    mode: 'replace',
                    content: systemMessage.content + structuredOutputAppend,
                };
            } else {
                systemMessage = {
                    mode: 'append',
                    content: (systemMessage.content || '') + structuredOutputAppend,
                };
            }
        } else if (structuredOutputAppend) {
            systemMessage = {
                mode: 'append',
                content: structuredOutputAppend,
            };
        }

        // Merge MCP configs: provider-level + agent-level + call-level
        const providerMcpServers = this.options.providerOptions.mcpServers;
        const agentMcpServers = agent?.mcpServers;
        const callMcpServers = callOptions?.mcpServers;
        const mergedMcpServers = mergeMcpConfigs(
            mergeMcpConfigs(providerMcpServers, agentMcpServers),
            callMcpServers
        );

        // Determine provider config (model-level overrides provider-level)
        const providerConfig = this.options.settings?.provider
            ?? this.options.providerOptions.provider;

        const session = await client.createSession({
            model: actualModelId,
            provider: providerConfig,
            systemMessage,
            availableTools: this.options.settings?.availableTools,
            excludedTools: this.options.settings?.excludedTools,
            streaming,
            mcpServers: mergedMcpServers,
            customAgents: agent ? [agent] : this.options.providerOptions.customAgents,
        });

        return session;
    }

    async doGenerate(
        options: LanguageModelV3CallOptions
    ): Promise<LanguageModelV3GenerateResult> {
        const ctx = createRequestContext(this.modelId);
        this.logger.info(`[${ctx.requestId}] Starting doGenerate for ${this.modelId}`);

        const warnings: SharedV3Warning[] = [];

        // Extract Copilot-specific call options
        const callOptions = options.providerOptions?.copilot as CopilotCallOptions | undefined;

        // Merge retry options from provider and call level
        const retryOptions = mergeRetryOptions(
            this.options.providerOptions.retry,
            callOptions?.retry
        );

        try {
            // Wrap main logic with retry
            const result = await withRetry(
                async () => {
                    const { result, durationMs } = await withTiming(
                        () => this.executeGenerate(options, warnings),
                        this.logger,
                        `generate:${ctx.requestId}`
                    );

                    this.logger.info(`[${ctx.requestId}] doGenerate completed in ${durationMs}ms`);
                    return result;
                },
                retryOptions,
                this.logger
            );

            return result;
        } catch (error) {
            this.logger.error(`[${ctx.requestId}] doGenerate failed: ${error}`);
            throw mapCopilotError(error);
        }
    }

    private async executeGenerate(
        options: LanguageModelV3CallOptions,
        warnings: SharedV3Warning[]
    ): Promise<LanguageModelV3GenerateResult> {
        // Handle structured output (system prompt injection - only viable approach)
        let structuredOutputAppend: string | undefined;
        if (options.responseFormat?.type === 'json' && options.responseFormat.schema) {
            const structuredResult = processStructuredOutput({
                hasSchema: true,
                schema: options.responseFormat.schema,
                name: options.responseFormat.name,
                description: options.responseFormat.description,
            });
            warnings.push(...structuredResult.warnings);
            structuredOutputAppend = structuredResult.systemMessageAppend;
        }

        // Get per-call options
        const callOptions = options.providerOptions?.copilot as CopilotCallOptions | undefined;

        // Acquire client and create session
        const client = await this.ensureClient();
        const session = await this.ensureSession(client, false, callOptions, structuredOutputAppend);

        try {
            // Handle tool choice - emit warning if unsupported
            if (options.toolChoice) {
                const toolChoiceResult = mapToolChoiceToCopilotFormat(options.toolChoice);
                if (!toolChoiceResult.supported && toolChoiceResult.warning) {
                    warnings.push({
                        type: 'unsupported',
                        feature: 'toolChoice',
                        details: toolChoiceResult.warning,
                    });
                }
            }

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

            // Create reasoning context for non-streaming (auto-detect from events)
            const reasoningContext = createReasoningContext();

            // Collect response via events
            return new Promise<LanguageModelV3GenerateResult>((resolve, reject) => {
                const content: LanguageModelV3Content[] = [];
                let usage: LanguageModelV3Usage | undefined;
                let finishReason: LanguageModelV3FinishReason | undefined;
                let responseId: string | undefined;
                let responseTimestamp: Date | undefined;
                const textParts: string[] = [];
                const toolCalls: LanguageModelV3ToolCall[] = [];

                const unsubscribe = session.on((event: SessionEvent) => {
                    switch (event.type) {
                        case 'assistant.message':
                            // Accumulate text content
                            if ('content' in event.data && typeof event.data.content === 'string') {
                                textParts.push(event.data.content);
                            }
                            responseId = event.id;
                            responseTimestamp = new Date(event.timestamp);

                            // Handle tool requests (return-to-caller model)
                            const toolRequests = event.data.toolRequests as ToolRequest[] | undefined;
                            if (toolRequests && toolRequests.length > 0) {
                                for (const req of toolRequests) {
                                    toolCalls.push({
                                        type: 'tool-call',
                                        toolCallId: req.toolCallId,
                                        toolName: req.name,
                                        input: JSON.stringify(req.arguments ?? {}),
                                        providerExecuted: false,
                                    });
                                }
                            }
                            break;

                        case 'assistant.reasoning':
                            // Capture reasoning for final response (auto-detected)
                            reasoningContext.accumulatedReasoning = event.data.content as string;
                            reasoningContext.reasoningBlockId = event.data.reasoningId as string;
                            break;

                        case 'assistant.turn_end':
                            // Turn complete - finalize response
                            unsubscribe();

                            // Include reasoning content if available (always include per DP-6)
                            const reasoningContent = createReasoningContent(reasoningContext);
                            if (reasoningContent) {
                                content.push(reasoningContent as LanguageModelV3Content);
                            }

                            // Combine all text parts into single content
                            if (textParts.length > 0) {
                                content.push({ type: 'text', text: textParts.join('') });
                            }

                            // Add tool calls to content
                            for (const toolCall of toolCalls) {
                                content.push(toolCall);
                            }

                            // Set finish reason based on whether tools were called
                            finishReason = toolCalls.length > 0
                                ? { unified: 'tool-calls', raw: 'tool_calls' }
                                : { unified: 'stop', raw: 'complete' };

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
        } finally {
            // Release client reference
            this.releaseClient();
        }
    }

    async doStream(
        options: LanguageModelV3CallOptions
    ): Promise<LanguageModelV3StreamResult> {
        const ctx = createRequestContext(this.modelId);
        this.logger.info(`[${ctx.requestId}] Starting doStream for ${this.modelId}`);

        const warnings: SharedV3Warning[] = [];

        // Handle structured output (system prompt injection - only viable approach)
        let structuredOutputAppend: string | undefined;
        if (options.responseFormat?.type === 'json' && options.responseFormat.schema) {
            const structuredResult = processStructuredOutput({
                hasSchema: true,
                schema: options.responseFormat.schema,
                name: options.responseFormat.name,
                description: options.responseFormat.description,
            });
            warnings.push(...structuredResult.warnings);
            structuredOutputAppend = structuredResult.systemMessageAppend;
        }

        // Get per-call options
        const callOptions = options.providerOptions?.copilot as CopilotCallOptions | undefined;

        // Acquire client and create session with all Phase 4 features
        const client = await this.ensureClient();
        const session = await this.ensureSession(client, true, callOptions, structuredOutputAppend);

        // Handle tool choice - emit warning if unsupported
        if (options.toolChoice) {
            const toolChoiceResult = mapToolChoiceToCopilotFormat(options.toolChoice);
            if (!toolChoiceResult.supported && toolChoiceResult.warning) {
                warnings.push({
                    type: 'unsupported',
                    feature: 'toolChoice',
                    details: toolChoiceResult.warning,
                });
            }
        }

        // Map AI SDK prompt to Copilot format
        const prompt = mapPromptToCopilotFormat(options.prompt);

        // Create stream context for tracking state
        const context = createStreamContext(warnings);

        // Capture references for closure
        const modelId = this.modelId;
        const logger = this.logger;
        const releaseClient = () => this.releaseClient();

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
                        releaseClient();
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

                            case 'assistant.turn_end': {
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
                                    finishReason: mapFinishReason(undefined, context.hasToolCalls),
                                    usage: context.usage ?? getDefaultUsage(),
                                });

                                // Cleanup and close
                                unsubscribe();
                                if (options.abortSignal && abortListener) {
                                    options.abortSignal.removeEventListener('abort', abortListener);
                                }
                                session.destroy().catch(() => { });
                                releaseClient();
                                logger.info(`[${ctx.requestId}] doStream completed`);
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
                                    releaseClient();
                                    logger.error(`[${ctx.requestId}] doStream failed: ${errorMessage}`);
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
                                releaseClient();
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
                        releaseClient();
                        logger.error(`[${ctx.requestId}] doStream error: ${error}`);
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
                    releaseClient();
                    logger.error(`[${ctx.requestId}] doStream send failed: ${error}`);
                    controller.error(mapCopilotError(error));
                });
            },

            cancel: () => {
                if (options.abortSignal && abortListener) {
                    options.abortSignal.removeEventListener('abort', abortListener);
                }
                session.abort().catch(() => { });
                session.destroy().catch(() => { });
                releaseClient();
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
     * Note: If using a shared client manager from provider, use provider.dispose() instead.
     */
    async dispose(): Promise<void> {
        if (this.session) {
            await this.session.destroy();
            this.session = undefined;
        }
        if (this.client) {
            await this.client.stop();
            this.client = undefined;
        }
    }
}
