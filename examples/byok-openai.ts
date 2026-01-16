/**
 * BYOK OpenAI Example
 *
 * Demonstrates using Bring Your Own Key (BYOK) with an OpenAI endpoint.
 */

import { createCopilotProvider } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
    // Ensure API key is set
    if (!process.env.OPENAI_API_KEY) {
        console.error('Error: OPENAI_API_KEY environment variable is required');
        process.exit(1);
    }

    // Create provider with BYOK configuration
    const copilot = createCopilotProvider({
        provider: {
            type: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: process.env.OPENAI_API_KEY,
        },
        verbose: true,
    });

    try {
        console.log('Generating with BYOK OpenAI endpoint...\n');

        const result = await generateText({
            model: copilot('gpt-4o'),
            prompt: 'What are the main differences between TypeScript and JavaScript?',
        });

        console.log('Response:');
        console.log(result.text);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await copilot.dispose();
    }
}

main().catch(console.error);
