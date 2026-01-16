/**
 * Error handling utilities for the Copilot provider.
 * 
 * Provides comprehensive error classification, mapping to AI SDK error types,
 * and recovery hints for common error scenarios.
 * 
 * @module error
 */

import { APICallError, LoadAPIKeyError } from '@ai-sdk/provider';
import type { CopilotErrorMetadata, ErrorCategory } from './types.js';

/**
 * Error patterns for classification.
 * Each pattern includes regex matches, category, retryability, status code, and recovery hints.
 */
const ERROR_PATTERNS: Array<{
    patterns: RegExp[];
    category: ErrorCategory;
    isRetryable: boolean;
    statusCode: number;
    recoveryHint: string;
}> = [
        // Authentication errors
        {
            patterns: [
                /unauthorized/i,
                /authentication/i,
                /api key/i,
                /credentials/i,
                /not authenticated/i,
                /access denied/i,
                /forbidden/i,
                /login required/i,
            ],
            category: 'authentication',
            isRetryable: false,
            statusCode: 401,
            recoveryHint: 'Check your authentication credentials and ensure you are logged in to Copilot CLI.',
        },
        // Rate limiting
        {
            patterns: [
                /rate limit/i,
                /quota/i,
                /too many requests/i,
                /throttl/i,
            ],
            category: 'rate-limit',
            isRetryable: true,
            statusCode: 429,
            recoveryHint: 'Wait before retrying. Consider implementing request queuing.',
        },
        // Connection errors
        {
            patterns: [
                /connection/i,
                /econnrefused/i,
                /econnreset/i,
                /enotfound/i,
                /timeout/i,
                /timed out/i,
                /network/i,
                /socket/i,
            ],
            category: 'connection',
            isRetryable: true,
            statusCode: 503,
            recoveryHint: 'Check network connectivity and ensure Copilot CLI server is running.',
        },
        // Session errors
        {
            patterns: [
                /session not found/i,
                /session expired/i,
                /invalid session/i,
            ],
            category: 'session',
            isRetryable: false,
            statusCode: 400,
            recoveryHint: 'Create a new session. The previous session may have expired or been destroyed.',
        },
        // Request errors
        {
            patterns: [
                /invalid/i,
                /bad request/i,
                /malformed/i,
                /validation/i,
            ],
            category: 'request',
            isRetryable: false,
            statusCode: 400,
            recoveryHint: 'Check request parameters and message format.',
        },
        // CLI process errors (non-retryable)
        {
            patterns: [
                /cli not found/i,
                /spawn/i,
                /executable/i,
                /enoent/i,
            ],
            category: 'internal',
            isRetryable: false,
            statusCode: 500,
            recoveryHint: 'Ensure the Copilot CLI is installed and accessible in PATH.',
        },
    ];

/**
 * Classifies an error and returns comprehensive metadata.
 * 
 * @param error - The error to classify
 * @returns Error metadata including category, retryability, and recovery hint
 * 
 * @example
 * ```typescript
 * const metadata = classifyError(new Error('Connection refused'));
 * console.log(metadata.category);    // 'connection'
 * console.log(metadata.isRetryable); // true
 * console.log(metadata.recoveryHint); // 'Check network connectivity...'
 * ```
 */
export function classifyError(error: unknown): CopilotErrorMetadata {
    const message = error instanceof Error ? error.message : String(error);

    for (const pattern of ERROR_PATTERNS) {
        for (const regex of pattern.patterns) {
            if (regex.test(message)) {
                return {
                    category: pattern.category,
                    isRetryable: pattern.isRetryable,
                    recoveryHint: pattern.recoveryHint,
                    cause: error,
                };
            }
        }
    }

    // Default: internal error, retryable (optimistic for transient issues)
    return {
        category: 'internal',
        isRetryable: true,
        recoveryHint: 'An internal error occurred. The operation may succeed on retry.',
        cause: error,
    };
}

/**
 * Map of error categories to HTTP-like status codes.
 */
const STATUS_CODE_MAP: Record<ErrorCategory, number> = {
    connection: 503,
    authentication: 401,
    'rate-limit': 429,
    session: 400,
    request: 400,
    internal: 500,
};

/**
 * Creates an API call error with enhanced metadata.
 * 
 * @param error - The original error
 * @param metadata - Optional override metadata
 * @returns An APICallError with full classification
 */
export function createCopilotAPIError(
    error: unknown,
    metadata?: Partial<CopilotErrorMetadata>
): APICallError {
    const classification = classifyError(error);
    const mergedMetadata = { ...classification, ...metadata };

    const message = error instanceof Error ? error.message : String(error);

    return new APICallError({
        url: 'copilot://cli',
        requestBodyValues: {},
        statusCode: STATUS_CODE_MAP[mergedMetadata.category],
        responseHeaders: {},
        message,
        data: mergedMetadata,
        isRetryable: mergedMetadata.isRetryable,
    });
}

/**
 * Maps Copilot SDK errors to Vercel AI SDK error types.
 * 
 * This provides consistent error handling across the AI SDK ecosystem
 * and enables features like automatic retries for transient errors.
 * 
 * @param error - The error from Copilot SDK
 * @param retryAttempts - Optional number of retry attempts made
 * @returns A properly typed AI SDK error
 */
export function mapCopilotError(
    error: unknown,
    retryAttempts?: number
): Error {
    // Don't wrap abort errors - they should propagate as-is
    if (error instanceof Error && error.name === 'AbortError') {
        return error;
    }

    const classification = classifyError(error);
    classification.retryAttempts = retryAttempts;

    // Return LoadAPIKeyError for authentication issues
    if (classification.category === 'authentication') {
        return new LoadAPIKeyError({
            message: error instanceof Error ? error.message : String(error),
        });
    }

    return createCopilotAPIError(error, classification);
}

/**
 * Checks if an error is retryable.
 * 
 * @param error - The error to check
 * @returns true if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
    // Abort errors are never retryable
    if (error instanceof Error && error.name === 'AbortError') {
        return false;
    }

    // Check if already an APICallError with isRetryable set
    if (error instanceof APICallError) {
        return error.isRetryable ?? false;
    }

    // Classify and check
    const classification = classifyError(error);
    return classification.isRetryable;
}

/**
 * Gets recovery hint for an error.
 * 
 * @param error - The error to get hint for
 * @returns The recovery hint, or undefined if none available
 */
export function getRecoveryHint(error: unknown): string | undefined {
    const classification = classifyError(error);
    return classification.recoveryHint;
}

/**
 * Checks if an error is of a specific category.
 * 
 * @param error - The error to check
 * @param category - The category to check against
 * @returns true if the error matches the category
 */
export function isErrorCategory(error: unknown, category: ErrorCategory): boolean {
    const classification = classifyError(error);
    return classification.category === category;
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
