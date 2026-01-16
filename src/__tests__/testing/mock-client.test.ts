/**
 * Tests for mock CopilotClient.
 */
import { describe, it, expect, vi } from 'vitest';
import { createMockClient } from '../../testing/mock-client.js';

describe('createMockClient', () => {
    describe('default options', () => {
        it('should create connected client by default', () => {
            const client = createMockClient();
            expect(client.getState()).toBe('connected');
        });

        it('should track start calls', async () => {
            const client = createMockClient();
            expect(client._testing.getStartCalled()).toBe(false);

            await client.start();
            expect(client._testing.getStartCalled()).toBe(true);
        });

        it('should track sessions', async () => {
            const client = createMockClient();
            expect(client._testing.getSessionCount()).toBe(0);

            await client.createSession({ model: 'gpt-4' });
            expect(client._testing.getSessionCount()).toBe(1);
        });
    });

    describe('initial state', () => {
        it('should respect initialState option', () => {
            const client = createMockClient({ initialState: 'disconnected' });
            expect(client.getState()).toBe('disconnected');
        });

        it('should allow setting state via test helper', () => {
            const client = createMockClient();
            client._testing.setState('error');
            expect(client.getState()).toBe('error');
        });
    });

    describe('start', () => {
        it('should set state to connected', async () => {
            const client = createMockClient({ initialState: 'disconnected' });
            await client.start();
            expect(client.getState()).toBe('connected');
        });

        it('should throw when startSucceeds is false', async () => {
            const client = createMockClient({ startSucceeds: false });
            await expect(client.start()).rejects.toThrow('Mock start failed');
        });

        it('should throw custom error when startError provided', async () => {
            const error = new Error('Custom error');
            const client = createMockClient({ startError: error });
            await expect(client.start()).rejects.toThrow('Custom error');
        });
    });

    describe('stop', () => {
        it('should set state to disconnected', async () => {
            const client = createMockClient();
            await client.stop();
            expect(client.getState()).toBe('disconnected');
        });

        it('should destroy all sessions', async () => {
            const client = createMockClient();
            const session = await client.createSession({ model: 'gpt-4' });

            await client.stop();

            expect((session as unknown as { _testing: { isDestroyed: () => boolean } })._testing.isDestroyed()).toBe(true);
        });
    });

    describe('forceStop', () => {
        it('should set state to disconnected', async () => {
            const client = createMockClient();
            await client.forceStop();
            expect(client.getState()).toBe('disconnected');
        });

        it('should clear sessions without cleanup', async () => {
            const client = createMockClient();
            await client.createSession({ model: 'gpt-4' });
            expect(client._testing.getSessionCount()).toBe(1);

            await client.forceStop();
            expect(client._testing.getSessionCount()).toBe(0);
        });
    });

    describe('createSession', () => {
        it('should create session with config', async () => {
            const client = createMockClient();
            const session = await client.createSession({
                model: 'gpt-4',
                sessionId: 'custom-id',
            });

            expect(session.sessionId).toBe('custom-id');
        });

        it('should throw when not connected', async () => {
            const client = createMockClient({ initialState: 'disconnected' });
            await expect(client.createSession({ model: 'gpt-4' })).rejects.toThrow(
                'Client not connected'
            );
        });

        it('should use session options', async () => {
            const client = createMockClient({
                sessionOptions: { generateResponse: 'Hello!' },
            });

            const session = await client.createSession({ model: 'gpt-4' });
            const response = await session.send({ prompt: 'Hi' });

            expect(response).toBe('Hello!');
        });

        it('should allow access to created sessions', async () => {
            const client = createMockClient();

            const session1 = await client.createSession({ model: 'gpt-4' });
            const session2 = await client.createSession({ model: 'gpt-3.5-turbo' });

            const sessions = client._testing.getSessions();
            expect(sessions).toHaveLength(2);
            expect(sessions).toContain(session1);
            expect(sessions).toContain(session2);
        });
    });
});
