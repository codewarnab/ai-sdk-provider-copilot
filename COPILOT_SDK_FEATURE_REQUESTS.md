# Copilot SDK Feature Requests

Based on analysis of the AI SDK provider implementation and known limitations, here are features that would improve the SDK **without requiring server changes** (client-side SDK changes only).

---

## 🟢 High Impact - Easy to Implement

### 1. Tool Choice Configuration

**Current State:** SDK's `SessionConfig` only has `tools`, `availableTools`, `excludedTools` - no way to control tool calling behavior.

**Provider Workaround:** Emit warning and ignore `toolChoice` setting.

**Requested Feature:**
```typescript
interface SessionConfig {
    // ... existing fields
    
    /**
     * Tool choice configuration
     * - 'auto': Model decides (default)
     * - 'none': Disable all tools for this request
     * - 'required': Model MUST use at least one tool
     * - { type: 'tool', toolName: string }: Force specific tool
     */
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool', toolName: string };
}
```

**Implementation:** SDK can translate this to server protocol (if supported) or apply client-side filtering of `availableTools`/`excludedTools` for basic cases.

---

### 2. JSON Schema / Structured Output Support

**Current State:** No native JSON schema enforcement in SDK.

**Provider Workaround:** Inject schema into system message via prompt engineering.

**Requested Feature:**
```typescript
interface SessionConfig {
    // ... existing fields
    
    /**
     * Response format configuration
     */
    responseFormat?: {
        type: 'text' | 'json';
        schema?: JSONSchema7;  // JSON schema for structured output
        name?: string;
        description?: string;
    };
}
```

**Implementation:** SDK can inject schema instructions into system message (same as provider does now), but centralized in SDK for consistency across all SDK consumers.

---

### 3. Export Additional Type Helpers

**Current State:** Types are exported but some utility types are missing.

**Requested Features:**
```typescript
// Re-export useful type helpers
export type { JSONSchema7 } from 'json-schema';  // Or define own subset

// Type guard functions for discriminated union
export function isAssistantMessageEvent(event: SessionEvent): event is Extract<SessionEvent, { type: 'assistant.message' }>;
export function isToolExecutionEvent(event: SessionEvent): event is Extract<SessionEvent, { type: 'tool.execution_start' | 'tool.execution_complete' }>;
export function isUsageEvent(event: SessionEvent): event is Extract<SessionEvent, { type: 'assistant.usage' }>;

// Event type literal union for switch statements
export type SessionEventType = SessionEvent['type'];
```

**Implementation:** Pure type additions, no runtime changes.

---

### 4. Connection State Change Events

**Current State:** `client.getState()` returns current state but no way to subscribe to changes.

**Requested Feature:**
```typescript
interface CopilotClient {
    // ... existing methods
    
    /**
     * Subscribe to connection state changes
     */
    onStateChange(handler: (state: ConnectionState, previousState: ConnectionState) => void): () => void;
}
```

**Implementation:** Internal state tracking with event emitter pattern.

---

## 🟡 Medium Impact - Moderate Effort

### 5. Session Pool / Session Reuse Utilities

**Current State:** Each session must be manually created/destroyed. No built-in pooling.

**Provider Workaround:** Implements custom `SessionPool` class.

**Requested Feature:**
```typescript
import { createSessionPool } from '@github/copilot-sdk';

const pool = createSessionPool(client, {
    minSize: 2,
    maxSize: 10,
    idleTimeout: 30000,
    healthCheckInterval: 10000,
});

// Acquire from pool (creates if needed, waits if at max)
const session = await pool.acquire({ model: 'gpt-4' });

// ... use session ...

// Release back to pool (or destroy if unhealthy)
await pool.release(session);

// Graceful shutdown
await pool.drain();
```

**Implementation:** Client-side session management utility class.

---

### 6. Request/Response Middleware Hooks

**Current State:** No way to intercept/modify requests or responses.

**Requested Feature:**
```typescript
interface CopilotClientOptions {
    // ... existing fields
    
    /**
     * Middleware hooks for request/response interception
     */
    middleware?: {
        /** Called before sending session.create request */
        beforeCreateSession?: (config: SessionConfig) => SessionConfig | Promise<SessionConfig>;
        
        /** Called before sending session.send request */
        beforeSend?: (options: MessageOptions) => MessageOptions | Promise<MessageOptions>;
        
        /** Called when receiving events */
        onEvent?: (event: SessionEvent) => SessionEvent | null;  // null = filter out
    };
}
```

**Implementation:** Wrap JSON-RPC calls with middleware chain.

---

### 7. Built-in Retry Logic

**Current State:** No built-in retry for transient failures.

**Provider Workaround:** Implements custom `withRetry()` wrapper.

**Requested Feature:**
```typescript
interface CopilotClientOptions {
    // ... existing fields
    
    /**
     * Retry configuration for transient failures
     */
    retry?: {
        maxRetries?: number;        // default: 3
        initialDelayMs?: number;    // default: 100
        maxDelayMs?: number;        // default: 5000
        backoffMultiplier?: number; // default: 2
        isRetryable?: (error: Error) => boolean;
    };
}
```

**Implementation:** Wrap connection/request methods with retry logic.

---

### 8. Request Timeout Configuration

**Current State:** No timeout configuration for individual requests.

**Requested Feature:**
```typescript
interface MessageOptions {
    // ... existing fields
    
    /**
     * Timeout in milliseconds for this request
     * @default undefined (no timeout)
     */
    timeout?: number;
}

interface SessionConfig {
    // ... existing fields
    
    /**
     * Default timeout for all requests in this session
     */
    defaultTimeout?: number;
}
```

**Implementation:** AbortController with setTimeout wrapper.

---

## 🔵 Nice to Have - More Effort

### 9. Promise-based Event Waiting

**Current State:** Must use event callback pattern to wait for specific events.

**Requested Feature:**
```typescript
interface CopilotSession {
    // ... existing methods
    
    /**
     * Wait for a specific event type
     */
    waitForEvent<T extends SessionEvent['type']>(
        type: T,
        options?: { timeout?: number }
    ): Promise<Extract<SessionEvent, { type: T }>>;
    
    /**
     * Wait for turn completion (assistant.turn_end)
     */
    waitForTurnEnd(options?: { timeout?: number }): Promise<{
        content: string;
        toolCalls?: ToolRequest[];
        usage?: UsageData;
    }>;
}
```

**Implementation:** Wrap event callbacks in promise with timeout.

---

### 10. Built-in Observability Hooks

**Current State:** No built-in telemetry/metrics support.

**Provider Workaround:** Implements custom tracing and metrics.

**Requested Feature:**
```typescript
interface CopilotClientOptions {
    // ... existing fields
    
    /**
     * Observability hooks
     */
    observability?: {
        /** OpenTelemetry tracer instance */
        tracer?: Tracer;
        
        /** Metrics callback */
        onMetrics?: (metrics: {
            type: 'request' | 'response' | 'error';
            duration?: number;
            tokenUsage?: { input: number; output: number };
            model?: string;
            sessionId?: string;
        }) => void;
    };
}
```

**Implementation:** Instrument internal methods with timing and metrics collection.

---

### 11. Session Metadata/Tags

**Current State:** Sessions have ID but no custom metadata.

**Requested Feature:**
```typescript
interface SessionConfig {
    // ... existing fields
    
    /**
     * Custom metadata attached to session (for logging, tracing)
     */
    metadata?: Record<string, string>;
    
    /**
     * Tags for categorization/filtering
     */
    tags?: string[];
}

interface CopilotSession {
    // ... existing methods
    
    /** Get session metadata */
    getMetadata(): Record<string, string>;
    
    /** Update metadata */
    setMetadata(key: string, value: string): void;
}
```

**Implementation:** Client-side metadata storage attached to session object.

---

### 12. Batch/Parallel Session Operations

**Current State:** Must create sessions sequentially.

**Requested Feature:**
```typescript
interface CopilotClient {
    // ... existing methods
    
    /**
     * Create multiple sessions in parallel
     */
    createSessions(configs: SessionConfig[]): Promise<CopilotSession[]>;
    
    /**
     * Get all active sessions
     */
    getSessions(): CopilotSession[];
    
    /**
     * Destroy all sessions
     */
    destroyAllSessions(): Promise<Error[]>;
}
```

**Implementation:** Promise.all wrapper with internal session tracking (partially exists).

---

## 📋 Summary Table

| Feature | Impact | Effort | Server Changes? |
|---------|--------|--------|-----------------|
| Tool Choice Config | 🟢 High | Low | ❌ No |
| Structured Output | 🟢 High | Low | ❌ No |
| Type Helpers | 🟢 High | Very Low | ❌ No |
| Connection Events | 🟢 Medium | Low | ❌ No |
| Session Pool | 🟡 High | Medium | ❌ No |
| Middleware Hooks | 🟡 Medium | Medium | ❌ No |
| Built-in Retry | 🟡 Medium | Low | ❌ No |
| Request Timeout | 🟡 Medium | Low | ❌ No |
| Promise Events | 🔵 Medium | Medium | ❌ No |
| Observability | 🔵 High | Medium | ❌ No |
| Session Metadata | 🔵 Low | Low | ❌ No |
| Batch Operations | 🔵 Low | Low | ❌ No |

---

## Recommended Priority for PR

### Phase 1 (Quick Wins)
1. **Type Helpers** - Pure type additions, zero risk
2. **Connection Events** - Simple event emitter pattern

### Phase 2 (High Value)
3. **Tool Choice Config** - Major pain point for AI SDK integration
4. **Structured Output** - Major pain point, can use existing prompt injection pattern

### Phase 3 (Infrastructure)
5. **Built-in Retry** - Common need
6. **Request Timeout** - Common need
7. **Middleware Hooks** - Enables extensibility

### Phase 4 (Advanced)
8. **Session Pool** - Complex but high value for production
9. **Observability** - Complex but high value for production
