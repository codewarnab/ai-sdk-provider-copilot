import type {
    CopilotClientOptions,
    SystemMessageConfig,
} from '@github/copilot-sdk';

// ============================================================================
// Phase 5: Production Readiness Types
// ============================================================================

/**
 * Logger interface for debugging and observability.
 * Matches Gemini CLI pattern for consistency.
 */
export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

/**
 * Retry configuration options.
 * Controls automatic retry behavior for transient failures.
 */
export interface RetryOptions {
    /**
     * Maximum number of retry attempts
     * @default 3
     */
    maxRetries?: number;

    /**
     * Initial delay in milliseconds before first retry
     * @default 100
     */
    initialDelayMs?: number;

    /**
     * Maximum delay in milliseconds (caps exponential backoff)
     * @default 5000
     */
    maxDelayMs?: number;

    /**
     * Backoff multiplier applied after each retry
     * @default 2
     */
    backoffMultiplier?: number;

    /**
     * Jitter percentage (0-1) to add randomness to delays
     * @default 0.1
     */
    jitter?: number;

    /**
     * Custom function to determine if an error is retryable.
     * Overrides default classification when provided.
     */
    isRetryable?: (error: unknown) => boolean;
}

/**
 * Error category for classification
 */
export type ErrorCategory = 'connection' | 'authentication' | 'rate-limit' | 'session' | 'request' | 'internal';

/**
 * Error metadata for observability and recovery
 */
export interface CopilotErrorMetadata {
    /** Error category for classification */
    category: ErrorCategory;
    /** Whether the error is retryable */
    isRetryable: boolean;
    /** Suggested action for recovery */
    recoveryHint?: string;
    /** Number of retry attempts made */
    retryAttempts?: number;
    /** Original error if wrapped */
    cause?: unknown;
}

// ============================================================================
// Phase 6: Observability & Advanced Tooling Types
// ============================================================================

/**
 * OpenTelemetry configuration options.
 * All OpenTelemetry types are `unknown` to avoid hard dependency on @opentelemetry/api.
 */
export interface TelemetryConfig {
    /**
     * OpenTelemetry TracerProvider instance.
     * If provided, spans will be created for each operation.
     * @example
     * import { trace } from '@opentelemetry/api';
     * telemetry: { tracerProvider: trace.getTracerProvider() }
     */
    tracerProvider?: unknown; // TracerProvider from @opentelemetry/api

    /**
     * OpenTelemetry MeterProvider instance.
     * If provided, metrics will be recorded for operations.
     */
    meterProvider?: unknown; // MeterProvider from @opentelemetry/api

    /**
     * Service name for telemetry identification.
     * @default 'copilot-ai-sdk-provider'
     */
    serviceName?: string;

    /**
     * Whether to record input/output content in spans.
     * Set to false for privacy in production.
     * @default false
     */
    recordContent?: boolean;
}

/**
 * Session pool configuration options.
 */
export interface SessionPoolConfig {
    /**
     * Whether to enable session reuse.
     * When true, sessions with matching configs may be reused.
     * @default false
     */
    enabled?: boolean;

    /**
     * Maximum number of idle sessions to keep in pool.
     * @default 3
     */
    maxIdleSessions?: number;

    /**
     * Time in milliseconds before an idle session is evicted.
     * @default 300000 (5 minutes)
     */
    idleTimeoutMs?: number;

    /**
     * Whether to validate session health before reuse.
     * @default true
     */
    validateBeforeReuse?: boolean;
}

/**
 * Health monitoring configuration.
 */
export interface HealthMonitorConfig {
    /**
     * Number of consecutive failures before marking unhealthy.
     * @default 3
     */
    failureThreshold?: number;

    /**
     * Time window in ms for failure counting (sliding window).
     * @default 60000 (1 minute)
     */
    failureWindowMs?: number;

    /**
     * Time in ms to wait before next reconnection attempt after failure.
     * Uses exponential backoff from this base.
     * @default 1000
     */
    reconnectBaseDelayMs?: number;

    /**
     * Callback when health state changes.
     */
    onHealthChange?: (healthy: boolean, reason?: string) => void;
}

// ============================================================================
// Provider and Model Configuration Types
// ============================================================================

/**
 * Configuration for a custom API provider (BYOK - Bring Your Own Key).
 * Matches the Copilot SDK ProviderConfig interface.
 */
export interface ProviderConfig {
    /**
     * Provider type. Defaults to "openai" for generic OpenAI-compatible APIs.
     */
    type?: 'openai' | 'azure' | 'anthropic';

    /**
     * API format (openai/azure only). Defaults to "completions".
     */
    wireApi?: 'completions' | 'responses';

    /**
     * API endpoint URL
     */
    baseUrl: string;

    /**
     * API key. Optional for local providers like Ollama.
     */
    apiKey?: string;

    /**
     * Bearer token for authentication. Sets the Authorization header directly.
     * Use this for services requiring bearer token auth instead of API key.
     * Takes precedence over apiKey when both are set.
     */
    bearerToken?: string;

    /**
     * Azure-specific options
     */
    azure?: {
        /**
         * API version. Defaults to "2024-10-21".
         */
        apiVersion?: string;
    };
}

/**
 * Base interface for MCP server configuration.
 */
interface MCPServerConfigBase {
    /**
     * List of tools to include from this server. [] means none. "*" means all.
     */
    tools: string[];
    /**
     * Indicates "remote" or "local" server type.
     * If not specified, defaults to "local".
     */
    type?: string;
    /**
     * Optional timeout in milliseconds for tool calls to this server.
     */
    timeout?: number;
}

/**
 * Configuration for a local/stdio MCP server.
 */
export interface MCPLocalServerConfig extends MCPServerConfigBase {
    type?: 'local' | 'stdio';
    command: string;
    args: string[];
    /**
     * Environment variables to pass to the server.
     */
    env?: Record<string, string>;
    cwd?: string;
}

/**
 * Configuration for a remote MCP server (HTTP or SSE).
 */
export interface MCPRemoteServerConfig extends MCPServerConfigBase {
    type: 'http' | 'sse';
    /**
     * URL of the remote server.
     */
    url: string;
    /**
     * Optional HTTP headers to include in requests.
     */
    headers?: Record<string, string>;
}

/**
 * Union type for MCP server configurations.
 */
export type MCPServerConfig = MCPLocalServerConfig | MCPRemoteServerConfig;

/**
 * Configuration for a custom agent.
 */
export interface CustomAgentConfig {
    /**
     * Unique name of the custom agent.
     */
    name: string;
    /**
     * Display name for UI purposes.
     */
    displayName?: string;
    /**
     * Description of what the agent does.
     */
    description?: string;
    /**
     * List of tool names the agent can use.
     * Use null or undefined for all tools.
     */
    tools?: string[] | null;
    /**
     * The prompt content for the agent.
     */
    prompt: string;
    /**
     * MCP servers specific to this agent.
     */
    mcpServers?: Record<string, MCPServerConfig>;
    /**
     * Whether the agent should be available for model inference.
     * @default true
     */
    infer?: boolean;
}

/**
 * Options for configuring the Copilot provider
 */
export interface CopilotProviderOptions {
    /**
     * Path to the Copilot CLI executable
     * @default "copilot" (searches PATH)
     */
    cliPath?: string;

    /**
     * URL of an existing Copilot CLI server
     * Mutually exclusive with cliPath
     */
    cliUrl?: string;

    /**
     * Custom provider configuration (BYOK - Bring Your Own Key).
     * Supports OpenAI, Azure, and Anthropic compatible endpoints.
     * This is the default provider for all models created by this provider.
     * Can be overridden per-model via CopilotModelSettings.provider
     */
    provider?: ProviderConfig;

    /**
     * Log level for the CLI server
     * @default "info"
     */
    logLevel?: CopilotClientOptions['logLevel'];

    /**
     * Working directory for the CLI process
     */
    cwd?: string;

    /**
     * Extra arguments to pass to the CLI executable
     */
    cliArgs?: string[];

    /**
     * Use stdio transport instead of TCP
     * @default true
     */
    useStdio?: boolean;

    /**
     * Environment variables to pass to the CLI process
     */
    env?: Record<string, string | undefined>;

    /**
     * MCP server configurations (provider-level defaults).
     * These servers will be available to all sessions created by this provider.
     * Can be overridden per-call via providerOptions.copilot.mcpServers
     */
    mcpServers?: Record<string, MCPServerConfig>;

    /**
     * Custom agent definitions.
     * Agents can be accessed via model ID pattern: 'agent/{name}'
     * Example: copilot('agent/code-reviewer')
     */
    customAgents?: CustomAgentConfig[];

    // Phase 5: Production Readiness Options

    /**
     * Logger for debugging and observability.
     * Pass `false` to disable all logging.
     * @default console
     */
    logger?: Logger | false;

    /**
     * Enable verbose logging (debug level).
     * @default false
     */
    verbose?: boolean;

    /**
     * Default retry configuration for all operations.
     * Can be overridden per-call via providerOptions.
     */
    retry?: RetryOptions;

    /**
     * Connection timeout in milliseconds.
     * @default 10000
     */
    connectionTimeoutMs?: number;

    /**
     * Request timeout in milliseconds.
     * @default 60000
     */
    requestTimeoutMs?: number;

    // Phase 6: Observability & Advanced Tooling Options

    /**
     * OpenTelemetry configuration.
     * When provided, enables distributed tracing and metrics.
     */
    telemetry?: TelemetryConfig;

    /**
     * Session pooling configuration.
     * When enabled, sessions may be reused for efficiency.
     */
    sessionPool?: SessionPoolConfig;

    /**
     * Health monitoring configuration.
     * Controls connection health tracking and recovery.
     */
    healthMonitor?: HealthMonitorConfig;
}

/**
 * Settings for a specific model instance
 */
export interface CopilotModelSettings {
    /**
     * System message configuration
     */
    systemMessage?: SystemMessageConfig;

    /**
     * Enable streaming of assistant message chunks
     * Used internally when calling doStream()
     * @default false
     */
    streaming?: boolean;

    /**
     * List of tool names to allow
     */
    availableTools?: string[];

    /**
     * List of tool names to disable
     */
    excludedTools?: string[];

    /**
     * Override BYOK provider configuration for this specific model.
     * Takes precedence over provider-level configuration.
     * Useful when different models need different API endpoints.
     */
    provider?: ProviderConfig;

    /**
     * Tool execution mode
     * - 'caller': Return tool calls to AI SDK caller for execution (default, Phase 3 behavior)
     * - 'provider': Let Copilot SDK execute tools internally (required for MCP server tools)
     * @default 'caller'
     */
    toolExecutionMode?: 'caller' | 'provider';
}

/**
 * AI SDK provider options for Copilot-specific configuration.
 * Used in: generateText({ providerOptions: { copilot: {...} } })
 */
export interface CopilotCallOptions {
    /**
     * Override MCP servers for this specific call.
     * Merged with provider-level mcpServers (call-level takes precedence by server name).
     */
    mcpServers?: Record<string, MCPServerConfig>;

    /**
     * Select a custom agent for this call by name.
     * Alternative to using 'agent/{name}' model ID pattern.
     */
    agent?: string;

    // Phase 5: Per-call overrides

    /**
     * Override retry configuration for this call.
     */
    retry?: RetryOptions;

    /**
     * Override request timeout for this call.
     */
    requestTimeoutMs?: number;
}

/**
 * Re-export types from Copilot SDK for convenience
 */
export type { SystemMessageConfig };

// ============================================================================
// Phase 7: Caching & Context Propagation Types
// ============================================================================

/**
 * Cache adapter interface for pluggable cache implementations.
 */
export interface CacheAdapter {
    /**
     * Gets a cached value by key.
     * @returns The cached value, or undefined if not found.
     */
    get<T>(key: string): Promise<T | undefined>;

    /**
     * Sets a value in the cache with optional TTL.
     * @param key - Cache key
     * @param value - Value to cache
     * @param ttlMs - Optional time-to-live in milliseconds
     */
    set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

    /**
     * Deletes a value from the cache.
     */
    delete(key: string): Promise<void>;

    /**
     * Clears all cached values.
     */
    clear(): Promise<void>;

    /**
     * Checks if a key exists in the cache.
     */
    has(key: string): Promise<boolean>;
}

/**
 * Cache configuration options.
 */
export interface CacheConfig {
    /**
     * Whether caching is enabled.
     * @default false
     */
    enabled?: boolean;

    /**
     * Cache adapter implementation.
     * Uses in-memory cache by default.
     */
    adapter?: CacheAdapter;

    /**
     * Default TTL in milliseconds for cached responses.
     * @default 300000 (5 minutes)
     */
    defaultTtlMs?: number;

    /**
     * Custom cache key generator.
     * @param options - The call options being cached
     * @returns Cache key string
     */
    keyGenerator?: (options: CacheKeyOptions) => string;

    /**
     * Whether to cache streaming responses.
     * When true, streams are buffered and replayed from cache.
     * @default false
     */
    cacheStreaming?: boolean;

    /**
     * Whether to cache tool calls.
     * Tool-less responses are always cacheable if enabled.
     * @default false
     */
    cacheToolCalls?: boolean;
}

/**
 * Input for cache key generation.
 */
export interface CacheKeyOptions {
    modelId: string;
    prompt: unknown;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    tools?: unknown[];
    systemMessageHash?: string;
}

/**
 * Context propagation configuration.
 */
export interface PropagationConfig {
    /**
     * Whether to extract trace context from incoming requests.
     * @default true
     */
    extractContext?: boolean;

    /**
     * Whether to inject trace context into outgoing requests.
     * @default true
     */
    injectContext?: boolean;

    /**
     * Custom baggage entries to add to propagated context.
     */
    baggage?: Record<string, string>;
}

