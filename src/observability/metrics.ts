/**
 * OpenTelemetry metrics integration for the Copilot provider.
 *
 * Provides counter and histogram recording for request latency,
 * token usage, and error tracking.
 *
 * @module observability/metrics
 */

import type { TelemetryConfig } from '../types.js';

// Lazy import to avoid requiring OTel as hard dependency
let metricsApi: typeof import('@opentelemetry/api') | undefined;

async function getMetricsApi() {
    if (!metricsApi) {
        try {
            metricsApi = await import('@opentelemetry/api');
        } catch {
            // OTel not available
        }
    }
    return metricsApi;
}

/**
 * Metric name constants following OTel conventions.
 */
export const METRIC_NAMES = {
    REQUEST_DURATION: 'copilot.request.duration',
    REQUEST_COUNT: 'copilot.request.count',
    TOKEN_INPUT: 'copilot.token.input',
    TOKEN_OUTPUT: 'copilot.token.output',
    ERROR_COUNT: 'copilot.error.count',
    SESSION_ACTIVE: 'copilot.session.active',
    SESSION_REUSED: 'copilot.session.reused',
} as const;

/**
 * Options for recording a request.
 */
export interface RecordRequestOptions {
    /** Model ID used for the request */
    modelId: string;
    /** Operation type */
    operation: 'generate' | 'stream';
    /** Request duration in milliseconds */
    durationMs: number;
    /** Number of input tokens */
    inputTokens?: number;
    /** Number of output tokens */
    outputTokens?: number;
    /** Whether the request succeeded */
    success: boolean;
    /** Error category if failed */
    errorCategory?: string;
}

/**
 * Creates metrics recorder for the provider.
 *
 * @param config - Telemetry configuration
 * @returns A metrics object with recording methods
 */
export function createMetrics(config: TelemetryConfig) {
    const serviceName = config.serviceName ?? 'copilot-ai-sdk-provider';

    let meter: import('@opentelemetry/api').Meter | undefined;
    let requestDuration: import('@opentelemetry/api').Histogram | undefined;
    let requestCount: import('@opentelemetry/api').Counter | undefined;
    let tokenInputCount: import('@opentelemetry/api').Counter | undefined;
    let tokenOutputCount: import('@opentelemetry/api').Counter | undefined;
    let errorCount: import('@opentelemetry/api').Counter | undefined;

    async function ensureInitialized(): Promise<boolean> {
        if (meter) return true;

        const api = await getMetricsApi();
        if (!api || !config.meterProvider) return false;

        const meterProvider = config.meterProvider as import('@opentelemetry/api').MeterProvider;
        meter = meterProvider.getMeter(serviceName, '1.0.0');

        requestDuration = meter.createHistogram(METRIC_NAMES.REQUEST_DURATION, {
            unit: 'ms',
            description: 'Duration of LLM requests',
        });

        requestCount = meter.createCounter(METRIC_NAMES.REQUEST_COUNT, {
            description: 'Total number of LLM requests',
        });

        tokenInputCount = meter.createCounter(METRIC_NAMES.TOKEN_INPUT, {
            description: 'Total input tokens consumed',
        });

        tokenOutputCount = meter.createCounter(METRIC_NAMES.TOKEN_OUTPUT, {
            description: 'Total output tokens generated',
        });

        errorCount = meter.createCounter(METRIC_NAMES.ERROR_COUNT, {
            description: 'Total errors encountered',
        });

        return true;
    }

    return {
        /**
         * Records a completed request with latency and token usage.
         *
         * @param options - Request recording options
         */
        async recordRequest(options: RecordRequestOptions): Promise<void> {
            if (!(await ensureInitialized())) return;

            const attributes = {
                model: options.modelId,
                operation: options.operation,
                success: String(options.success),
            };

            requestDuration?.record(options.durationMs, attributes);
            requestCount?.add(1, attributes);

            if (options.inputTokens !== undefined) {
                tokenInputCount?.add(options.inputTokens, { model: options.modelId });
            }

            if (options.outputTokens !== undefined) {
                tokenOutputCount?.add(options.outputTokens, { model: options.modelId });
            }

            if (!options.success && options.errorCategory) {
                errorCount?.add(1, {
                    model: options.modelId,
                    category: options.errorCategory,
                });
            }
        },
    };
}

/**
 * Type for the metrics recorder returned by createMetrics.
 */
export type CopilotMetrics = ReturnType<typeof createMetrics>;
