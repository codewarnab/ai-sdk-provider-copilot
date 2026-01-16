import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createStreamContext,
    mapEventToStreamParts,
    mapUsageEvent,
    mapFinishReason,
    getDefaultUsage,
    type StreamContext,
    type SessionUsageInfo,
    type CompactionResult,
    type SubagentInfo,
} from '../event-mapper.js';
import type { SessionEvent } from '@github/copilot-sdk';

// Mock crypto.randomUUID for predictable tests
vi.mock('node:crypto', () => ({
    randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

function createMockEvent(type: string, data: Record<string, unknown> = {}): SessionEvent {
    return {
        id: 'event-123',
        type,
        timestamp: new Date().toISOString(),
        parentId: null,
        data,
    } as SessionEvent;
}

describe('event-mapper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createStreamContext', () => {
        it('should initialize with default values', () => {
            const context = createStreamContext();

            expect(context.textStarted).toBe(false);
            expect(context.reasoningStarted).toBe(false);
            expect(context.textBlockId).toBeUndefined();
            expect(context.reasoningBlockId).toBeUndefined();
            expect(context.usage).toBeUndefined();
            expect(context.turnId).toBeUndefined();
            expect(context.warnings).toEqual([]);
            expect(context.toolCalls).toEqual([]);
            expect(context.hasToolCalls).toBe(false);
            expect(context.sessionUsageInfo).toBeUndefined();
            expect(context.compactionInProgress).toBe(false);
            expect(context.compactionResult).toBeUndefined();
            expect(context.subagents).toBeInstanceOf(Map);
            expect(context.subagents.size).toBe(0);
        });

        it('should accept initial warnings', () => {
            const warnings = [{ type: 'other' as const, message: 'test' }];
            const context = createStreamContext(warnings);

            expect(context.warnings).toBe(warnings);
        });
    });

    describe('mapEventToStreamParts', () => {
        let context: StreamContext;

        beforeEach(() => {
            context = createStreamContext();
        });

        it('should return empty array for unhandled events', () => {
            const event = createMockEvent('unknown.event');
            const parts = mapEventToStreamParts(event, context);

            expect(parts).toEqual([]);
        });

        it('should track turn start in context', () => {
            const event = createMockEvent('assistant.turn_start', { turnId: 'turn-123' });
            const parts = mapEventToStreamParts(event, context);

            expect(parts).toEqual([]);
            expect(context.turnId).toBe('turn-123');
        });

        describe('text streaming', () => {
            it('should emit text-start on first message delta', () => {
                const event = createMockEvent('assistant.message_delta', {
                    messageId: 'msg-1',
                    deltaContent: 'Hello',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(2);
                expect(parts[0]).toEqual({ type: 'text-start', id: 'msg-1' });
                expect(parts[1]).toEqual({ type: 'text-delta', id: 'msg-1', delta: 'Hello' });
                expect(context.textStarted).toBe(true);
                expect(context.textBlockId).toBe('msg-1');
            });

            it('should emit only text-delta on subsequent deltas', () => {
                context.textStarted = true;
                context.textBlockId = 'msg-1';

                const event = createMockEvent('assistant.message_delta', {
                    messageId: 'msg-1',
                    deltaContent: ' world',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({ type: 'text-delta', id: 'msg-1', delta: ' world' });
            });

            it('should generate UUID when messageId is missing', () => {
                const event = createMockEvent('assistant.message_delta', {
                    deltaContent: 'Hello',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts[0]).toEqual({ type: 'text-start', id: 'test-uuid-1234' });
                expect(context.textBlockId).toBe('test-uuid-1234');
            });

            it('should not emit text-delta when deltaContent is empty', () => {
                const event = createMockEvent('assistant.message_delta', {
                    messageId: 'msg-1',
                    deltaContent: '',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({ type: 'text-start', id: 'msg-1' });
            });

            it('should emit text-end on assistant.message when text was started', () => {
                context.textStarted = true;
                context.textBlockId = 'msg-1';

                const event = createMockEvent('assistant.message', {
                    content: 'Hello world',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({ type: 'text-end', id: 'msg-1' });
            });

            it('should return empty when assistant.message and no text was started', () => {
                const event = createMockEvent('assistant.message', {
                    content: 'Hello world',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
            });

            it('should emit tool-call for toolRequests in assistant.message', () => {
                const event = createMockEvent('assistant.message', {
                    content: '',
                    toolRequests: [
                        {
                            toolCallId: 'call-123',
                            name: 'getWeather',
                            arguments: { location: 'Seattle' },
                        },
                    ],
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({
                    type: 'tool-call',
                    toolCallId: 'call-123',
                    toolName: 'getWeather',
                    input: '{"location":"Seattle"}',
                    providerExecuted: false,
                });
                expect(context.hasToolCalls).toBe(true);
                expect(context.toolCalls).toHaveLength(1);
            });

            it('should handle multiple tool requests in single message', () => {
                const event = createMockEvent('assistant.message', {
                    content: '',
                    toolRequests: [
                        { toolCallId: 'call-1', name: 'tool1', arguments: { a: 1 } },
                        { toolCallId: 'call-2', name: 'tool2', arguments: { b: 2 } },
                    ],
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(2);
                expect(parts[0]).toMatchObject({ type: 'tool-call', toolCallId: 'call-1', toolName: 'tool1' });
                expect(parts[1]).toMatchObject({ type: 'tool-call', toolCallId: 'call-2', toolName: 'tool2' });
                expect(context.toolCalls).toHaveLength(2);
            });

            it('should handle empty arguments for tool request', () => {
                const event = createMockEvent('assistant.message', {
                    content: '',
                    toolRequests: [
                        { toolCallId: 'call-123', name: 'noArgs' },
                    ],
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts[0]).toEqual({
                    type: 'tool-call',
                    toolCallId: 'call-123',
                    toolName: 'noArgs',
                    input: '{}',
                    providerExecuted: false,
                });
            });

            it('should emit text-end before tool-calls when both present', () => {
                context.textStarted = true;
                context.textBlockId = 'msg-1';

                const event = createMockEvent('assistant.message', {
                    content: 'Let me check the weather',
                    toolRequests: [
                        { toolCallId: 'call-123', name: 'getWeather', arguments: {} },
                    ],
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(2);
                expect(parts[0]).toEqual({ type: 'text-end', id: 'msg-1' });
                expect(parts[1]).toMatchObject({ type: 'tool-call' });
            });
        });

        describe('reasoning streaming', () => {
            it('should emit reasoning-start on first reasoning delta', () => {
                const event = createMockEvent('assistant.reasoning_delta', {
                    reasoningId: 'reason-1',
                    deltaContent: 'Thinking...',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(2);
                expect(parts[0]).toEqual({ type: 'reasoning-start', id: 'reason-1' });
                expect(parts[1]).toEqual({ type: 'reasoning-delta', id: 'reason-1', delta: 'Thinking...' });
                expect(context.reasoningStarted).toBe(true);
                expect(context.reasoningBlockId).toBe('reason-1');
            });

            it('should emit only reasoning-delta on subsequent deltas', () => {
                context.reasoningStarted = true;
                context.reasoningBlockId = 'reason-1';

                const event = createMockEvent('assistant.reasoning_delta', {
                    reasoningId: 'reason-1',
                    deltaContent: ' more thoughts',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({ type: 'reasoning-delta', id: 'reason-1', delta: ' more thoughts' });
            });

            it('should generate UUID when reasoningId is missing', () => {
                const event = createMockEvent('assistant.reasoning_delta', {
                    deltaContent: 'Thinking...',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts[0]).toEqual({ type: 'reasoning-start', id: 'test-uuid-1234' });
            });

            it('should emit reasoning-end on assistant.reasoning', () => {
                context.reasoningStarted = true;
                context.reasoningBlockId = 'reason-1';

                const event = createMockEvent('assistant.reasoning', {});

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({ type: 'reasoning-end', id: 'reason-1' });
            });

            it('should return empty when assistant.reasoning and no reasoning was started', () => {
                const event = createMockEvent('assistant.reasoning', {});

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
            });
        });

        describe('usage events', () => {
            it('should store usage data in context', () => {
                const event = createMockEvent('assistant.usage', {
                    inputTokens: 100,
                    outputTokens: 50,
                    cacheReadTokens: 10,
                    cacheWriteTokens: 5,
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                expect(context.usage).toEqual({
                    inputTokens: {
                        total: 100,
                        noCache: undefined,
                        cacheRead: 10,
                        cacheWrite: 5,
                    },
                    outputTokens: {
                        total: 50,
                        text: undefined,
                        reasoning: undefined,
                    },
                });
            });
        });

        describe('session.usage_info events', () => {
            it('should store session usage info in context', () => {
                const event = createMockEvent('session.usage_info', {
                    tokenLimit: 100000,
                    currentTokens: 5000,
                    messagesLength: 10,
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                expect(context.sessionUsageInfo).toEqual({
                    tokenLimit: 100000,
                    currentTokens: 5000,
                    messagesLength: 10,
                });
            });

            it('should update session usage info on subsequent events', () => {
                const event1 = createMockEvent('session.usage_info', {
                    tokenLimit: 100000,
                    currentTokens: 5000,
                    messagesLength: 10,
                });
                mapEventToStreamParts(event1, context);

                const event2 = createMockEvent('session.usage_info', {
                    tokenLimit: 100000,
                    currentTokens: 7500,
                    messagesLength: 15,
                });
                const parts = mapEventToStreamParts(event2, context);

                expect(parts).toEqual([]);
                expect(context.sessionUsageInfo).toEqual({
                    tokenLimit: 100000,
                    currentTokens: 7500,
                    messagesLength: 15,
                });
            });
        });

        describe('session.compaction_start events', () => {
            it('should set compactionInProgress to true', () => {
                const event = createMockEvent('session.compaction_start', {});

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                expect(context.compactionInProgress).toBe(true);
            });
        });

        describe('session.compaction_complete events', () => {
            it('should handle successful compaction', () => {
                // First mark compaction as started
                context.compactionInProgress = true;

                const event = createMockEvent('session.compaction_complete', {
                    success: true,
                    preCompactionTokens: 50000,
                    postCompactionTokens: 30000,
                    preCompactionMessagesLength: 100,
                    messagesRemoved: 20,
                    tokensRemoved: 20000,
                    summaryContent: 'Conversation summarized',
                    compactionTokensUsed: {
                        input: 1000,
                        output: 500,
                        cachedInput: 200,
                    },
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                expect(context.compactionInProgress).toBe(false);
                expect(context.compactionResult).toEqual({
                    success: true,
                    error: undefined,
                    preCompactionTokens: 50000,
                    postCompactionTokens: 30000,
                    preCompactionMessagesLength: 100,
                    messagesRemoved: 20,
                    tokensRemoved: 20000,
                    summaryContent: 'Conversation summarized',
                    compactionTokensUsed: {
                        input: 1000,
                        output: 500,
                        cachedInput: 200,
                    },
                });
            });

            it('should handle failed compaction', () => {
                context.compactionInProgress = true;

                const event = createMockEvent('session.compaction_complete', {
                    success: false,
                    error: 'Compaction failed due to timeout',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                expect(context.compactionInProgress).toBe(false);
                expect(context.compactionResult).toEqual({
                    success: false,
                    error: 'Compaction failed due to timeout',
                    preCompactionTokens: undefined,
                    postCompactionTokens: undefined,
                    preCompactionMessagesLength: undefined,
                    messagesRemoved: undefined,
                    tokensRemoved: undefined,
                    summaryContent: undefined,
                    compactionTokensUsed: undefined,
                });
            });
        });

        describe('subagent.started events', () => {
            it('should track subagent started state', () => {
                const event = createMockEvent('subagent.started', {
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                    agentDisplayName: 'Code Reviewer',
                    agentDescription: 'Reviews code for quality',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                expect(context.subagents.size).toBe(1);
                const subagent = context.subagents.get('call-123');
                expect(subagent).toEqual({
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                    agentDisplayName: 'Code Reviewer',
                    agentDescription: 'Reviews code for quality',
                    status: 'started',
                });
            });
        });

        describe('subagent.completed events', () => {
            it('should update existing subagent to completed status', () => {
                // First start the subagent
                context.subagents.set('call-123', {
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                    agentDisplayName: 'Code Reviewer',
                    agentDescription: 'Reviews code for quality',
                    status: 'started',
                });

                const event = createMockEvent('subagent.completed', {
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                const subagent = context.subagents.get('call-123');
                expect(subagent?.status).toBe('completed');
            });

            it('should create new subagent entry if not exists', () => {
                const event = createMockEvent('subagent.completed', {
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                const subagent = context.subagents.get('call-123');
                expect(subagent).toEqual({
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                    status: 'completed',
                });
            });
        });

        describe('subagent.failed events', () => {
            it('should update existing subagent to failed status with error', () => {
                context.subagents.set('call-123', {
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                    agentDisplayName: 'Code Reviewer',
                    agentDescription: 'Reviews code for quality',
                    status: 'started',
                });

                const event = createMockEvent('subagent.failed', {
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                    error: 'Timeout while processing',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                const subagent = context.subagents.get('call-123');
                expect(subagent?.status).toBe('failed');
                expect(subagent?.error).toBe('Timeout while processing');
            });

            it('should create new subagent entry with failed status if not exists', () => {
                const event = createMockEvent('subagent.failed', {
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                    error: 'Agent not available',
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                const subagent = context.subagents.get('call-123');
                expect(subagent).toEqual({
                    toolCallId: 'call-123',
                    agentName: 'code-reviewer',
                    status: 'failed',
                    error: 'Agent not available',
                });
            });
        });

        describe('subagent.selected events', () => {
            it('should track selected subagent with tools', () => {
                const event = createMockEvent('subagent.selected', {
                    agentName: 'code-reviewer',
                    agentDisplayName: 'Code Reviewer',
                    tools: ['read_file', 'grep_search', 'semantic_search'],
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                const subagent = context.subagents.get('code-reviewer');
                expect(subagent).toEqual({
                    toolCallId: 'code-reviewer',
                    agentName: 'code-reviewer',
                    agentDisplayName: 'Code Reviewer',
                    status: 'selected',
                    tools: ['read_file', 'grep_search', 'semantic_search'],
                });
            });

            it('should handle selected subagent with null tools', () => {
                const event = createMockEvent('subagent.selected', {
                    agentName: 'code-reviewer',
                    agentDisplayName: 'Code Reviewer',
                    tools: null,
                });

                const parts = mapEventToStreamParts(event, context);

                expect(parts).toEqual([]);
                const subagent = context.subagents.get('code-reviewer');
                expect(subagent?.tools).toBeNull();
            });
        });
    });

    describe('mapUsageEvent', () => {
        it('should correctly map all token counts', () => {
            const usage = mapUsageEvent({
                inputTokens: 100,
                outputTokens: 50,
                cacheReadTokens: 10,
                cacheWriteTokens: 5,
            });

            expect(usage).toEqual({
                inputTokens: {
                    total: 100,
                    noCache: undefined,
                    cacheRead: 10,
                    cacheWrite: 5,
                },
                outputTokens: {
                    total: 50,
                    text: undefined,
                    reasoning: undefined,
                },
            });
        });

        it('should handle missing optional fields', () => {
            const usage = mapUsageEvent({});

            expect(usage).toEqual({
                inputTokens: {
                    total: 0,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                },
                outputTokens: {
                    total: 0,
                    text: undefined,
                    reasoning: undefined,
                },
            });
        });
    });

    describe('mapFinishReason', () => {
        it('should return correct format with raw reason', () => {
            const reason = mapFinishReason('stopped');

            expect(reason).toEqual({
                unified: 'stop',
                raw: 'stopped',
            });
        });

        it('should default to "complete" when no reason provided', () => {
            const reason = mapFinishReason();

            expect(reason).toEqual({
                unified: 'stop',
                raw: 'complete',
            });
        });

        it('should return tool-calls finish reason when hasToolCalls is true', () => {
            const reason = mapFinishReason(undefined, true);

            expect(reason).toEqual({
                unified: 'tool-calls',
                raw: 'tool_calls',
            });
        });

        it('should use raw reason with tool-calls when both provided', () => {
            const reason = mapFinishReason('custom_reason', true);

            expect(reason).toEqual({
                unified: 'tool-calls',
                raw: 'custom_reason',
            });
        });
    });

    describe('getDefaultUsage', () => {
        it('should return zeroed usage with all required fields', () => {
            const usage = getDefaultUsage();

            expect(usage).toEqual({
                inputTokens: {
                    total: 0,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                },
                outputTokens: {
                    total: 0,
                    text: undefined,
                    reasoning: undefined,
                },
            });
        });
    });
});
