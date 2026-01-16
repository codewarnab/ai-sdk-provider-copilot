import { describe, it, expect } from 'vitest';
import {
    processStructuredOutput,
    parseJsonResponse,
} from '../structured-output.js';
import type { JSONSchema7 } from 'json-schema';

describe('structured-output', () => {
    describe('processStructuredOutput', () => {
        it('should return empty result when no schema', () => {
            const result = processStructuredOutput({ hasSchema: false });

            expect(result.systemMessageAppend).toBeUndefined();
            expect(result.warnings).toEqual([]);
        });

        it('should return empty result when hasSchema is true but schema is undefined', () => {
            const result = processStructuredOutput({ hasSchema: true });

            expect(result.systemMessageAppend).toBeUndefined();
            expect(result.warnings).toEqual([]);
        });

        it('should emit warning for schema enforcement via prompt injection', () => {
            const schema: JSONSchema7 = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
            };

            const result = processStructuredOutput({
                hasSchema: true,
                schema,
            });

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0].type).toBe('other');
            expect(result.warnings[0].message).toContain('JSON schema enforcement via system prompt injection');
        });

        it('should build schema instruction string', () => {
            const schema: JSONSchema7 = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'number' },
                },
                required: ['name'],
            };

            const result = processStructuredOutput({
                hasSchema: true,
                schema,
            });

            expect(result.systemMessageAppend).toBeDefined();
            expect(result.systemMessageAppend).toContain('JSON Output Requirements');
            expect(result.systemMessageAppend).toContain('JSON Schema for "response"');
            expect(result.systemMessageAppend).toContain('"type": "object"');
            expect(result.systemMessageAppend).toContain('"name"');
            expect(result.systemMessageAppend).toContain('"age"');
        });

        it('should include schema name in instruction', () => {
            const schema: JSONSchema7 = { type: 'object' };

            const result = processStructuredOutput({
                hasSchema: true,
                schema,
                name: 'Person',
            });

            expect(result.systemMessageAppend).toContain('JSON Schema for "Person"');
        });

        it('should include schema description in instruction', () => {
            const schema: JSONSchema7 = { type: 'object' };

            const result = processStructuredOutput({
                hasSchema: true,
                schema,
                description: 'A person object with name and age',
            });

            expect(result.systemMessageAppend).toContain('Description: A person object with name and age');
        });

        it('should include both name and description', () => {
            const schema: JSONSchema7 = { type: 'object' };

            const result = processStructuredOutput({
                hasSchema: true,
                schema,
                name: 'Person',
                description: 'A person object',
            });

            expect(result.systemMessageAppend).toContain('JSON Schema for "Person"');
            expect(result.systemMessageAppend).toContain('Description: A person object');
        });
    });

    describe('parseJsonResponse', () => {
        it('should parse clean JSON', () => {
            const json = '{"name": "John", "age": 30}';
            const result = parseJsonResponse(json);

            expect(result).toEqual({ name: 'John', age: 30 });
        });

        it('should parse JSON with whitespace', () => {
            const json = '  \n  {"name": "John"}  \n  ';
            const result = parseJsonResponse(json);

            expect(result).toEqual({ name: 'John' });
        });

        it('should extract JSON from markdown code block', () => {
            const response = '```json\n{"name": "John"}\n```';
            const result = parseJsonResponse(response);

            expect(result).toEqual({ name: 'John' });
        });

        it('should extract JSON from code block without language', () => {
            const response = '```\n{"name": "John"}\n```';
            const result = parseJsonResponse(response);

            expect(result).toEqual({ name: 'John' });
        });

        it('should handle code block with extra whitespace', () => {
            const response = '```json\n  \n{"name": "John"}\n  \n```';
            const result = parseJsonResponse(response);

            expect(result).toEqual({ name: 'John' });
        });

        it('should parse arrays', () => {
            const json = '[1, 2, 3]';
            const result = parseJsonResponse(json);

            expect(result).toEqual([1, 2, 3]);
        });

        it('should parse nested objects', () => {
            const json = '{"person": {"name": "John", "address": {"city": "NYC"}}}';
            const result = parseJsonResponse(json);

            expect(result).toEqual({
                person: {
                    name: 'John',
                    address: { city: 'NYC' },
                },
            });
        });

        it('should throw on invalid JSON', () => {
            const invalid = '{name: "John"}'; // Missing quotes around key

            expect(() => parseJsonResponse(invalid)).toThrow('Failed to parse JSON response');
        });

        it('should throw on empty string', () => {
            expect(() => parseJsonResponse('')).toThrow('Failed to parse JSON response');
        });

        it('should throw on non-JSON text', () => {
            const text = 'This is not JSON';

            expect(() => parseJsonResponse(text)).toThrow('Failed to parse JSON response');
        });
    });
});
