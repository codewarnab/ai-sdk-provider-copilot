/**
 * Tool Calling Example
 *
 * Demonstrates using tools/function calling with the Copilot provider.
 */

import { createCopilotProvider } from '../src/index.js';
import { generateText } from 'ai';
import { z } from 'zod';

async function main() {
    const copilot = createCopilotProvider();

    try {
        console.log('Generating with tools...\n');

        const result = await generateText({
            model: copilot('gpt-4'),
            prompt: 'What is the weather in Tokyo and what is 42 * 17?',
            tools: {
                weather: {
                    description: 'Get the current weather in a given location',
                    parameters: z.object({
                        location: z.string().describe('The city and state, e.g., San Francisco, CA'),
                        unit: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
                    }),
                },
                calculator: {
                    description: 'Perform basic mathematical calculations',
                    parameters: z.object({
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
                console.log(`  Args: ${JSON.stringify(toolCall.args)}`);
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
