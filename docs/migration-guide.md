# Migration Guide

This guide covers upgrading between versions of the AI SDK Copilot Provider.

## Version 0.1.x (Phase 5 Release)

This release adds production readiness features. Existing code should continue to work without changes.

### New Features

#### Provider Disposal

Providers now support cleanup via `dispose()`:

```typescript
const copilot = createCopilotProvider();

// ... use provider ...

// Clean up resources when done
await copilot.dispose();
```

**Recommendation:** Always call `dispose()` when your application shuts down to clean up CLI processes.

#### Retry Configuration

Automatic retry for transient errors is now built-in:

```typescript
// Provider-level configuration
const copilot = createCopilotProvider({
  retry: {
    maxRetries: 5,
    initialDelayMs: 100,
    maxDelayMs: 5000,
  },
});

// Per-call override
const result = await generateText({
  model: copilot('gpt-4'),
  prompt: 'Hello',
  providerOptions: {
    copilot: {
      retry: { maxRetries: 10 },
    },
  },
});
```

**Default behavior:** 3 retries with exponential backoff (100ms, 200ms, 400ms).

#### Logging

Configurable logging is now available:

```typescript
// Use custom logger
const copilot = createCopilotProvider({
  logger: myLogger,  // Must implement Logger interface
  verbose: true,     // Enable debug messages
});

// Disable logging
const silent = createCopilotProvider({
  logger: false,
});
```

#### New Exports

The following are now exported:

```typescript
import {
  // Error utilities
  classifyError,
  createCopilotAPIError,
  getRecoveryHint,
  isErrorCategory,
  
  // Retry utilities
  withRetry,
  createRetryable,
  mergeRetryOptions,
  calculateDelay,
  DEFAULT_RETRY_OPTIONS,
  
  // Telemetry utilities
  getLogger,
  createVerboseLogger,
  withTiming,
  createRequestContext,
  
  // Client management
  ClientManager,
  createClientManager,
  
  // Types
  Logger,
  RetryOptions,
  CopilotErrorMetadata,
  ErrorCategory,
  ClientState,
} from 'ai-sdk-provider-copilot';
```

### Breaking Changes

**None.** This release is fully backward compatible.

### Deprecations

**None.**

---

## Upgrading from Earlier Phases

### From Phase 4 (Advanced Features)

No changes required. Phase 5 is an additive release.

### From Phase 3 (Tool Support)

No changes required. Tool calling continues to work as before.

### From Phase 2 (Streaming)

No changes required. Streaming continues to work as before.

### From Phase 1 (Core Provider)

No changes required. All core functionality remains unchanged.

---

## Migrating from Other Providers

### From OpenAI Provider

```typescript
// Before: OpenAI
import { createOpenAI } from '@ai-sdk/openai';
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = openai('gpt-4');

// After: Copilot
import { createCopilotProvider } from 'ai-sdk-provider-copilot';
const copilot = createCopilotProvider();
const model = copilot('gpt-4');
```

### From Azure OpenAI

If using BYOK, configure the provider:

```typescript
const copilot = createCopilotProvider({
  provider: {
    type: 'azure',
    baseUrl: 'https://your-resource.openai.azure.com/openai/deployments/your-deployment',
    apiKey: process.env.AZURE_OPENAI_KEY,
    azure: {
      apiVersion: '2024-10-21',
    },
  },
});
```

### From Anthropic Provider

For BYOK with Anthropic:

```typescript
const copilot = createCopilotProvider({
  provider: {
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});
```

---

## Troubleshooting

### "CopilotClient is disposing" Error

You're trying to use the provider after calling `dispose()`. Create a new provider instance.

### Connection Timeouts

Increase the connection timeout:

```typescript
createCopilotProvider({
  connectionTimeoutMs: 30000, // 30 seconds
});
```

### Retries Not Working

1. Check that the error is classified as retryable (`isRetryableError(error)`)
2. Abort errors are never retried
3. Authentication errors are never retried

### Debug Logging Not Appearing

Set `verbose: true`:

```typescript
createCopilotProvider({ verbose: true });
```

Or provide a logger that implements `debug()`.
