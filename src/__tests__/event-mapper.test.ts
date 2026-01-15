import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
    createStreamContext,
    mapEventToStreamParts,
    mapUsageEvent,
    mapFinishReason,
    getDefaultUsage,
    type StreamContext,
} from '../event-mapper.js';

// Define SessionEvent type inline since the SDK doesn't export types
interface SessionEvent {
    id: string;
    type: string;
    timestamp: number;
    data: Record<string, unknown>;
}

// Mock crypto.randomUUID for predictable tests
vi.mock('node:crypto', () => ({
    randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

function createMockEvent(type: string, data: Record<string, unknown> = {}): SessionEvent {
    return {
        id: 'event-123',
        type,
        timestamp: Date.now(),
        data,
    };
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
