/**
 * MCP Server Configuration Handler
 *
 * Handles validation and merging of MCP server configurations
 * for the Copilot AI SDK provider.
 */
import type {
    MCPServerConfig,
    MCPLocalServerConfig,
    MCPRemoteServerConfig,
} from './types.js';

export type { MCPServerConfig, MCPLocalServerConfig, MCPRemoteServerConfig };

/**
 * Validation result for MCP configuration
 */
export interface McpValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validates MCP server configuration.
 *
 * @param name - Server name for error messages
 * @param config - The MCP server configuration to validate
 * @returns Validation result with error message if invalid
 */
export function validateMcpConfig(
    name: string,
    config: MCPServerConfig
): McpValidationResult {
    if (!config.tools || !Array.isArray(config.tools)) {
        return { valid: false, error: `MCP server '${name}' must specify 'tools' array` };
    }

    const type = config.type ?? 'local';

    if (type === 'local' || type === 'stdio') {
        const localConfig = config as MCPLocalServerConfig;
        if (!localConfig.command) {
            return { valid: false, error: `Local MCP server '${name}' must specify 'command'` };
        }
        if (!Array.isArray(localConfig.args)) {
            return { valid: false, error: `Local MCP server '${name}' must specify 'args' array` };
        }
    } else if (type === 'http' || type === 'sse') {
        const remoteConfig = config as MCPRemoteServerConfig;
        if (!remoteConfig.url) {
            return { valid: false, error: `Remote MCP server '${name}' must specify 'url'` };
        }
    } else {
        return { valid: false, error: `MCP server '${name}' has invalid type '${type}'` };
    }

    return { valid: true };
}

/**
 * Merges MCP server configurations.
 * Call-level config overrides provider-level config by server name.
 *
 * @param providerConfig - Provider-level MCP server configurations
 * @param callConfig - Call-level MCP server configurations (takes precedence)
 * @returns Merged configuration or undefined if both are empty
 */
export function mergeMcpConfigs(
    providerConfig?: Record<string, MCPServerConfig>,
    callConfig?: Record<string, MCPServerConfig>
): Record<string, MCPServerConfig> | undefined {
    if (!providerConfig && !callConfig) {
        return undefined;
    }

    return {
        ...providerConfig,
        ...callConfig,
    };
}
