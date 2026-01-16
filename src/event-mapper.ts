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
    LanguageModelV3ToolCall,
} from '@ai-sdk/provider';
import type { SessionEvent } from '@github/copilot-sdk';

/**
 * Tool request from Copilot SDK assistant.message event
 */
export interface ToolRequest {
    toolCallId: string;
    name: string;
    arguments?: unknown;
}

/**
 * Session usage info from session.usage_info event.
 */
export interface SessionUsageInfo {
    tokenLimit: number;
    currentTokens: number;
    messagesLength: number;
}

/**
 * Compaction result from session.compaction_complete event.
 */
export interface CompactionResult {
    success: boolean;
    error?: string;
    preCompactionTokens?: number;
    postCompactionTokens?: number;
    preCompactionMessagesLength?: number;
    messagesRemoved?: number;
    tokensRemoved?: number;
    summaryContent?: string;
    compactionTokensUsed?: {
        input: number;
        output: number;
        cachedInput: number;
    };
}

/**
 * Subagent state tracking.
 */
export interface SubagentInfo {
    toolCallId: string;
    agentName: string;
    agentDisplayName?: string;
    agentDescription?: string;
    status: 'started' | 'completed' | 'failed' | 'selected';
    error?: string;
    tools?: string[] | null;
}

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

    /** Tool calls collected from assistant.message events */
    toolCalls: LanguageModelV3ToolCall[];

    /** Whether any tool calls were made (affects finish reason) */
    hasToolCalls: boolean;

    /** Session usage info from session.usage_info event */
    sessionUsageInfo?: SessionUsageInfo;

    /** Whether context compaction is in progress */
    compactionInProgress: boolean;

    /** Result of the last compaction operation */
    compactionResult?: CompactionResult;

    /** Active subagents tracked during the stream */
    subagents: Map<string, SubagentInfo>;
}

/**
 * Creates initial stream context.
 */
export function createStreamContext(warnings: SharedV3Warning[] = []): StreamContext {
    return {
        textStarted: false,
        reasoningStarted: false,
        warnings,
        toolCalls: [],
        hasToolCalls: false,
        compactionInProgress: false,
        subagents: new Map(),
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

            // Handle tool requests from assistant.message (return-to-caller model)
            // The toolRequests field contains tool calls BEFORE execution
            const toolRequests = event.data.toolRequests as ToolRequest[] | undefined;
            if (toolRequests && toolRequests.length > 0) {
                for (const req of toolRequests) {
                    const toolCall: LanguageModelV3ToolCall = {
                        type: 'tool-call',
                        toolCallId: req.toolCallId,
                        toolName: req.name,
                        input: JSON.stringify(req.arguments ?? {}),
                        providerExecuted: false, // Caller will execute (return-to-caller model)
                    };
                    parts.push(toolCall);
                    context.toolCalls.push(toolCall);
                    context.hasToolCalls = true;
                }
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

        case 'session.usage_info': {
            // Track session token limits and usage for observability
            context.sessionUsageInfo = {
                tokenLimit: event.data.tokenLimit as number,
                currentTokens: event.data.currentTokens as number,
                messagesLength: event.data.messagesLength as number,
            };
            break;
        }

        case 'session.compaction_start': {
            // Track when context compaction begins
            context.compactionInProgress = true;
            break;
        }

        case 'session.compaction_complete': {
            // Track compaction results
            context.compactionInProgress = false;
            context.compactionResult = {
                success: event.data.success as boolean,
                error: event.data.error as string | undefined,
                preCompactionTokens: event.data.preCompactionTokens as number | undefined,
                postCompactionTokens: event.data.postCompactionTokens as number | undefined,
                preCompactionMessagesLength: event.data.preCompactionMessagesLength as number | undefined,
                messagesRemoved: event.data.messagesRemoved as number | undefined,
                tokensRemoved: event.data.tokensRemoved as number | undefined,
                summaryContent: event.data.summaryContent as string | undefined,
                compactionTokensUsed: event.data.compactionTokensUsed as {
                    input: number;
                    output: number;
                    cachedInput: number;
                } | undefined,
            };
            break;
        }

        case 'subagent.started': {
            const toolCallId = event.data.toolCallId as string;
            context.subagents.set(toolCallId, {
                toolCallId,
                agentName: event.data.agentName as string,
                agentDisplayName: event.data.agentDisplayName as string,
                agentDescription: event.data.agentDescription as string,
                status: 'started',
            });
            break;
        }

        case 'subagent.completed': {
            const toolCallId = event.data.toolCallId as string;
            const existing = context.subagents.get(toolCallId);
            if (existing) {
                existing.status = 'completed';
            } else {
                context.subagents.set(toolCallId, {
                    toolCallId,
                    agentName: event.data.agentName as string,
                    status: 'completed',
                });
            }
            break;
        }

        case 'subagent.failed': {
            const toolCallId = event.data.toolCallId as string;
            const existing = context.subagents.get(toolCallId);
            if (existing) {
                existing.status = 'failed';
                existing.error = event.data.error as string;
            } else {
                context.subagents.set(toolCallId, {
                    toolCallId,
                    agentName: event.data.agentName as string,
                    status: 'failed',
                    error: event.data.error as string,
                });
            }
            break;
        }

        case 'subagent.selected': {
            // subagent.selected uses agentName as identifier (no toolCallId)
            const agentName = event.data.agentName as string;
            context.subagents.set(agentName, {
                toolCallId: agentName, // Use agentName as key for selected events
                agentName,
                agentDisplayName: event.data.agentDisplayName as string,
                status: 'selected',
                tools: event.data.tools as string[] | null,
            });
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
 *
 * @param rawReason - Optional raw reason string
 * @param hasToolCalls - Whether tool calls were made during this turn
 */
export function mapFinishReason(rawReason?: string, hasToolCalls = false): LanguageModelV3FinishReason {
    if (hasToolCalls) {
        return {
            unified: 'tool-calls',
            raw: rawReason ?? 'tool_calls',
        };
    }
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
