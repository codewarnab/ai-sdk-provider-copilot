# Known Limitations

This document outlines the current limitations of the AI SDK Copilot Provider and potential workarounds.

## Model Types Not Supported

### Embedding Models

The Copilot SDK does not expose embedding model APIs. Calling `copilot.embeddingModel()` will throw a `NoSuchModelError`.

**Workaround:** Use a dedicated embedding provider:

```typescript
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const embeddingModel = openai.embedding('text-embedding-3-small');
```

### Image Models

The Copilot SDK does not support image generation. Calling `copilot.imageModel()` will throw a `NoSuchModelError`.

**Workaround:** Use a dedicated image provider.

---

## Tool Calling

### Tool Choice Not Supported

The Copilot SDK does not support the `toolChoice` parameter. Setting `toolChoice: 'required'` or `toolChoice: { type: 'tool', toolName: 'xyz' }` will emit a warning but not fail.

The model will determine tool usage automatically based on context.

### Tool Execution Model

The AI SDK expects tools to be executed by the caller (return tool calls for external execution). The Copilot SDK can execute tools internally via registered handlers.

**Default behavior:** Tool calls are returned to the AI SDK caller for execution (`toolExecutionMode: 'caller'`).

**For MCP server tools:** Set `toolExecutionMode: 'provider'` to let the Copilot SDK execute tools internally.

---

## Structured Output

### No Native JSON Schema Support

The Copilot SDK does not have native JSON schema enforcement. Structured output is implemented via system prompt injection.

**Behavior:**
- A warning `unsupported: structuredOutput` is emitted
- JSON schema is converted to instructions appended to the system message
- Output format is not guaranteed - model may deviate

**Best Practice:** Use explicit validation on the returned JSON:

```typescript
import { z } from 'zod';

const schema = z.object({ name: z.string(), age: z.number() });
const result = await generateObject({
  model: copilot('gpt-4'),
  schema,
});

// Always validate
const parsed = schema.parse(result.object);
```

---

## Session Management

### Fresh Sessions Per Call

Each `doGenerate()` and `doStream()` call creates a fresh session and destroys it on completion. This matches the AI SDK's stateless model.

**Impact:** No conversation state is maintained between calls. Full conversation history must be passed in each call.

**Why:** The AI SDK pattern expects models to be stateless. The caller manages conversation history via the `prompt` array.

---

## Reasoning/Thinking Mode

### No Explicit Enable

The Copilot SDK does not have an explicit "enable reasoning" parameter. Reasoning events are automatically detected and captured when the model produces them.

**Behavior:** If the model outputs reasoning, it will be included in the response. There's no way to explicitly enable/disable reasoning mode.

---

## Token Usage

### Limited Token Metrics

Token usage information depends on what the Copilot SDK reports. Fine-grained breakdowns (cache read/write, reasoning tokens) may not be available.

**Returned:** `inputTokens.total`, `outputTokens.total`

**May be undefined:** `inputTokens.cacheRead`, `inputTokens.cacheWrite`, `outputTokens.reasoning`

---

## Provider Configuration

### CLI Path OR URL

You must specify either `cliPath` or `cliUrl`, not both. They are mutually exclusive options.

```typescript
// ✅ Correct
createCopilotProvider({ cliPath: '/usr/local/bin/copilot' });
createCopilotProvider({ cliUrl: 'http://localhost:8080' });

// ❌ Error
createCopilotProvider({ cliPath: '/path', cliUrl: 'http://...' });
```

---

## Retry Behavior

### Abort Errors Not Retried

Abort errors (from `AbortController` cancellation) are never retried, regardless of retry configuration.

### Custom isRetryable

If you provide a custom `isRetryable` function, it completely overrides the default error classification:

```typescript
createCopilotProvider({
  retry: {
    isRetryable: (error) => {
      // Your custom logic - default classification is bypassed
      return error.message.includes('temporary');
    },
  },
});
```

---

## Logging

### Console as Default

When no logger is specified, the provider uses `console` with `[copilot]` prefix. Debug messages are suppressed unless `verbose: true`.

### Logger Interface

Custom loggers must implement all four methods: `debug`, `info`, `warn`, `error`. Missing methods will throw at runtime.

---

## Deployment Considerations

### Vercel Serverless

The Copilot CLI requires a persistent process. On Vercel serverless:
- Each function invocation may spawn a new CLI process
- No session persistence across invocations
- Consider using `cliUrl` with an external CLI server

### Edge Runtime

The Copilot SDK requires Node.js APIs and **will not work** in Edge Runtime environments.

---

## Now Implemented

These features are now available:

- ✅ OpenTelemetry tracing integration
- ✅ OpenTelemetry metrics integration
- ✅ Session pooling for efficiency
- ✅ Response caching
- ✅ Health checks and connection monitoring
- ✅ Retry with exponential backoff
- ✅ Windows CLI auto-detection

## Tool Calling with Custom Tools

Custom tools defined via the AI SDK are now properly registered with the Copilot SDK. The model may use both:
- Your custom tools (e.g., `weather`, `calculator`)
- Copilot's built-in tools (e.g., `web_fetch`, `report_intent`)

The built-in tools may take precedence for common tasks. Use `excludedTools` to disable specific built-in tools if needed.
