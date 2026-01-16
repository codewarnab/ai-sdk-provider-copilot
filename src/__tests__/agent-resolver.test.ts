import { describe, it, expect } from 'vitest';
import {
    isAgentModelId,
    extractAgentName,
    resolveAgent,
    getAgentModelId,
    buildAgentSystemMessage,
    validateAgentConfigs,
} from '../agent-resolver.js';
import type { CustomAgentConfig } from '@github/copilot-sdk';

describe('agent-resolver', () => {
    const mockAgents: CustomAgentConfig[] = [
        {
            name: 'code-reviewer',
            displayName: 'Code Reviewer',
            description: 'Reviews code for best practices',
            prompt: 'You are an expert code reviewer.',
            tools: ['read_file', 'search_code'],
        },
        {
            name: 'test-writer',
            displayName: 'Test Writer',
            description: 'Writes unit tests',
            prompt: 'You are a test writing expert.',
        },
    ];

    describe('isAgentModelId', () => {
        it('should return true for agent model IDs', () => {
            expect(isAgentModelId('agent/code-reviewer')).toBe(true);
            expect(isAgentModelId('agent/test-writer')).toBe(true);
            expect(isAgentModelId('agent/my-custom-agent')).toBe(true);
        });

        it('should return false for regular model IDs', () => {
            expect(isAgentModelId('gpt-4')).toBe(false);
            expect(isAgentModelId('claude-3')).toBe(false);
            expect(isAgentModelId('agents/not-valid')).toBe(false);
            expect(isAgentModelId('')).toBe(false);
        });
    });

    describe('extractAgentName', () => {
        it('should extract agent name from model ID', () => {
            expect(extractAgentName('agent/code-reviewer')).toBe('code-reviewer');
            expect(extractAgentName('agent/test-writer')).toBe('test-writer');
            expect(extractAgentName('agent/my-custom-agent')).toBe('my-custom-agent');
        });

        it('should throw for non-agent model IDs', () => {
            expect(() => extractAgentName('gpt-4')).toThrow(
                "Model ID 'gpt-4' is not an agent reference"
            );
            expect(() => extractAgentName('')).toThrow(
                "Model ID '' is not an agent reference"
            );
        });
    });

    describe('resolveAgent', () => {
        it('should return null for non-agent model IDs', () => {
            expect(resolveAgent('gpt-4', mockAgents)).toBeNull();
            expect(resolveAgent('claude-3', mockAgents)).toBeNull();
        });

        it('should find agent by name', () => {
            const agent = resolveAgent('agent/code-reviewer', mockAgents);
            expect(agent).not.toBeNull();
            expect(agent?.name).toBe('code-reviewer');
            expect(agent?.prompt).toBe('You are an expert code reviewer.');
        });

        it('should throw for unknown agent', () => {
            expect(() => resolveAgent('agent/unknown-agent', mockAgents)).toThrow(
                "Custom agent 'unknown-agent' not found. Available agents: code-reviewer, test-writer"
            );
        });

        it('should throw with "none" when no agents registered', () => {
            expect(() => resolveAgent('agent/any', undefined)).toThrow(
                "Custom agent 'any' not found. Available agents: none"
            );
            expect(() => resolveAgent('agent/any', [])).toThrow(
                "Custom agent 'any' not found. Available agents: none"
            );
        });
    });

    describe('getAgentModelId', () => {
        it('should return undefined (use session default)', () => {
            const agent = mockAgents[0];
            expect(getAgentModelId(agent)).toBeUndefined();
        });
    });

    describe('buildAgentSystemMessage', () => {
        it('should create replace-mode system message from agent prompt', () => {
            const agent = mockAgents[0];
            const result = buildAgentSystemMessage(agent);

            expect(result.mode).toBe('replace');
            expect(result.content).toBe('You are an expert code reviewer.');
        });
    });

    describe('validateAgentConfigs', () => {
        it('should pass for valid agent configurations', () => {
            expect(() => validateAgentConfigs(mockAgents)).not.toThrow();
        });

        it('should throw for agent without name', () => {
            const invalidAgents = [{ prompt: 'test' }] as CustomAgentConfig[];
            expect(() => validateAgentConfigs(invalidAgents)).toThrow(
                'Custom agent must have a name'
            );
        });

        it('should throw for agent without prompt', () => {
            const invalidAgents = [{ name: 'test' }] as CustomAgentConfig[];
            expect(() => validateAgentConfigs(invalidAgents)).toThrow(
                "Custom agent 'test' must have a prompt"
            );
        });

        it('should throw for duplicate agent names', () => {
            const duplicateAgents: CustomAgentConfig[] = [
                { name: 'test', prompt: 'prompt1' },
                { name: 'test', prompt: 'prompt2' },
            ];
            expect(() => validateAgentConfigs(duplicateAgents)).toThrow(
                "Duplicate custom agent name: 'test'"
            );
        });

        it('should pass for empty array', () => {
            expect(() => validateAgentConfigs([])).not.toThrow();
        });
    });
});
