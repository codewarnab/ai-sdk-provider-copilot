# Observability & Tracing

The Copilot AI SDK Provider integrates with OpenTelemetry to provide deep visibility into your AI applications. This includes distributed tracing (W3C TraceContext) and metrics.

## Distributed Tracing (W3C TraceContext)

The provider supports **W3C TraceContext** propagation, allowing you to link traces across service boundaries. This is crucial when your AI application interacts with other microservices or when you want to trace a request from the frontend to the LLM backend.

### Enabling Propagation

Context propagation is enabled by configuring the `propagation` option in the provider.

```typescript
import { createCopilotProvider } from 'ai-sdk-provider-copilot';
import { createPropagator } from 'ai-sdk-provider-copilot/propagation';

const propagator = createPropagator({
    extractContext: true, // Extract trace parent from optional carrier
    injectContext: true,  // Inject trace context into outgoing headers
});

const copilot = createCopilotProvider({
    // ... other config
});

// The provider uses OTel internally for tracing. 
// If @opentelemetry/api is installed, traces are automatically propagated.
```

### Sub-path Import

You can import propagation utilities directly:

```typescript
import { createPropagator } from 'ai-sdk-provider-copilot/propagation';
```

### OpenTelemetry Setup

To fully utilize tracing, ensure your application is instrumented with OpenTelemetry.

```typescript
// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  serviceName: 'my-ai-service',
});

sdk.start();
```

## Metrics

The provider automatically emits metrics if OpenTelemetry is available.

- `gen_ai.client.token.usage`: Counter of tokens used (input/output).
- `gen_ai.client.operation.duration`: Histogram of operation latency.

### Labels
- `model`: The model ID used.
- `operation`: `generate` or `stream`.
- `provider`: `copilot`.

## Configuration

In `createCopilotProvider`, you can pass a `telemetry` config:

```typescript
const copilot = createCopilotProvider({
    telemetry: {
        enabled: true,
        tracerParams: {
            name: 'my-custom-tracer',
            version: '1.0.0',
        },
        recordInputs: false, // Set to true to record prompts in spans (careful with PII)
        recordOutputs: false // Set to true to record completions
    }
});
```
