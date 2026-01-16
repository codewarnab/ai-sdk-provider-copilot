/**
 * Session pool for managing and reusing Copilot sessions.
 *
 * Implements on-demand session creation with soft reuse
 * for efficiency when session configurations match.
 *
 * @module pool/session-pool
 */

import type { CopilotSession } from '@github/copilot-sdk';
import type { SessionPoolConfig, Logger } from '../types.js';

/**
 * Represents a pooled session with metadata.
 */
interface PooledSession {
    session: CopilotSession;
    configHash: string;
    lastUsed: number;
    useCount: number;
}

/**
 * Default session pool configuration.
 */
export const DEFAULT_POOL_CONFIG: Required<SessionPoolConfig> = {
    enabled: false,
    maxIdleSessions: 3,
    idleTimeoutMs: 300000, // 5 minutes
    validateBeforeReuse: true,
};

/**
 * Generates a hash for session configuration to enable matching.
 */
function hashConfig(config: Record<string, unknown>): string {
    // Simple hash for matching sessions based on configuration
    const normalized = JSON.stringify(config, Object.keys(config).sort());
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

/**
 * No-op logger for when none is provided.
 */
const noopLogger: Logger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};

/**
 * Session pool for reusing sessions across requests.
 *
 * @example
 * ```typescript
 * const pool = new SessionPool({ enabled: true }, logger);
 *
 * // Try to acquire an existing session
 * const existing = pool.acquire({ model: 'gpt-4' });
 * if (existing) {
 *   // Reuse the session
 * } else {
 *   // Create a new session
 *   const session = await client.createSession({ model: 'gpt-4' });
 *   // When done, release back to pool
 *   pool.release(session, { model: 'gpt-4' });
 * }
 * ```
 */
export class SessionPool {
    private pool: PooledSession[] = [];
    private config: Required<SessionPoolConfig>;
    private logger: Logger;
    private cleanupInterval?: ReturnType<typeof setInterval>;

    constructor(config: SessionPoolConfig = {}, logger?: Logger) {
        this.config = { ...DEFAULT_POOL_CONFIG, ...config };
        this.logger = logger ?? noopLogger;

        if (this.config.enabled) {
            this.startCleanupTimer();
        }
    }

    /**
     * Attempts to acquire a session from the pool.
     * Returns null if no matching session available.
     *
     * @param sessionConfig - Configuration to match against pooled sessions
     * @returns A matching session or null
     */
    acquire(sessionConfig: Record<string, unknown>): CopilotSession | null {
        if (!this.config.enabled) return null;

        const configHash = hashConfig(sessionConfig);
        const now = Date.now();

        // Find a matching, non-expired session
        const index = this.pool.findIndex(
            (ps) =>
                ps.configHash === configHash &&
                now - ps.lastUsed < this.config.idleTimeoutMs
        );

        if (index === -1) {
            this.logger.debug('[pool] No matching session found');
            return null;
        }

        const pooled = this.pool.splice(index, 1)[0];
        pooled.useCount++;
        pooled.lastUsed = now;

        this.logger.debug(`[pool] Reusing session (use count: ${pooled.useCount})`);
        return pooled.session;
    }

    /**
     * Returns a session to the pool for potential reuse.
     *
     * @param session - The session to release
     * @param sessionConfig - Configuration of the session
     */
    release(session: CopilotSession, sessionConfig: Record<string, unknown>): void {
        if (!this.config.enabled) return;

        const configHash = hashConfig(sessionConfig);

        // Check if we have room
        if (this.pool.length >= this.config.maxIdleSessions) {
            // Evict oldest
            const oldest = this.pool.reduce((min, ps) =>
                ps.lastUsed < min.lastUsed ? ps : min
            );
            this.evict(oldest);
        }

        this.pool.push({
            session,
            configHash,
            lastUsed: Date.now(),
            useCount: 0,
        });

        this.logger.debug(`[pool] Session released (pool size: ${this.pool.length})`);
    }

    /**
     * Gets current pool statistics.
     */
    getStats(): { size: number; maxSize: number } {
        return {
            size: this.pool.length,
            maxSize: this.config.maxIdleSessions,
        };
    }

    /**
     * Disposes all pooled sessions.
     */
    async dispose(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }

        const sessions = this.pool.splice(0);
        this.logger.debug(`[pool] Disposing ${sessions.length} pooled sessions`);

        await Promise.all(
            sessions.map((ps) => this.destroySession(ps.session).catch(() => { }))
        );
    }

    private startCleanupTimer(): void {
        // Run cleanup every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }

    private cleanup(): void {
        const now = Date.now();
        const expired = this.pool.filter(
            (ps) => now - ps.lastUsed >= this.config.idleTimeoutMs
        );

        if (expired.length > 0) {
            this.logger.debug(`[pool] Cleaning up ${expired.length} expired sessions`);
            expired.forEach((ps) => this.evict(ps));
        }
    }

    private evict(pooled: PooledSession): void {
        const index = this.pool.indexOf(pooled);
        if (index !== -1) {
            this.pool.splice(index, 1);
            this.destroySession(pooled.session).catch(() => { });
        }
    }

    private async destroySession(session: CopilotSession): Promise<void> {
        try {
            await session.destroy();
        } catch (error) {
            this.logger.warn(`[pool] Error destroying session: ${error}`);
        }
    }
}
