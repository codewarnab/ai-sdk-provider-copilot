/**
 * Tool Mapper for AI SDK V3 to Copilot SDK
 *
 * Maps AI SDK V3 function tools to Copilot SDK format.
 * Implements the "return-to-caller" model where tool calls are returned
 * to the AI SDK caller for execution, rather than being executed internally.
 */
import type {
    LanguageModelV3FunctionTool,
    LanguageModelV3ToolChoice,
} from '@ai-sdk/provider';

/**
 * JSON Schema type (subset we care about for cleaning)
 */
interface JsonSchemaObject {
    $schema?: string;
    $ref?: string;
    $defs?: unknown;
    definitions?: unknown;
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
    additionalProperties?: unknown;
    allOf?: unknown[];
    anyOf?: unknown[];
    oneOf?: unknown[];
    required?: string[];
    [key: string]: unknown;
}

/**
 * Copilot SDK tool format (schema-only, no handler for return-to-caller model)
 */
export interface CopilotToolSchema {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
}

/**
 * Result of tool choice mapping
 */
export interface ToolChoiceResult {
    /** Whether the tool choice is supported by Copilot SDK */
    supported: boolean;
    /** Warning message if not supported */
    warning?: string;
}

/**
 * Maps AI SDK V3 function tools to Copilot SDK tool format.
 *
 * Key difference: AI SDK tools don't have handlers (caller executes),
 * but Copilot SDK expects handlers. We create tools WITHOUT handlers
 * to signal "return to caller" pattern - the toolRequests in assistant.message
 * events will be captured and returned to the AI SDK caller.
 *
 * @param tools - AI SDK V3 function tools
 * @returns Copilot SDK tool schemas (without handlers for return-to-caller model)
 */
export function mapToolsToCopilotFormat(
    tools: LanguageModelV3FunctionTool[]
): CopilotToolSchema[] {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: cleanJsonSchema(tool.inputSchema as JsonSchemaObject),
    }));
}


/**
 * Cleans JSON schema for Copilot SDK compatibility.
 * Removes $schema, $ref, $defs and other metadata that may cause issues.
 *
 * @param schema - JSON schema object to clean
 * @returns Cleaned schema object
 */
export function cleanJsonSchema(schema: JsonSchemaObject): Record<string, unknown> {
    if (typeof schema !== 'object' || schema === null) {
        return schema as Record<string, unknown>;
    }

    const cleaned = { ...schema };

    // Remove metadata properties that Copilot SDK may not handle
    delete cleaned.$schema;
    delete cleaned.$ref;
    delete cleaned.$defs;
    delete cleaned.definitions;

    // Recursively clean nested schemas in properties
    if (cleaned.properties && typeof cleaned.properties === 'object') {
        const cleanedProps: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(cleaned.properties)) {
            cleanedProps[key] = cleanJsonSchema(value as JsonSchemaObject);
        }
        cleaned.properties = cleanedProps;
    }

    // Clean items schema (for arrays)
    if (cleaned.items) {
        cleaned.items = cleanJsonSchema(cleaned.items as JsonSchemaObject);
    }

    // Clean additionalProperties if it's a schema object
    if (cleaned.additionalProperties && typeof cleaned.additionalProperties === 'object') {
        cleaned.additionalProperties = cleanJsonSchema(
            cleaned.additionalProperties as JsonSchemaObject
        );
    }

    // Clean composition schemas (allOf, anyOf, oneOf)
    for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
        const arrayProp = cleaned[key];
        if (Array.isArray(arrayProp)) {
            cleaned[key] = arrayProp.map((item) =>
                cleanJsonSchema(item as JsonSchemaObject)
            );
        }
    }

    // Ensure type is set for objects with properties
    if (cleaned.properties && cleaned.type === undefined) {
        cleaned.type = 'object';
    }

    return cleaned;
}

/**
 * Maps AI SDK tool choice to Copilot SDK format.
 *
 * Note: Copilot SDK does NOT support tool choice configuration.
 * SessionConfig only has: tools, availableTools, excludedTools.
 * Returns warning for any non-auto tool choice.
 *
 * @param toolChoice - AI SDK V3 tool choice
 * @returns Result indicating support status and optional warning
 */
export function mapToolChoiceToCopilotFormat(
    toolChoice: LanguageModelV3ToolChoice
): ToolChoiceResult {
    switch (toolChoice.type) {
        case 'auto':
            // Auto is the default behavior - supported
            return { supported: true };

        case 'none':
            return {
                supported: false,
                warning: `Tool choice 'none' is not supported by Copilot provider. Tools will still be available to the model.`,
            };

        case 'required':
            return {
                supported: false,
                warning: `Tool choice 'required' is not supported by Copilot provider. Model may or may not use tools.`,
            };

        case 'tool':
            return {
                supported: false,
                warning: `Tool choice 'tool' (forcing specific tool '${toolChoice.toolName}') is not supported by Copilot provider. Model will choose tools automatically.`,
            };

        default:
            return {
                supported: false,
                warning: 'Unknown tool choice type.',
            };
    }
}

/**
 * Checks if an object is a function tool (not a provider tool).
 *
 * @param tool - Tool object to check
 * @returns True if the tool is a function tool
 */
export function isFunctionTool(tool: unknown): tool is LanguageModelV3FunctionTool {
    return (
        typeof tool === 'object' &&
        tool !== null &&
        'type' in tool &&
        (tool as { type: string }).type === 'function'
    );
}

/**
 * Extracts function tools from a mixed array of tools.
 *
 * @param tools - Array of tools (may include provider tools)
 * @returns Array of function tools only
 */
export function extractFunctionTools(
    tools: unknown[]
): LanguageModelV3FunctionTool[] {
    return tools.filter(isFunctionTool);
}
