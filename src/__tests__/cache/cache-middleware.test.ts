import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapWithCache, DEFAULT_CACHE_CONFIG } from '../../cache/cache-middleware.js';
import type { LanguageModelV3 } from '@ai-sdk/provider';

// Create a mock model
function createMockModel(): LanguageModelV3 {
    return {
        specificationVersion: 'v3',
        provider: 'test',
        modelId: 'test-model',
        doGenerate: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Generated response' }],
            finishReason: { type: 'stop' },
            usage: {
                inputTokens: { total: 10 },
                outputTokens: { total: 20 },
            },
        }),
        doStream: vi.fn().mockResolvedValue({
            stream: new ReadableStream(),
            usage: Promise.resolve({
                inputTokens: { total: 10 },
                outputTokens: { total: 20 },
            }),
        }),
    } as unknown as LanguageModelV3;
}

describe('wrapWithCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns model unchanged when disabled', () => {
        const model = createMockModel();
        const wrapped = wrapWithCache(model, { enabled: false });

        expect(wrapped).toBe(model);
    });

    it('returns model unchanged with default config', () => {
        const model = createMockModel();
        const wrapped = wrapWithCache(model);

        // Default config has enabled: false
        expect(wrapped).toBe(model);
    });

    it('cache hit returns cached response', async () => {
        const model = createMockModel();
        const wrapped = wrapWithCache(model, { enabled: true });

        const options = {
            prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] }],
            inputFormat: 'messages' as const,
        };

        // First call - cache miss
        await wrapped.doGenerate(options);
        expect(model.doGenerate).toHaveBeenCalledTimes(1);

        // Second call - cache hit
        await wrapped.doGenerate(options);
        expect(model.doGenerate).toHaveBeenCalledTimes(1); // Not called again
    });

    it('cache miss calls underlying model', async () => {
        const model = createMockModel();
        const wrapped = wrapWithCache(model, { enabled: true });

        const options = {
            prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] }],
            inputFormat: 'messages' as const,
        };

        await wrapped.doGenerate(options);

        expect(model.doGenerate).toHaveBeenCalledTimes(1);
        expect(model.doGenerate).toHaveBeenCalledWith(options);
    });

    it('tool calls bypass cache by default', async () => {
        const model = createMockModel();
        const wrapped = wrapWithCache(model, { enabled: true });

        const options = {
            prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] }],
            inputFormat: 'messages' as const,
            tools: [{ type: 'function' as const, name: 'test', inputSchema: { type: 'object' } }],
        };

        // First call
        await wrapped.doGenerate(options as never);
        expect(model.doGenerate).toHaveBeenCalledTimes(1);

        // Second call - should NOT hit cache (tools present)
        await wrapped.doGenerate(options as never);
        expect(model.doGenerate).toHaveBeenCalledTimes(2);
    });

    it('tool calls can be cached when enabled', async () => {
        const model = createMockModel();
        const wrapped = wrapWithCache(model, { enabled: true, cacheToolCalls: true });

        const options = {
            prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] }],
            inputFormat: 'messages' as const,
            tools: [{ type: 'function' as const, name: 'test', inputSchema: { type: 'object' } }],
        };

        // First call
        await wrapped.doGenerate(options as never);
        expect(model.doGenerate).toHaveBeenCalledTimes(1);

        // Second call - should hit cache
        await wrapped.doGenerate(options as never);
        expect(model.doGenerate).toHaveBeenCalledTimes(1);
    });

    it('custom key generator is used', async () => {
        const model = createMockModel();
        const customKeyGen = vi.fn().mockReturnValue('custom-key');

        const wrapped = wrapWithCache(model, {
            enabled: true,
            keyGenerator: customKeyGen,
        });

        const options = {
            prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] }],
            inputFormat: 'messages' as const,
        };

        await wrapped.doGenerate(options);

        expect(customKeyGen).toHaveBeenCalledWith({
            modelId: 'test-model',
            prompt: options.prompt,
            maxTokens: undefined,
            temperature: undefined,
            topP: undefined,
            tools: undefined,
        });
    });

    it('streaming delegates to underlying model', async () => {
        const model = createMockModel();
        const wrapped = wrapWithCache(model, { enabled: true });

        const options = {
            prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] }],
            inputFormat: 'messages' as const,
        };

        await wrapped.doStream(options);

        expect(model.doStream).toHaveBeenCalledTimes(1);
    });

    it('DEFAULT_CACHE_CONFIG has correct defaults', () => {
        expect(DEFAULT_CACHE_CONFIG.enabled).toBe(false);
        expect(DEFAULT_CACHE_CONFIG.defaultTtlMs).toBe(300000);
        expect(DEFAULT_CACHE_CONFIG.cacheStreaming).toBe(false);
        expect(DEFAULT_CACHE_CONFIG.cacheToolCalls).toBe(false);
    });
});
