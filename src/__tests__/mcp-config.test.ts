import { describe, it, expect } from 'vitest';
import {
    validateMcpConfig,
    mergeMcpConfigs,
} from '../mcp-config.js';
import type { MCPServerConfig, MCPLocalServerConfig, MCPRemoteServerConfig } from '@github/copilot-sdk';

describe('mcp-config', () => {
    describe('validateMcpConfig', () => {
        describe('local server validation', () => {
            it('should validate local server with command and args', () => {
                const config: MCPLocalServerConfig = {
                    type: 'local',
                    command: 'node',
                    args: ['server.js'],
                    tools: ['tool1', 'tool2'],
                };
                const result = validateMcpConfig('test-server', config);
                expect(result.valid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('should validate stdio server (alias for local)', () => {
                const config: MCPLocalServerConfig = {
                    type: 'stdio',
                    command: 'python',
                    args: ['-m', 'server'],
                    tools: ['*'],
                };
                const result = validateMcpConfig('python-server', config);
                expect(result.valid).toBe(true);
            });

            it('should default to local type when not specified', () => {
                const config = {
                    command: 'node',
                    args: ['server.js'],
                    tools: ['tool1'],
                } as MCPLocalServerConfig;
                const result = validateMcpConfig('default-server', config);
                expect(result.valid).toBe(true);
            });

            it('should reject local server without command', () => {
                const config = {
                    type: 'local',
                    args: ['server.js'],
                    tools: ['tool1'],
                } as MCPLocalServerConfig;
                const result = validateMcpConfig('bad-server', config);
                expect(result.valid).toBe(false);
                expect(result.error).toBe("Local MCP server 'bad-server' must specify 'command'");
            });

            it('should reject local server without args array', () => {
                const config = {
                    type: 'local',
                    command: 'node',
                    tools: ['tool1'],
                } as unknown as MCPLocalServerConfig;
                const result = validateMcpConfig('bad-server', config);
                expect(result.valid).toBe(false);
                expect(result.error).toBe("Local MCP server 'bad-server' must specify 'args' array");
            });
        });

        describe('remote server validation', () => {
            it('should validate HTTP remote server with url', () => {
                const config: MCPRemoteServerConfig = {
                    type: 'http',
                    url: 'https://api.example.com/mcp',
                    tools: ['remote-tool'],
                };
                const result = validateMcpConfig('http-server', config);
                expect(result.valid).toBe(true);
            });

            it('should validate SSE remote server with url', () => {
                const config: MCPRemoteServerConfig = {
                    type: 'sse',
                    url: 'https://api.example.com/events',
                    tools: ['*'],
                    headers: { Authorization: 'Bearer token' },
                };
                const result = validateMcpConfig('sse-server', config);
                expect(result.valid).toBe(true);
            });

            it('should reject remote server without url', () => {
                const config = {
                    type: 'http',
                    tools: ['tool1'],
                } as unknown as MCPRemoteServerConfig;
                const result = validateMcpConfig('bad-remote', config);
                expect(result.valid).toBe(false);
                expect(result.error).toBe("Remote MCP server 'bad-remote' must specify 'url'");
            });
        });

        describe('common validation', () => {
            it('should reject server without tools array', () => {
                const config = {
                    type: 'local',
                    command: 'node',
                    args: ['server.js'],
                } as unknown as MCPServerConfig;
                const result = validateMcpConfig('no-tools', config);
                expect(result.valid).toBe(false);
                expect(result.error).toBe("MCP server 'no-tools' must specify 'tools' array");
            });

            it('should reject invalid server type', () => {
                const config = {
                    type: 'invalid',
                    tools: ['tool1'],
                } as unknown as MCPServerConfig;
                const result = validateMcpConfig('invalid-type', config);
                expect(result.valid).toBe(false);
                expect(result.error).toBe("MCP server 'invalid-type' has invalid type 'invalid'");
            });
        });
    });

    describe('mergeMcpConfigs', () => {
        const providerConfig: Record<string, MCPServerConfig> = {
            'server-a': {
                type: 'local',
                command: 'node',
                args: ['a.js'],
                tools: ['tool-a'],
            } as MCPLocalServerConfig,
            'server-b': {
                type: 'http',
                url: 'https://b.example.com',
                tools: ['tool-b'],
            } as MCPRemoteServerConfig,
        };

        const callConfig: Record<string, MCPServerConfig> = {
            'server-b': {
                type: 'http',
                url: 'https://b-override.example.com',
                tools: ['tool-b-override'],
            } as MCPRemoteServerConfig,
            'server-c': {
                type: 'local',
                command: 'python',
                args: ['c.py'],
                tools: ['tool-c'],
            } as MCPLocalServerConfig,
        };

        it('should return undefined when both configs are empty', () => {
            expect(mergeMcpConfigs(undefined, undefined)).toBeUndefined();
        });

        it('should return provider config when call config is empty', () => {
            const result = mergeMcpConfigs(providerConfig, undefined);
            expect(result).toEqual(providerConfig);
        });

        it('should return call config when provider config is empty', () => {
            const result = mergeMcpConfigs(undefined, callConfig);
            expect(result).toEqual(callConfig);
        });

        it('should merge configs with call-level taking precedence', () => {
            const result = mergeMcpConfigs(providerConfig, callConfig);

            expect(result).toBeDefined();
            expect(Object.keys(result!)).toHaveLength(3);

            // server-a from provider (not overridden)
            expect(result!['server-a']).toEqual(providerConfig['server-a']);

            // server-b from call (overridden)
            expect(result!['server-b']).toEqual(callConfig['server-b']);

            // server-c from call (new)
            expect(result!['server-c']).toEqual(callConfig['server-c']);
        });
    });
});
