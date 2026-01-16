/**
 * Example: Session Pool Usage
 *
 * Demonstrates how to use the session pool for efficient
 * session reuse across multiple requests.
 *
 * Run with: npx tsx examples/session-pool.ts
 */

import { createCopilotProvider, SessionPool, HealthMonitor } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
    // Create provider with session pool and health monitoring
    const copilot = createCopilotProvider({
        sessionPool: {
            enabled: true,          // Enable session reuse
            maxIdleSessions: 3,     // Keep up to 3 idle sessions
            idleTimeoutMs: 300000,  // 5 minute idle timeout
            validateBeforeReuse: true,
        },
        healthMonitor: {
            failureThreshold: 3,    // Mark unhealthy after 3 failures
            failureWindowMs: 60000, // In a 1-minute window
            onHealthChange: (healthy, reason) => {
                console.log(`Health changed: ${healthy} (${reason})`);
            },
        },
        verbose: true,
    });

    try {
        // Make multiple requests - sessions may be reused
        console.log('Making 3 sequential requests...\n');

        for (let i = 1; i <= 3; i++) {
            console.log(`--- Request ${i} ---`);

            const result = await generateText({
                model: copilot('gpt-4'),
                prompt: `What is ${i} + ${i}?`,
            });

            console.log('Response:', result.text);
            console.log('');
        }

        console.log('✓ All requests completed');
    } finally {
        await copilot.dispose();
    }
}

// Standalone pool example (for advanced use cases)
async function standalonePoolExample() {
    console.log('\n--- Standalone Pool Example ---\n');

    // Create logger
    const logger = {
        debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
        info: (msg: string) => console.log(`[INFO] ${msg}`),
        warn: (msg: string) => console.log(`[WARN] ${msg}`),
        error: (msg: string) => console.log(`[ERROR] ${msg}`),
    };

    // Create pool
    const pool = new SessionPool(
        {
            enabled: true,
            maxIdleSessions: 5,
        },
        logger
    );

    // Create health monitor
    const healthMonitor = new HealthMonitor(
        {
            failureThreshold: 2,
            reconnectBaseDelayMs: 500,
        },
        logger
    );

    console.log('Pool stats:', pool.getStats());
    console.log('Health status:', healthMonitor.getStatus());

    // Simulate operations
    healthMonitor.recordSuccess();
    console.log('After success:', healthMonitor.getStatus());

    healthMonitor.recordFailure(new Error('Test error 1'));
    console.log('After failure 1:', healthMonitor.getStatus());

    healthMonitor.recordFailure(new Error('Test error 2'));
    console.log('After failure 2:', healthMonitor.getStatus());

    console.log('Reconnect delay:', healthMonitor.getReconnectDelay(), 'ms');

    // Clean up
    await pool.dispose();
}

main()
    .then(standalonePoolExample)
    .catch(console.error);
