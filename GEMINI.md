# Development Learnings

Key insights to avoid issues during package development.

## SDK Dependencies

### @github/copilot-sdk
- **No .d.ts files**: The SDK doesn't ship TypeScript declarations
- **Solution**: Created `src/copilot-sdk.d.ts` with manual type declarations
- **Build SDK first**: Run `npm install && npm run build` in `copilot-sdk/nodejs` before installing this package

### tsup DTS Generation
- **Issue**: DTS build fails when importing from packages without proper type exports
- **Workaround**: Set `dts: false` in `tsup.config.ts` until SDK ships types
- **Note**: Package still works, just won't have `.d.ts` exports

## AI SDK V3 Interface

### LanguageModelV3Usage Structure
```typescript
// V3 requires ALL these fields (can be undefined)
usage: {
  inputTokens: {
    total: number | undefined,
    noCache: number | undefined,
    cacheRead: number | undefined,
    cacheWrite: number | undefined,
  },
  outputTokens: {
    total: number | undefined,
    text: number | undefined,
    reasoning: number | undefined,
  }
}
```

### Type Helpers
- Use `Extract<LanguageModelV3Prompt[number], { role: 'user' }>` instead of intersection types like `LanguageModelV3Message & { role: 'user' }`
- Intersection types can cause DTS generation issues

## Copilot SDK Events

Key events to handle in `session.on()`:
- `assistant.message` - Text content
- `turn.end` - Turn complete, resolve promise
- `session.error` - Error occurred, reject promise

## Testing

### Mocking @github/copilot-sdk
```typescript
// Use class syntax for constructor mocks - vi.fn().mockImplementation() fails
vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: class MockCopilotClient {
    createSession = vi.fn().mockResolvedValue(mockSession);
    stop = vi.fn().mockResolvedValue([]);
  },
}));
```

### Avoid Complex Async Mocks
- Keep tests synchronous where possible
- Async event-based mocking is error-prone and causes timeouts

## Streaming (Phase 2)

### ReadableStream Pattern
- Event subscription happens inside `start()` callback
- Always clean up abort listeners in all paths (success, error, cancel)
- Use `controller.enqueue()` for parts, `controller.close()` or `controller.error()` to end

### Event Naming
- Copilot SDK uses `turn.end` not `assistant.turn_end`
- Delta events: `assistant.message_delta`, `assistant.reasoning_delta`


## Tool Support (Phase 3)

### Return-to-Caller Model
- AI SDK expects tool calls returned to caller for execution
- Copilot SDK auto-executes tools via handlers internally
- Solution: Capture `toolRequests` from `assistant.message` event, don't register handlers

### Tool Requests Structure
```typescript
// In assistant.message event
toolRequests?: {
  toolCallId: string;
  name: string;
  arguments?: unknown;
}[]
```

### Tool Choice Not Supported
- Copilot SDK has no `toolChoice` parameter in SessionConfig
- Only `tools`, `availableTools`, `excludedTools` available
- Emit warning for non-auto tool choice, don't fail

### Finish Reason
- Set `unified: 'tool-calls'` when `toolRequests` present
- Check `context.hasToolCalls` flag in streaming

## Advanced Features (Phase 4)

### Type Exports from Copilot SDK
- SDK doesn't export `ProviderConfig`, `MCPServerConfig`, `MCPLocalServerConfig`, `MCPRemoteServerConfig`, `CustomAgentConfig` in index.ts
- Solution: Define these types locally in `types.ts` matching SDK's internal definitions
- Only import `SystemMessageConfig` and `CopilotClientOptions` from SDK

### AI SDK Warning Types
- Use `type: 'unsupported'` with `feature` field (not `setting`)
- Correct structure: `{ type: 'unsupported', feature: string, details?: string }`

### Reasoning Event Data
- Event data fields are `unknown` type, must cast explicitly
- `event.data.content as string` and `event.data.reasoningId as string`
- Same for `deltaContent` in reasoning_delta events

### Session Creation Per Call
- Fresh session created for each `doGenerate`/`doStream` call
- Enables per-call overrides for MCP servers, agents, structured output
- No session pooling needed - SDK handles lifecycle

### Structured Output
- Copilot SDK has NO native JSON schema support
- Only viable approach: inject schema into system message
- Always emit warning about prompt-based enforcement
- Use append mode to avoid overwriting existing system message

## Production Readiness (Phase 5)

### Client Manager
- Reference counting for shared client lifecycle
- `acquire()` increments, `release()` decrements
- `dispose()` has internal retry for graceful shutdown
- State tracking: disconnected → connecting → connected → disposing

### Retry Logic
- Use exponential backoff with jitter to prevent thundering herd
- Default: 3 retries, 100ms initial delay, 2x multiplier, 10% jitter
- Merge provider-level and call-level options (call takes precedence)
- AbortErrors should never be retried

### Error Classification
- Pattern-based classification using regex
- Categories: connection, authentication, rate-limit, session, request, internal
- Map to virtual HTTP status codes (503, 401, 429, 400, 500)
- Include recovery hints for user guidance

### Logger Interface
```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```
- Use `verbose: true` to enable debug logging
- Default: console with [copilot] prefix
- Pass `false` to fully disable logging

### Testing with Fake Timers
- Vitest fake timers + async retry tests can cause spurious unhandled rejection warnings
- These are benign but can obscure test output
- Tests still pass - check final counts not error messages

## Observability & Testing (Phase 6)

### OpenTelemetry Integration
- Use `unknown` type for TracerProvider/MeterProvider to avoid hard dependency on @opentelemetry/api
- Lazy dynamic imports: `const api = await import('@opentelemetry/api')` inside functions
- Return no-op handlers when OTel not available - never throw
- Gen AI semantic conventions: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`

### Session Pool
- Config hashing for session matching: `JSON.stringify(config, Object.keys(config).sort())`
- Cleanup interval fixed at 60 seconds - runs via `setInterval`
- Always clear interval in `dispose()` to prevent memory leaks
- Track `useCount` and `lastUsed` for eviction decisions

### Health Monitor
- Sliding window failure tracking: filter failures by `now - timestamp < windowMs`
- Exponential backoff: `baseDelay * Math.pow(2, attempts)` with ±10% jitter
- Max delay cap (30 seconds) to prevent infinite waits
- `onHealthChange` callback for external notification

### Mock Testing Utilities
- Expose `_testing` object for deep inspection in tests
- Type as `MockCopilotClient = CopilotClient & { _testing: ... }` for type safety
- Mock session `send()` must return `Promise<string>` per SDK interface
- Add `getMessages(): Promise<SessionEvent[]>` for SDK compatibility
- Use underscore prefix (`_messageOptions`) for intentionally unused params

### Test Organization
- Tests in `__tests__/{module}/` need `../../{module}/` import paths
- Define local `TestEvent` interface instead of importing from SDK (may not export)
- Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` for timer tests
