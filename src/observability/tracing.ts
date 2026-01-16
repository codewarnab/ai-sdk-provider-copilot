/**
 * OpenTelemetry tracing integration for the Copilot provider.
 *
 * Provides span creation and attribute management following
 * OpenTelemetry Gen AI semantic conventions.
 *
 * @module observability/tracing
 */

import type { TelemetryConfig } from '../types.js';

// Lazy import to avoid requiring OTel as hard dependency
let traceApi: typeof import('@opentelemetry/api') | undefined;

async function getTraceApi() {
    if (!traceApi) {
        try {
            traceApi = await import('@opentelemetry/api');
        } catch {
            // OTel not available
        }
    }
    return traceApi;
}

/**
 * Semantic convention attribute names for Gen AI operations.
 * Based on OpenTelemetry Gen AI semantic conventions.
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export const GEN_AI_ATTRIBUTES = {
    SYSTEM: 'gen_ai.system',
    REQUEST_MODEL: 'gen_ai.request.model',
    REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
    REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
    REQUEST_TOP_P: 'gen_ai.request.top_p',
    RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',
    USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
    USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
    // Copilot-specific attributes
    SESSION_ID: 'copilot.session.id',
    STREAMING: 'copilot.streaming',
    TOOL_COUNT: 'copilot.tool_count',
} as const;

/**
 * Options for starting a generation span.
 */
export interface GenerationSpanOptions {
    /** Operation name: 'doGenerate' or 'doStream' */
    operation: 'doGenerate' | 'doStream';
    /** Model ID being used */
    modelId: string;
    /** Whether streaming is enabled */
    streaming?: boolean;
    /** Maximum output tokens */
    maxTokens?: number;
    /** Temperature parameter */
    temperature?: number;
    /** Top-p parameter */
    topP?: number;
    /** Number of tools provided */
    toolCount?: number;
}

/**
 * Handle for an active span with helper methods.
 */
export interface SpanHandle {
    /** The underlying OTel span (null if OTel not available) */
    span: unknown | null;
    /** Sets the session ID attribute */
    setSessionId(sessionId: string): void;
    /** Records token usage */
    recordUsage(inputTokens: number | undefined, outputTokens: number | undefined): void;
    /** Records the finish reason */
    recordFinishReason(reason: string): void;
    /** Records an error */
    recordError(error: Error): void;
    /** Ends the span */
    end(): void;
}

/**
 * Creates an OpenTelemetry tracer for the provider.
 *
 * @param config - Telemetry configuration
 * @returns A tracer object with span creation methods
 */
export function createTracer(config: TelemetryConfig) {
    const serviceName = config.serviceName ?? 'copilot-ai-sdk-provider';

    return {
        /**
         * Starts a span for a generation operation.
         *
         * @param options - Span options including operation type and attributes
         * @returns A span handle with helper methods
         */
        async startGenerationSpan(options: GenerationSpanOptions): Promise<SpanHandle> {
            const api = await getTraceApi();
            if (!api || !config.tracerProvider) {
                return {
                    span: null,
                    setSessionId: () => { },
                    recordUsage: () => { },
                    recordFinishReason: () => { },
                    recordError: () => { },
                    end: () => { },
                };
            }

            const tracerProvider = config.tracerProvider as import('@opentelemetry/api').TracerProvider;
            const tracer = tracerProvider.getTracer(serviceName, '1.0.0');

            const span = tracer.startSpan(`copilot.${options.operation}`, {
                kind: api.SpanKind.CLIENT,
                attributes: {
                    [GEN_AI_ATTRIBUTES.SYSTEM]: 'copilot',
                    [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: options.modelId,
                    [GEN_AI_ATTRIBUTES.STREAMING]: options.streaming ?? false,
                    ...(options.maxTokens !== undefined && {
                        [GEN_AI_ATTRIBUTES.REQUEST_MAX_TOKENS]: options.maxTokens,
                    }),
                    ...(options.temperature !== undefined && {
                        [GEN_AI_ATTRIBUTES.REQUEST_TEMPERATURE]: options.temperature,
                    }),
                    ...(options.topP !== undefined && {
                        [GEN_AI_ATTRIBUTES.REQUEST_TOP_P]: options.topP,
                    }),
                    ...(options.toolCount !== undefined && {
                        [GEN_AI_ATTRIBUTES.TOOL_COUNT]: options.toolCount,
                    }),
                },
            });

            return {
                span,
                setSessionId(sessionId: string) {
                    span.setAttribute(GEN_AI_ATTRIBUTES.SESSION_ID, sessionId);
                },
                recordUsage(inputTokens: number | undefined, outputTokens: number | undefined) {
                    if (inputTokens !== undefined) {
                        span.setAttribute(GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS, inputTokens);
                    }
                    if (outputTokens !== undefined) {
                        span.setAttribute(GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS, outputTokens);
                    }
                },
                recordFinishReason(reason: string) {
                    span.setAttribute(GEN_AI_ATTRIBUTES.RESPONSE_FINISH_REASONS, [reason]);
                },
                recordError(error: Error) {
                    span.recordException(error);
                    span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
                },
                end() {
                    span.end();
                },
            };
        },
    };
}

/**
 * Type for the tracer returned by createTracer.
 */
export type CopilotTracer = ReturnType<typeof createTracer>;
