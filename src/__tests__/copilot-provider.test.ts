import { describe, it, expect, vi } from 'vitest';
import { createCopilotProvider } from '../copilot-provider.js';
import { NoSuchModelError } from '@ai-sdk/provider';

describe('createCopilotProvider', () => {
    it('should create a provider with specificationVersion v3', () => {
        const provider = createCopilotProvider();
        expect(provider.specificationVersion).toBe('v3');
    });

    it('should return a language model when called as a function', () => {
        const provider = createCopilotProvider();
        const model = provider('gpt-4');

        expect(model).toBeDefined();
        expect(model.modelId).toBe('gpt-4');
        expect(model.provider).toBe('copilot');
        expect(model.specificationVersion).toBe('v3');
    });

    it('should throw when called with new keyword', () => {
        const provider = createCopilotProvider();

        expect(() => {
            // @ts-expect-error - testing runtime behavior
            new provider('gpt-4');
        }).toThrow('The provider function cannot be called with the new keyword.');
    });

    it('should return a language model via languageModel method', () => {
        const provider = createCopilotProvider();
        const model = provider.languageModel('gpt-4o');

        expect(model).toBeDefined();
        expect(model.modelId).toBe('gpt-4o');
        expect(model.provider).toBe('copilot');
    });

    it('should return a language model via chat method', () => {
        const provider = createCopilotProvider();
        const model = provider.chat('claude-3.5-sonnet');

        expect(model).toBeDefined();
        expect(model.modelId).toBe('claude-3.5-sonnet');
    });

    it('should throw NoSuchModelError for embeddingModel', () => {
        const provider = createCopilotProvider();

        expect(() => {
            provider.embeddingModel('text-embedding-ada-002');
        }).toThrow(NoSuchModelError);
    });

    it('should throw NoSuchModelError for imageModel', () => {
        const provider = createCopilotProvider();

        expect(() => {
            provider.imageModel('dall-e-3');
        }).toThrow(NoSuchModelError);
    });

    it('should pass provider options to language model', () => {
        const provider = createCopilotProvider({
            cliPath: '/custom/path/copilot',
            logLevel: 'debug',
        });

        const model = provider('gpt-4');
        expect(model).toBeDefined();
        expect(model.modelId).toBe('gpt-4');
    });

    it('should pass model settings to language model', () => {
        const provider = createCopilotProvider();
        const model = provider('gpt-4', {
            systemMessage: { mode: 'append', content: 'Be helpful' },
        });

        expect(model).toBeDefined();
        expect(model.modelId).toBe('gpt-4');
    });
});
