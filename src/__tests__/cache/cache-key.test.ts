import { describe, it, expect } from 'vitest';
import { generateCacheKey, hashPrompt } from '../../cache/cache-key.js';

describe('generateCacheKey', () => {
    it('same inputs produce same key', () => {
        const options1 = {
            modelId: 'gpt-4',
            prompt: 'Hello world',
            temperature: 0.7,
        };
        const options2 = {
            modelId: 'gpt-4',
            prompt: 'Hello world',
            temperature: 0.7,
        };

        const key1 = generateCacheKey(options1);
        const key2 = generateCacheKey(options2);

        expect(key1).toBe(key2);
    });

    it('different inputs produce different keys', () => {
        const options1 = {
            modelId: 'gpt-4',
            prompt: 'Hello world',
        };
        const options2 = {
            modelId: 'gpt-4',
            prompt: 'Goodbye world',
        };

        const key1 = generateCacheKey(options1);
        const key2 = generateCacheKey(options2);

        expect(key1).not.toBe(key2);
    });

    it('different models produce different keys', () => {
        const options1 = {
            modelId: 'gpt-4',
            prompt: 'Hello',
        };
        const options2 = {
            modelId: 'gpt-3.5-turbo',
            prompt: 'Hello',
        };

        const key1 = generateCacheKey(options1);
        const key2 = generateCacheKey(options2);

        expect(key1).not.toBe(key2);
    });

    it('whitespace normalization works', () => {
        const options1 = {
            modelId: 'gpt-4',
            prompt: 'Hello   world',
        };
        const options2 = {
            modelId: 'gpt-4',
            prompt: 'Hello world',
        };

        const key1 = generateCacheKey(options1);
        const key2 = generateCacheKey(options2);

        expect(key1).toBe(key2);
    });

    it('object key ordering does not affect hash', () => {
        const options1 = {
            modelId: 'gpt-4',
            prompt: [{ role: 'user', content: 'Hi' }],
            temperature: 0.5,
            maxTokens: 100,
        };
        const options2 = {
            maxTokens: 100,
            temperature: 0.5,
            modelId: 'gpt-4',
            prompt: [{ role: 'user', content: 'Hi' }],
        };

        const key1 = generateCacheKey(options1);
        const key2 = generateCacheKey(options2);

        expect(key1).toBe(key2);
    });

    it('handles complex prompts with nested objects', () => {
        const options = {
            modelId: 'claude-3',
            prompt: [
                { role: 'system', content: 'You are a helper' },
                { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
            ],
            tools: [{ name: 'search', schema: { type: 'object' } }],
        };

        const key = generateCacheKey(options);
        expect(key).toBeDefined();
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
    });

    it('undefined values are excluded', () => {
        const options1 = {
            modelId: 'gpt-4',
            prompt: 'Hi',
            temperature: undefined,
        };
        const options2 = {
            modelId: 'gpt-4',
            prompt: 'Hi',
        };

        const key1 = generateCacheKey(options1);
        const key2 = generateCacheKey(options2);

        expect(key1).toBe(key2);
    });

    it('tools array affects key', () => {
        const options1 = {
            modelId: 'gpt-4',
            prompt: 'Hi',
            tools: [{ name: 'tool1' }],
        };
        const options2 = {
            modelId: 'gpt-4',
            prompt: 'Hi',
            tools: [{ name: 'tool2' }],
        };

        const key1 = generateCacheKey(options1);
        const key2 = generateCacheKey(options2);

        expect(key1).not.toBe(key2);
    });
});

describe('hashPrompt', () => {
    it('produces consistent hashes', () => {
        const prompt = 'Hello world';

        const hash1 = hashPrompt(prompt);
        const hash2 = hashPrompt(prompt);

        expect(hash1).toBe(hash2);
    });

    it('different prompts produce different hashes', () => {
        const hash1 = hashPrompt('Hello');
        const hash2 = hashPrompt('World');

        expect(hash1).not.toBe(hash2);
    });

    it('handles array prompts', () => {
        const prompt = [
            { role: 'user', content: 'Test' },
            { role: 'assistant', content: 'Response' },
        ];

        const hash = hashPrompt(prompt);
        expect(hash).toBeDefined();
        expect(typeof hash).toBe('string');
    });

    it('whitespace is normalized', () => {
        const hash1 = hashPrompt('Hello    world');
        const hash2 = hashPrompt('Hello world');

        expect(hash1).toBe(hash2);
    });
});
