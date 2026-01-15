import { describe, it, expect } from 'vitest';
import {
    mapPromptToCopilotFormat,
    extractLatestUserMessage,
} from '../message-mapper.js';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

describe('mapPromptToCopilotFormat', () => {
    describe('user messages', () => {
        it('should map simple user text message', () => {
            const prompt: LanguageModelV3Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello, world!' }] },
            ];

            const result = mapPromptToCopilotFormat(prompt);
            expect(result).toBe('Hello, world!');
        });

        it('should map multi-part user message', () => {
            const prompt: LanguageModelV3Prompt = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'First part.' },
                        { type: 'text', text: 'Second part.' },
                    ],
                },
            ];

            const result = mapPromptToCopilotFormat(prompt);
            expect(result).toBe('First part.\nSecond part.');
        });

        it('should handle file parts with warning', () => {
            const prompt: LanguageModelV3Prompt = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Check this file:' },
                        {
                            type: 'file',
                            data: new Uint8Array([1, 2, 3]),
                            mimeType: 'image/png',
                        },
                    ],
                },
            ];

            const result = mapPromptToCopilotFormat(prompt);
            expect(result).toContain('Check this file:');
            expect(result).toContain('[File attachment not yet supported]');
        });
    });

    describe('system messages', () => {
        it('should map system message with prefix', () => {
            const prompt: LanguageModelV3Prompt = [
                { role: 'system', content: 'You are a helpful assistant.' },
            ];

            const result = mapPromptToCopilotFormat(prompt);
            expect(result).toBe('[System]: You are a helpful assistant.');
        });
    });

    describe('assistant messages', () => {
        it('should map assistant text message', () => {
            const prompt: LanguageModelV3Prompt = [
                {
                    role: 'assistant',
                    content: [{ type: 'text', text: 'I can help with that.' }],
                },
            ];

            const result = mapPromptToCopilotFormat(prompt);
            expect(result).toBe('I can help with that.');
        });

        it('should map assistant message with tool call', () => {
            const prompt: LanguageModelV3Prompt = [
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool-call',
                            toolCallId: 'call-1',
                            toolName: 'get_weather',
                            args: { location: 'NYC' },
                        },
                    ],
                },
            ];

            const result = mapPromptToCopilotFormat(prompt);
            expect(result).toBe('[Called tool: get_weather]');
        });
    });

    describe('tool messages', () => {
        it('should map tool result message', () => {
            const prompt: LanguageModelV3Prompt = [
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'call-1',
                            toolName: 'get_weather',
                            output: 'Sunny, 72°F',
                        },
                    ],
                },
            ];

            const result = mapPromptToCopilotFormat(prompt);
            expect(result).toBe('[Tool Result: get_weather]: Sunny, 72°F');
        });

        it('should map tool result with JSON output', () => {
            const prompt: LanguageModelV3Prompt = [
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'call-1',
                            toolName: 'get_data',
                            output: { type: 'json', value: { temp: 72 } },
                        },
                    ],
                },
            ];

            const result = mapPromptToCopilotFormat(prompt);
            expect(result).toContain('[Tool Result: get_data]:');
            expect(result).toContain('72');
        });
    });

    describe('multi-turn conversations', () => {
        it('should map complete conversation', () => {
            const prompt: LanguageModelV3Prompt = [
                { role: 'system', content: 'Be helpful.' },
                { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
                {
                    role: 'assistant',
                    content: [{ type: 'text', text: 'Hello! How can I help?' }],
                },
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'What is 2+2?' }],
                },
            ];

            const result = mapPromptToCopilotFormat(prompt);

            expect(result).toContain('[System]: Be helpful.');
            expect(result).toContain('Hi');
            expect(result).toContain('Hello! How can I help?');
            expect(result).toContain('What is 2+2?');
        });
    });
});

describe('extractLatestUserMessage', () => {
    it('should extract last user message', () => {
        const prompt: LanguageModelV3Prompt = [
            { role: 'user', content: [{ type: 'text', text: 'First' }] },
            {
                role: 'assistant',
                content: [{ type: 'text', text: 'Response' }],
            },
            { role: 'user', content: [{ type: 'text', text: 'Second' }] },
        ];

        const result = extractLatestUserMessage(prompt);
        expect(result).toBe('Second');
    });

    it('should return null if no user message', () => {
        const prompt: LanguageModelV3Prompt = [
            { role: 'system', content: 'System prompt' },
        ];

        const result = extractLatestUserMessage(prompt);
        expect(result).toBeNull();
    });
});
