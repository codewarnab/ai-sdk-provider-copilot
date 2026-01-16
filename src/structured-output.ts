/**
 * Structured Output Handler for Copilot AI SDK Provider
 *
 * Handles JSON schema structured output via system prompt injection.
 * This is the ONLY viable approach since Copilot SDK does NOT support
 * native JSON schema enforcement.
 */
import type { JSONSchema7 } from 'json-schema';

/**
 * Warning type compatible with AI SDK SharedV3Warning
 */
export interface StructuredOutputWarning {
    type: 'other';
    message: string;
}

export interface StructuredOutputConfig {
    /** Whether schema was requested */
    hasSchema: boolean;
    /** The JSON schema (if provided) */
    schema?: JSONSchema7;
    /** Schema name (for LLM guidance) */
    name?: string;
    /** Schema description (for LLM guidance) */
    description?: string;
}

export interface StructuredOutputResult {
    /** Additional system message content to append */
    systemMessageAppend?: string;
    /** Warnings to emit */
    warnings: StructuredOutputWarning[];
}

/**
 * Processes structured output configuration for Copilot sessions.
 *
 * Since Copilot SDK does NOT support native JSON schema enforcement,
 * we inject instructions into the system message using append mode.
 * This is the ONLY viable approach for structured output.
 */
export function processStructuredOutput(
    config: StructuredOutputConfig
): StructuredOutputResult {
    const warnings: StructuredOutputWarning[] = [];

    if (!config.hasSchema || !config.schema) {
        return { warnings };
    }

    // Inform caller that we're using prompt injection (not native enforcement)
    warnings.push({
        type: 'other',
        message: 'JSON schema enforcement via system prompt injection. Results may not strictly conform to schema.',
    });

    // Build the schema instruction
    const schemaName = config.name || 'response';
    const schemaDescription = config.description || '';

    let instruction = '\n\n--- JSON Output Requirements ---\n';
    instruction += `You MUST respond with valid JSON that conforms to the following schema.\n`;

    if (schemaDescription) {
        instruction += `Description: ${schemaDescription}\n`;
    }

    instruction += `\nJSON Schema for "${schemaName}":\n`;
    instruction += '```json\n';
    instruction += JSON.stringify(config.schema, null, 2);
    instruction += '\n```\n';
    instruction += '\nRespond ONLY with the JSON object. Do not include any explanation, markdown formatting, or code blocks around the JSON.\n';
    instruction += '--- End JSON Requirements ---\n';

    return {
        systemMessageAppend: instruction,
        warnings,
    };
}

/**
 * Parses JSON response from model output.
 * Handles common cases where models wrap JSON in markdown code blocks.
 *
 * @param response - The model response text
 * @returns The parsed JSON or throws an error
 */
export function parseJsonResponse(response: string): unknown {
    // Attempt to extract JSON from response
    // Models sometimes wrap JSON in markdown code blocks
    let jsonText = response.trim();

    // Try to extract from markdown code block
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
    }

    // Parse JSON
    try {
        return JSON.parse(jsonText);
    } catch (error) {
        throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
}
