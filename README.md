# ai-sdk-provider-copilot

Community AI SDK provider for GitHub Copilot CLI.

> ⚠️ **Note**: This provider requires the Copilot CLI to be running locally. It will **not work in serverless environments** (Vercel, AWS Lambda, etc.) because the Copilot SDK spawns a local CLI process.

## Installation

```bash
npm install ai-sdk-provider-copilot @github/copilot-sdk
```

## Prerequisites

- Node.js 20+
- GitHub Copilot CLI installed globally: `npm install -g @github/copilot`
- Valid GitHub Copilot subscription
- Authenticated via `copilot auth login` or `gh auth login`

## Quick Start

```typescript
import { createCopilotProvider } from 'ai-sdk-provider-copilot';
import { generateText, streamText } from 'ai';

// Create the provider
const copilot = createCopilotProvider();

// Generate text
const result = await generateText({
  model: copilot('gpt-4'),
  prompt: 'Hello, world!'
});
console.log(result.text);

// Stream text
const stream = await streamText({
  model: copilot('gpt-4'),
  prompt: 'Tell me a story'
});
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

// Always dispose when done
await copilot.dispose();
```

## Configuration

### Provider Options

```typescript
const copilot = createCopilotProvider({
  // Enable verbose logging
  verbose: true,

  // Retry configuration
  retry: {
    maxRetries: 3,
    initialDelayMs: 100,
  },

  // BYOK - Bring Your Own Key
  provider: {
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
  },

  // Custom agents
  customAgents: [{
    name: 'code-reviewer',
    prompt: 'You are an expert code reviewer...',
  }],
});
```

### Model Settings

```typescript
const model = copilot('gpt-4', {
  systemMessage: {
    mode: 'append',
    content: 'Be concise and helpful.',
  },
  // Control which built-in tools are available
  availableTools: ['web_fetch'],
  excludedTools: ['report_intent'],
});
```

## Supported Features

| Feature | Status |
|---------|--------|
| `generateText()` | ✅ |
| `streamText()` | ✅ |
| Tool calling | ✅ |
| Custom agents | ✅ |
| BYOK (Bring Your Own Key) | ✅ |
| MCP server integration | ✅ |
| Response caching | ✅ |
| Retry with backoff | ✅ |
| OpenTelemetry integration | ✅ |
| `generateObject()` | ⚠️ Prompt-based only |

## Examples

See the [`examples/`](./examples) directory:

- `basic-usage.ts` - Simple text generation
- `streaming.ts` - Real-time streaming
- `tool-calling.ts` - Custom tool definitions
- `custom-agent.ts` - Custom agent personas
- `caching.ts` - Response caching
- `error-handling.ts` - Retry and error handling
- `http-server-sse.ts` - SSE streaming server

Run any example with:
```bash
npx tsx examples/basic-usage.ts
```

## Windows Notes

On Windows, the provider automatically detects the Copilot CLI path. If you encounter issues, ensure the CLI is installed globally:

```powershell
npm install -g @github/copilot
```

## License

MIT
