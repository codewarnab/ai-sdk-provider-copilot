/**
 * Reasoning Mapper for Copilot SDK to AI SDK V3
 *
 * Maps Copilot SDK reasoning events to AI SDK V3 reasoning stream parts.
 * Reasoning is auto-detected from events - no SDK configuration needed.
 */
import { randomUUID } from 'node:crypto';
import type {
    LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import type { SessionEvent } from '@github/copilot-sdk';

/**
 * AI SDK V3 Reasoning content type
 */
export interface LanguageModelV3Reasoning {
    type: 'reasoning';
    text: string;
    providerMetadata?: {
        copilot?: {
            reasoningId?: string;
        };
    };
}

/**
 * Reasoning tracking context for streaming
 */
export interface ReasoningContext {
    /** Current reasoning block ID */
    reasoningBlockId?: string;
    /** Whether reasoning-start has been emitted */
    reasoningStarted: boolean;
    /** Accumulated reasoning content for doGenerate */
    accumulatedReasoning: string;
}

/**
 * Creates initial reasoning context
 */
export function createReasoningContext(): ReasoningContext {
    return {
        reasoningStarted: false,
        accumulatedReasoning: '',
    };
}

/**
 * Maps Copilot reasoning events to AI SDK V3 stream parts.
 *
 * @param event - The Copilot SDK session event
 * @param context - Mutable reasoning context for tracking state
 * @returns Array of stream parts to enqueue (may be empty)
 */
export function mapReasoningEventToStreamParts(
    event: SessionEvent,
    context: ReasoningContext
): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];

    switch (event.type) {
        case 'assistant.reasoning_delta': {
            const reasoningId = event.data.reasoningId as string | undefined;
            const deltaContent = event.data.deltaContent as string | undefined;

            // Emit reasoning-start on first delta
            if (!context.reasoningStarted) {
                context.reasoningBlockId = reasoningId || randomUUID();
                context.reasoningStarted = true;
                parts.push({
                    type: 'reasoning-start',
                    id: context.reasoningBlockId,
                });
            }

            // Emit reasoning-delta
            if (deltaContent) {
                context.accumulatedReasoning += deltaContent;
                parts.push({
                    type: 'reasoning-delta',
                    id: context.reasoningBlockId!,
                    delta: deltaContent,
                });
            }
            break;
        }

        case 'assistant.reasoning': {
            const reasoningId = event.data.reasoningId as string | undefined;
            const content = event.data.content as string;

            // If streaming was enabled, close the block
            if (context.reasoningStarted && context.reasoningBlockId) {
                parts.push({
                    type: 'reasoning-end',
                    id: context.reasoningBlockId,
                });
            }
            // Store the full content (may come without streaming)
            context.accumulatedReasoning = content;
            context.reasoningBlockId = reasoningId;
            break;
        }
    }

    return parts;
}

/**
 * Creates reasoning content for doGenerate response.
 *
 * @param context - Reasoning context with accumulated content
 * @returns LanguageModelV3Reasoning content if reasoning was provided
 */
export function createReasoningContent(
    context: ReasoningContext
): LanguageModelV3Reasoning | null {
    if (!context.accumulatedReasoning) {
        return null;
    }

    return {
        type: 'reasoning',
        text: context.accumulatedReasoning,
        providerMetadata: {
            copilot: {
                reasoningId: context.reasoningBlockId,
            },
        },
    };
}
