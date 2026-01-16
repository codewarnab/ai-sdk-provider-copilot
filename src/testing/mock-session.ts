/**
 * Mock CopilotSession for testing.
 *
 * Provides a configurable mock implementation of the CopilotSession
 * interface that emits events based on configuration.
 *
 * @module testing/mock-session
 */

import type { SessionEvent, SessionEventHandler, MessageOptions } from '@github/copilot-sdk';

/**
 * Interface matching the public API of CopilotSession for mocking.
 */
export interface CopilotSessionLike {
    readonly sessionId: string;
    on(handler: SessionEventHandler): () => void;
    send(options: MessageOptions): Promise<string>;
    abort(): Promise<void>;
    destroy(): Promise<void>;
    getMessages(): Promise<SessionEvent[]>;
}

/**
 * Options for creating a mock session.
 */
export interface MockSessionOptions {
    /** Session ID */
    sessionId?: string;
    /** Model being used */
    model?: string;

    /**
     * Text response for generate calls.
     */
    generateResponse?: string;

    /**
     * Token usage to report.
     */
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };

    /**
     * Tool calls to simulate.
     */
    toolCalls?: Array<{
        toolName: string;
        arguments: unknown;
    }>;

    /**
     * Simulate streaming with delays (ms between words).
     */
    streamingDelay?: number;

    /**
     * Error to throw on send.
     */
    sendError?: Error;

    /**
     * Delay before emitting events (ms).
     */
    responseDelay?: number;
}

/**
 * Test helpers exposed on mock sessions.
 */
export interface MockSessionTestHelpers {
    /** Manually emit an event */
    emit: (event: SessionEvent) => void;
    /** Get number of active listeners */
    getListenerCount: () => number;
    /** Check if session is destroyed */
    isDestroyed: () => boolean;
}

/**
 * Mock session type with test helpers.
 */
export type MockCopilotSession = CopilotSessionLike & { _testing: MockSessionTestHelpers };

/**
 * Creates a mock CopilotSession for testing.
 *
 * @example
 * ```typescript
 * const session = createMockSession({
 *   generateResponse: 'Hello, world!',
 *   usage: { inputTokens: 10, outputTokens: 5 },
 * });
 *
 * // Subscribe to events
 * session.on((event) => {
 *   console.log(event.type, event.data);
 * });
 *
 * // Trigger events by sending
 * await session.send({ prompt: 'Hi' });
 *
 * // Or manually emit events
 * session._testing.emit({ type: 'assistant.message', data: { content: 'Test' } });
 * ```
 */
/**
 * Helper to create a properly typed mock event.
 * SDK events require parentId and timestamp as ISO string.
 */
function createMockEvent<T extends SessionEvent['type']>(
    type: T,
    id: string,
    data: Extract<SessionEvent, { type: T }>['data']
): SessionEvent {
    return {
        type,
        id,
        timestamp: new Date().toISOString(),
        parentId: null,
        data,
    } as SessionEvent;
}

export function createMockSession(options: MockSessionOptions = {}): MockCopilotSession {
    const listeners: Set<SessionEventHandler> = new Set();
    let destroyed = false;

    const emit = (event: SessionEvent) => {
        if (destroyed) return;
        listeners.forEach((handler) => handler(event));
    };

    const session: MockCopilotSession = {
        sessionId: options.sessionId ?? 'mock-session-id',

        on(handler: SessionEventHandler): () => void {
            listeners.add(handler);
            return () => listeners.delete(handler);
        },

        async send(_messageOptions: MessageOptions): Promise<string> {
            if (destroyed) {
                throw new Error('Session destroyed');
            }

            if (options.sendError) {
                throw options.sendError;
            }

            // Optional delay before responding
            if (options.responseDelay) {
                await new Promise((r) => setTimeout(r, options.responseDelay));
            }

            // Emit turn start
            emit(createMockEvent('assistant.turn_start', 'mock-turn', { turnId: 'mock-turn' }));

            // Emit tool calls if configured
            if (options.toolCalls) {
                for (const toolCall of options.toolCalls) {
                    emit(createMockEvent('tool.execution_start', `tool-start-${toolCall.toolName}`, {
                        toolCallId: `mock-tool-call-${toolCall.toolName}`,
                        toolName: toolCall.toolName,
                    }));

                    emit(createMockEvent('tool.execution_complete', `tool-complete-${toolCall.toolName}`, {
                        toolCallId: `mock-tool-call-${toolCall.toolName}`,
                        success: true,
                    }));
                }
            }

            // Emit text response
            if (options.generateResponse) {
                if (options.streamingDelay) {
                    // Simulate streaming with word-by-word deltas
                    const words = options.generateResponse.split(' ');
                    for (let i = 0; i < words.length; i++) {
                        await new Promise((r) => setTimeout(r, options.streamingDelay));
                        const content = words[i] + (i < words.length - 1 ? ' ' : '');
                        emit(createMockEvent('assistant.message_delta', 'mock-delta', {
                            messageId: 'mock-message',
                            deltaContent: content,
                        }));
                    }
                }

                emit(createMockEvent('assistant.message', 'mock-message', {
                    messageId: 'mock-message',
                    content: options.generateResponse,
                }));
            }

            // Emit usage (ephemeral: true is required for this event type)
            emit({
                type: 'assistant.usage',
                id: 'mock-usage',
                timestamp: new Date().toISOString(),
                parentId: null,
                ephemeral: true,
                data: {
                    inputTokens: options.usage?.inputTokens ?? 10,
                    outputTokens: options.usage?.outputTokens ?? 20,
                },
            } as SessionEvent);

            // Emit turn end
            emit(createMockEvent('assistant.turn_end', 'mock-turn-end', { turnId: 'mock-turn' }));

            // Return the response text (as per SDK interface)
            return options.generateResponse ?? '';
        },

        async abort(): Promise<void> {
            emit(createMockEvent('abort', 'mock-abort', { reason: 'User requested abort' }));
        },

        async destroy(): Promise<void> {
            destroyed = true;
            listeners.clear();
        },

        async getMessages(): Promise<SessionEvent[]> {
            // Return empty array for mock
            return [];
        },

        // Test helpers
        _testing: {
            emit,
            getListenerCount: () => listeners.size,
            isDestroyed: () => destroyed,
        },
    };

    return session;
}
