import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getLogger,
    createVerboseLogger,
    withTiming,
    createRequestContext,
    formatWithContext,
} from '../telemetry.js';
import type { Logger } from '../types.js';

describe('getLogger', () => {
    describe('with false', () => {
        it('should return a noop logger', () => {
            const logger = getLogger(false);

            // These should not throw
            logger.debug('test');
            logger.info('test');
            logger.warn('test');
            logger.error('test');
        });

        it('should not output anything', () => {
            const consoleSpy = vi.spyOn(console, 'debug');
            const logger = getLogger(false);

            logger.debug('test message');

            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('with undefined (default)', () => {
        it('should return console-based logger with verbose=false', () => {
            const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => { });
            const logger = getLogger(undefined, false);

            logger.info('test message');

            // Should use console.info with [copilot] prefix
            expect(consoleSpy).toHaveBeenCalledWith('[copilot] test message');
            consoleSpy.mockRestore();
        });

        it('should suppress debug when verbose=false', () => {
            const consoleSpy = vi.spyOn(console, 'debug');
            const logger = getLogger(undefined, false);

            logger.debug('debug message');

            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should allow debug when verbose=true', () => {
            const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => { });
            const logger = getLogger(undefined, true);

            logger.debug('debug message');

            expect(consoleSpy).toHaveBeenCalledWith('[copilot] debug message');
            consoleSpy.mockRestore();
        });
    });

    describe('with custom logger', () => {
        it('should return the custom logger', () => {
            const customLogger: Logger = {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            };

            const logger = getLogger(customLogger, true);

            logger.info('test');

            expect(customLogger.info).toHaveBeenCalledWith('test');
        });

        it('should wrap custom logger to suppress debug when verbose=false', () => {
            const customLogger: Logger = {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            };

            const logger = getLogger(customLogger, false);

            logger.debug('debug');
            logger.info('info');

            expect(customLogger.debug).not.toHaveBeenCalled();
            expect(customLogger.info).toHaveBeenCalledWith('info');
        });
    });
});

describe('createVerboseLogger', () => {
    it('should pass through all methods when verbose=true', () => {
        const baseLogger: Logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const logger = createVerboseLogger(baseLogger, true);

        logger.debug('d');
        logger.info('i');
        logger.warn('w');
        logger.error('e');

        expect(baseLogger.debug).toHaveBeenCalledWith('d');
        expect(baseLogger.info).toHaveBeenCalledWith('i');
        expect(baseLogger.warn).toHaveBeenCalledWith('w');
        expect(baseLogger.error).toHaveBeenCalledWith('e');
    });

    it('should suppress debug when verbose=false', () => {
        const baseLogger: Logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const logger = createVerboseLogger(baseLogger, false);

        logger.debug('d');
        logger.info('i');
        logger.warn('w');
        logger.error('e');

        expect(baseLogger.debug).not.toHaveBeenCalled();
        expect(baseLogger.info).toHaveBeenCalledWith('i');
        expect(baseLogger.warn).toHaveBeenCalledWith('w');
        expect(baseLogger.error).toHaveBeenCalledWith('e');
    });
});

describe('withTiming', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should measure successful operations', async () => {
        const fn = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'result';
        });

        const promise = withTiming(fn);
        await vi.advanceTimersByTimeAsync(100);
        const { result, durationMs } = await promise;

        expect(result).toBe('result');
        expect(durationMs).toBeGreaterThanOrEqual(100);
    });

    it('should measure failed operations', async () => {
        const fn = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            throw new Error('fail');
        });

        const promise = withTiming(fn);
        await vi.advanceTimersByTimeAsync(50);

        await expect(promise).rejects.toThrow('fail');
    });

    it('should log timing on success when logger and operation provided', async () => {
        const logger: Logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const fn = vi.fn().mockResolvedValue('result');

        await withTiming(fn, logger, 'test-op');

        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('[timing] test-op completed'));
    });

    it('should log timing on failure when logger and operation provided', async () => {
        const logger: Logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        await expect(withTiming(fn, logger, 'test-op')).rejects.toThrow('fail');

        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('[timing] test-op failed'));
    });
});

describe('createRequestContext', () => {
    it('should create a context with unique request ID', () => {
        const ctx1 = createRequestContext('gpt-4');
        const ctx2 = createRequestContext('gpt-4');

        expect(ctx1.requestId).toBeDefined();
        expect(ctx2.requestId).toBeDefined();
        expect(ctx1.requestId).not.toBe(ctx2.requestId);
    });

    it('should include the model ID', () => {
        const ctx = createRequestContext('claude-3');

        expect(ctx.modelId).toBe('claude-3');
    });

    it('should include a start time', () => {
        const before = Date.now();
        const ctx = createRequestContext('model');
        const after = Date.now();

        expect(ctx.startTime).toBeGreaterThanOrEqual(before);
        expect(ctx.startTime).toBeLessThanOrEqual(after);
    });
});

describe('formatWithContext', () => {
    it('should prefix message with request ID', () => {
        const ctx = createRequestContext('model');
        const formatted = formatWithContext(ctx, 'test message');

        expect(formatted).toBe(`[${ctx.requestId}] test message`);
    });
});
