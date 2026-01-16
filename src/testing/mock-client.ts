/**
 * Mock CopilotClient for testing.
 *
 * Provides a configurable mock implementation of the CopilotClient
 * interface for unit testing without requiring a real CLI.
 *
 * @module testing/mock-client
 */

import type { SessionConfig, ConnectionState } from '@github/copilot-sdk';
import { createMockSession, type MockSessionOptions, type CopilotSessionLike } from './mock-session.js';

/**
 * Interface matching the public API of CopilotClient for mocking.
 */
export interface CopilotClientLike {
    start(): Promise<void>;
    stop(): Promise<Error[]>;
    forceStop(): Promise<void>;
    createSession(config?: SessionConfig): Promise<CopilotSessionLike>;
    getState(): ConnectionState;
}

/**
 * Options for creating a mock client.
 */
export interface MockClientOptions {
    /**
     * Initial connection state.
     * @default 'connected'
     */
    initialState?: ConnectionState;

    /**
     * Whether start() should succeed.
     * @default true
     */
    startSucceeds?: boolean;

    /**
     * Error to throw on start failure.
     */
    startError?: Error;

    /**
     * Mock session options passed to created sessions.
     */
    sessionOptions?: Omit<MockSessionOptions, 'sessionId' | 'model'>;
}

/**
 * Test helpers exposed on mock clients.
 */
export interface MockClientTestHelpers {
    /** Whether start() has been called */
    getStartCalled: () => boolean;
    /** Number of sessions created */
    getSessionCount: () => number;
    /** Manually set connection state */
    setState: (newState: ConnectionState) => void;
    /** Get created sessions for inspection */
    getSessions: () => CopilotSessionLike[];
}

/**
 * Mock client type with test helpers.
 */
export type MockCopilotClient = CopilotClientLike & { _testing: MockClientTestHelpers };

/**
 * Creates a mock CopilotClient for testing.
 *
 * @example
 * ```typescript
 * const client = createMockClient({
 *   sessionOptions: {
 *     generateResponse: 'Hello, world!',
 *   },
 * });
 *
 * const session = await client.createSession({ model: 'gpt-4' });
 * // Use session in tests...
 *
 * // Access test helpers
 * expect(client._testing.getSessionCount()).toBe(1);
 * ```
 */
export function createMockClient(options: MockClientOptions = {}): MockCopilotClient {
    let state: ConnectionState = options.initialState ?? 'connected';
    let startCalled = false;
    const sessions: CopilotSessionLike[] = [];

    const client: MockCopilotClient = {
        async start() {
            if (options.startSucceeds === false || options.startError) {
                if (options.startError) {
                    throw options.startError;
                }
                throw new Error('Mock start failed');
            }
            state = 'connected';
            startCalled = true;
        },

        async stop() {
            state = 'disconnected';
            // Return any errors from session cleanup
            const errors: Error[] = [];
            for (const session of sessions) {
                try {
                    await session.destroy();
                } catch (e) {
                    errors.push(e as Error);
                }
            }
            return errors;
        },

        async forceStop() {
            state = 'disconnected';
            // Immediately clear sessions without cleanup
            sessions.length = 0;
        },

        async createSession(config: SessionConfig): Promise<CopilotSessionLike> {
            if (state !== 'connected') {
                throw new Error('Client not connected');
            }

            const session = createMockSession({
                ...options.sessionOptions,
                sessionId: config.sessionId,
                model: config.model,
            });

            sessions.push(session);
            return session;
        },

        getState(): ConnectionState {
            return state;
        },

        // Test helpers
        _testing: {
            getStartCalled: () => startCalled,
            getSessionCount: () => sessions.length,
            setState: (newState: ConnectionState) => {
                state = newState;
            },
            getSessions: () => sessions,
        },
    };

    return client;
}
