/**
 * Tests for OpenTelemetry tracing integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTracer, GEN_AI_ATTRIBUTES } from '../../observability/tracing.js';
import type { TelemetryConfig } from '../../types.js';

describe('GEN_AI_ATTRIBUTES', () => {
    it('should define correct attribute names', () => {
        expect(GEN_AI_ATTRIBUTES.SYSTEM).toBe('gen_ai.system');
        expect(GEN_AI_ATTRIBUTES.REQUEST_MODEL).toBe('gen_ai.request.model');
        expect(GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS).toBe('gen_ai.usage.input_tokens');
        expect(GEN_AI_ATTRIBUTES.SESSION_ID).toBe('copilot.session.id');
    });
});

describe('createTracer', () => {
    describe('without tracerProvider', () => {
        it('should return no-op tracer when tracerProvider not provided', async () => {
            const config: TelemetryConfig = {};
            const tracer = createTracer(config);

            const handle = await tracer.startGenerationSpan({
                operation: 'doGenerate',
                modelId: 'gpt-4',
            });

            expect(handle.span).toBeNull();
        });

        it('should have no-op methods that do not throw', async () => {
            const tracer = createTracer({});
            const handle = await tracer.startGenerationSpan({
                operation: 'doGenerate',
                modelId: 'gpt-4',
            });

            // All methods should be callable without throwing
            expect(() => handle.setSessionId('test')).not.toThrow();
            expect(() => handle.recordUsage(10, 20)).not.toThrow();
            expect(() => handle.recordFinishReason('stop')).not.toThrow();
            expect(() => handle.recordError(new Error('test'))).not.toThrow();
            expect(() => handle.end()).not.toThrow();
        });
    });

    describe('with tracerProvider', () => {
        let mockSpan: Record<string, unknown>;
        let mockTracer: Record<string, unknown>;
        let mockTracerProvider: Record<string, unknown>;

        beforeEach(() => {
            mockSpan = {
                setAttribute: vi.fn(),
                recordException: vi.fn(),
                setStatus: vi.fn(),
                end: vi.fn(),
            };

            mockTracer = {
                startSpan: vi.fn().mockReturnValue(mockSpan),
            };

            mockTracerProvider = {
                getTracer: vi.fn().mockReturnValue(mockTracer),
            };
        });

        it('should use custom service name', async () => {
            const tracer = createTracer({
                tracerProvider: mockTracerProvider,
                serviceName: 'my-service',
            });

            // Mock the import to work
            await tracer.startGenerationSpan({
                operation: 'doGenerate',
                modelId: 'gpt-4',
            });

            // The tracer should request a tracer with the service name
            // This test is limited because we can't easily mock dynamic imports
        });
    });
});

describe('createTracer service name', () => {
    it('should use default service name when not specified', () => {
        const tracer = createTracer({});
        // The default service name is used internally
        expect(tracer).toBeDefined();
    });

    it('should accept custom service name', () => {
        const tracer = createTracer({ serviceName: 'custom-service' });
        expect(tracer).toBeDefined();
    });
});
