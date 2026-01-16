/**
 * Agent Resolver for Copilot AI SDK Provider
 *
 * Handles custom agent resolution from model IDs.
 * Agents are accessed via model ID pattern: 'agent/{name}'
 */
import type { CustomAgentConfig } from './types.js';

export type { CustomAgentConfig };

const AGENT_PREFIX = 'agent/';

/**
 * Checks if a model ID refers to a custom agent.
 *
 * @param modelId - The model ID to check
 * @returns True if the model ID is an agent reference
 */
export function isAgentModelId(modelId: string): boolean {
    return modelId.startsWith(AGENT_PREFIX);
}

/**
 * Extracts agent name from model ID.
 *
 * @param modelId - The model ID (must be an agent reference)
 * @returns The agent name
 * @throws Error if modelId is not an agent reference
 */
export function extractAgentName(modelId: string): string {
    if (!isAgentModelId(modelId)) {
        throw new Error(`Model ID '${modelId}' is not an agent reference`);
    }
    return modelId.slice(AGENT_PREFIX.length);
}

/**
 * Resolves a custom agent from the registry.
 *
 * @param modelId - The model ID (may or may not be an agent reference)
 * @param agents - Array of registered custom agents
 * @returns The resolved agent or null if not an agent model ID
 * @throws Error if agent reference but agent not found
 */
export function resolveAgent(
    modelId: string,
    agents: CustomAgentConfig[] | undefined
): CustomAgentConfig | null {
    if (!isAgentModelId(modelId)) {
        return null;
    }

    const agentName = extractAgentName(modelId);
    const agent = agents?.find(a => a.name === agentName);

    if (!agent) {
        const availableAgents = agents?.map(a => a.name).join(', ') || 'none';
        throw new Error(`Custom agent '${agentName}' not found. Available agents: ${availableAgents}`);
    }

    return agent;
}

/**
 * Gets the actual model ID to use for an agent.
 * If the agent doesn't specify a model, returns undefined (use session default).
 *
 * @param _agent - The custom agent configuration
 * @returns The model ID or undefined to use session default
 */
export function getAgentModelId(_agent: CustomAgentConfig): string | undefined {
    // CustomAgentConfig doesn't specify model - use session default
    // The agent's prompt becomes the system message
    return undefined;
}

/**
 * Builds system message from agent configuration.
 *
 * @param agent - The custom agent configuration
 * @returns System message config in replace mode with agent prompt
 */
export function buildAgentSystemMessage(agent: CustomAgentConfig): {
    mode: 'replace';
    content: string;
} {
    // Agent prompt becomes the complete system message
    return {
        mode: 'replace',
        content: agent.prompt,
    };
}

/**
 * Validates custom agent configurations.
 *
 * @param agents - Array of custom agent configurations to validate
 * @throws Error if any agent configuration is invalid
 */
export function validateAgentConfigs(agents: CustomAgentConfig[]): void {
    const agentNames = new Set<string>();

    for (const agent of agents) {
        if (!agent.name) {
            throw new Error('Custom agent must have a name');
        }
        if (!agent.prompt) {
            throw new Error(`Custom agent '${agent.name}' must have a prompt`);
        }
        if (agentNames.has(agent.name)) {
            throw new Error(`Duplicate custom agent name: '${agent.name}'`);
        }
        agentNames.add(agent.name);
    }
}
