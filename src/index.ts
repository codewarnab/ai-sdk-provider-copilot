/**
 * AI SDK Provider for GitHub Copilot
 *
 * This package provides a Vercel AI SDK V3 compatible provider
 * for GitHub Copilot, allowing you to use Copilot models with
 * the standard AI SDK interfaces.
 *
 * @example
 * ```typescript
 * import { createCopilotProvider } from 'ai-sdk-provider-copilot';
 * import { generateText } from 'ai';
 *
 * const copilot = createCopilotProvider();
 * const model = copilot('gpt-4');
 *
 * const result = await generateText({
 *   model,
 *   prompt: 'Hello, world!'
 * });
 * 
 * // Don't forget to dispose when done
 * await copilot.dispose();
 * ```
 *
 * @packageDocumentation
 */

// Provider factory
export { createCopilotProvider } from './copilot-provider.js';
export type { CopilotProvider } from './copilot-provider.js';

// Language model
export { CopilotLanguageModel } from './copilot-language-model.js';
export type { CopilotLanguageModelOptions } from './copilot-language-model.js';

// Types
export type {
    CopilotProviderOptions,
    CopilotModelSettings,
    CopilotCallOptions,
    SystemMessageConfig,
    ProviderConfig,
    MCPServerConfig,
    MCPLocalServerConfig,
    MCPRemoteServerConfig,
    CustomAgentConfig,
    // Phase 5: Production readiness types
    Logger,
    RetryOptions,
    CopilotErrorMetadata,
    ErrorCategory,
} from './types.js';

// Error utilities (Phase 5: Enhanced)
export {
    mapCopilotError,
    isRetryableError,
    createAbortError,
    classifyError,
    createCopilotAPIError,
    getRecoveryHint,
    isErrorCategory,
} from './error.js';

// Message mapping utilities
export { mapPromptToCopilotFormat, extractLatestUserMessage } from './message-mapper.js';

// Event mapping utilities (streaming)
export {
    mapEventToStreamParts,
    createStreamContext,
    mapUsageEvent,
    mapFinishReason,
    getDefaultUsage,
    type StreamContext,
    type ToolRequest,
} from './event-mapper.js';

// Tool mapping utilities
export {
    mapToolsToCopilotFormat,
    mapToolChoiceToCopilotFormat,
    cleanJsonSchema,
    isFunctionTool,
    extractFunctionTools,
    type CopilotToolSchema,
    type ToolChoiceResult,
} from './tool-mapper.js';

// Agent resolver utilities (Phase 4)
export {
    isAgentModelId,
    extractAgentName,
    resolveAgent,
    getAgentModelId,
    buildAgentSystemMessage,
    validateAgentConfigs,
} from './agent-resolver.js';

// MCP configuration utilities (Phase 4)
export {
    validateMcpConfig,
    mergeMcpConfigs,
    type McpValidationResult,
} from './mcp-config.js';

// Structured output utilities (Phase 4)
export {
    processStructuredOutput,
    parseJsonResponse,
    type StructuredOutputConfig,
    type StructuredOutputResult,
    type StructuredOutputWarning,
} from './structured-output.js';

// Reasoning mapper utilities (Phase 4)
export {
    createReasoningContext,
    mapReasoningEventToStreamParts,
    createReasoningContent,
    type ReasoningContext,
    type LanguageModelV3Reasoning,
} from './reasoning-mapper.js';

// Phase 5: Client manager utilities
export {
    ClientManager,
    createClientManager,
    type ClientState,
} from './client-manager.js';

// Phase 5: Retry utilities
export {
    withRetry,
    createRetryable,
    mergeRetryOptions,
    calculateDelay,
    shouldRetry,
    DEFAULT_RETRY_OPTIONS,
} from './retry.js';

// Phase 5: Telemetry utilities
export {
    getLogger,
    createVerboseLogger,
    withTiming,
    createRequestContext,
    formatWithContext,
    type TimingResult,
    type RequestContext,
} from './telemetry.js';

// ============================================================================
// Phase 6: Observability & Advanced Tooling
// ============================================================================

// OpenTelemetry Tracing
export {
    createTracer,
    GEN_AI_ATTRIBUTES,
    type CopilotTracer,
    type SpanHandle,
    type GenerationSpanOptions,
} from './observability/index.js';

// OpenTelemetry Metrics
export {
    createMetrics,
    METRIC_NAMES,
    type CopilotMetrics,
    type RecordRequestOptions,
} from './observability/index.js';

// Session Pool
export { SessionPool, DEFAULT_POOL_CONFIG } from './pool/index.js';

// Health Monitor
export {
    HealthMonitor,
    DEFAULT_HEALTH_CONFIG,
    type HealthStatus,
} from './pool/index.js';

// Testing Utilities
export {
    createMockClient,
    createMockSession,
    type MockClientOptions,
    type MockSessionOptions,
    type MockClientTestHelpers,
    type MockSessionTestHelpers,
    type MockCopilotClient,
    type MockCopilotSession,
} from './testing/index.js';

// Phase 6 Types
export type {
    TelemetryConfig,
    SessionPoolConfig,
    HealthMonitorConfig,
} from './types.js';

// ============================================================================
// Phase 7: Caching & Context Propagation
// ============================================================================

// Cache
export { wrapWithCache, DEFAULT_CACHE_CONFIG } from './cache/index.js';
export { createMemoryCache, DEFAULT_MEMORY_CACHE_OPTIONS } from './cache/index.js';
export { createNoopCache } from './cache/index.js';
export { generateCacheKey, hashPrompt } from './cache/index.js';
export type { CacheAdapter, CacheConfig, CacheKeyOptions } from './types.js';
export type { MemoryCacheOptions } from './cache/index.js';

// Context Propagation
export {
    createPropagator,
    DEFAULT_PROPAGATION_CONFIG,
} from './propagation/index.js';
export type { ContextPropagator } from './propagation/index.js';
export type { PropagationConfig } from './types.js';

