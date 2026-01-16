/**
 * Basic Usage Example
 *
 * Demonstrates simple text generation with the Copilot provider.
 *
 * Run with: npx tsx examples/basic-usage.ts
 */

import { createCopilotProvider } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
    // Create the provider with default settings
    const copilot = createCopilotProvider();

    try {
        console.log('Generating text...\n');

        // Generate text using the AI SDK
        const result = await generateText({
            model: copilot('gpt-4'),
            prompt: 'Explain the concept of recursion in programming with a simple example.',
        });

        console.log('Response:');
        console.log(result.text);
        console.log('\n--- Metadata ---');
        console.log('Model:', result.response.modelId);
        console.log('Finish Reason:', result.finishReason);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Always dispose to clean up resources
        await copilot.dispose();
        console.log('\nProvider disposed.');
    }
}

main().catch(console.error);
