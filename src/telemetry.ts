/**
 * Telemetry and logging utilities for the Copilot provider.
 * 
 * Provides a simple, consistent logging interface matching the Gemini CLI pattern.
 * Supports logger injection, verbose mode, and timing utilities.
 * 
 * @module telemetry
 */

import type { Logger } from './types.js';

/**
 * No-op logger that discards all output.
 * Used when logging is disabled.
 */
const noopLogger: Logger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};

/**
 * Console-based logger with [copilot] prefix.
 * Default logger when none is provided.
 */
const consoleLogger: Logger = {
    debug: (msg, ...args) => console.debug(`[copilot] ${msg}`, ...args),
    info: (msg, ...args) => console.info(`[copilot] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[copilot] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[copilot] ${msg}`, ...args),
};

/**
 * Gets a logger based on configuration.
 * 
 * @param logger - The logger configuration: a Logger instance, false to disable, or undefined for default
 * @param verbose - Whether verbose (debug) logging is enabled
 * @returns The resolved logger instance
 * 
 * @example
 * ```typescript
 * // Use custom logger
 * const logger = getLogger(myLogger, false);
 * 
 * // Disable logging
 * const silent = getLogger(false, false);
 * 
 * // Default console logger
 * const defaultLogger = getLogger(undefined, true);
 * ```
 */
export function getLogger(logger?: Logger | false, verbose?: boolean): Logger {
    if (logger === false) {
        return noopLogger;
    }

    const baseLogger = logger ?? consoleLogger;

    // If not verbose, suppress debug messages
    if (!verbose) {
        return createVerboseLogger(baseLogger, false);
    }

    return baseLogger;
}

/**
 * Creates a verbose-aware logger that optionally suppresses debug messages.
 * 
 * @param baseLogger - The underlying logger to wrap
 * @param verbose - Whether to allow debug messages through
 * @returns A logger that filters debug based on verbose setting
 */
export function createVerboseLogger(baseLogger: Logger, verbose: boolean): Logger {
    if (verbose) {
        return baseLogger;
    }

    return {
        ...baseLogger,
        debug: () => { }, // Suppress debug unless verbose
    };
}

/**
 * Result of a timed operation including the result and duration.
 */
export interface TimingResult<T> {
    /** The result of the operation */
    result: T;
    /** Duration of the operation in milliseconds */
    durationMs: number;
}

/**
 * Wraps an async function with timing measurement.
 * Logs the duration if a logger and operation name are provided.
 * 
 * @param fn - The async function to time
 * @param logger - Optional logger for timing output
 * @param operation - Optional operation name for logging
 * @returns The result and duration of the operation
 * 
 * @example
 * ```typescript
 * const { result, durationMs } = await withTiming(
 *   () => fetchData(),
 *   logger,
 *   'fetch-data'
 * );
 * console.log(`Fetched in ${durationMs}ms`);
 * ```
 */
export async function withTiming<T>(
    fn: () => Promise<T>,
    logger?: Logger,
    operation?: string
): Promise<TimingResult<T>> {
    const startTime = Date.now();

    try {
        const result = await fn();
        const durationMs = Date.now() - startTime;

        if (logger && operation) {
            logger.debug(`[timing] ${operation} completed in ${durationMs}ms`);
        }

        return { result, durationMs };
    } catch (error) {
        const durationMs = Date.now() - startTime;

        if (logger && operation) {
            logger.debug(`[timing] ${operation} failed after ${durationMs}ms`);
        }

        throw error;
    }
}

/**
 * Request context for logging correlation.
 * Used to track a single request across multiple log entries.
 */
export interface RequestContext {
    /** Unique identifier for this request */
    requestId: string;
    /** The model being used */
    modelId: string;
    /** Timestamp when the request started */
    startTime: number;
}

/**
 * Creates a request context for logging correlation.
 * 
 * @param modelId - The model ID for this request
 * @returns A new request context with unique ID
 * 
 * @example
 * ```typescript
 * const ctx = createRequestContext('gpt-4');
 * logger.info(`[${ctx.requestId}] Starting generation`);
 * ```
 */
export function createRequestContext(modelId: string): RequestContext {
    return {
        requestId: crypto.randomUUID(),
        modelId,
        startTime: Date.now(),
    };
}

/**
 * Formats a log message with request context.
 * 
 * @param ctx - The request context
 * @param message - The message to format
 * @returns Formatted message with request ID prefix
 */
export function formatWithContext(ctx: RequestContext, message: string): string {
    return `[${ctx.requestId}] ${message}`;
}
