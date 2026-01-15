import type {
    CopilotClientOptions,
    SystemMessageConfig,
} from '@github/copilot-sdk';

/**
 * Configuration for a custom API provider (BYOK - Bring Your Own Key).
 * Matches the Copilot SDK ProviderConfig interface.
 */
export interface ProviderConfig {
    /**
     * Provider type. Defaults to "openai" for generic OpenAI-compatible APIs.
     */
    type?: 'openai' | 'azure' | 'anthropic';

    /**
     * API format (openai/azure only). Defaults to "completions".
     */
    wireApi?: 'completions' | 'responses';

    /**
     * API endpoint URL
     */
    baseUrl: string;

    /**
     * API key. Optional for local providers like Ollama.
     */
    apiKey?: string;

    /**
     * Bearer token for authentication. Sets the Authorization header directly.
     * Use this for services requiring bearer token auth instead of API key.
     * Takes precedence over apiKey when both are set.
     */
    bearerToken?: string;

    /**
     * Azure-specific options
     */
    azure?: {
        /**
         * API version. Defaults to "2024-10-21".
         */
        apiVersion?: string;
    };
}

/**
 * Options for configuring the Copilot provider
 */
export interface CopilotProviderOptions {
    /**
     * Path to the Copilot CLI executable
     * @default "copilot" (searches PATH)
     */
    cliPath?: string;

    /**
     * URL of an existing Copilot CLI server
     * Mutually exclusive with cliPath
     */
    cliUrl?: string;

    /**
     * Custom provider configuration (BYOK - Bring Your Own Key)
     */
    provider?: ProviderConfig;

    /**
     * Log level for the CLI server
     * @default "info"
     */
    logLevel?: CopilotClientOptions['logLevel'];

    /**
     * Working directory for the CLI process
     */
    cwd?: string;

    /**
     * Extra arguments to pass to the CLI executable
     */
    cliArgs?: string[];

    /**
     * Use stdio transport instead of TCP
     * @default true
     */
    useStdio?: boolean;

    /**
     * Environment variables to pass to the CLI process
     */
    env?: Record<string, string | undefined>;
}

/**
 * Settings for a specific model instance
 */
export interface CopilotModelSettings {
    /**
     * System message configuration
     */
    systemMessage?: SystemMessageConfig;

    /**
     * Enable streaming of assistant message chunks
     * Used internally when calling doStream()
     * @default false
     */
    streaming?: boolean;

    /**
     * List of tool names to allow
     */
    availableTools?: string[];

    /**
     * List of tool names to disable
     */
    excludedTools?: string[];
}

/**
 * Re-export types from Copilot SDK for convenience
 */
export type { SystemMessageConfig };
