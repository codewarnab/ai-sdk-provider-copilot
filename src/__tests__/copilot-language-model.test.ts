import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopilotLanguageModel } from '../copilot-language-model.js';

// Mock the Copilot SDK
const mockSession = {
    on: vi.fn().mockReturnValue(() => { }),
    send: vi.fn().mockResolvedValue('msg-id'),
    abort: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
};

const mockClient = {
    createSession: vi.fn().mockResolvedValue(mockSession),
    stop: vi.fn().mockResolvedValue([]),
};

vi.mock('@github/copilot-sdk', () => {
    return {
        CopilotClient: class MockCopilotClient {
            createSession = mockClient.createSession;
            stop = mockClient.stop;
        },
        CopilotSession: class MockCopilotSession { },
    };
});

describe('CopilotLanguageModel', () => {
    let model: CopilotLanguageModel;

    beforeEach(() => {
        vi.clearAllMocks();

        model = new CopilotLanguageModel({
            modelId: 'gpt-4',
            providerOptions: {},
        });
    });

    afterEach(async () => {
        try {
            await model.dispose();
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('properties', () => {
        it('should have specificationVersion v3', () => {
            expect(model.specificationVersion).toBe('v3');
        });

        it('should have provider set to "copilot"', () => {
            expect(model.provider).toBe('copilot');
        });

        it('should have correct modelId', () => {
            expect(model.modelId).toBe('gpt-4');
        });

        it('should have empty supportedUrls', () => {
            expect(model.supportedUrls).toEqual({});
        });
    });

    describe('model with different options', () => {
        it('should accept custom model ID', () => {
            const customModel = new CopilotLanguageModel({
                modelId: 'claude-3.5-sonnet',
                providerOptions: {},
            });

            expect(customModel.modelId).toBe('claude-3.5-sonnet');
        });

        it('should accept provider options', () => {
            const customModel = new CopilotLanguageModel({
                modelId: 'gpt-4o',
                providerOptions: {
                    cliPath: '/custom/path',
                    logLevel: 'debug',
                },
            });

            expect(customModel.modelId).toBe('gpt-4o');
        });

        it('should accept model settings', () => {
            const customModel = new CopilotLanguageModel({
                modelId: 'gpt-4',
                providerOptions: {},
                settings: {
                    systemMessage: { mode: 'append', content: 'Be helpful' },
                },
            });

            expect(customModel.modelId).toBe('gpt-4');
        });
    });

    describe('doStream', () => {
        it('should return a result with stream', async () => {
            const result = await model.doStream({
                prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
            });

            expect(result).toHaveProperty('stream');
            expect(result.stream).toBeInstanceOf(ReadableStream);
        });

        it('should include request body in result', async () => {
            const result = await model.doStream({
                prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
            });

            expect(result).toHaveProperty('request');
            expect(result.request).toHaveProperty('body');
        });

        it('should handle already aborted signal', async () => {
            const controller = new AbortController();
            controller.abort();

            const result = await model.doStream({
                prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
                abortSignal: controller.signal,
            });

            const reader = result.stream.getReader();

            await expect(reader.read()).rejects.toThrow('Request aborted');
        });
    });

    describe('dispose', () => {
        it('should be callable multiple times safely', async () => {
            await model.dispose();
            await model.dispose();
            // Should not throw
        });
    });
});
