/**
 * Context propagation module for distributed tracing.
 * @module propagation
 */

export {
    createPropagator,
    DEFAULT_PROPAGATION_CONFIG,
    type ContextPropagator,
} from './trace-context.js';

// Re-export types from main types module
export type { PropagationConfig } from '../types.js';
