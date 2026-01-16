/**
 * Tests for session pool.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionPool, DEFAULT_POOL_CONFIG } from '../../pool/session-pool.js';
import type { CopilotSession } from '@github/copilot-sdk';
import type { Logger } from '../../types.js';

// Create mock session factory
function createMockPoolSession(id: string): CopilotSession {
    return {
        sessionId: id,
        on: vi.fn().mockReturnValue(vi.fn()),
        send: vi.fn().mockResolvedValue('response'),
        abort: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        getMessages: vi.fn().mockResolvedValue([]),
    } as unknown as CopilotSession;
}

const mockLogger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

describe('DEFAULT_POOL_CONFIG', () => {
    it('should have expected defaults', () => {
        expect(DEFAULT_POOL_CONFIG.enabled).toBe(false);
        expect(DEFAULT_POOL_CONFIG.maxIdleSessions).toBe(3);
        expect(DEFAULT_POOL_CONFIG.idleTimeoutMs).toBe(300000);
        expect(DEFAULT_POOL_CONFIG.validateBeforeReuse).toBe(true);
    });
});

describe('SessionPool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('when disabled', () => {
        it('acquire returns null', () => {
            const pool = new SessionPool({ enabled: false }, mockLogger);
            const session = pool.acquire({ model: 'gpt-4' });
            expect(session).toBeNull();
        });

        it('release does nothing', () => {
            const pool = new SessionPool({ enabled: false }, mockLogger);
            const session = createMockPoolSession('test');
            pool.release(session, { model: 'gpt-4' });
            expect(pool.getStats().size).toBe(0);
        });
    });

    describe('when enabled', () => {
        it('acquire returns null when pool is empty', () => {
            const pool = new SessionPool({ enabled: true }, mockLogger);
            const session = pool.acquire({ model: 'gpt-4' });
            expect(session).toBeNull();
        });

        it('release adds session to pool', () => {
            const pool = new SessionPool({ enabled: true }, mockLogger);
            const session = createMockPoolSession('test');
            pool.release(session, { model: 'gpt-4' });
            expect(pool.getStats().size).toBe(1);
        });

        it('acquire returns matching session', () => {
            const pool = new SessionPool({ enabled: true }, mockLogger);
            const session = createMockPoolSession('test');
            pool.release(session, { model: 'gpt-4' });

            const acquired = pool.acquire({ model: 'gpt-4' });
            expect(acquired).toBe(session);
            expect(pool.getStats().size).toBe(0);
        });

        it('acquire returns null for non-matching config', () => {
            const pool = new SessionPool({ enabled: true }, mockLogger);
            const session = createMockPoolSession('test');
            pool.release(session, { model: 'gpt-4' });

            const acquired = pool.acquire({ model: 'gpt-3.5-turbo' });
            expect(acquired).toBeNull();
            expect(pool.getStats().size).toBe(1);
        });

        it('evicts oldest when at capacity', () => {
            const pool = new SessionPool(
                { enabled: true, maxIdleSessions: 2 },
                mockLogger
            );

            const session1 = createMockPoolSession('1');
            const session2 = createMockPoolSession('2');
            const session3 = createMockPoolSession('3');

            pool.release(session1, { model: 'gpt-4', v: 1 });
            vi.advanceTimersByTime(100);
            pool.release(session2, { model: 'gpt-4', v: 2 });
            vi.advanceTimersByTime(100);
            pool.release(session3, { model: 'gpt-4', v: 3 });

            expect(pool.getStats().size).toBe(2);
            // Session1 should have been evicted
            expect(session1.destroy).toHaveBeenCalled();
        });

        it('getStats returns accurate counts', () => {
            const pool = new SessionPool(
                { enabled: true, maxIdleSessions: 5 },
                mockLogger
            );

            expect(pool.getStats()).toEqual({ size: 0, maxSize: 5 });

            pool.release(createMockPoolSession('1'), { model: 'gpt-4' });
            pool.release(createMockPoolSession('2'), { model: 'gpt-4' });

            expect(pool.getStats()).toEqual({ size: 2, maxSize: 5 });
        });
    });

    describe('cleanup', () => {
        it('removes expired sessions on cleanup interval', () => {
            const pool = new SessionPool(
                { enabled: true, idleTimeoutMs: 1000 },
                mockLogger
            );

            const session = createMockPoolSession('test');
            pool.release(session, { model: 'gpt-4' });

            expect(pool.getStats().size).toBe(1);

            // Advance past idle timeout
            vi.advanceTimersByTime(1100);
            // Advance to cleanup interval (60 seconds)
            vi.advanceTimersByTime(60000);

            expect(pool.getStats().size).toBe(0);
            expect(session.destroy).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('destroys all sessions', async () => {
            const pool = new SessionPool({ enabled: true }, mockLogger);

            const session1 = createMockPoolSession('1');
            const session2 = createMockPoolSession('2');

            pool.release(session1, { model: 'gpt-4' });
            pool.release(session2, { model: 'gpt-4' });

            await pool.dispose();

            expect(session1.destroy).toHaveBeenCalled();
            expect(session2.destroy).toHaveBeenCalled();
            expect(pool.getStats().size).toBe(0);
        });
    });
});
