import { describe, it, expect } from 'vitest';
import { APICallError, LoadAPIKeyError } from '@ai-sdk/provider';
import {
    mapCopilotError,
    isRetryableError,
    createAbortError,
    classifyError,
    createCopilotAPIError,
    getRecoveryHint,
    isErrorCategory,
} from '../error.js';

describe('classifyError', () => {
    describe('authentication errors', () => {
        it('should classify unauthorized as authentication', () => {
            const result = classifyError(new Error('Unauthorized'));

            expect(result.category).toBe('authentication');
            expect(result.isRetryable).toBe(false);
        });

        it('should classify access denied as authentication', () => {
            const result = classifyError(new Error('Access denied'));

            expect(result.category).toBe('authentication');
            expect(result.isRetryable).toBe(false);
        });

        it('should include recovery hint for auth errors', () => {
            const result = classifyError(new Error('Authentication failed'));

            expect(result.recoveryHint).toContain('authentication');
        });
    });

    describe('rate limit errors', () => {
        it('should classify rate limit as rate-limit', () => {
            const result = classifyError(new Error('Rate limit exceeded'));

            expect(result.category).toBe('rate-limit');
            expect(result.isRetryable).toBe(true);
        });

        it('should classify quota exceeded as rate-limit', () => {
            const result = classifyError(new Error('Quota exceeded'));

            expect(result.category).toBe('rate-limit');
            expect(result.isRetryable).toBe(true);
        });
    });

    describe('connection errors', () => {
        it('should classify connection refused as connection', () => {
            const result = classifyError(new Error('ECONNREFUSED'));

            expect(result.category).toBe('connection');
            expect(result.isRetryable).toBe(true);
        });

        it('should classify timeout as connection', () => {
            const result = classifyError(new Error('Request timed out'));

            expect(result.category).toBe('connection');
            expect(result.isRetryable).toBe(true);
        });

        it('should classify network error as connection', () => {
            const result = classifyError(new Error('Network error'));

            expect(result.category).toBe('connection');
            expect(result.isRetryable).toBe(true);
        });
    });

    describe('session errors', () => {
        it('should classify session not found as session', () => {
            const result = classifyError(new Error('Session not found'));

            expect(result.category).toBe('session');
            expect(result.isRetryable).toBe(false);
        });

        it('should classify session expired as session', () => {
            const result = classifyError(new Error('Session expired'));

            expect(result.category).toBe('session');
            expect(result.isRetryable).toBe(false);
        });
    });

    describe('request errors', () => {
        it('should classify invalid request as request', () => {
            const result = classifyError(new Error('Invalid request'));

            expect(result.category).toBe('request');
            expect(result.isRetryable).toBe(false);
        });

        it('should classify bad request as request', () => {
            const result = classifyError(new Error('Bad request'));

            expect(result.category).toBe('request');
            expect(result.isRetryable).toBe(false);
        });
    });

    describe('internal errors', () => {
        it('should classify unknown errors as internal', () => {
            const result = classifyError(new Error('Something went wrong'));

            expect(result.category).toBe('internal');
            expect(result.isRetryable).toBe(true);
        });

        it('should classify CLI not found as internal non-retryable', () => {
            const result = classifyError(new Error('CLI not found'));

            expect(result.category).toBe('internal');
            expect(result.isRetryable).toBe(false);
        });
    });

    it('should include the original error as cause', () => {
        const original = new Error('Test error');
        const result = classifyError(original);

        expect(result.cause).toBe(original);
    });
});

describe('createCopilotAPIError', () => {
    it('should create APICallError with correct status code', () => {
        const error = createCopilotAPIError(new Error('Rate limit'));

        expect(error).toBeInstanceOf(APICallError);
        expect(error.statusCode).toBe(429);
    });

    it('should include metadata in data field', () => {
        const error = createCopilotAPIError(new Error('Connection error'));

        expect(error.data).toBeDefined();
        expect((error.data as { category: string }).category).toBe('connection');
    });

    it('should set isRetryable correctly', () => {
        const retryable = createCopilotAPIError(new Error('Connection error'));
        const nonRetryable = createCopilotAPIError(new Error('Authentication failed'));

        expect(retryable.isRetryable).toBe(true);
        expect(nonRetryable.isRetryable).toBe(false);
    });

    it('should allow metadata override', () => {
        const error = createCopilotAPIError(
            new Error('Test'),
            { category: 'rate-limit', isRetryable: true }
        );

        expect((error.data as { category: string }).category).toBe('rate-limit');
    });
});

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
        });

        it('should map null to APICallError', () => {
            const result = mapCopilotError(null);

            expect(result).toBeInstanceOf(APICallError);
        });
    });

    it('should include retry attempts in metadata when provided', () => {
        const result = mapCopilotError(new Error('Connection error'), 3);

        expect(result).toBeInstanceOf(APICallError);
        expect((((result as APICallError).data) as { retryAttempts: number }).retryAttempts).toBe(3);
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

    it('should classify and check regular errors', () => {
        // Connection errors are retryable
        expect(isRetryableError(new Error('Connection refused'))).toBe(true);

        // Auth errors are not retryable
        expect(isRetryableError(new Error('Unauthorized'))).toBe(false);
    });

    it('should return false for abort errors', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';

        expect(isRetryableError(error)).toBe(false);
    });
});

describe('getRecoveryHint', () => {
    it('should return hint for authentication errors', () => {
        const hint = getRecoveryHint(new Error('Unauthorized'));

        expect(hint).toContain('authentication');
    });

    it('should return hint for connection errors', () => {
        const hint = getRecoveryHint(new Error('Connection refused'));

        expect(hint).toContain('network');
    });

    it('should return hint for rate limit errors', () => {
        const hint = getRecoveryHint(new Error('Rate limit'));

        expect(hint).toContain('Wait');
    });

    it('should return generic hint for unknown errors', () => {
        const hint = getRecoveryHint(new Error('Unknown error'));

        expect(hint).toBeDefined();
    });
});

describe('isErrorCategory', () => {
    it('should return true for matching category', () => {
        expect(isErrorCategory(new Error('Unauthorized'), 'authentication')).toBe(true);
        expect(isErrorCategory(new Error('Connection refused'), 'connection')).toBe(true);
        expect(isErrorCategory(new Error('Rate limit'), 'rate-limit')).toBe(true);
    });

    it('should return false for non-matching category', () => {
        expect(isErrorCategory(new Error('Unauthorized'), 'connection')).toBe(false);
        expect(isErrorCategory(new Error('Connection refused'), 'authentication')).toBe(false);
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
