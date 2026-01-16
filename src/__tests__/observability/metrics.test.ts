/**
 * Tests for OpenTelemetry metrics integration.
 */
import { describe, it, expect } from 'vitest';
import { createMetrics, METRIC_NAMES } from '../../observability/metrics.js';
import type { TelemetryConfig } from '../../types.js';

describe('METRIC_NAMES', () => {
    it('should define correct metric names', () => {
        expect(METRIC_NAMES.REQUEST_DURATION).toBe('copilot.request.duration');
        expect(METRIC_NAMES.REQUEST_COUNT).toBe('copilot.request.count');
        expect(METRIC_NAMES.TOKEN_INPUT).toBe('copilot.token.input');
        expect(METRIC_NAMES.TOKEN_OUTPUT).toBe('copilot.token.output');
        expect(METRIC_NAMES.ERROR_COUNT).toBe('copilot.error.count');
    });
});

describe('createMetrics', () => {
    describe('without meterProvider', () => {
        it('should return no-op metrics when meterProvider not provided', () => {
            const config: TelemetryConfig = {};
            const metrics = createMetrics(config);

            expect(metrics.recordRequest).toBeDefined();
        });

        it('should have no-op recordRequest that does not throw', async () => {
            const metrics = createMetrics({});

            // Should not throw
            await expect(
                metrics.recordRequest({
                    modelId: 'gpt-4',
                    operation: 'generate',
                    durationMs: 1000,
                    inputTokens: 10,
                    outputTokens: 20,
                    success: true,
                })
            ).resolves.toBeUndefined();
        });

        it('should handle error case without throwing', async () => {
            const metrics = createMetrics({});

            await expect(
                metrics.recordRequest({
                    modelId: 'gpt-4',
                    operation: 'generate',
                    durationMs: 1000,
                    success: false,
                    errorCategory: 'connection',
                })
            ).resolves.toBeUndefined();
        });
    });
});

describe('createMetrics service name', () => {
    it('should use default service name when not specified', () => {
        const metrics = createMetrics({});
        expect(metrics).toBeDefined();
    });

    it('should accept custom service name', () => {
        const metrics = createMetrics({ serviceName: 'custom-service' });
        expect(metrics).toBeDefined();
    });
});
