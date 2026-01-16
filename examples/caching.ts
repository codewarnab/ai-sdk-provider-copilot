/**
 * Caching Example
 *
 * Demonstrates response caching to improve performance and reduce
 * API calls for repeated prompts.
 *
 * Run with: npx tsx examples/caching.ts
 */

import { createCopilotProvider } from '../src/copilot-provider.js';
import { createMemoryCache, wrapWithCache } from '../src/cache/index.js';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('--- Caching Example ---\n');

    const copilot = createCopilotProvider({
        verbose: true,
    });

    // 1. Setup Cache
    const cache = createMemoryCache({
        maxEntries: 10,
        logger: console, // Log cache operations
    });

    // 2. Wrap model
    const baseModel = copilot('gpt-4');
    const cachedModel = wrapWithCache(baseModel, {
        enabled: true,
        adapter: cache,
        defaultTtlMs: 5000, // Short TTL for testing
    });

    const prompt = 'What is the capital of France? Answer in one word.';

    // 3. First call (Cache Miss)
    console.time('First Call');
    console.log(`> Asking: "${prompt}"`);
    const result1 = await generateText({
        model: cachedModel,
        prompt,
    });
    console.timeEnd('First Call');
    console.log(`< Response: ${result1.text}\n`);

    // 4. Second call (Cache Hit)
    console.time('Second Call (Cached)');
    console.log(`> Asking again: "${prompt}"`);
    const result2 = await generateText({
        model: cachedModel,
        prompt,
    });
    console.timeEnd('Second Call (Cached)');
    console.log(`< Response: ${result2.text}\n`);

    console.log('Done!');
    await copilot.dispose();
}

main().catch(console.error);
