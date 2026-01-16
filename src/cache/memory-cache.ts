import type { CacheAdapter, Logger } from '../types.js';

/**
 * Options for the in-memory cache.
 */
export interface MemoryCacheOptions {
    /**
     * Maximum number of entries to store.
     * Oldest entries are evicted when limit is reached.
     * @default 100
     */
    maxEntries?: number;

    /**
     * Logger for cache operations.
     */
    logger?: Logger;
}

interface CacheEntry<T> {
    value: T;
    expiresAt?: number;
    insertedAt: number;
}

/**
 * Default in-memory cache configuration.
 */
export const DEFAULT_MEMORY_CACHE_OPTIONS: Required<Omit<MemoryCacheOptions, 'logger'>> = {
    maxEntries: 100,
};

/**
 * Creates an in-memory cache with LRU-like eviction.
 */
export function createMemoryCache(options: MemoryCacheOptions = {}): CacheAdapter {
    const config = { ...DEFAULT_MEMORY_CACHE_OPTIONS, ...options };
    const cache = new Map<string, CacheEntry<unknown>>();
    const logger = options.logger;

    function isExpired(entry: CacheEntry<unknown>): boolean {
        if (entry.expiresAt === undefined) return false;
        return Date.now() > entry.expiresAt;
    }

    function evictOldest(): void {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;

        for (const [key, entry] of cache.entries()) {
            if (entry.insertedAt < oldestTime) {
                oldestTime = entry.insertedAt;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            cache.delete(oldestKey);
            logger?.debug(`[cache] Evicted oldest entry: ${oldestKey.slice(0, 16)}...`);
        }
    }

    return {
        async get<T>(key: string): Promise<T | undefined> {
            const entry = cache.get(key) as CacheEntry<T> | undefined;

            if (!entry) {
                logger?.debug(`[cache] Miss: ${key.slice(0, 16)}...`);
                return undefined;
            }

            if (isExpired(entry)) {
                cache.delete(key);
                logger?.debug(`[cache] Expired: ${key.slice(0, 16)}...`);
                return undefined;
            }

            logger?.debug(`[cache] Hit: ${key.slice(0, 16)}...`);
            return entry.value;
        },

        async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
            // Evict if at capacity
            while (cache.size >= config.maxEntries) {
                evictOldest();
            }

            cache.set(key, {
                value,
                expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
                insertedAt: Date.now(),
            });

            logger?.debug(`[cache] Set: ${key.slice(0, 16)}... (TTL: ${ttlMs ?? 'none'})`);
        },

        async delete(key: string): Promise<void> {
            cache.delete(key);
            logger?.debug(`[cache] Deleted: ${key.slice(0, 16)}...`);
        },

        async clear(): Promise<void> {
            const size = cache.size;
            cache.clear();
            logger?.debug(`[cache] Cleared ${size} entries`);
        },

        async has(key: string): Promise<boolean> {
            const entry = cache.get(key);
            if (!entry) return false;
            if (isExpired(entry as CacheEntry<unknown>)) {
                cache.delete(key);
                return false;
            }
            return true;
        },
    };
}
