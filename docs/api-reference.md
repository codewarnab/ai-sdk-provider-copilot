# API Reference

Complete API documentation for the AI SDK Copilot Provider.

## Provider Factory

### `createCopilotProvider(options?)`

Creates a new Copilot provider instance.

```typescript
import { createCopilotProvider } from 'ai-sdk-provider-copilot';

const copilot = createCopilotProvider(options);
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `CopilotProviderOptions` | Optional configuration |

#### Returns

`CopilotProvider` - A provider function that creates language models.

---

## Types

### `CopilotProviderOptions`

Configuration options for the provider.

```typescript
interface CopilotProviderOptions {
  // CLI Configuration
  cliPath?: string;           // Path to Copilot CLI executable
  cliUrl?: string;            // URL of existing CLI server (mutually exclusive with cliPath)
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  cwd?: string;               // Working directory
  cliArgs?: string[];         // Additional CLI arguments
  useStdio?: boolean;         // Use stdio transport (default: true)
  env?: Record<string, string | undefined>;
  
  // BYOK Provider
  provider?: ProviderConfig;
  
  // MCP Servers
  mcpServers?: Record<string, MCPServerConfig>;
  
  // Custom Agents
  customAgents?: CustomAgentConfig[];
  
  // Phase 5: Production Readiness
  logger?: Logger | false;    // Logger instance or false to disable
  verbose?: boolean;          // Enable debug logging (default: false)
  retry?: RetryOptions;       // Default retry configuration
  connectionTimeoutMs?: number; // Connection timeout (default: 10000)
  requestTimeoutMs?: number;  // Request timeout (default: 60000)
}
```

### `CopilotModelSettings`

Settings for a specific model instance.

```typescript
interface CopilotModelSettings {
  systemMessage?: SystemMessageConfig;
  streaming?: boolean;
  availableTools?: string[];
  excludedTools?: string[];
  provider?: ProviderConfig;  // Override BYOK config
  toolExecutionMode?: 'caller' | 'provider';
}
```

### `CopilotCallOptions`

Per-call options passed via `providerOptions.copilot`.

```typescript
interface CopilotCallOptions {
  mcpServers?: Record<string, MCPServerConfig>;
  agent?: string;
  retry?: RetryOptions;  // Override retry config
  requestTimeoutMs?: number;
}
```

### `RetryOptions`

Configuration for automatic retry.

```typescript
interface RetryOptions {
  maxRetries?: number;        // Maximum attempts (default: 3)
  initialDelayMs?: number;    // Initial delay (default: 100)
  maxDelayMs?: number;        // Maximum delay cap (default: 5000)
  backoffMultiplier?: number; // Exponential multiplier (default: 2)
  jitter?: number;            // Randomness 0-1 (default: 0.1)
  isRetryable?: (error: unknown) => boolean; // Custom classification
}
```

### `Logger`

Logger interface for debugging.

```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### `ProviderConfig`

BYOK provider configuration.

```typescript
interface ProviderConfig {
  type?: 'openai' | 'azure' | 'anthropic';
  wireApi?: 'completions' | 'responses';
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: {
    apiVersion?: string;
  };
}
```

### `MCPServerConfig`

MCP server configuration (local or remote).

```typescript
// Local server
interface MCPLocalServerConfig {
  type?: 'local' | 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  tools: string[];
  timeout?: number;
}

// Remote server
interface MCPRemoteServerConfig {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  tools: string[];
  timeout?: number;
}
```

### `CustomAgentConfig`

Custom agent definition.

```typescript
interface CustomAgentConfig {
  name: string;
  displayName?: string;
  description?: string;
  tools?: string[] | null;
  prompt: string;
  mcpServers?: Record<string, MCPServerConfig>;
  infer?: boolean;
}
```

### `CopilotErrorMetadata`

Error metadata for observability.

```typescript
interface CopilotErrorMetadata {
  category: 'connection' | 'authentication' | 'rate-limit' | 'session' | 'request' | 'internal';
  isRetryable: boolean;
  recoveryHint?: string;
  retryAttempts?: number;
  cause?: unknown;
}
```

---

## Utility Functions

### Error Handling

```typescript
import {
  mapCopilotError,
  isRetryableError,
  classifyError,
  getRecoveryHint,
  isErrorCategory,
  createAbortError,
} from 'ai-sdk-provider-copilot';

// Map Copilot SDK error to AI SDK error type
const aiError = mapCopilotError(error);

// Check if error should be retried
if (isRetryableError(error)) { /* ... */ }

// Get error classification
const metadata = classifyError(error);
console.log(metadata.category, metadata.isRetryable);

// Get recovery suggestion
const hint = getRecoveryHint(error);

// Check specific category
if (isErrorCategory(error, 'rate-limit')) { /* ... */ }
```

### Retry Utilities

```typescript
import {
  withRetry,
  createRetryable,
  DEFAULT_RETRY_OPTIONS,
} from 'ai-sdk-provider-copilot';

// Execute with retry
const result = await withRetry(
  () => fetchData(),
  { maxRetries: 5, initialDelayMs: 100 }
);

// Create a retryable function
const retryableFetch = createRetryable(fetchData, { maxRetries: 3 });
const result = await retryableFetch(url);
```

### Telemetry Utilities

```typescript
import {
  getLogger,
  withTiming,
  createRequestContext,
} from 'ai-sdk-provider-copilot';

// Get a configured logger
const logger = getLogger(customLogger, verbose);

// Time an operation
const { result, durationMs } = await withTiming(
  () => someOperation(),
  logger,
  'operation-name'
);

// Create request context for correlation
const ctx = createRequestContext('gpt-4');
logger.info(`[${ctx.requestId}] Starting request`);
```

### Client Manager

```typescript
import { ClientManager, createClientManager } from 'ai-sdk-provider-copilot';

const manager = createClientManager(options);

const client = await manager.acquire();
try {
  // Use client
} finally {
  manager.release();
}

// Cleanup
await manager.dispose();
```

---

## CopilotProvider Interface

The provider function and its methods.

```typescript
interface CopilotProvider extends ProviderV3 {
  // Create model via function call
  (modelId: string, settings?: CopilotModelSettings): LanguageModelV3;
  
  // Explicit language model creation
  languageModel(modelId: string, settings?: CopilotModelSettings): LanguageModelV3;
  
  // Alias for chat models
  chat(modelId: string, settings?: CopilotModelSettings): LanguageModelV3;
  
  // Not supported - throws NoSuchModelError
  embeddingModel(modelId: string): never;
  imageModel(modelId: string): never;
  
  // Resource cleanup
  dispose(): Promise<void>;
}
```

---

## CopilotLanguageModel Class

The language model implementation.

```typescript
class CopilotLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'copilot';
  readonly modelId: string;
  
  // Generate text (non-streaming)
  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult>;
  
  // Generate text (streaming)
  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult>;
  
  // Cleanup (for standalone usage)
  async dispose(): Promise<void>;
}
```
