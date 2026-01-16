/**
 * Tool Calling Example
 *
 * Demonstrates using tools/function calling with the Copilot provider.
 *
 * NOTE: Copilot has its own built-in tools (web_fetch, report_intent, etc.)
 * that the model may prefer to use over custom-defined tools, especially
 * for common tasks like fetching web data. Custom tools work best for
 * domain-specific functionality that Copilot doesn't have built-in.
 *
 * Run with: npx tsx examples/tool-calling.ts
 */

import { createCopilotProvider } from '../src/index.js';
import { generateText } from 'ai';
import { z } from 'zod';

async function main() {
    const copilot = createCopilotProvider();

    try {
        console.log('Generating with tools...\n');

        const result = await generateText({
            model: copilot('gpt-5'),
            prompt: 'What is the weather in Tokyo and what is 42 * 17?',
            tools: {
                weather: {
                    description: 'Get the current weather in a given location',
                    inputSchema: z.object({
                        location: z.string().describe('The city and state, e.g., San Francisco, CA'),
                        unit: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
                    }),
                },
                calculator: {
                    description: 'Perform basic mathematical calculations',
                    inputSchema: z.object({
                        expression: z.string().describe('The mathematical expression to evaluate'),
                    }),
                },
            },
        });

        console.log('Final Response:');
        console.log(result.text);

        console.log('\n--- Tool Calls ---');
        if (result.toolCalls && result.toolCalls.length > 0) {
            for (const toolCall of result.toolCalls) {
                console.log(`Tool: ${toolCall.toolName}`);
                console.log(`  ID: ${toolCall.toolCallId}`);
                console.log(`  Input: ${JSON.stringify(toolCall.input)}`);
            }
        } else {
            console.log('No tool calls made');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await copilot.dispose();
    }
}

main().catch(console.error);
