/**
 * AI SDK Provider for GitHub Copilot
 *
 * This package provides a Vercel AI SDK V3 compatible provider
 * for GitHub Copilot, allowing you to use Copilot models with
 * the standard AI SDK interfaces.
 *
 * @example
 * ```typescript
 * import { createCopilotProvider } from 'ai-sdk-provider-copilot';
 * import { generateText } from 'ai';
 *
 * const copilot = createCopilotProvider();
 * const model = copilot('gpt-4');
 *
 * const result = await generateText({
 *   model,
 *   prompt: 'Hello, world!'
 * });
 * ```
 *
 * @packageDocumentation
 */

// Provider factory
export { createCopilotProvider } from './copilot-provider.js';
export type { CopilotProvider } from './copilot-provider.js';

// Language model
export { CopilotLanguageModel } from './copilot-language-model.js';
export type { CopilotLanguageModelOptions } from './copilot-language-model.js';

// Types
export type {
    CopilotProviderOptions,
    CopilotModelSettings,
    SystemMessageConfig,
    ProviderConfig,
} from './types.js';

// Error utilities
export { mapCopilotError, isRetryableError, createAbortError } from './error.js';

// Message mapping utilities
export { mapPromptToCopilotFormat, extractLatestUserMessage } from './message-mapper.js';

// Event mapping utilities (streaming)
export {
    mapEventToStreamParts,
    createStreamContext,
    mapUsageEvent,
    mapFinishReason,
    getDefaultUsage,
    type StreamContext,
} from './event-mapper.js';
