import { describe, it, expect } from 'vitest';
import type { LanguageModelV3FunctionTool, LanguageModelV3ToolChoice } from '@ai-sdk/provider';
import {
    mapToolsToCopilotFormat,
    mapToolChoiceToCopilotFormat,
    cleanJsonSchema,
    isFunctionTool,
    extractFunctionTools,
} from '../tool-mapper.js';

describe('tool-mapper', () => {
    describe('mapToolsToCopilotFormat', () => {
        it('should map a simple tool correctly', () => {
            const tools: LanguageModelV3FunctionTool[] = [
                {
                    type: 'function',
                    name: 'getWeather',
                    description: 'Get the current weather',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            location: { type: 'string', description: 'City name' },
                        },
                        required: ['location'],
                    },
                },
            ];

            const result = mapToolsToCopilotFormat(tools);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                name: 'getWeather',
                description: 'Get the current weather',
                parameters: {
                    type: 'object',
                    properties: {
                        location: { type: 'string', description: 'City name' },
                    },
                    required: ['location'],
                },
            });
        });

        it('should map tool with complex nested schema', () => {
            const tools: LanguageModelV3FunctionTool[] = [
                {
                    type: 'function',
                    name: 'createUser',
                    description: 'Create a new user',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            address: {
                                type: 'object',
                                properties: {
                                    street: { type: 'string' },
                                    city: { type: 'string' },
                                },
                            },
                            tags: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                        },
                    },
                },
            ];

            const result = mapToolsToCopilotFormat(tools);

            expect(result[0].parameters).toEqual({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    address: {
                        type: 'object',
                        properties: {
                            street: { type: 'string' },
                            city: { type: 'string' },
                        },
                    },
                    tags: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
            });
        });


        it('should remove $schema and $ref from schema', () => {
            const tools: LanguageModelV3FunctionTool[] = [
                {
                    type: 'function',
                    name: 'test',
                    inputSchema: {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        $ref: '#/definitions/Test',
                        $defs: { Test: { type: 'string' } },
                        type: 'object',
                        properties: {
                            nested: {
                                $schema: 'http://json-schema.org/draft-07/schema#',
                                type: 'string',
                            },
                        },
                    },
                },
            ];

            const result = mapToolsToCopilotFormat(tools);

            expect(result[0].parameters).not.toHaveProperty('$schema');
            expect(result[0].parameters).not.toHaveProperty('$ref');
            expect(result[0].parameters).not.toHaveProperty('$defs');
            expect((result[0].parameters.properties as Record<string, unknown>).nested).not.toHaveProperty('$schema');
        });

        it('should handle tool without description', () => {
            const tools: LanguageModelV3FunctionTool[] = [
                {
                    type: 'function',
                    name: 'noDescription',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                    },
                },
            ];

            const result = mapToolsToCopilotFormat(tools);

            expect(result[0].name).toBe('noDescription');
            expect(result[0].description).toBeUndefined();
        });

        it('should map multiple tools', () => {
            const tools: LanguageModelV3FunctionTool[] = [
                {
                    type: 'function',
                    name: 'tool1',
                    description: 'First tool',
                    inputSchema: { type: 'object' },
                },
                {
                    type: 'function',
                    name: 'tool2',
                    description: 'Second tool',
                    inputSchema: { type: 'object' },
                },
            ];

            const result = mapToolsToCopilotFormat(tools);

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('tool1');
            expect(result[1].name).toBe('tool2');
        });
    });

    describe('cleanJsonSchema', () => {
        it('should remove $schema property', () => {
            const schema = {
                $schema: 'http://json-schema.org/draft-07/schema#',
                type: 'object',
            };

            const result = cleanJsonSchema(schema);

            expect(result).not.toHaveProperty('$schema');
            expect(result.type).toBe('object');
        });

        it('should remove $ref and $defs', () => {
            const schema = {
                $ref: '#/definitions/Test',
                $defs: { Test: { type: 'string' } },
                definitions: { Test: { type: 'string' } },
            };

            const result = cleanJsonSchema(schema);

            expect(result).not.toHaveProperty('$ref');
            expect(result).not.toHaveProperty('$defs');
            expect(result).not.toHaveProperty('definitions');
        });

        it('should recursively clean nested properties', () => {
            const schema = {
                type: 'object',
                properties: {
                    nested: {
                        $schema: 'should-be-removed',
                        type: 'string',
                    },
                },
            };

            const result = cleanJsonSchema(schema);
            const nested = (result.properties as Record<string, unknown>).nested as Record<string, unknown>;

            expect(nested).not.toHaveProperty('$schema');
            expect(nested.type).toBe('string');
        });

        it('should clean items schema for arrays', () => {
            const schema = {
                type: 'array',
                items: {
                    $schema: 'should-be-removed',
                    type: 'string',
                },
            };

            const result = cleanJsonSchema(schema);
            const items = result.items as Record<string, unknown>;

            expect(items).not.toHaveProperty('$schema');
            expect(items.type).toBe('string');
        });

        it('should clean additionalProperties schema', () => {
            const schema = {
                type: 'object',
                additionalProperties: {
                    $schema: 'should-be-removed',
                    type: 'number',
                },
            };

            const result = cleanJsonSchema(schema);
            const additionalProps = result.additionalProperties as Record<string, unknown>;

            expect(additionalProps).not.toHaveProperty('$schema');
            expect(additionalProps.type).toBe('number');
        });

        it('should clean allOf, anyOf, oneOf arrays', () => {
            const schema = {
                anyOf: [
                    { $schema: 'remove', type: 'string' },
                    { $schema: 'remove', type: 'number' },
                ],
            };

            const result = cleanJsonSchema(schema);
            const anyOf = result.anyOf as Array<Record<string, unknown>>;

            expect(anyOf[0]).not.toHaveProperty('$schema');
            expect(anyOf[1]).not.toHaveProperty('$schema');
        });

        it('should add type: object when properties exist but type is missing', () => {
            const schema = {
                properties: {
                    name: { type: 'string' },
                },
            };

            const result = cleanJsonSchema(schema);

            expect(result.type).toBe('object');
        });

        it('should handle non-object input gracefully', () => {
            expect(cleanJsonSchema(null as unknown as Record<string, unknown>)).toBeNull();
            expect(cleanJsonSchema('string' as unknown as Record<string, unknown>)).toBe('string');
        });
    });

    describe('mapToolChoiceToCopilotFormat', () => {
        it('should return supported=true for auto', () => {
            const result = mapToolChoiceToCopilotFormat({ type: 'auto' });

            expect(result.supported).toBe(true);
            expect(result.warning).toBeUndefined();
        });

        it('should return warning for none', () => {
            const result = mapToolChoiceToCopilotFormat({ type: 'none' });

            expect(result.supported).toBe(false);
            expect(result.warning).toContain("'none'");
            expect(result.warning).toContain('not supported');
        });

        it('should return warning for required', () => {
            const result = mapToolChoiceToCopilotFormat({ type: 'required' });

            expect(result.supported).toBe(false);
            expect(result.warning).toContain("'required'");
            expect(result.warning).toContain('not supported');
        });

        it('should return warning for specific tool with tool name', () => {
            const result = mapToolChoiceToCopilotFormat({ type: 'tool', toolName: 'getWeather' });

            expect(result.supported).toBe(false);
            expect(result.warning).toContain("'tool'");
            expect(result.warning).toContain('getWeather');
            expect(result.warning).toContain('not supported');
        });

        it('should handle unknown tool choice type', () => {
            const result = mapToolChoiceToCopilotFormat({ type: 'unknown' } as LanguageModelV3ToolChoice);

            expect(result.supported).toBe(false);
            expect(result.warning).toContain('Unknown');
        });
    });

    describe('isFunctionTool', () => {
        it('should return true for function tools', () => {
            const tool = {
                type: 'function',
                name: 'test',
                inputSchema: { type: 'object' },
            };

            expect(isFunctionTool(tool)).toBe(true);
        });

        it('should return false for provider tools', () => {
            const tool = {
                type: 'provider',
                name: 'test',
            };

            expect(isFunctionTool(tool)).toBe(false);
        });

        it('should return false for null', () => {
            expect(isFunctionTool(null)).toBe(false);
        });

        it('should return false for non-objects', () => {
            expect(isFunctionTool('string')).toBe(false);
            expect(isFunctionTool(123)).toBe(false);
            expect(isFunctionTool(undefined)).toBe(false);
        });

        it('should return false for objects without type', () => {
            expect(isFunctionTool({ name: 'test' })).toBe(false);
        });
    });

    describe('extractFunctionTools', () => {
        it('should extract only function tools from mixed array', () => {
            const tools = [
                { type: 'function', name: 'func1', inputSchema: {} },
                { type: 'provider', name: 'prov1' },
                { type: 'function', name: 'func2', inputSchema: {} },
            ];

            const result = extractFunctionTools(tools);

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('func1');
            expect(result[1].name).toBe('func2');
        });

        it('should return empty array when no function tools', () => {
            const tools = [
                { type: 'provider', name: 'prov1' },
            ];

            const result = extractFunctionTools(tools);

            expect(result).toHaveLength(0);
        });

        it('should handle empty array', () => {
            const result = extractFunctionTools([]);

            expect(result).toHaveLength(0);
        });
    });
});
