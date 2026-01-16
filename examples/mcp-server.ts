/**
 * MCP Server Integration Example
 *
 * Demonstrates how to use the Copilot provider with an MCP (Model Context Protocol)
 * server for extended capabilities.
 *
 * This example uses the public DeepWiki MCP server for code search and documentation.
 * DeepWiki allows you to search and explore GitHub repositories.
 * Learn more: https://mcp.deepwiki.com/
 *
 * Run with: npx tsx examples/mcp-server.ts
 */

import { createCopilotProvider } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
    console.log('--- MCP Server Integration Example (DeepWiki) ---\n');

    // Create provider with DeepWiki MCP server for code search
    const copilot = createCopilotProvider({
        verbose: true,
        mcpServers: {
            // DeepWiki MCP server - provides code search and GitHub repository exploration
            'deepwiki': {
                type: 'sse',
                url: 'https://mcp.deepwiki.com/mcp',
                tools: ['*'], // Include all tools from this server
            },
        },
    });

    try {
        console.log('Querying with DeepWiki MCP server enabled...\n');

        // The model can now use DeepWiki tools to search GitHub repositories
        const result = await generateText({
            model: copilot('gpt-5'),
            prompt: 'Using the DeepWiki tools, search the VS Code repository (https://github.com/microsoft/vscode) and explain how the extension host architecture works.',
        });

        console.log('Response:');
        console.log(result.text);
        console.log('\n--- Metadata ---');
        console.log('Model:', result.response.modelId);
        console.log('Finish Reason:', result.finishReason);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Always dispose the provider to clean up resources
        await copilot.dispose();
    }
}

main().catch(console.error);
