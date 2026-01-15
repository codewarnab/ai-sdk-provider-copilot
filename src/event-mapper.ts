/**
 * Event Mapper for Copilot SDK to AI SDK V3 Stream Parts
 *
 * Maps Copilot SDK session events to AI SDK V3 LanguageModelV3StreamPart format.
 * Maintains streaming context across events for proper block lifecycle (start/delta/end).
 */
import { randomUUID } from 'node:crypto';
import type {
    LanguageModelV3StreamPart,
    LanguageModelV3Usage,
    LanguageModelV3FinishReason,
    SharedV3Warning,
} from '@ai-sdk/provider';
import type { SessionEvent } from '@github/copilot-sdk';

/**
 * State tracker for streaming context.
 * Maintains IDs and state across multiple events for a single stream.
 */
export interface StreamContext {
    /** Current text block ID (stable across text-start/delta/end) */
    textBlockId?: string;
    /** Whether text-start has been emitted */
    textStarted: boolean;

    /** Current reasoning block ID */
    reasoningBlockId?: string;
    /** Whether reasoning-start has been emitted */
    reasoningStarted: boolean;

    /** Accumulated usage data */
    usage?: LanguageModelV3Usage;

    /** Current turn ID from turn_start */
    turnId?: string;

    /** Warnings accumulated during stream */
    warnings: SharedV3Warning[];
}

/**
 * Creates initial stream context.
 */
export function createStreamContext(warnings: SharedV3Warning[] = []): StreamContext {
    return {
        textStarted: false,
        reasoningStarted: false,
        warnings,
    };
}

/**
 * Maps a Copilot SDK event to zero or more AI SDK V3 stream parts.
 * Returns an array because some events may produce multiple parts.
 *
 * @param event - The Copilot SDK session event
 * @param context - Mutable stream context for tracking state
 * @returns Array of stream parts to enqueue (may be empty)
 */
export function mapEventToStreamParts(
    event: SessionEvent,
    context: StreamContext
): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];

    switch (event.type) {
        case 'assistant.turn_start':
            context.turnId = event.data.turnId as string | undefined;
            break;

        case 'assistant.message_delta': {
            const messageId = event.data.messageId as string | undefined;
            const deltaContent = event.data.deltaContent as string | undefined;

            // Emit text-start on first delta
            if (!context.textStarted) {
                context.textBlockId = messageId || randomUUID();
                context.textStarted = true;
                parts.push({
                    type: 'text-start',
                    id: context.textBlockId,
                });
            }

            // Emit text-delta
            if (deltaContent) {
                parts.push({
                    type: 'text-delta',
                    id: context.textBlockId!,
                    delta: deltaContent,
                });
            }
            break;
        }

        case 'assistant.message': {
            // Emit text-end if text was started
            if (context.textStarted && context.textBlockId) {
                parts.push({
                    type: 'text-end',
                    id: context.textBlockId,
                });
            }
            break;
        }

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
                parts.push({
                    type: 'reasoning-delta',
                    id: context.reasoningBlockId!,
                    delta: deltaContent,
                });
            }
            break;
        }

        case 'assistant.reasoning': {
            // Emit reasoning-end if reasoning was started
            if (context.reasoningStarted && context.reasoningBlockId) {
                parts.push({
                    type: 'reasoning-end',
                    id: context.reasoningBlockId,
                });
            }
            break;
        }

        case 'assistant.usage': {
            // Store usage for finish event
            context.usage = mapUsageEvent(event.data);
            break;
        }
    }

    return parts;
}

/**
 * Maps Copilot usage data to AI SDK V3 usage format.
 */
export function mapUsageEvent(data: Record<string, unknown>): LanguageModelV3Usage {
    return {
        inputTokens: {
            total: (data.inputTokens as number | undefined) ?? 0,
            noCache: undefined,
            cacheRead: data.cacheReadTokens as number | undefined,
            cacheWrite: data.cacheWriteTokens as number | undefined,
        },
        outputTokens: {
            total: (data.outputTokens as number | undefined) ?? 0,
            text: undefined,
            reasoning: undefined,
        },
    };
}

/**
 * Maps Copilot turn end to AI SDK V3 finish reason.
 */
export function mapFinishReason(rawReason?: string): LanguageModelV3FinishReason {
    return {
        unified: 'stop',
        raw: rawReason ?? 'complete',
    };
}

/**
 * Creates default usage if none was received.
 */
export function getDefaultUsage(): LanguageModelV3Usage {
    return {
        inputTokens: {
            total: 0,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
        },
        outputTokens: {
            total: 0,
            text: undefined,
            reasoning: undefined,
        },
    };
}
