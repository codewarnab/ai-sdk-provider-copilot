# Caching

The Copilot AI SDK Provider includes a built-in caching system to improve performance and reduce latency for repeated prompts.

## Overview

The caching system consists of:
- **Cache Middleware**: Wraps `LanguageModelV3` to intercept calls.
- **Cache Adapter**: Pluggable backend storage (memory-based by default).
- **Key Generator**: Configurable strategy for generating cache keys from prompts.

## Usage

### Enabling Caching

To enable caching, you can use the `createMemoryCache` and `wrapWithCache` utilities:

```typescript
import { createCopilotProvider } from 'ai-sdk-provider-copilot';
import { 
    createMemoryCache, 
    wrapWithCache, 
    DEFAULT_CACHE_CONFIG 
} from 'ai-sdk-provider-copilot/cache';

const copilot = createCopilotProvider();

// 1. Create a cache adapter (in-memory)
const memoryCache = createMemoryCache({
    maxEntries: 100, // Limit memory usage
});

// 2. Create a model
const baseModel = copilot('gpt-4');

// 3. Wrap the model with caching
const cachedModel = wrapWithCache(baseModel, {
    enabled: true,
    adapter: memoryCache,
    defaultTtlMs: 60 * 1000, // 1 minute Cache TTL
});

// 4. Use with AI SDK
const result1 = await generateText({
    model: cachedModel,
    prompt: 'Tell me a joke',
});

// Second call with same prompt returns cached result immediately
const result2 = await generateText({
    model: cachedModel,
    prompt: 'Tell me a joke',
});
```

### Configuration

#### Cache Options

```typescript
interface CacheConfig {
    enabled?: boolean;           // Master switch (default: false)
    adapter?: CacheAdapter;      // Storage backend (default: MemoryCache)
    defaultTtlMs?: number;       // Time-to-live in ms (default: 5 mins)
    keyGenerator?: func;         // Custom key generation logic
    cacheStreaming?: boolean;    // Cache streaming responses (TODO)
    cacheToolCalls?: boolean;    // Cache calls with tool use (default: false)
}
```

#### Memory Cache Options

```typescript
const cache = createMemoryCache({
    maxEntries: 1000,    // LRU eviction limit
    logger: console,     // Logger for debug info
});
```

## Custom Cache Adapters

You can implement the `CacheAdapter` interface to use external storage like Redis:

```typescript
import type { CacheAdapter } from 'ai-sdk-provider-copilot/cache';
import Redis from 'ioredis';

export class RedisCacheAdapter implements CacheAdapter {
    private client = new Redis();

    async get<T>(key: string): Promise<T | undefined> {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : undefined;
    }

    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
        if (ttlMs) {
            await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
        } else {
            await this.client.set(key, JSON.stringify(value));
        }
    }
    
    // ... implement delete, clear, has
}
```
