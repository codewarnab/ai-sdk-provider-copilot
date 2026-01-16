/**
 * Observability module exports for OpenTelemetry integration.
 *
 * @module observability
 */

// Tracing
export {
    createTracer,
    GEN_AI_ATTRIBUTES,
    type CopilotTracer,
    type SpanHandle,
    type GenerationSpanOptions,
} from './tracing.js';

// Metrics
export {
    createMetrics,
    METRIC_NAMES,
    type CopilotMetrics,
    type RecordRequestOptions,
} from './metrics.js';
