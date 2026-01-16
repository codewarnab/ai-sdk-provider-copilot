import type { LanguageModelV3, LanguageModelV3CallOptions } from '@ai-sdk/provider';
import type { CacheAdapter, CacheConfig, Logger } from '../types.js';
import { generateCacheKey } from './cache-key.js';
import { createMemoryCache } from './memory-cache.js';

/**
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: Required<Omit<CacheConfig, 'adapter' | 'keyGenerator'>> = {
    enabled: false,
    defaultTtlMs: 300000, // 5 minutes
    cacheStreaming: false,
    cacheToolCalls: false,
};

/**
 * Wraps a language model with caching capabilities.
 *
 * @example
 * ```typescript
 * import { wrapWithCache } from 'ai-sdk-provider-copilot/cache';
 *
 * const cachedModel = wrapWithCache(copilot('gpt-4'), {
 *   enabled: true,
 *   defaultTtlMs: 600000, // 10 minutes
 * });
 * ```
 */
export function wrapWithCache(
    model: LanguageModelV3,
    config: CacheConfig & { logger?: Logger } = {}
): LanguageModelV3 {
    const mergedConfig = { ...DEFAULT_CACHE_CONFIG, ...config };

    if (!mergedConfig.enabled) {
        return model;
    }

    const adapter: CacheAdapter = config.adapter ?? createMemoryCache({ logger: config.logger });
    const logger = config.logger;

    const getCacheKey = config.keyGenerator ?? generateCacheKey;

    return {
        ...model,

        async doGenerate(options: LanguageModelV3CallOptions) {
            // Skip cache for tool calls if not enabled
            if (options.tools?.length && !mergedConfig.cacheToolCalls) {
                logger?.debug('[cache] Bypassing cache: tool calls present');
                return model.doGenerate(options);
            }

            const cacheKey = getCacheKey({
                modelId: model.modelId,
                prompt: options.prompt,
                maxTokens: options.maxOutputTokens,
                temperature: options.temperature,
                topP: options.topP,
                tools: options.tools,
            });

            // Check cache
            const cached = await adapter.get(cacheKey);
            if (cached) {
                logger?.info('[cache] Returning cached response');
                return cached as Awaited<ReturnType<typeof model.doGenerate>>;
            }

            // Generate fresh response
            const result = await model.doGenerate(options);

            // Cache the result
            await adapter.set(cacheKey, result, mergedConfig.defaultTtlMs);
            logger?.debug(`[cache] Cached response (key: ${cacheKey})`);

            return result;
        },

        async doStream(options: LanguageModelV3CallOptions) {
            // Streaming cache is optional and complex - skip for now
            if (!mergedConfig.cacheStreaming) {
                return model.doStream(options);
            }

            // TODO: Implement stream caching with buffering and replay
            // For now, delegate to underlying model
            logger?.debug('[cache] Stream caching not yet implemented');
            return model.doStream(options);
        },
    };
}
