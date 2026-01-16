/**
 * HTTP Server with SSE Streaming Example
 *
 * Demonstrates using the Copilot provider with a Node.js HTTP server
 * that streams responses via Server-Sent Events (SSE).
 *
 * This example shows AI SDK compatibility with standard SSE streaming.
 *
 * Run with: npx tsx examples/http-server-sse.ts
 * Test with: curl http://localhost:3000/chat?prompt=Hello
 */

import http from 'http';
import { URL } from 'url';
import { createCopilotProvider } from '../src/index.js';
import { streamText } from 'ai';

const PORT = 3000;

// Create provider once for the server
const copilot = createCopilotProvider({
    verbose: true,
});

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    // Health check endpoint
    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    // SSE streaming endpoint
    if (url.pathname === '/chat') {
        const prompt = url.searchParams.get('prompt') || 'Hello!';

        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });

        try {
            console.log(`\n[Server] Received request: "${prompt}"`);

            // Stream text using AI SDK
            const result = await streamText({
                model: copilot('gpt-4'),
                prompt,
            });

            // Stream the response as SSE events
            for await (const chunk of result.textStream) {
                // SSE format: data: <content>\n\n
                res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
            }

            // Get final metadata
            const usage = await result.usage;
            const finishReason = await result.finishReason;

            // Send completion event
            res.write(`data: ${JSON.stringify({
                type: 'done',
                finishReason,
                usage,
            })}\n\n`);

            console.log(`[Server] Stream completed`);
        } catch (error) {
            console.error('[Server] Error:', error);
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            })}\n\n`);
        }

        res.end();
        return;
    }

    // Default: show usage info
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Copilot SSE Server</title></head>
        <body>
            <h1>Copilot AI SDK SSE Server</h1>
            <h2>Endpoints:</h2>
            <ul>
                <li><code>GET /chat?prompt=YOUR_PROMPT</code> - Stream a response via SSE</li>
                <li><code>GET /health</code> - Health check</li>
            </ul>
            <h2>Test with curl:</h2>
            <pre>curl "http://localhost:${PORT}/chat?prompt=Tell me a joke"</pre>
            <h2>Live Demo:</h2>
            <input type="text" id="prompt" placeholder="Enter prompt..." style="width: 300px">
            <button onclick="sendPrompt()">Send</button>
            <pre id="output" style="background: #f0f0f0; padding: 10px; min-height: 100px;"></pre>
            <script>
                function sendPrompt() {
                    const prompt = document.getElementById('prompt').value;
                    const output = document.getElementById('output');
                    output.textContent = '';
                    
                    const eventSource = new EventSource('/chat?prompt=' + encodeURIComponent(prompt));
                    
                    eventSource.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        if (data.type === 'text') {
                            output.textContent += data.content;
                        } else if (data.type === 'done') {
                            output.textContent += '\\n\\n--- Done ---';
                            eventSource.close();
                        } else if (data.type === 'error') {
                            output.textContent += '\\nError: ' + data.message;
                            eventSource.close();
                        }
                    };
                    
                    eventSource.onerror = () => {
                        eventSource.close();
                    };
                }
            </script>
        </body>
        </html>
    `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[Server] Shutting down...');
    await copilot.dispose();
    server.close();
    process.exit(0);
});

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Copilot SSE Server running at http://localhost:${PORT}         ║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    GET /chat?prompt=...  - Stream response via SSE           ║
║    GET /health           - Health check                      ║
║                                                              ║
║  Test with:                                                  ║
║    curl "http://localhost:${PORT}/chat?prompt=Hello"            ║
║                                                              ║
║  Or open http://localhost:${PORT} in your browser              ║
║                                                              ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
    `);
});
