import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    mergeRetryOptions,
    calculateDelay,
    shouldRetry,
    withRetry,
    createRetryable,
    DEFAULT_RETRY_OPTIONS,
} from '../retry.js';
import type { Logger, RetryOptions } from '../types.js';
import { APICallError } from '@ai-sdk/provider';

describe('DEFAULT_RETRY_OPTIONS', () => {
    it('should have sensible defaults', () => {
        expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBe(3);
        expect(DEFAULT_RETRY_OPTIONS.initialDelayMs).toBe(100);
        expect(DEFAULT_RETRY_OPTIONS.maxDelayMs).toBe(5000);
        expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBe(2);
        expect(DEFAULT_RETRY_OPTIONS.jitter).toBe(0.1);
    });
});

describe('mergeRetryOptions', () => {
    it('should return defaults when no options provided', () => {
        const result = mergeRetryOptions();

        expect(result.maxRetries).toBe(DEFAULT_RETRY_OPTIONS.maxRetries);
        expect(result.initialDelayMs).toBe(DEFAULT_RETRY_OPTIONS.initialDelayMs);
    });

    it('should merge provider options with defaults', () => {
        const result = mergeRetryOptions({ maxRetries: 5 });

        expect(result.maxRetries).toBe(5);
        expect(result.initialDelayMs).toBe(DEFAULT_RETRY_OPTIONS.initialDelayMs);
    });

    it('should merge call options over provider options', () => {
        const result = mergeRetryOptions(
            { maxRetries: 5, initialDelayMs: 200 },
            { initialDelayMs: 300 }
        );

        expect(result.maxRetries).toBe(5);
        expect(result.initialDelayMs).toBe(300);
    });

    it('should preserve custom isRetryable function', () => {
        const customFn = () => true;
        const result = mergeRetryOptions({ isRetryable: customFn });

        expect(result.isRetryable).toBe(customFn);
    });
});

describe('calculateDelay', () => {
    it('should return initial delay for attempt 0', () => {
        const options = { ...DEFAULT_RETRY_OPTIONS, jitter: 0 };
        const delay = calculateDelay(0, options);

        expect(delay).toBe(100);
    });

    it('should apply exponential backoff', () => {
        const options = { ...DEFAULT_RETRY_OPTIONS, jitter: 0 };

        expect(calculateDelay(0, options)).toBe(100);
        expect(calculateDelay(1, options)).toBe(200);
        expect(calculateDelay(2, options)).toBe(400);
        expect(calculateDelay(3, options)).toBe(800);
    });

    it('should cap at maxDelayMs', () => {
        const options = { ...DEFAULT_RETRY_OPTIONS, jitter: 0, maxDelayMs: 500 };

        expect(calculateDelay(0, options)).toBe(100);
        expect(calculateDelay(1, options)).toBe(200);
        expect(calculateDelay(2, options)).toBe(400);
        expect(calculateDelay(3, options)).toBe(500); // Capped
        expect(calculateDelay(10, options)).toBe(500); // Still capped
    });

    it('should add jitter within range', () => {
        const options = { ...DEFAULT_RETRY_OPTIONS, jitter: 0.5 };

        // With 50% jitter on 100ms delay, result should be between 50 and 150
        const delays = Array.from({ length: 100 }, () => calculateDelay(0, options));

        expect(delays.every(d => d >= 50 && d <= 150)).toBe(true);
    });

    it('should never return negative delay', () => {
        const options = { ...DEFAULT_RETRY_OPTIONS, jitter: 1 }; // 100% jitter

        const delays = Array.from({ length: 100 }, () => calculateDelay(0, options));

        expect(delays.every(d => d >= 0)).toBe(true);
    });
});

describe('shouldRetry', () => {
    it('should return false when attempt exceeds maxRetries', () => {
        expect(shouldRetry(new Error('test'), 3, { maxRetries: 3 })).toBe(false);
        expect(shouldRetry(new Error('test'), 4, { maxRetries: 3 })).toBe(false);
    });

    it('should return true for retryable errors when under max', () => {
        // APICallError with isRetryable: true
        const error = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 503,
            responseHeaders: {},
            message: 'Service unavailable',
            isRetryable: true,
        });

        expect(shouldRetry(error, 0, { maxRetries: 3 })).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
        // APICallError with isRetryable: false
        const error = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 400,
            responseHeaders: {},
            message: 'Bad request',
            isRetryable: false,
        });

        expect(shouldRetry(error, 0, { maxRetries: 3 })).toBe(false);
    });

    it('should use custom isRetryable function when provided', () => {
        const customFn = vi.fn().mockReturnValue(true);
        const error = new Error('test');

        const result = shouldRetry(error, 0, {
            maxRetries: 3,
            isRetryable: customFn,
        });

        expect(customFn).toHaveBeenCalledWith(error);
        expect(result).toBe(true);
    });
});

describe('withRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should succeed on first attempt', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const result = await withRetry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
        const retryableError = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 503,
            responseHeaders: {},
            message: 'Service unavailable',
            isRetryable: true,
        });

        const fn = vi.fn()
            .mockRejectedValueOnce(retryableError)
            .mockRejectedValueOnce(retryableError)
            .mockResolvedValueOnce('success');

        const promise = withRetry(fn, { maxRetries: 3, jitter: 0 });

        // Advance through retry delays
        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(200);

        const result = await promise;

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw immediately on non-retryable errors', async () => {
        const nonRetryableError = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 400,
            responseHeaders: {},
            message: 'Bad request',
            isRetryable: false,
        });

        const fn = vi.fn().mockRejectedValue(nonRetryableError);

        await expect(withRetry(fn)).rejects.toThrow('Bad request');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exceeded', async () => {
        const retryableError = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 503,
            responseHeaders: {},
            message: 'Always fails',
            isRetryable: true,
        });

        const fn = vi.fn().mockRejectedValue(retryableError);

        const promise = withRetry(fn, { maxRetries: 2, jitter: 0 });

        // Advance through all retry delays
        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(200);
        await vi.advanceTimersByTimeAsync(400);

        await expect(promise).rejects.toThrow('Always fails');
        // Initial + 2 retries = 3 calls
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should log retry attempts when logger provided', async () => {
        const logger: Logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const retryableError = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 503,
            responseHeaders: {},
            message: 'Retry me',
            isRetryable: true,
        });

        const fn = vi.fn()
            .mockRejectedValueOnce(retryableError)
            .mockResolvedValueOnce('success');

        const promise = withRetry(fn, { maxRetries: 3, jitter: 0 }, logger);
        await vi.advanceTimersByTimeAsync(100);
        await promise;

        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Retry attempt')
        );
    });
});

describe('createRetryable', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should create a wrapped function with retry behavior', async () => {
        const original = vi.fn().mockResolvedValue('result');
        const retryable = createRetryable(original);

        const result = await retryable();

        expect(result).toBe('result');
        expect(original).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the original function', async () => {
        const original = vi.fn().mockResolvedValue('result');
        const retryable = createRetryable(original);

        await retryable('arg1', 'arg2');

        expect(original).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should retry on failure', async () => {
        const retryableError = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 503,
            responseHeaders: {},
            message: 'Fail once',
            isRetryable: true,
        });

        const original = vi.fn()
            .mockRejectedValueOnce(retryableError)
            .mockResolvedValueOnce('success');

        const retryable = createRetryable(original, { maxRetries: 2, jitter: 0 });

        const promise = retryable();
        await vi.advanceTimersByTimeAsync(100);
        const result = await promise;

        expect(result).toBe('success');
        expect(original).toHaveBeenCalledTimes(2);
    });
});
