/**
 * Tests for mock CopilotSession.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockSession } from '../../testing/mock-session.js';

// Define a simple event type for test assertions
interface TestEvent {
    type: string;
    data: Record<string, unknown>;
}

describe('createMockSession', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('default options', () => {
        it('should create session with default ID', () => {
            const session = createMockSession();
            expect(session.sessionId).toBe('mock-session-id');
        });

        it('should allow custom session ID', () => {
            const session = createMockSession({ sessionId: 'custom-id' });
            expect(session.sessionId).toBe('custom-id');
        });
    });

    describe('on', () => {
        it('should track listener count', () => {
            const session = createMockSession();
            expect(session._testing.getListenerCount()).toBe(0);

            const unsub1 = session.on(() => { });
            expect(session._testing.getListenerCount()).toBe(1);

            const unsub2 = session.on(() => { });
            expect(session._testing.getListenerCount()).toBe(2);

            unsub1();
            expect(session._testing.getListenerCount()).toBe(1);

            unsub2();
            expect(session._testing.getListenerCount()).toBe(0);
        });
    });

    describe('send', () => {
        it('should return response text', async () => {
            const session = createMockSession({ generateResponse: 'Hello!' });
            const response = await session.send({ prompt: 'Hi' });
            expect(response).toBe('Hello!');
        });

        it('should emit events in order', async () => {
            const session = createMockSession({ generateResponse: 'Response' });
            const events: string[] = [];

            session.on((event) => events.push(event.type));

            await session.send({ prompt: 'Hi' });

            expect(events).toContain('assistant.turn_start');
            expect(events).toContain('assistant.message');
            expect(events).toContain('assistant.usage');
            expect(events).toContain('assistant.turn_end');
        });

        it('should emit tool calls when configured', async () => {
            const session = createMockSession({
                toolCalls: [
                    { toolName: 'search', arguments: { query: 'test' } },
                ],
            });

            const events: string[] = [];
            session.on((event) => events.push(event.type));

            await session.send({ prompt: 'Hi' });

            expect(events).toContain('tool.execution_start');
            expect(events).toContain('tool.execution_complete');
        });

        it('should emit usage with configured values', async () => {
            const session = createMockSession({
                usage: { inputTokens: 100, outputTokens: 50 },
            });

            let usageData: Record<string, unknown> | undefined;
            session.on((event) => {
                if (event.type === 'assistant.usage') {
                    usageData = event.data;
                }
            });

            await session.send({ prompt: 'Hi' });

            expect(usageData?.inputTokens).toBe(100);
            expect(usageData?.outputTokens).toBe(50);
        });

        it('should throw configured send error', async () => {
            const error = new Error('Send failed');
            const session = createMockSession({ sendError: error });

            await expect(session.send({ prompt: 'Hi' })).rejects.toThrow('Send failed');
        });

        it('should delay response when configured', async () => {
            const session = createMockSession({
                generateResponse: 'Response',
                responseDelay: 100,
            });

            const startTime = Date.now();
            const promise = session.send({ prompt: 'Hi' });

            await vi.advanceTimersByTimeAsync(100);
            await promise;

            // Verify delay happened (fake timer advances)
            expect(Date.now() - startTime).toBeGreaterThanOrEqual(100);
        });

        it('should throw when destroyed', async () => {
            const session = createMockSession();
            await session.destroy();

            await expect(session.send({ prompt: 'Hi' })).rejects.toThrow(
                'Session destroyed'
            );
        });
    });

    describe('streaming simulation', () => {
        it('should emit word-by-word deltas', async () => {
            const session = createMockSession({
                generateResponse: 'Hello world test',
                streamingDelay: 10,
            });

            const deltas: string[] = [];
            session.on((event) => {
                if (event.type === 'assistant.message_delta') {
                    deltas.push(event.data.deltaContent as string);
                }
            });

            const promise = session.send({ prompt: 'Hi' });

            // Advance through all delays
            await vi.advanceTimersByTimeAsync(50);

            await promise;

            expect(deltas).toHaveLength(3);
            expect(deltas.join('')).toBe('Hello world test');
        });
    });

    describe('abort', () => {
        it('should emit abort event', async () => {
            const session = createMockSession();

            let abortEvent: Record<string, unknown> | undefined;
            session.on((event) => {
                if (event.type === 'abort') {
                    abortEvent = event.data;
                }
            });

            await session.abort();

            expect(abortEvent?.reason).toBe('User requested abort');
        });
    });

    describe('destroy', () => {
        it('should mark session as destroyed', async () => {
            const session = createMockSession();
            expect(session._testing.isDestroyed()).toBe(false);

            await session.destroy();
            expect(session._testing.isDestroyed()).toBe(true);
        });

        it('should clear all listeners', async () => {
            const session = createMockSession();
            session.on(() => { });
            session.on(() => { });
            expect(session._testing.getListenerCount()).toBe(2);

            await session.destroy();
            expect(session._testing.getListenerCount()).toBe(0);
        });
    });

    describe('getMessages', () => {
        it('should return empty array', async () => {
            const session = createMockSession();
            const messages = await session.getMessages();
            expect(messages).toEqual([]);
        });
    });

    describe('manual emit', () => {
        it('should broadcast event to listeners', () => {
            const session = createMockSession();

            let receivedEvent: Record<string, unknown> | undefined;
            session.on((event) => {
                receivedEvent = event as unknown as Record<string, unknown>;
            });

            session._testing.emit({
                type: 'custom.event',
                id: 'test',
                timestamp: Date.now(),
                data: { custom: 'data' },
            });

            expect(receivedEvent?.type).toBe('custom.event');
            expect((receivedEvent?.data as Record<string, unknown>)?.custom).toBe('data');
        });

        it('should not emit after destroy', () => {
            const session = createMockSession();

            const handler = vi.fn();
            session.on(handler);

            session.destroy();

            session._testing.emit({
                type: 'custom.event',
                id: 'test',
                timestamp: Date.now(),
                data: {},
            });

            expect(handler).not.toHaveBeenCalled();
        });
    });
});
