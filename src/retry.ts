/**
 * Retry logic with exponential backoff for the Copilot provider.
 * 
 * Provides configurable retry behavior for transient failures with:
 * - Exponential backoff with configurable multiplier
 * - Maximum delay capping
 * - Jitter to prevent thundering herd
 * - Custom retryability classification
 * 
 * @module retry
 */

import type { RetryOptions, Logger } from './types.js';
import { isRetryableError } from './error.js';

/**
 * Default retry configuration.
 * Used when no explicit options are provided.
 */
export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'isRetryable'>> = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitter: 0.1,
};

/**
 * Merges retry options from provider and call levels.
 * Call-level options take precedence over provider-level.
 * 
 * @param providerOptions - Provider-level retry configuration
 * @param callOptions - Per-call retry configuration override
 * @returns Merged retry options with all defaults applied
 * 
 * @example
 * ```typescript
 * const options = mergeRetryOptions(
 *   { maxRetries: 5 },           // Provider level
 *   { initialDelayMs: 200 }      // Call level
 * );
 * // Result: { maxRetries: 5, initialDelayMs: 200, ...defaults }
 * ```
 */
export function mergeRetryOptions(
    providerOptions?: RetryOptions,
    callOptions?: RetryOptions
): Required<Omit<RetryOptions, 'isRetryable'>> & Pick<RetryOptions, 'isRetryable'> {
    return {
        ...DEFAULT_RETRY_OPTIONS,
        ...providerOptions,
        ...callOptions,
    };
}

/**
 * Calculates the delay before the next retry attempt.
 * Uses exponential backoff with optional jitter.
 * 
 * @param attempt - The current retry attempt number (0-indexed)
 * @param options - The retry configuration options
 * @returns The delay in milliseconds before retrying
 * 
 * @example
 * ```typescript
 * // With default options:
 * // Attempt 0: ~100ms (initial delay)
 * // Attempt 1: ~200ms (100 * 2^1)
 * // Attempt 2: ~400ms (100 * 2^2)
 * const delay = calculateDelay(2, DEFAULT_RETRY_OPTIONS);
 * ```
 */
export function calculateDelay(
    attempt: number,
    options: Required<Omit<RetryOptions, 'isRetryable'>>
): number {
    // Calculate base exponential delay
    const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);

    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

    // Add jitter: random value between -jitter% and +jitter%
    const jitterRange = cappedDelay * options.jitter;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Determines if an error should be retried.
 * 
 * @param error - The error to check
 * @param attempt - The current attempt number (0-indexed)
 * @param options - The retry configuration options
 * @returns true if the error should be retried
 * 
 * @example
 * ```typescript
 * const error = new Error('Connection timeout');
 * if (shouldRetry(error, 0, options)) {
 *   // Retry the operation
 * }
 * ```
 */
export function shouldRetry(
    error: unknown,
    attempt: number,
    options: RetryOptions
): boolean {
    // Check if we've exceeded max retries
    if (attempt >= (options.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries)) {
        return false;
    }

    // Use custom classification function if provided
    if (options.isRetryable) {
        return options.isRetryable(error);
    }

    // Use default error classification
    return isRetryableError(error);
}

/**
 * Executes an async function with automatic retry on failure.
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @param logger - Optional logger for retry attempt logging
 * @returns The result of the function on success
 * @throws The last error if all retries fail
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchData(),
 *   { maxRetries: 3, initialDelayMs: 100 },
 *   logger
 * );
 * ```
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
    logger?: Logger
): Promise<T> {
    const mergedOptions = mergeRetryOptions(options);
    let lastError: unknown;

    for (let attempt = 0; attempt <= mergedOptions.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (!shouldRetry(error, attempt, mergedOptions)) {
                throw error;
            }

            const delay = calculateDelay(attempt, mergedOptions);
            logger?.debug(
                `Retry attempt ${attempt + 1}/${mergedOptions.maxRetries} after ${delay}ms`
            );

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Creates a retryable version of an async function.
 * Returns a new function that automatically retries on failure.
 * 
 * @param fn - The async function to wrap with retry logic
 * @param options - Retry configuration options
 * @param logger - Optional logger for retry attempt logging
 * @returns A wrapped function with automatic retry behavior
 * 
 * @example
 * ```typescript
 * const retryableFetch = createRetryable(
 *   fetchData,
 *   { maxRetries: 3 },
 *   logger
 * );
 * 
 * // Every call to retryableFetch will automatically retry
 * const result = await retryableFetch(url, options);
 * ```
 */
export function createRetryable<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: RetryOptions = {},
    logger?: Logger
): (...args: TArgs) => Promise<TResult> {
    return (...args: TArgs) => withRetry(() => fn(...args), options, logger);
}
