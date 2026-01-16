# Development Guidelines

Key guidelines and patterns for developing the Copilot AI SDK provider.

## Prerequisites

### Environment Setup
- Node.js 20+
- Global Copilot CLI: `npm install -g @github/copilot`
- Authenticated via `copilot auth login` or `gh auth login`
- Build SDK first: `npm install && npm run build` in `copilot-sdk/nodejs`

### Version Compatibility
- CLI version must match SDK version (protocol compatibility)
- Check CLI version: `copilot --version`
- Update CLI if needed: `npm install -g @github/copilot@latest`
- **Error**: `SDK protocol version mismatch` means versions don't match

## SDK Dependencies

### Copilot SDK
- No TypeScript declarations shipped - use `src/copilot-sdk.d.ts` for manual types
- Only import `SystemMessageConfig` and `CopilotClientOptions` from SDK
- Define `ProviderConfig`, `MCPServerConfig`, `CustomAgentConfig` locally in `types.ts`

### Build Configuration
- DTS generation may fail due to SDK missing type exports
- Use `dts: false` in `tsup.config.ts` as workaround

## Windows Compatibility

### CLI Spawn Issues
- Default `cliPath: "copilot"` causes `EINVAL` errors on Windows
- Absolute paths to `.cmd` files fail (SDK skips `cmd /c` for absolute paths)
- **Workaround**: Point to the `.js` file directly:
```typescript
const globalPath = execSync('npm root -g', { encoding: 'utf-8' }).trim();
const cliPath = path.join(globalPath, '@github', 'copilot', 'index.js');
```

## AI SDK V3 Interface

### Usage Structure
```typescript
usage: {
  inputTokens: { total, noCache, cacheRead, cacheWrite },
  outputTokens: { total, text, reasoning }
}  // All fields can be undefined
```

### Type Patterns
- Use `Extract<LanguageModelV3Prompt[number], { role: 'user' }>` not intersection types
- Warning structure: `{ type: 'unsupported', feature: string, details?: string }`

## Copilot SDK Events

### Key Events
| Event | Purpose |
|-------|---------|
| `assistant.message` | Text content, tool requests |
| `assistant.message_delta` | Streaming text delta |
| `assistant.reasoning_delta` | Streaming reasoning delta |
| `turn.end` | Turn complete, resolve promise |
| `session.error` | Error occurred, reject promise |

### Event Data
- Fields are `unknown` type - cast explicitly: `event.data.content as string`

## Tool Support

### Handler Requirement
- Copilot SDK **requires** `handler` function for all tools
- AI SDK uses return-to-caller model (caller executes tools)
- **Solution**: Use `mapToolsWithHandlers()` to create tools with no-op handlers
- The handlers return a marker; actual tool calls captured via `toolRequests` in events

### Return-to-Caller Model
- AI SDK expects tool calls returned to caller for execution
- Copilot SDK auto-executes tools internally via handlers
- Our handlers return immediately; tool requests captured from `assistant.message` event

### Limitations
- No `toolChoice` parameter - only `tools`, `availableTools`, `excludedTools`
- Emit warning for non-auto tool choice, don't fail
- Custom tools work alongside Copilot's built-in tools (web_fetch, report_intent, etc.)

## Structured Output
- Copilot SDK has NO native JSON schema support
- **Approach**: Inject schema into system message (append mode)
- Always emit warning about prompt-based enforcement

## Streaming

### ReadableStream Pattern
- Subscribe to events inside `start()` callback
- Clean up abort listeners in all paths (success, error, cancel)
- Use `controller.enqueue()` for parts, `controller.close()`/`controller.error()` to end

## Client Lifecycle

### ClientManager
- Reference counting: `acquire()` increments, `release()` decrements
- States: disconnected → connecting → connected → disposing
- Retry with exponential backoff on shutdown

### Session Management
- Fresh session per `doGenerate`/`doStream` call
- Enables per-call overrides for MCP servers, agents, structured output

## Error Handling

### Classification
- Categories: connection, authentication, rate-limit, session, request, internal
- Map to HTTP status codes: 503, 401, 429, 400, 500
- Include recovery hints

### Retry Logic
- Exponential backoff with jitter (prevents thundering herd)
- Default: 3 retries, 100ms initial, 2x multiplier, 10% jitter
- Never retry AbortErrors

## Logging

```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```
- `verbose: true` enables debug logging
- Default: console with `[copilot]` prefix
- Pass `false` to fully disable

## Testing

### Mocking Copilot SDK
```typescript
vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: class MockCopilotClient {
    createSession = vi.fn().mockResolvedValue(mockSession);
    stop = vi.fn().mockResolvedValue([]);
  },
}));
```

### Best Practices
- Use class syntax for constructor mocks (not `vi.fn().mockImplementation()`)
- Keep tests synchronous where possible
- Define local `TestEvent` interface (SDK may not export)
- Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` for timers
- Fake timers can cause spurious warnings - check final counts, not error messages

### Mock Testing Utilities
- Expose `_testing` object for inspection
- Mock `send()` must return `Promise<string>`
- Add `getMessages(): Promise<SessionEvent[]>` for SDK compatibility

## OpenTelemetry

- Use `unknown` type for providers (avoid hard dependency)
- Lazy dynamic imports: `await import('@opentelemetry/api')`
- Return no-ops when OTel unavailable - never throw
- Semantic conventions: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`

## Session Pool

- Config hashing: `JSON.stringify(config, Object.keys(config).sort())`
- Cleanup interval: 60 seconds via `setInterval`
- Clear interval in `dispose()` to prevent leaks
- Track `useCount` and `lastUsed` for eviction

## Health Monitor

- Sliding window failure tracking: `now - timestamp < windowMs`
- Exponential backoff with ±10% jitter
- Max delay cap: 30 seconds
- `onHealthChange` callback for notifications
