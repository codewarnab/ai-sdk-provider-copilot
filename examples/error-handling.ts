/**
 * Error Handling Example
 *
 * Demonstrates retry configuration and error handling.
 */

import { createCopilotProvider, isRetryableError, getRecoveryHint, classifyError } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
    // Create provider with custom retry configuration
    const copilot = createCopilotProvider({
        retry: {
            maxRetries: 5,
            initialDelayMs: 200,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            jitter: 0.2, // 20% randomness
        },
        verbose: true, // See retry attempts in logs
    });

    try {
        console.log('Making request with retry enabled...\n');

        const result = await generateText({
            model: copilot('gpt-4'),
            prompt: 'Say hello!',
            // Override retry for this specific call
            providerOptions: {
                copilot: {
                    retry: { maxRetries: 3 }, // Fewer retries for this call
                    requestTimeoutMs: 30000,
                },
            },
        });

        console.log('Response:', result.text);
    } catch (error) {
        console.error('Request failed after all retries.');

        // Analyze the error
        const classification = classifyError(error);
        console.log('\n--- Error Analysis ---');
        console.log('Category:', classification.category);
        console.log('Is Retryable:', classification.isRetryable);
        console.log('Retry Attempts:', classification.retryAttempts ?? 'N/A');

        // Get recovery suggestion
        const hint = getRecoveryHint(error);
        if (hint) {
            console.log('\nRecovery Hint:', hint);
        }
    } finally {
        await copilot.dispose();
    }
}

// Custom retry classification example
async function customRetryExample() {
    console.log('\n=== Custom Retry Classification ===\n');

    const copilot = createCopilotProvider({
        retry: {
            maxRetries: 3,
            // Custom function to determine retryability
            isRetryable: (error) => {
                if (error instanceof Error) {
                    // Only retry specific error types
                    const message = error.message.toLowerCase();
                    return (
                        message.includes('timeout') ||
                        message.includes('temporary') ||
                        message.includes('service unavailable')
                    );
                }
                return false;
            },
        },
    });

    try {
        const result = await generateText({
            model: copilot('gpt-4'),
            prompt: 'Test custom retry',
        });
        console.log('Response:', result.text);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await copilot.dispose();
    }
}

// Error inspection example
function errorInspectionExample() {
    console.log('\n=== Error Inspection Demo ===\n');

    const testErrors = [
        new Error('Unauthorized: Please login'),
        new Error('Rate limit exceeded'),
        new Error('Connection refused'),
        new Error('Session expired'),
        new Error('Unknown error occurred'),
    ];

    for (const error of testErrors) {
        const classification = classifyError(error);
        console.log(`"${error.message}"`);
        console.log(`  Category: ${classification.category}`);
        console.log(`  Retryable: ${classification.isRetryable}`);
        console.log(`  Hint: ${classification.recoveryHint}`);
        console.log();
    }
}

// Run examples
async function run() {
    await main();
    await customRetryExample();
    errorInspectionExample();
}

run().catch(console.error);
