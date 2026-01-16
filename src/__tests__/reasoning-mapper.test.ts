import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createReasoningContext,
    mapReasoningEventToStreamParts,
    createReasoningContent,
    type ReasoningContext,
} from '../reasoning-mapper.js';

// Mock crypto.randomUUID for predictable tests
vi.mock('node:crypto', () => ({
    randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

// Define SessionEvent type inline
interface SessionEvent {
    id: string;
    type: string;
    timestamp: string;
    parentId: string | null;
    data: Record<string, unknown>;
}

function createMockEvent(type: string, data: Record<string, unknown> = {}): SessionEvent {
    return {
        id: 'event-123',
        type,
        timestamp: new Date().toISOString(),
        parentId: null,
        data,
    };
}

describe('reasoning-mapper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createReasoningContext', () => {
        it('should initialize with empty values', () => {
            const context = createReasoningContext();

            expect(context.reasoningBlockId).toBeUndefined();
            expect(context.reasoningStarted).toBe(false);
            expect(context.accumulatedReasoning).toBe('');
        });
    });

    describe('mapReasoningEventToStreamParts', () => {
        let context: ReasoningContext;

        beforeEach(() => {
            context = createReasoningContext();
        });

        describe('assistant.reasoning_delta events', () => {
            it('should emit reasoning-start on first delta', () => {
                const event = createMockEvent('assistant.reasoning_delta', {
                    reasoningId: 'reason-1',
                    deltaContent: 'Let me think...',
                });

                const parts = mapReasoningEventToStreamParts(event as any, context);

                expect(parts).toHaveLength(2);
                expect(parts[0]).toEqual({ type: 'reasoning-start', id: 'reason-1' });
                expect(parts[1]).toEqual({
                    type: 'reasoning-delta',
                    id: 'reason-1',
                    delta: 'Let me think...',
                });
                expect(context.reasoningStarted).toBe(true);
                expect(context.reasoningBlockId).toBe('reason-1');
                expect(context.accumulatedReasoning).toBe('Let me think...');
            });

            it('should emit only reasoning-delta on subsequent deltas', () => {
                context.reasoningStarted = true;
                context.reasoningBlockId = 'reason-1';
                context.accumulatedReasoning = 'Let me think...';

                const event = createMockEvent('assistant.reasoning_delta', {
                    reasoningId: 'reason-1',
                    deltaContent: ' about this problem.',
                });

                const parts = mapReasoningEventToStreamParts(event as any, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({
                    type: 'reasoning-delta',
                    id: 'reason-1',
                    delta: ' about this problem.',
                });
                expect(context.accumulatedReasoning).toBe('Let me think... about this problem.');
            });

            it('should generate UUID when reasoningId is missing', () => {
                const event = createMockEvent('assistant.reasoning_delta', {
                    deltaContent: 'Thinking...',
                });

                const parts = mapReasoningEventToStreamParts(event as any, context);

                expect(parts[0]).toEqual({ type: 'reasoning-start', id: 'test-uuid-1234' });
                expect(context.reasoningBlockId).toBe('test-uuid-1234');
            });

            it('should not emit reasoning-delta when deltaContent is empty', () => {
                const event = createMockEvent('assistant.reasoning_delta', {
                    reasoningId: 'reason-1',
                    deltaContent: '',
                });

                const parts = mapReasoningEventToStreamParts(event as any, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({ type: 'reasoning-start', id: 'reason-1' });
            });
        });

        describe('assistant.reasoning events', () => {
            it('should emit reasoning-end when reasoning was started', () => {
                context.reasoningStarted = true;
                context.reasoningBlockId = 'reason-1';

                const event = createMockEvent('assistant.reasoning', {
                    reasoningId: 'reason-1',
                    content: 'Full reasoning content',
                });

                const parts = mapReasoningEventToStreamParts(event as any, context);

                expect(parts).toHaveLength(1);
                expect(parts[0]).toEqual({ type: 'reasoning-end', id: 'reason-1' });
                expect(context.accumulatedReasoning).toBe('Full reasoning content');
            });

            it('should store content without emitting when reasoning was not started', () => {
                const event = createMockEvent('assistant.reasoning', {
                    reasoningId: 'reason-1',
                    content: 'Full reasoning content',
                });

                const parts = mapReasoningEventToStreamParts(event as any, context);

                expect(parts).toEqual([]);
                expect(context.accumulatedReasoning).toBe('Full reasoning content');
                expect(context.reasoningBlockId).toBe('reason-1');
            });
        });

        it('should return empty array for unhandled events', () => {
            const event = createMockEvent('unknown.event', {});
            const parts = mapReasoningEventToStreamParts(event as any, context);

            expect(parts).toEqual([]);
        });
    });

    describe('createReasoningContent', () => {
        it('should return null when no reasoning accumulated', () => {
            const context = createReasoningContext();
            const result = createReasoningContent(context);

            expect(result).toBeNull();
        });

        it('should return reasoning content with text', () => {
            const context: ReasoningContext = {
                reasoningStarted: true,
                reasoningBlockId: 'reason-1',
                accumulatedReasoning: 'This is my reasoning process.',
            };

            const result = createReasoningContent(context);

            expect(result).not.toBeNull();
            expect(result?.type).toBe('reasoning');
            expect(result?.text).toBe('This is my reasoning process.');
        });

        it('should include provider metadata with reasoningId', () => {
            const context: ReasoningContext = {
                reasoningStarted: true,
                reasoningBlockId: 'reason-123',
                accumulatedReasoning: 'Reasoning text',
            };

            const result = createReasoningContent(context);

            expect(result?.providerMetadata).toEqual({
                copilot: {
                    reasoningId: 'reason-123',
                },
            });
        });

        it('should handle undefined reasoningBlockId', () => {
            const context: ReasoningContext = {
                reasoningStarted: false,
                reasoningBlockId: undefined,
                accumulatedReasoning: 'Some reasoning',
            };

            const result = createReasoningContent(context);

            expect(result).not.toBeNull();
            expect(result?.providerMetadata?.copilot?.reasoningId).toBeUndefined();
        });
    });
});
