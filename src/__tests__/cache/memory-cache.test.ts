import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryCache, DEFAULT_MEMORY_CACHE_OPTIONS } from '../../cache/memory-cache.js';

describe('createMemoryCache', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('creates a working cache', () => {
        const cache = createMemoryCache();
        expect(cache).toBeDefined();
        expect(cache.get).toBeInstanceOf(Function);
        expect(cache.set).toBeInstanceOf(Function);
        expect(cache.delete).toBeInstanceOf(Function);
        expect(cache.clear).toBeInstanceOf(Function);
        expect(cache.has).toBeInstanceOf(Function);
    });

    it('returns undefined for missing keys', async () => {
        const cache = createMemoryCache();
        const result = await cache.get('nonexistent');
        expect(result).toBeUndefined();
    });

    it('set and get round-trips correctly', async () => {
        const cache = createMemoryCache();
        const value = { message: 'hello world', count: 42 };

        await cache.set('test-key', value);
        const result = await cache.get('test-key');

        expect(result).toEqual(value);
    });

    it('TTL expiration works', async () => {
        const cache = createMemoryCache();
        const value = { data: 'expires' };

        await cache.set('ttl-key', value, 1000); // 1 second TTL

        // Should exist immediately
        expect(await cache.get('ttl-key')).toEqual(value);

        // Advance time past TTL
        vi.advanceTimersByTime(1001);

        // Should be expired
        expect(await cache.get('ttl-key')).toBeUndefined();
    });

    it('max entries eviction works (LRU)', async () => {
        const cache = createMemoryCache({ maxEntries: 3 });

        await cache.set('key1', 'value1');
        vi.advanceTimersByTime(10);
        await cache.set('key2', 'value2');
        vi.advanceTimersByTime(10);
        await cache.set('key3', 'value3');
        vi.advanceTimersByTime(10);

        // All 3 should exist
        expect(await cache.has('key1')).toBe(true);
        expect(await cache.has('key2')).toBe(true);
        expect(await cache.has('key3')).toBe(true);

        // Add a 4th - should evict the oldest (key1)
        await cache.set('key4', 'value4');

        expect(await cache.has('key1')).toBe(false); // Evicted
        expect(await cache.has('key2')).toBe(true);
        expect(await cache.has('key3')).toBe(true);
        expect(await cache.has('key4')).toBe(true);
    });

    it('delete removes entry', async () => {
        const cache = createMemoryCache();

        await cache.set('delete-me', 'value');
        expect(await cache.has('delete-me')).toBe(true);

        await cache.delete('delete-me');
        expect(await cache.has('delete-me')).toBe(false);
    });

    it('clear removes all entries', async () => {
        const cache = createMemoryCache();

        await cache.set('key1', 'value1');
        await cache.set('key2', 'value2');
        await cache.set('key3', 'value3');

        expect(await cache.has('key1')).toBe(true);
        expect(await cache.has('key2')).toBe(true);
        expect(await cache.has('key3')).toBe(true);

        await cache.clear();

        expect(await cache.has('key1')).toBe(false);
        expect(await cache.has('key2')).toBe(false);
        expect(await cache.has('key3')).toBe(false);
    });

    it('has returns correct status', async () => {
        const cache = createMemoryCache();

        expect(await cache.has('unknown')).toBe(false);

        await cache.set('known', 'value');
        expect(await cache.has('known')).toBe(true);

        await cache.delete('known');
        expect(await cache.has('known')).toBe(false);
    });

    it('has returns false for expired entries', async () => {
        const cache = createMemoryCache();

        await cache.set('expires', 'value', 500);
        expect(await cache.has('expires')).toBe(true);

        vi.advanceTimersByTime(501);
        expect(await cache.has('expires')).toBe(false);
    });

    it('uses default maxEntries from DEFAULT_MEMORY_CACHE_OPTIONS', () => {
        expect(DEFAULT_MEMORY_CACHE_OPTIONS.maxEntries).toBe(100);
    });

    it('logs operations when logger is provided', async () => {
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const cache = createMemoryCache({ logger });

        await cache.set('log-key', 'value');
        expect(logger.debug).toHaveBeenCalled();

        await cache.get('log-key');
        expect(logger.debug).toHaveBeenCalled();
    });
});
