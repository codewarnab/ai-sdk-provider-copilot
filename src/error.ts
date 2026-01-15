import { APICallError, LoadAPIKeyError } from '@ai-sdk/provider';

/**
 * Maps Copilot SDK errors to Vercel AI SDK error types.
 *
 * This provides consistent error handling across the AI SDK ecosystem
 * and enables features like automatic retries for transient errors.
 *
 * @param error - The error from Copilot SDK
 * @returns A properly typed AI SDK error
 */
export function mapCopilotError(error: unknown): Error {
    if (error instanceof Error) {
        // Don't wrap abort errors - they should propagate as-is
        if (error.name === 'AbortError') {
            return error;
        }

        const message = error.message.toLowerCase();

        // Authentication errors
        if (
            message.includes('unauthorized') ||
            message.includes('authentication') ||
            message.includes('api key') ||
            message.includes('credentials') ||
            message.includes('not authenticated') ||
            message.includes('login required')
        ) {
            return new LoadAPIKeyError({ message: error.message });
        }

        // Rate limit errors
        if (
            message.includes('rate limit') ||
            message.includes('quota') ||
            message.includes('too many requests')
        ) {
            return new APICallError({
                url: 'copilot://cli',
                requestBodyValues: {},
                statusCode: 429,
                responseHeaders: {},
                message: error.message,
                isRetryable: true,
            });
        }

        // Connection errors
        if (
            message.includes('connection') ||
            message.includes('econnrefused') ||
            message.includes('enotfound') ||
            message.includes('timeout') ||
            message.includes('network')
        ) {
            return new APICallError({
                url: 'copilot://cli',
                requestBodyValues: {},
                statusCode: 503,
                responseHeaders: {},
                message: error.message,
                isRetryable: true,
            });
        }

        // CLI process errors
        if (
            message.includes('cli not found') ||
            message.includes('spawn') ||
            message.includes('process') ||
            message.includes('executable')
        ) {
            return new APICallError({
                url: 'copilot://cli',
                requestBodyValues: {},
                statusCode: 500,
                responseHeaders: {},
                message: `Copilot CLI error: ${error.message}. Ensure the Copilot CLI is installed and accessible.`,
                isRetryable: false,
            });
        }

        // Session errors
        if (message.includes('session')) {
            return new APICallError({
                url: 'copilot://cli',
                requestBodyValues: {},
                statusCode: 400,
                responseHeaders: {},
                message: error.message,
                isRetryable: false,
            });
        }

        // Model not found errors
        if (message.includes('model') && message.includes('not found')) {
            return new APICallError({
                url: 'copilot://cli',
                requestBodyValues: {},
                statusCode: 404,
                responseHeaders: {},
                message: error.message,
                isRetryable: false,
            });
        }

        // Default: internal error (may be retryable)
        return new APICallError({
            url: 'copilot://cli',
            requestBodyValues: {},
            statusCode: 500,
            responseHeaders: {},
            message: error.message,
            isRetryable: true,
        });
    }

    // Unknown error type
    return new APICallError({
        url: 'copilot://cli',
        requestBodyValues: {},
        statusCode: 500,
        responseHeaders: {},
        message: 'An unknown error occurred',
        isRetryable: true,
    });
}

/**
 * Checks if an error is retryable.
 *
 * @param error - The error to check
 * @returns true if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
    if (error instanceof APICallError) {
        return error.isRetryable ?? false;
    }
    return false;
}

/**
 * Creates an abort error.
 *
 * @param message - Optional message for the abort error
 * @returns An AbortError
 */
export function createAbortError(message = 'Request was aborted'): Error {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}
