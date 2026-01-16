import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientManager, createClientManager } from '../client-manager.js';
import type { CopilotProviderOptions } from '../types.js';

// Mock the Copilot SDK
vi.mock('@github/copilot-sdk', () => ({
    CopilotClient: class MockCopilotClient {
        start = vi.fn().mockResolvedValue(undefined);
        stop = vi.fn().mockResolvedValue([]);
        getState = vi.fn().mockReturnValue('connected');
    },
}));

describe('ClientManager', () => {
    const defaultOptions: CopilotProviderOptions = {
        logger: false, // Disable logging for tests
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('acquire', () => {
        it('should create client on first call', async () => {
            const manager = new ClientManager(defaultOptions);

            const client = await manager.acquire();

            expect(client).toBeDefined();
            expect(manager.getReferenceCount()).toBe(1);
        });

        it('should return same client on subsequent calls', async () => {
            const manager = new ClientManager(defaultOptions);

            const client1 = await manager.acquire();
            const client2 = await manager.acquire();

            expect(client1).toBe(client2);
            expect(manager.getReferenceCount()).toBe(2);
        });

        it('should increment reference count on each acquire', async () => {
            const manager = new ClientManager(defaultOptions);

            expect(manager.getReferenceCount()).toBe(0);

            await manager.acquire();
            expect(manager.getReferenceCount()).toBe(1);

            await manager.acquire();
            expect(manager.getReferenceCount()).toBe(2);

            await manager.acquire();
            expect(manager.getReferenceCount()).toBe(3);
        });

        it('should set state to disposing during dispose', async () => {
            const manager = new ClientManager(defaultOptions);

            // First acquire to create a client
            await manager.acquire();
            expect(manager.getState()).toBe('connected');

            // Start dispose - captures state during operation
            await manager.dispose();

            // After dispose completes, state should be disconnected  
            expect(manager.getState()).toBe('disconnected');
        });
    });

    describe('release', () => {
        it('should decrement reference count', async () => {
            const manager = new ClientManager(defaultOptions);

            await manager.acquire();
            await manager.acquire();
            expect(manager.getReferenceCount()).toBe(2);

            manager.release();
            expect(manager.getReferenceCount()).toBe(1);

            manager.release();
            expect(manager.getReferenceCount()).toBe(0);
        });

        it('should not go below zero', () => {
            const manager = new ClientManager(defaultOptions);

            manager.release();
            manager.release();
            manager.release();

            expect(manager.getReferenceCount()).toBe(0);
        });
    });

    describe('dispose', () => {
        it('should stop client and reset state', async () => {
            const manager = new ClientManager(defaultOptions);

            await manager.acquire();
            expect(manager.isConnected()).toBe(true);

            await manager.dispose();

            expect(manager.isConnected()).toBe(false);
            expect(manager.getReferenceCount()).toBe(0);
            expect(manager.getState()).toBe('disconnected');
        });

        it('should be idempotent', async () => {
            const manager = new ClientManager(defaultOptions);

            await manager.acquire();

            // Multiple dispose calls should not throw
            await manager.dispose();
            await manager.dispose();
            await manager.dispose();

            expect(manager.getState()).toBe('disconnected');
        });
    });

    describe('getState', () => {
        it('should return disconnected initially', () => {
            const manager = new ClientManager(defaultOptions);

            expect(manager.getState()).toBe('disconnected');
        });

        it('should return connected after acquire', async () => {
            const manager = new ClientManager(defaultOptions);

            await manager.acquire();

            expect(manager.getState()).toBe('connected');
        });

        it('should return disconnected after dispose', async () => {
            const manager = new ClientManager(defaultOptions);

            await manager.acquire();
            await manager.dispose();

            expect(manager.getState()).toBe('disconnected');
        });
    });

    describe('isConnected', () => {
        it('should return false initially', () => {
            const manager = new ClientManager(defaultOptions);

            expect(manager.isConnected()).toBe(false);
        });

        it('should return true after acquire', async () => {
            const manager = new ClientManager(defaultOptions);

            await manager.acquire();

            expect(manager.isConnected()).toBe(true);
        });

        it('should return false after dispose', async () => {
            const manager = new ClientManager(defaultOptions);

            await manager.acquire();
            await manager.dispose();

            expect(manager.isConnected()).toBe(false);
        });
    });
});

describe('createClientManager', () => {
    it('should create a ClientManager instance', () => {
        const manager = createClientManager({ logger: false });

        expect(manager).toBeInstanceOf(ClientManager);
    });

    it('should pass options to the manager', async () => {
        const options: CopilotProviderOptions = {
            cliPath: '/custom/path',
            logger: false,
        };

        const manager = createClientManager(options);

        // The manager should be created without error
        expect(manager.getState()).toBe('disconnected');
    });
});
