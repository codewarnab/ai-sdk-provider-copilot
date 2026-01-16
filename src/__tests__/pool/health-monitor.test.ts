/**
 * Tests for health monitor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitor, DEFAULT_HEALTH_CONFIG } from '../../pool/health-monitor.js';
import type { Logger } from '../../types.js';

const mockLogger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

describe('DEFAULT_HEALTH_CONFIG', () => {
    it('should have expected defaults', () => {
        expect(DEFAULT_HEALTH_CONFIG.failureThreshold).toBe(3);
        expect(DEFAULT_HEALTH_CONFIG.failureWindowMs).toBe(60000);
        expect(DEFAULT_HEALTH_CONFIG.reconnectBaseDelayMs).toBe(1000);
    });
});

describe('HealthMonitor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('should be healthy initially', () => {
            const monitor = new HealthMonitor({}, mockLogger);
            expect(monitor.isHealthy()).toBe(true);
        });

        it('should have zero failure count initially', () => {
            const monitor = new HealthMonitor({}, mockLogger);
            const status = monitor.getStatus();
            expect(status.failureCount).toBe(0);
            expect(status.consecutiveFailures).toBe(0);
            expect(status.reconnectAttempts).toBe(0);
        });
    });

    describe('recordSuccess', () => {
        it('should clear consecutive failures', () => {
            const monitor = new HealthMonitor({}, mockLogger);

            monitor.recordFailure(new Error('test'));
            expect(monitor.getStatus().consecutiveFailures).toBe(1);

            monitor.recordSuccess();
            expect(monitor.getStatus().consecutiveFailures).toBe(0);
        });

        it('should restore healthy status', () => {
            const onHealthChange = vi.fn();
            const monitor = new HealthMonitor(
                { failureThreshold: 1, onHealthChange },
                mockLogger
            );

            monitor.recordFailure(new Error('test'));
            expect(monitor.isHealthy()).toBe(false);

            monitor.recordSuccess();
            expect(monitor.isHealthy()).toBe(true);
            expect(onHealthChange).toHaveBeenLastCalledWith(true, 'recovered');
        });

        it('should reset reconnect attempts', () => {
            const monitor = new HealthMonitor({}, mockLogger);

            monitor.getReconnectDelay();
            monitor.getReconnectDelay();
            expect(monitor.getStatus().reconnectAttempts).toBe(2);

            monitor.recordSuccess();
            expect(monitor.getStatus().reconnectAttempts).toBe(0);
        });
    });

    describe('recordFailure', () => {
        it('should increment consecutive failures', () => {
            const monitor = new HealthMonitor({}, mockLogger);

            monitor.recordFailure(new Error('test1'));
            expect(monitor.getStatus().consecutiveFailures).toBe(1);

            monitor.recordFailure(new Error('test2'));
            expect(monitor.getStatus().consecutiveFailures).toBe(2);
        });

        it('should mark unhealthy after threshold exceeded', () => {
            const onHealthChange = vi.fn();
            const monitor = new HealthMonitor(
                { failureThreshold: 2, onHealthChange },
                mockLogger
            );

            monitor.recordFailure(new Error('test1'));
            expect(monitor.isHealthy()).toBe(true);

            monitor.recordFailure(new Error('test2'));
            expect(monitor.isHealthy()).toBe(false);
            expect(onHealthChange).toHaveBeenCalledWith(
                false,
                expect.stringContaining('2 failures')
            );
        });

        it('should use sliding window for failure counting', async () => {
            vi.useFakeTimers();
            const monitor = new HealthMonitor(
                { failureThreshold: 3, failureWindowMs: 1000 },
                mockLogger
            );

            // Record failures
            monitor.recordFailure(new Error('test1'));
            vi.advanceTimersByTime(600);
            monitor.recordFailure(new Error('test2'));
            vi.advanceTimersByTime(600);

            // First failure should expire
            monitor.recordFailure(new Error('test3'));

            // Only 2 failures in window
            expect(monitor.getStatus().failureCount).toBe(2);

            vi.useRealTimers();
        });
    });

    describe('getReconnectDelay', () => {
        it('should return base delay for first attempt', () => {
            const monitor = new HealthMonitor(
                { reconnectBaseDelayMs: 1000 },
                mockLogger
            );

            const delay = monitor.getReconnectDelay();
            // With jitter, should be between 900 and 1100
            expect(delay).toBeGreaterThanOrEqual(900);
            expect(delay).toBeLessThanOrEqual(1100);
        });

        it('should use exponential backoff', () => {
            const monitor = new HealthMonitor(
                { reconnectBaseDelayMs: 100 },
                mockLogger
            );

            const delay1 = monitor.getReconnectDelay();
            const delay2 = monitor.getReconnectDelay();
            const delay3 = monitor.getReconnectDelay();

            // Base delays without jitter: 100, 200, 400
            expect(delay1).toBeLessThan(200);
            expect(delay2).toBeGreaterThanOrEqual(180);
            expect(delay2).toBeLessThanOrEqual(220);
            expect(delay3).toBeGreaterThanOrEqual(360);
            expect(delay3).toBeLessThanOrEqual(440);
        });

        it('should cap at maximum delay', () => {
            const monitor = new HealthMonitor(
                { reconnectBaseDelayMs: 10000 },
                mockLogger
            );

            // After 3 attempts: 10000, 20000, 40000 -> capped at 30000
            monitor.getReconnectDelay();
            monitor.getReconnectDelay();
            const delay = monitor.getReconnectDelay();

            // Should be around 30000 with jitter
            expect(delay).toBeLessThanOrEqual(33000);
        });
    });

    describe('resetReconnectAttempts', () => {
        it('should reset counter to zero', () => {
            const monitor = new HealthMonitor({}, mockLogger);

            monitor.getReconnectDelay();
            monitor.getReconnectDelay();
            expect(monitor.getStatus().reconnectAttempts).toBe(2);

            monitor.resetReconnectAttempts();
            expect(monitor.getStatus().reconnectAttempts).toBe(0);
        });
    });

    describe('reset', () => {
        it('should reset all state', () => {
            const monitor = new HealthMonitor(
                { failureThreshold: 1 },
                mockLogger
            );

            monitor.recordFailure(new Error('test'));
            monitor.getReconnectDelay();
            expect(monitor.isHealthy()).toBe(false);

            monitor.reset();

            const status = monitor.getStatus();
            expect(status.healthy).toBe(true);
            expect(status.failureCount).toBe(0);
            expect(status.consecutiveFailures).toBe(0);
            expect(status.reconnectAttempts).toBe(0);
        });
    });
});
