import type { CacheKeyOptions } from '../types.js';

/**
 * Creates a stable cache key from call options.
 * Uses content-addressable approach with JSON serialization and hashing.
 */
export function generateCacheKey(options: CacheKeyOptions): string {
    const normalized = {
        m: options.modelId,
        p: normalizePrompt(options.prompt),
        mt: options.maxTokens,
        t: options.temperature,
        tp: options.topP,
        tools: options.tools?.map((t) => normalizeObject(t)),
        sm: options.systemMessageHash,
    };

    // Remove undefined values for consistent hashing
    const cleaned = Object.fromEntries(
        Object.entries(normalized).filter(([, v]) => v !== undefined)
    );

    const json = JSON.stringify(cleaned, Object.keys(cleaned).sort());
    return hashString(json);
}

/**
 * Normalizes prompt content for hashing.
 * Collapses whitespace and sorts message arrays by role for consistency.
 */
function normalizePrompt(prompt: unknown): unknown {
    if (typeof prompt === 'string') {
        return prompt.trim().replace(/\s+/g, ' ');
    }

    if (Array.isArray(prompt)) {
        return prompt.map((msg) => normalizeObject(msg));
    }

    return normalizeObject(prompt);
}

/**
 * Normalizes an object for consistent JSON representation.
 */
function normalizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(normalizeObject);
    }

    // Sort object keys for consistent ordering
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = normalizeObject((obj as Record<string, unknown>)[key]);
    }
    return sorted;
}

/**
 * Simple hash function for cache keys.
 * Uses DJB2 algorithm for fast, reasonably distributed hashes.
 */
function hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    // Convert to base36 for shorter keys
    return (hash >>> 0).toString(36);
}

/**
 * Creates a hash of just the prompt content for quick comparison.
 */
export function hashPrompt(prompt: unknown): string {
    return hashString(JSON.stringify(normalizePrompt(prompt)));
}
