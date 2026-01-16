import type { PropagationConfig, Logger } from '../types.js';

// Lazy import OTel propagation API
let propagationApi: typeof import('@opentelemetry/api') | undefined;

async function getPropagationApi() {
    if (!propagationApi) {
        try {
            propagationApi = await import('@opentelemetry/api');
        } catch {
            // OTel not available
        }
    }
    return propagationApi;
}

/**
 * Default propagation configuration.
 */
export const DEFAULT_PROPAGATION_CONFIG: Required<Omit<PropagationConfig, 'baggage'>> = {
    extractContext: true,
    injectContext: true,
};

/**
 * Context propagator for distributed tracing.
 */
export interface ContextPropagator {
    /**
     * Extracts trace context from carrier (e.g., HTTP headers).
     */
    extract(carrier: Record<string, string | undefined>): Promise<unknown | null>;

    /**
     * Injects trace context into carrier (e.g., outgoing headers).
     */
    inject(carrier: Record<string, string>): Promise<void>;

    /**
     * Runs a function within a given context.
     */
    with<T>(context: unknown, fn: () => Promise<T>): Promise<T>;

    /**
     * Gets the current trace ID if available.
     */
    getTraceId(): Promise<string | undefined>;
}

/**
 * Creates a context propagator for distributed tracing.
 * Uses OpenTelemetry propagation API when available.
 */
export function createPropagator(
    config: PropagationConfig = {},
    logger?: Logger
): ContextPropagator {
    const mergedConfig = { ...DEFAULT_PROPAGATION_CONFIG, ...config };

    return {
        /**
         * Extracts trace context from carrier (e.g., HTTP headers).
         */
        async extract(carrier: Record<string, string | undefined>): Promise<unknown | null> {
            if (!mergedConfig.extractContext) return null;

            const api = await getPropagationApi();
            if (!api) {
                logger?.debug('[propagation] OTel not available, skipping extraction');
                return null;
            }

            const context = api.propagation.extract(
                api.context.active(),
                carrier,
                api.defaultTextMapGetter
            );

            logger?.debug('[propagation] Extracted context from carrier');
            return context;
        },

        /**
         * Injects trace context into carrier (e.g., outgoing headers).
         */
        async inject(carrier: Record<string, string>): Promise<void> {
            if (!mergedConfig.injectContext) return;

            const api = await getPropagationApi();
            if (!api) {
                logger?.debug('[propagation] OTel not available, skipping injection');
                return;
            }

            // Add custom baggage if configured
            let context = api.context.active();

            if (config.baggage) {
                const baggageEntries: Record<string, { value: string }> = {};
                for (const [key, value] of Object.entries(config.baggage)) {
                    baggageEntries[key] = { value };
                }
                const baggage = api.propagation.createBaggage(baggageEntries);
                context = api.propagation.setBaggage(context, baggage);
            }

            api.propagation.inject(context, carrier, api.defaultTextMapSetter);

            logger?.debug('[propagation] Injected context into carrier');
        },

        /**
         * Runs a function within a given context.
         */
        async with<T>(context: unknown, fn: () => Promise<T>): Promise<T> {
            const api = await getPropagationApi();
            if (!api || !context) {
                return fn();
            }

            return api.context.with(context as import('@opentelemetry/api').Context, fn);
        },

        /**
         * Gets the current trace ID if available.
         */
        async getTraceId(): Promise<string | undefined> {
            const api = await getPropagationApi();
            if (!api) return undefined;

            const span = api.trace.getActiveSpan();
            return span?.spanContext().traceId;
        },
    };
}
