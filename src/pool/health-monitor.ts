/**
 * Health monitor for tracking connection health and managing recovery.
 *
 * Implements passive error monitoring with sliding window failure
 * tracking and exponential backoff for reconnection attempts.
 *
 * @module pool/health-monitor
 */

import type { HealthMonitorConfig, Logger } from '../types.js';

/**
 * Default health monitor configuration.
 */
export const DEFAULT_HEALTH_CONFIG: Required<Omit<HealthMonitorConfig, 'onHealthChange'>> = {
    failureThreshold: 3,
    failureWindowMs: 60000, // 1 minute
    reconnectBaseDelayMs: 1000,
};

/**
 * Record of a failure for sliding window tracking.
 */
interface FailureRecord {
    timestamp: number;
    error: string;
}

/**
 * No-op logger for when none is provided.
 */
const noopLogger: Logger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};

/**
 * Health status information.
 */
export interface HealthStatus {
    /** Whether the connection is currently healthy */
    healthy: boolean;
    /** Number of failures in the current window */
    failureCount: number;
    /** Number of consecutive failures */
    consecutiveFailures: number;
    /** Number of reconnection attempts */
    reconnectAttempts: number;
}

/**
 * Monitors connection health and manages recovery.
 *
 * @example
 * ```typescript
 * const monitor = new HealthMonitor({
 *   failureThreshold: 3,
 *   onHealthChange: (healthy, reason) => {
 *     console.log(`Health changed: ${healthy} (${reason})`);
 *   }
 * }, logger);
 *
 * // After each operation:
 * try {
 *   await doOperation();
 *   monitor.recordSuccess();
 * } catch (error) {
 *   monitor.recordFailure(error);
 *   if (!monitor.isHealthy()) {
 *     await sleep(monitor.getReconnectDelay());
 *   }
 * }
 * ```
 */
export class HealthMonitor {
    private config: Required<Omit<HealthMonitorConfig, 'onHealthChange'>> &
        Pick<HealthMonitorConfig, 'onHealthChange'>;
    private logger: Logger;
    private failures: FailureRecord[] = [];
    private healthy = true;
    private consecutiveFailures = 0;
    private reconnectAttempts = 0;

    constructor(config: HealthMonitorConfig = {}, logger?: Logger) {
        this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
        this.logger = logger ?? noopLogger;
    }

    /**
     * Records a successful operation.
     * Clears failure counts and restores healthy status.
     */
    recordSuccess(): void {
        this.consecutiveFailures = 0;
        this.reconnectAttempts = 0;

        if (!this.healthy) {
            this.healthy = true;
            this.logger.info('[health] Connection restored');
            this.config.onHealthChange?.(true, 'recovered');
        }
    }

    /**
     * Records a failed operation.
     * Updates the sliding window and may mark as unhealthy.
     *
     * @param error - The error that occurred
     */
    recordFailure(error: Error): void {
        const now = Date.now();

        // Add to sliding window
        this.failures.push({ timestamp: now, error: error.message });

        // Remove old failures outside window
        this.failures = this.failures.filter(
            (f) => now - f.timestamp < this.config.failureWindowMs
        );

        this.consecutiveFailures++;

        // Check if threshold exceeded
        if (this.failures.length >= this.config.failureThreshold && this.healthy) {
            this.healthy = false;
            this.logger.warn(
                `[health] Marked unhealthy after ${this.failures.length} failures`
            );
            this.config.onHealthChange?.(false, `${this.failures.length} failures in window`);
        }
    }

    /**
     * Returns whether the connection is considered healthy.
     */
    isHealthy(): boolean {
        return this.healthy;
    }

    /**
     * Gets the delay before next reconnection attempt.
     * Uses exponential backoff with jitter.
     *
     * @returns Delay in milliseconds
     */
    getReconnectDelay(): number {
        const baseDelay = this.config.reconnectBaseDelayMs;
        const exponential = baseDelay * Math.pow(2, this.reconnectAttempts);
        const maxDelay = 30000; // 30 second max
        const delay = Math.min(exponential, maxDelay);

        // Add jitter (±10%)
        const jitter = delay * 0.1 * (Math.random() * 2 - 1);

        this.reconnectAttempts++;
        return Math.round(delay + jitter);
    }

    /**
     * Resets reconnection attempt counter.
     */
    resetReconnectAttempts(): void {
        this.reconnectAttempts = 0;
    }

    /**
     * Gets current health status.
     */
    getStatus(): HealthStatus {
        return {
            healthy: this.healthy,
            failureCount: this.failures.length,
            consecutiveFailures: this.consecutiveFailures,
            reconnectAttempts: this.reconnectAttempts,
        };
    }

    /**
     * Resets all state to initial values.
     */
    reset(): void {
        this.failures = [];
        this.healthy = true;
        this.consecutiveFailures = 0;
        this.reconnectAttempts = 0;
    }
}
