# ai-sdk-provider-copilot

Community AI SDK provider for GitHub Copilot CLI.

> ⚠️ **Note**: This provider requires the Copilot CLI to be running locally. It will **not work in serverless environments** (Vercel, AWS Lambda, etc.) because the Copilot SDK spawns a local CLI process.

## Installation

```bash
npm install ai-sdk-provider-copilot @github/copilot-sdk
```

## Prerequisites

- Node.js 20+
- GitHub Copilot CLI installed and in PATH
- Valid GitHub Copilot subscription
- Authenticated via `copilot auth login`

## Usage

```typescript
import { createCopilotProvider } from 'ai-sdk-provider-copilot';
import { generateText } from 'ai';

// Create the provider
const copilot = createCopilotProvider();

// Get a language model
const model = copilot('gpt-4');

// Use with Vercel AI SDK
const result = await generateText({
  model,
  prompt: 'Hello, world!'
});

console.log(result.text);
```

## Configuration

### Provider Options

```typescript
const copilot = createCopilotProvider({
  // Path to Copilot CLI executable (optional, defaults to "copilot" in PATH)
  cliPath: '/usr/local/bin/copilot',

  // Log level
  logLevel: 'info', // 'none' | 'error' | 'warning' | 'info' | 'debug' | 'all'

  // BYOK - Bring Your Own Key (use custom provider)
  provider: {
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY
  }
});
```

### Model Settings

```typescript
const model = copilot('gpt-4', {
  systemMessage: {
    mode: 'append',
    content: 'Be concise and helpful.'
  }
});
```

## Supported Features

| Feature | Status |
|---------|--------|
| `generateText()` (non-streaming) | ✅ |
| `streamText()` (streaming) | 🔜 Phase 2 |
| Tool calling | 🔜 Phase 3 |
| `generateObject()` (structured output) | 🔜 Phase 4 |

## License

MIT
