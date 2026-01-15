import type {
    ProviderV3,
    LanguageModelV3,
    EmbeddingModelV3,
    ImageModelV3,
} from '@ai-sdk/provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import { CopilotLanguageModel } from './copilot-language-model.js';
import type { CopilotProviderOptions, CopilotModelSettings } from './types.js';

/**
 * Copilot provider interface extending AI SDK ProviderV3
 */
export interface CopilotProvider extends ProviderV3 {
    (modelId: string, settings?: CopilotModelSettings): LanguageModelV3;
    languageModel(
        modelId: string,
        settings?: CopilotModelSettings
    ): LanguageModelV3;
    chat(modelId: string, settings?: CopilotModelSettings): LanguageModelV3;
    embeddingModel(modelId: string): EmbeddingModelV3;
    imageModel(modelId: string): ImageModelV3;
}

/**
 * Creates a new Copilot provider instance.
 *
 * @param options - Configuration options for the provider
 * @returns A configured provider function
 *
 * @example
 * ```typescript
 * import { createCopilotProvider } from 'ai-sdk-provider-copilot';
 *
 * // Basic usage with default Copilot CLI
 * const copilot = createCopilotProvider();
 *
 * // Use with Vercel AI SDK
 * const model = copilot('gpt-4');
 * const result = await generateText({
 *   model,
 *   prompt: 'Hello, world!'
 * });
 *
 * // With custom CLI path
 * const customCopilot = createCopilotProvider({
 *   cliPath: '/usr/local/bin/copilot'
 * });
 *
 * // With BYOK (Bring Your Own Key) provider
 * const byokCopilot = createCopilotProvider({
 *   provider: {
 *     type: 'openai',
 *     baseUrl: 'https://api.openai.com/v1',
 *     apiKey: process.env.OPENAI_API_KEY
 *   }
 * });
 * ```
 */
export function createCopilotProvider(
    options: CopilotProviderOptions = {}
): CopilotProvider {
    // Create the language model factory function
    const createLanguageModel = (
        modelId: string,
        settings?: CopilotModelSettings
    ) => {
        return new CopilotLanguageModel({
            modelId,
            providerOptions: options,
            settings,
        });
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
        }
    ) as CopilotProvider;

    return provider;
}
