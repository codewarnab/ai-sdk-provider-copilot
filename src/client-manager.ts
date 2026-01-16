/**
 * Client lifecycle management for the Copilot provider.
 * 
 * Manages shared CopilotClient instances across model instances with:
 * - Lazy initialization on first use
 * - Reference counting for safe cleanup
 * - Graceful disposal with retry
 * 
 * @module client-manager
 */

import { CopilotClient } from '@github/copilot-sdk';
import type { CopilotClientOptions } from '@github/copilot-sdk';
import type { Logger, CopilotProviderOptions } from './types.js';
import { getLogger } from './telemetry.js';

/**
 * Connection state of the client manager.
 */
export type ClientState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'disposing';

/**
 * Manages shared CopilotClient instances across model instances.
 * 
 * Implements lazy initialization, reference counting, and graceful cleanup.
 * A single ClientManager instance should be created per provider and shared
 * across all model instances created by that provider.
 * 
 * @example
 * ```typescript
 * const manager = new ClientManager(providerOptions);
 * 
 * // Acquire client (creates on first call, reuses on subsequent)
 * const client = await manager.acquire();
 * 
 * try {
 *   // Use client...
 * } finally {
 *   manager.release();
 * }
 * 
 * // Clean up when done
 * await manager.dispose();
 * ```
 */
export class ClientManager {
    private client?: CopilotClient;
    private clientPromise?: Promise<CopilotClient>;
    private referenceCount = 0;
    private state: ClientState = 'disconnected';
    private logger: Logger;
    private options: CopilotProviderOptions;

    constructor(options: CopilotProviderOptions) {
        this.options = options;
        this.logger = getLogger(options.logger, options.verbose);
    }

    /**
     * Gets or creates a shared CopilotClient instance.
     * Increments reference count.
     * 
     * @returns The shared CopilotClient instance
     * @throws Error if the manager is disposing
     */
    async acquire(): Promise<CopilotClient> {
        if (this.state === 'disposing') {
            throw new Error('ClientManager is disposing, cannot acquire new client');
        }

        this.referenceCount++;
        this.logger.debug(`Acquiring client (refs: ${this.referenceCount})`);

        if (this.client) {
            return this.client;
        }

        if (!this.clientPromise) {
            this.clientPromise = this.createClient();
        }

        return this.clientPromise;
    }

    /**
     * Releases a reference to the client.
     * When reference count reaches zero, client is not immediately destroyed
     * (allows reuse). Call dispose() for immediate cleanup.
     */
    release(): void {
        this.referenceCount = Math.max(0, this.referenceCount - 1);
        this.logger.debug(`Releasing client (refs: ${this.referenceCount})`);
    }

    /**
     * Disposes all resources, stopping the client if active.
     * Uses retry with exponential backoff for graceful cleanup.
     */
    async dispose(): Promise<void> {
        if (this.state === 'disposing') return;

        this.state = 'disposing';
        this.logger.debug('Disposing ClientManager');

        if (this.client) {
            try {
                // Retry with exponential backoff for clean shutdown
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const errors = await this.client.stop();
                        if (errors.length > 0) {
                            this.logger.warn(
                                `Errors during client stop: ${errors.map(e => e.message).join(', ')}`
                            );
                        }
                        break;
                    } catch (error) {
                        if (attempt < 3) {
                            const delay = 100 * Math.pow(2, attempt - 1);
                            this.logger.debug(`Stop attempt ${attempt} failed, retrying in ${delay}ms`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        } else {
                            throw error;
                        }
                    }
                }
            } catch (error) {
                this.logger.error(`Error stopping client: ${error}`);
            }
            this.client = undefined;
        }

        this.clientPromise = undefined;
        this.referenceCount = 0;
        this.state = 'disconnected';
    }

    /**
     * Returns current connection state.
     */
    getState(): ClientState {
        return this.state;
    }

    /**
     * Returns current reference count.
     * Useful for debugging and testing.
     */
    getReferenceCount(): number {
        return this.referenceCount;
    }

    /**
     * Checks if the manager has an active client.
     */
    isConnected(): boolean {
        return this.state === 'connected' && !!this.client;
    }

    private async createClient(): Promise<CopilotClient> {
        this.state = 'connecting';
        this.logger.info('Creating new CopilotClient');

        try {
            const clientOptions: Partial<CopilotClientOptions> = {
                cliPath: this.options.cliPath,
                cliUrl: this.options.cliUrl,
                cwd: this.options.cwd,
                cliArgs: this.options.cliArgs,
                useStdio: this.options.useStdio,
                env: this.options.env,
                logLevel: this.options.logLevel ?? 'info',
            };

            this.client = new CopilotClient(clientOptions as CopilotClientOptions);

            // Verify connection
            await this.client.start();
            this.state = 'connected';
            this.logger.info('CopilotClient connected');

            return this.client;
        } catch (error) {
            this.state = 'error';
            this.client = undefined;
            this.clientPromise = undefined;
            throw error;
        }
    }
}

/**
 * Creates a ClientManager with the given options.
 * 
 * @param options - Provider configuration options
 * @returns A new ClientManager instance
 */
export function createClientManager(options: CopilotProviderOptions): ClientManager {
    return new ClientManager(options);
}
