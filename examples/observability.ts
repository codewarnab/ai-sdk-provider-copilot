/**
 * Example: OpenTelemetry Observability Integration
 *
 * Demonstrates how to use OpenTelemetry tracing and metrics
 * with the Copilot AI SDK provider.
 *
 * Run with: npx tsx examples/observability.ts
 *
 * Prerequisites:
 * - @opentelemetry/api and @opentelemetry/sdk-node installed
 * - Optional: A collector like Jaeger for visualization
 */

import { createCopilotProvider, createTracer, createMetrics } from '../src/index.js';
import { generateText } from 'ai';

// Example with mock OTel setup (in production, use real OTel SDK)
async function main() {
    // Note: In production, use the real @opentelemetry/api:
    //
    // import { trace, metrics } from '@opentelemetry/api';
    // const tracerProvider = trace.getTracerProvider();
    // const meterProvider = metrics.getMeterProvider();
    //
    // const copilot = createCopilotProvider({
    //   telemetry: {
    //     tracerProvider,
    //     meterProvider,
    //     serviceName: 'my-app',
    //     recordContent: false, // Don't log content in production
    //   },
    // });

    // Create provider (without OTel for this example)
    const copilot = createCopilotProvider({
        verbose: true, // Enable debug logging
    });

    // Standalone tracer (for custom instrumentation)
    const tracer = createTracer({
        serviceName: 'my-app',
        // In production: tracerProvider: trace.getTracerProvider(),
    });

    // Standalone metrics (for custom metrics)
    const metricsRecorder = createMetrics({
        serviceName: 'my-app',
        // In production: meterProvider: metrics.getMeterProvider(),
    });

    try {
        // Manual span example (if you want custom spans)
        const span = await tracer.startGenerationSpan({
            operation: 'doGenerate',
            modelId: 'gpt-4',
            streaming: false,
        });

        try {
            const startTime = Date.now();

            // Generate text with Copilot
            const result = await generateText({
                model: copilot('gpt-4'),
                prompt: 'Explain observability in 3 sentences.',
            });

            console.log('\nResponse:', result.text);
            console.log('Usage:', result.usage);

            // Record span attributes (cast usage to access internal structure)
            const usage = result.usage as { promptTokens?: number; completionTokens?: number } | undefined;
            span.recordUsage(
                usage?.promptTokens,
                usage?.completionTokens
            );
            span.recordFinishReason('stop');

            // Record metrics
            await metricsRecorder.recordRequest({
                modelId: 'gpt-4',
                operation: 'generate',
                durationMs: Date.now() - startTime,
                inputTokens: usage?.promptTokens,
                outputTokens: usage?.completionTokens,
                success: true,
            });

            console.log('\n✓ Telemetry recorded successfully');
        } catch (error) {
            span.recordError(error as Error);
            await metricsRecorder.recordRequest({
                modelId: 'gpt-4',
                operation: 'generate',
                durationMs: 0,
                success: false,
                errorCategory: 'request',
            });
            throw error;
        } finally {
            span.end();
        }
    } finally {
        await copilot.dispose();
    }
}

main().catch(console.error);
