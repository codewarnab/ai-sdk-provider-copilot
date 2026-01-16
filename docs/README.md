# AI SDK Provider for GitHub Copilot

A Vercel AI SDK V3 compatible provider for GitHub Copilot, allowing you to use Copilot models with the standard AI SDK interfaces.

## Features

- ✅ **Full AI SDK V3 Compatibility** - Works with `generateText`, `streamText`, and all AI SDK functions
- ✅ **Streaming Support** - Real-time text and reasoning streaming
- ✅ **Tool Calling** - Built-in support for function tools
- ✅ **BYOK Support** - Bring Your Own Key for OpenAI, Azure, and Anthropic endpoints
- ✅ **MCP Server Integration** - Connect to local and remote MCP servers
- ✅ **Custom Agents** - Define and use custom agent personalities
- ✅ **Reasoning Mode** - Access model reasoning/thinking output
- ✅ **Retry Logic** - Automatic retry with exponential backoff for transient failures
- ✅ **Configurable Logging** - Debug and observability support
- ✅ **Caching** - Built-in memory cache and middleware for performance
- ✅ **Trace Propagation** - W3C TraceContext support for distributed systems

## Installation

```bash
npm install ai-sdk-provider-copilot @github/copilot-sdk
```

## Quick Start

```typescript
import { createCopilotProvider } from 'ai-sdk-provider-copilot';
import { generateText } from 'ai';

// Create the provider
const copilot = createCopilotProvider();

// Generate text
const result = await generateText({
  model: copilot('gpt-4'),
  prompt: 'Explain quantum computing in simple terms.',
});

console.log(result.text);

// Don't forget to dispose when done
await copilot.dispose();
```

## Streaming

```typescript
import { createCopilotProvider } from 'ai-sdk-provider-copilot';
import { streamText } from 'ai';

const copilot = createCopilotProvider();

const result = await streamText({
  model: copilot('gpt-4'),
  prompt: 'Write a short story about AI.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

await copilot.dispose();
```

## Configuration

### Provider Options

```typescript
const copilot = createCopilotProvider({
  // CLI Configuration
  cliPath: '/usr/local/bin/copilot',  // Custom CLI path
  cliUrl: 'http://localhost:8080',     // OR: Connect to existing server
  logLevel: 'debug',                   // CLI log level
  
  // Retry Configuration
  retry: {
    maxRetries: 5,
    initialDelayMs: 100,
    maxDelayMs: 5000,
  },
  
  // Logging
  logger: console,  // or custom logger, or false to disable
  verbose: true,    // Enable debug logging
  
  // BYOK Provider (optional)
  provider: {
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
  },
  
  // MCP Servers (optional)
  mcpServers: {
    filesystem: {
      type: 'local',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
      tools: ['*'],
    },
  },
  
  // Custom Agents (optional)
  customAgents: [
    {
      name: 'code-reviewer',
      prompt: 'You are an expert code reviewer...',
    },
  ],
});
```

### Model Settings

```typescript
const model = copilot('gpt-4', {
  systemMessage: {
    mode: 'replace',
    content: 'You are a helpful coding assistant.',
  },
  availableTools: ['search', 'calculate'],
  excludedTools: ['dangerous-tool'],
});
```

### Per-Call Options

```typescript
const result = await generateText({
  model: copilot('gpt-4'),
  prompt: 'Hello',
  providerOptions: {
    copilot: {
      retry: { maxRetries: 10 },
      requestTimeoutMs: 120000,
      mcpServers: { /* call-specific servers */ },
      agent: 'code-reviewer',
    },
  },
});
```

## Resources

- [API Reference](./api-reference.md)
- [Known Limitations](./known-limitations.md)
- [Migration Guide](./migration-guide.md)
- [Examples](../examples/)
- [Caching Guide](./caching.md)
- [Observability Guide](./observability.md)

## Requirements

- Node.js 18+
- GitHub Copilot CLI installed and authenticated
- Vercel AI SDK 3.0+

## License

MIT
