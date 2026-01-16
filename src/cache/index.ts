/**
 * Cache module for response caching.
 * @module cache
 */

// Cache adapter interface and noop implementation
export { createNoopCache, type CacheAdapter } from './cache-adapter.js';

// In-memory cache implementation
export {
    createMemoryCache,
    DEFAULT_MEMORY_CACHE_OPTIONS,
    type MemoryCacheOptions,
} from './memory-cache.js';

// Cache key generation
export { generateCacheKey, hashPrompt } from './cache-key.js';

// Cache middleware
export { wrapWithCache, DEFAULT_CACHE_CONFIG } from './cache-middleware.js';

// Re-export types from main types module
export type { CacheConfig, CacheKeyOptions } from '../types.js';
