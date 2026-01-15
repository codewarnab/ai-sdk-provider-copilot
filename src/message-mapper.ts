import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

/**
 * Maps AI SDK V3 prompt to Copilot CLI format.
 *
 * Copilot SDK uses a simple string prompt for session.send(),
 * so we need to concatenate the messages into a formatted string.
 * System messages are handled separately via SessionConfig.
 *
 * @param messages - AI SDK V3 prompt array
 * @returns Formatted prompt string for Copilot SDK
 */
export function mapPromptToCopilotFormat(messages: LanguageModelV3Prompt): string {
    const parts: string[] = [];

    for (const message of messages) {
        switch (message.role) {
            case 'system':
                // System messages are typically handled via SessionConfig.systemMessage
                // But for multi-turn conversations, we include them in context
                parts.push(`[System]: ${message.content}`);
                break;

            case 'user':
                parts.push(formatUserMessage(message));
                break;

            case 'assistant':
                parts.push(formatAssistantMessage(message));
                break;

            case 'tool':
                // Tool results - format as context
                for (const part of message.content) {
                    if (part.type === 'tool-result') {
                        const output = formatToolOutput(part.output);
                        parts.push(`[Tool Result: ${part.toolName}]: ${output}`);
                    }
                }
                break;
        }
    }

    return parts.join('\n\n');
}

/**
 * Formats a user message with its content parts.
 */
function formatUserMessage(
    message: Extract<LanguageModelV3Prompt[number], { role: 'user' }>
): string {
    const textParts: string[] = [];

    for (const part of message.content) {
        switch (part.type) {
            case 'text':
                textParts.push(part.text);
                break;
            case 'file':
                // Phase 1: Warn about unsupported file parts
                textParts.push(`[File attachment not yet supported]`);
                break;
        }
    }

    return textParts.join('\n');
}

/**
 * Formats an assistant message with its content parts.
 */
function formatAssistantMessage(
    message: Extract<LanguageModelV3Prompt[number], { role: 'assistant' }>
): string {
    const textParts: string[] = [];

    for (const part of message.content) {
        switch (part.type) {
            case 'text':
                textParts.push(part.text);
                break;
            case 'tool-call':
                textParts.push(`[Called tool: ${part.toolName}]`);
                break;
        }
    }

    return textParts.join('\n');
}

/**
 * Formats tool output for inclusion in the prompt.
 */
function formatToolOutput(output: unknown): string {
    if (typeof output === 'object' && output !== null) {
        const typed = output as {
            type?: string;
            value?: unknown;
            reason?: string;
        };

        switch (typed.type) {
            case 'text':
            case 'error-text':
                return String(typed.value ?? '');
            case 'json':
            case 'error-json':
                return JSON.stringify(typed.value);
            case 'execution-denied':
                return `[Execution denied: ${typed.reason ?? 'unknown reason'}]`;
            default:
                return JSON.stringify(output);
        }
    }
    return String(output);
}

/**
 * Extracts the user's latest message from the prompt.
 * Used when we only need the most recent user input.
 */
export function extractLatestUserMessage(messages: LanguageModelV3Prompt): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.role === 'user') {
            return formatUserMessage(message);
        }
    }
    return null;
}
