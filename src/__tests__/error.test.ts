import { describe, it, expect } from 'vitest';
import { APICallError, LoadAPIKeyError } from '@ai-sdk/provider';
import {
    mapCopilotError,
    isRetryableError,
    createAbortError,
} from '../error.js';

describe('mapCopilotError', () => {
    describe('authentication errors', () => {
        it('should map unauthorized error to LoadAPIKeyError', () => {
            const error = new Error('Unauthorized: Please authenticate');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(LoadAPIKeyError);
        });

        it('should map authentication error to LoadAPIKeyError', () => {
            const error = new Error('Authentication failed');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(LoadAPIKeyError);
        });

        it('should map api key error to LoadAPIKeyError', () => {
            const error = new Error('Invalid API key');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(LoadAPIKeyError);
        });

        it('should map credentials error to LoadAPIKeyError', () => {
            const error = new Error('Invalid credentials');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(LoadAPIKeyError);
        });
    });

    describe('rate limit errors', () => {
        it('should map rate limit error with retry flag', () => {
            const error = new Error('Rate limit exceeded');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).statusCode).toBe(429);
            expect((result as APICallError).isRetryable).toBe(true);
        });

        it('should map quota error with retry flag', () => {
            const error = new Error('Quota exceeded');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).statusCode).toBe(429);
        });
    });

    describe('connection errors', () => {
        it('should map connection error as retryable', () => {
            const error = new Error('Connection refused');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).statusCode).toBe(503);
            expect((result as APICallError).isRetryable).toBe(true);
        });

        it('should map ECONNREFUSED error as retryable', () => {
            const error = new Error('ECONNREFUSED');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).statusCode).toBe(503);
        });

        it('should map timeout error as retryable', () => {
            const error = new Error('Request timeout');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).statusCode).toBe(503);
            expect((result as APICallError).isRetryable).toBe(true);
        });
    });

    describe('CLI process errors', () => {
        it('should map CLI not found error', () => {
            const error = new Error('CLI not found');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).statusCode).toBe(500);
            expect((result as APICallError).isRetryable).toBe(false);
        });

        it('should map spawn error', () => {
            const error = new Error('spawn ENOENT');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).isRetryable).toBe(false);
        });
    });

    describe('session errors', () => {
        it('should map session error as non-retryable', () => {
            const error = new Error('Session not found');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).statusCode).toBe(400);
            expect((result as APICallError).isRetryable).toBe(false);
        });
    });

    describe('abort errors', () => {
        it('should pass through abort errors unchanged', () => {
            const error = new Error('Request aborted');
            error.name = 'AbortError';

            const result = mapCopilotError(error);

            expect(result).toBe(error);
            expect(result.name).toBe('AbortError');
        });
    });

    describe('unknown errors', () => {
        it('should map unknown Error to APICallError', () => {
            const error = new Error('Something went wrong');
            const result = mapCopilotError(error);

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).statusCode).toBe(500);
            expect((result as APICallError).isRetryable).toBe(true);
        });

        it('should map non-Error to APICallError', () => {
            const result = mapCopilotError('string error');

            expect(result).toBeInstanceOf(APICallError);
            expect((result as APICallError).message).toBe('An unknown error occurred');
        });

        it('should map null to APICallError', () => {
            const result = mapCopilotError(null);

            expect(result).toBeInstanceOf(APICallError);
        });
    });
});

describe('isRetryableError', () => {
    it('should return true for retryable APICallError', () => {
        const error = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 503,
            responseHeaders: {},
            message: 'Test',
            isRetryable: true,
        });

        expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for non-retryable APICallError', () => {
        const error = new APICallError({
            url: 'test',
            requestBodyValues: {},
            statusCode: 400,
            responseHeaders: {},
            message: 'Test',
            isRetryable: false,
        });

        expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for non-APICallError', () => {
        expect(isRetryableError(new Error('test'))).toBe(false);
        expect(isRetryableError('string')).toBe(false);
        expect(isRetryableError(null)).toBe(false);
    });
});

describe('createAbortError', () => {
    it('should create an AbortError with default message', () => {
        const error = createAbortError();

        expect(error.name).toBe('AbortError');
        expect(error.message).toBe('Request was aborted');
    });

    it('should create an AbortError with custom message', () => {
        const error = createAbortError('Custom abort message');

        expect(error.name).toBe('AbortError');
        expect(error.message).toBe('Custom abort message');
    });
});
