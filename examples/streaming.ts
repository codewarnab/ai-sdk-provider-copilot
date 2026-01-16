/**
 * Streaming Example
 *
 * Demonstrates streaming text generation with real-time output.
 *
 * Run with: npx tsx examples/streaming.ts
 */

import { createCopilotProvider } from '../src/index.js';
import { streamText } from 'ai';

async function main() {
    // Create provider with verbose logging
    const copilot = createCopilotProvider({
        verbose: true,
    });

    try {
        console.log('Starting streaming generation...\n');

        // Stream text using the AI SDK
        const result = await streamText({
            model: copilot('gpt-4'),
            prompt: 'Write a short poem about coding at midnight.',
        });

        // Read the stream in real-time
        console.log('Response:\n');
        for await (const chunk of result.textStream) {
            process.stdout.write(chunk);
        }
        console.log('\n');

        // Get final result after stream completes
        console.log('\n--- Metadata ---');
        console.log('Finish Reason:', result.finishReason);

        // Access usage information if available
        const usage = await result.usage;
        if (usage) {
            console.log('Input Tokens:', (usage as Record<string, unknown>).promptTokens ?? usage);
            console.log('Output Tokens:', (usage as Record<string, unknown>).completionTokens ?? usage);
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await copilot.dispose();
        console.log('\nProvider disposed.');
    }
}

main().catch(console.error);
