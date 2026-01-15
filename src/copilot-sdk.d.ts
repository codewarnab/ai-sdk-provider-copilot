/**
 * Type declarations for @github/copilot-sdk
 *
 * The Copilot SDK doesn't ship type declarations, so we declare the types
 * we need here based on the SDK source code.
 */
declare module '@github/copilot-sdk' {
    /**
     * Options for creating a CopilotClient
     */
    export interface CopilotClientOptions {
        cliPath?: string;
        cliArgs?: string[];
        cwd?: string;
        port?: number;
        useStdio?: boolean;
        cliUrl?: string;
        logLevel?: 'none' | 'error' | 'warning' | 'info' | 'debug' | 'all';
        autoStart?: boolean;
        autoRestart?: boolean;
        env?: Record<string, string | undefined>;
    }

    /**
     * System message configuration
     */
    export type SystemMessageConfig =
        | { mode?: 'append'; content?: string }
        | { mode: 'replace'; content: string };

    /**
     * Session configuration
     */
    export interface SessionConfig {
        sessionId?: string;
        model?: string;
        tools?: unknown[];
        systemMessage?: SystemMessageConfig;
        availableTools?: string[];
        excludedTools?: string[];
        provider?: {
            type?: 'openai' | 'azure' | 'anthropic';
            wireApi?: 'completions' | 'responses';
            baseUrl: string;
            apiKey?: string;
            bearerToken?: string;
            azure?: { apiVersion?: string };
        };
        onPermissionRequest?: unknown;
        streaming?: boolean;
        mcpServers?: unknown;
        customAgents?: unknown[];
    }

    /**
     * Session event
     */
    export interface SessionEvent {
        id: string;
        type: string;
        timestamp: number;
        data: Record<string, unknown>;
    }

    /**
     * Session event handler
     */
    export type SessionEventHandler = (event: SessionEvent) => void;

    /**
     * Message options for session.send()
     */
    export interface MessageOptions {
        prompt: string;
        attachments?: Array<{
            type: 'file' | 'directory';
            path: string;
            displayName?: string;
        }>;
        mode?: 'enqueue' | 'immediate';
    }

    /**
     * Copilot session
     */
    export class CopilotSession {
        readonly sessionId: string;

        send(options: MessageOptions): Promise<string>;
        on(handler: SessionEventHandler): () => void;
        abort(): Promise<void>;
        destroy(): Promise<void>;
        getMessages(): Promise<SessionEvent[]>;
    }

    /**
     * Copilot client
     */
    export class CopilotClient {
        constructor(options?: CopilotClientOptions);

        start(): Promise<void>;
        stop(): Promise<Error[]>;
        forceStop(): Promise<void>;
        createSession(config?: SessionConfig): Promise<CopilotSession>;
        getState(): 'disconnected' | 'connecting' | 'connected' | 'error';
    }
}
