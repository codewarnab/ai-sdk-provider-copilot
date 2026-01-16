import type { CacheAdapter } from '../types.js';

/**
 * Re-export the CacheAdapter interface for external implementations.
 */
export type { CacheAdapter };

/**
 * Creates a noop cache that never stores anything.
 * Useful for disabling caching at runtime.
 */
export function createNoopCache(): CacheAdapter {
    return {
        async get<T>(_key: string): Promise<T | undefined> {
            return undefined;
        },
        async set<T>(_key: string, _value: T, _ttlMs?: number): Promise<void> {
            // No-op
        },
        async delete(_key: string): Promise<void> {
            // No-op
        },
        async clear(): Promise<void> {
            // No-op
        },
        async has(_key: string): Promise<boolean> {
            return false;
        },
    };
}
