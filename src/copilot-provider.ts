/**
 * Copilot provider factory for the Vercel AI SDK.
 * 
 * Creates a provider that implements the AI SDK ProviderV3 interface,
 * enabling use of GitHub Copilot models with standard AI SDK functions.
 * 
 * @module copilot-provider
 */

import type {
    ProviderV3,
    LanguageModelV3,
    EmbeddingModelV3,
    ImageModelV3,
} from '@ai-sdk/provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import { CopilotLanguageModel } from './copilot-language-model.js';
import { isAgentModelId, resolveAgent, validateAgentConfigs } from './agent-resolver.js';
import { validateMcpConfig } from './mcp-config.js';
import { createClientManager } from './client-manager.js';
import { getLogger } from './telemetry.js';
import type { CopilotProviderOptions, CopilotModelSettings } from './types.js';

/**
 * Copilot provider interface extending AI SDK ProviderV3.
 * 
 * Includes the standard provider methods plus lifecycle management.
 */
export interface CopilotProvider extends ProviderV3 {
    /**
     * Creates a language model with the given ID.
     */
    (modelId: string, settings?: CopilotModelSettings): LanguageModelV3;

    /**
     * Creates a language model with the given ID.
     */
    languageModel(
        modelId: string,
        settings?: CopilotModelSettings
    ): LanguageModelV3;

    /**
     * Alias for languageModel (for chat models).
     */
    chat(modelId: string, settings?: CopilotModelSettings): LanguageModelV3;

    /**
     * Not supported - throws NoSuchModelError.
     */
    embeddingModel(modelId: string): EmbeddingModelV3;

    /**
     * Not supported - throws NoSuchModelError.
     */
    imageModel(modelId: string): ImageModelV3;

    /**
     * Disposes all resources held by the provider.
     * Call this when you're done using the provider to clean up CLI resources.
     */
    dispose(): Promise<void>;
}

/**
 * Creates a new Copilot provider instance.
 * 
 * The provider manages a shared CopilotClient for all model instances,
 * supports BYOK (Bring Your Own Key) configurations, MCP servers,
 * custom agents, and production-ready features like retry and logging.
 * 
 * @param options - Configuration options for the provider
 * @returns A configured provider function
 * 
 * @example
 * ```typescript
 * import { createCopilotProvider } from 'ai-sdk-provider-copilot';
 * import { generateText } from 'ai';
 * 
 * // Basic usage with default Copilot CLI
 * const copilot = createCopilotProvider();
 * 
 * const result = await generateText({
 *   model: copilot('gpt-4'),
 *   prompt: 'Hello, world!'
 * });
 * 
 * // With retry and logging
 * const copilotWithRetry = createCopilotProvider({
 *   retry: { maxRetries: 5 },
 *   verbose: true,
 * });
 * 
 * // With BYOK provider
 * const byokCopilot = createCopilotProvider({
 *   provider: {
 *     type: 'openai',
 *     baseUrl: 'https://api.openai.com/v1',
 *     apiKey: process.env.OPENAI_API_KEY
 *   }
 * });
 * 
 * // Don't forget to dispose when done
 * await copilot.dispose();
 * ```
 */
export function createCopilotProvider(
    options: CopilotProviderOptions = {}
): CopilotProvider {
    // Initialize logger
    const logger = getLogger(options.logger, options.verbose);
    logger.info('Creating Copilot provider');

    // Validate mutual exclusivity
    if (options.cliPath && options.cliUrl) {
        throw new Error('cliPath and cliUrl are mutually exclusive. Specify only one.');
    }

    // Validate MCP configurations at provider creation
    if (options.mcpServers) {
        for (const [name, config] of Object.entries(options.mcpServers)) {
            const validation = validateMcpConfig(name, config);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
        }
    }

    // Validate custom agent configurations
    if (options.customAgents) {
        validateAgentConfigs(options.customAgents);
    }

    // Create shared client manager
    const clientManager = createClientManager(options);

    // Create the language model factory function
    const createLanguageModel = (
        modelId: string,
        settings?: CopilotModelSettings
    ) => {
        // Validate agent reference if applicable
        if (isAgentModelId(modelId)) {
            // This will throw if agent not found
            resolveAgent(modelId, options.customAgents);
        }

        return new CopilotLanguageModel({
            modelId,
            providerOptions: options,
            settings,
            clientManager,
            logger,
        });
    };

    // Dispose function for cleanup
    const dispose = async () => {
        logger.info('Disposing provider');
        await clientManager.dispose();
    };

    // Create the provider function
    const provider = Object.assign(
        function (modelId: string, settings?: CopilotModelSettings) {
            if (new.target) {
                throw new Error(
                    'The provider function cannot be called with the new keyword.'
                );
            }

            return createLanguageModel(modelId, settings);
        },
        {
            specificationVersion: 'v3' as const,
            languageModel: createLanguageModel,
            chat: createLanguageModel,
            embeddingModel: (modelId: string): never => {
                throw new NoSuchModelError({
                    modelId,
                    modelType: 'embeddingModel',
                    message: `Copilot provider does not support embedding models.`,
                });
            },
            imageModel: (modelId: string): never => {
                throw new NoSuchModelError({
                    modelId,
                    modelType: 'imageModel',
                    message: `Copilot provider does not support image models.`,
                });
            },
            dispose,
        }
    ) as CopilotProvider;

    return provider;
}
