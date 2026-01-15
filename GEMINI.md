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
