/**
 * BYOK OpenAI Example
 *
 * Demonstrates using Bring Your Own Key (BYOK) with an OpenAI endpoint.
 * 
 * Set the OPENAI_API_KEY environment variable before running:
 * 
 * Windows (PowerShell):
 *   $env:OPENAI_API_KEY = "sk-your-api-key"
 * 
 * Windows (CMD):
 *   set OPENAI_API_KEY=sk-your-api-key
 * 
 * macOS / Linux:
 *   export OPENAI_API_KEY="sk-your-api-key"
 * 
 * Then run: npx tsx examples/byok-openai.ts
 */

import { createCopilotProvider } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
    // Ensure API key is set
    if (!process.env.OPENAI_API_KEY) {
        console.error('Error: OPENAI_API_KEY environment variable is required');
        console.error('');
        console.error('Set it first:');
        console.error('  Windows (PowerShell): $env:OPENAI_API_KEY = "sk-..."');
        console.error('  Windows (CMD):        set OPENAI_API_KEY=sk-...');
        console.error('  macOS/Linux:          export OPENAI_API_KEY="sk-..."');
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
