'use strict';

var chunkFUZCJ4SC_cjs = require('./chunk-FUZCJ4SC.cjs');
var chunkVHYCCVHD_cjs = require('./chunk-VHYCCVHD.cjs');
var provider = require('@ai-sdk/provider');
var copilotSdk = require('@github/copilot-sdk');
var crypto$1 = require('crypto');
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');

// src/message-mapper.ts
function mapPromptToCopilotFormat(messages) {
  const parts = [];
  for (const message of messages) {
    switch (message.role) {
      case "system":
        parts.push(`[System]: ${message.content}`);
        break;
      case "user":
        parts.push(formatUserMessage(message));
        break;
      case "assistant":
        parts.push(formatAssistantMessage(message));
        break;
      case "tool":
        for (const part of message.content) {
          if (part.type === "tool-result") {
            const output = formatToolOutput(part.output);
            parts.push(`[Tool Result: ${part.toolName}]: ${output}`);
          }
        }
        break;
    }
  }
  return parts.join("\n\n");
}
function formatUserMessage(message) {
  const textParts = [];
  for (const part of message.content) {
    switch (part.type) {
      case "text":
        textParts.push(part.text);
        break;
      case "file":
        textParts.push(`[File attachment not yet supported]`);
        break;
    }
  }
  return textParts.join("\n");
}
function formatAssistantMessage(message) {
  const textParts = [];
  for (const part of message.content) {
    switch (part.type) {
      case "text":
        textParts.push(part.text);
        break;
      case "tool-call":
        textParts.push(`[Called tool: ${part.toolName}]`);
        break;
    }
  }
  return textParts.join("\n");
}
function formatToolOutput(output) {
  if (typeof output === "object" && output !== null) {
    const typed = output;
    switch (typed.type) {
      case "text":
      case "error-text":
        return String(typed.value ?? "");
      case "json":
      case "error-json":
        return JSON.stringify(typed.value);
      case "execution-denied":
        return `[Execution denied: ${typed.reason ?? "unknown reason"}]`;
      default:
        return JSON.stringify(output);
    }
  }
  return String(output);
}
function extractLatestUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") {
      return formatUserMessage(message);
    }
  }
  return null;
}
var ERROR_PATTERNS = [
  // Authentication errors
  {
    patterns: [
      /unauthorized/i,
      /authentication/i,
      /api key/i,
      /credentials/i,
      /not authenticated/i,
      /access denied/i,
      /forbidden/i,
      /login required/i
    ],
    category: "authentication",
    isRetryable: false,
    statusCode: 401,
    recoveryHint: "Check your authentication credentials and ensure you are logged in to Copilot CLI."
  },
  // Rate limiting
  {
    patterns: [
      /rate limit/i,
      /quota/i,
      /too many requests/i,
      /throttl/i
    ],
    category: "rate-limit",
    isRetryable: true,
    statusCode: 429,
    recoveryHint: "Wait before retrying. Consider implementing request queuing."
  },
  // Connection errors
  {
    patterns: [
      /connection/i,
      /econnrefused/i,
      /econnreset/i,
      /enotfound/i,
      /timeout/i,
      /timed out/i,
      /network/i,
      /socket/i
    ],
    category: "connection",
    isRetryable: true,
    statusCode: 503,
    recoveryHint: "Check network connectivity and ensure Copilot CLI server is running."
  },
  // Session errors
  {
    patterns: [
      /session not found/i,
      /session expired/i,
      /invalid session/i
    ],
    category: "session",
    isRetryable: false,
    statusCode: 400,
    recoveryHint: "Create a new session. The previous session may have expired or been destroyed."
  },
  // Request errors
  {
    patterns: [
      /invalid/i,
      /bad request/i,
      /malformed/i,
      /validation/i
    ],
    category: "request",
    isRetryable: false,
    statusCode: 400,
    recoveryHint: "Check request parameters and message format."
  },
  // CLI process errors (non-retryable)
  {
    patterns: [
      /cli not found/i,
      /spawn/i,
      /executable/i,
      /enoent/i
    ],
    category: "internal",
    isRetryable: false,
    statusCode: 500,
    recoveryHint: "Ensure the Copilot CLI is installed and accessible in PATH."
  }
];
function classifyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(message)) {
        return {
          category: pattern.category,
          isRetryable: pattern.isRetryable,
          recoveryHint: pattern.recoveryHint,
          cause: error
        };
      }
    }
  }
  return {
    category: "internal",
    isRetryable: true,
    recoveryHint: "An internal error occurred. The operation may succeed on retry.",
    cause: error
  };
}
var STATUS_CODE_MAP = {
  connection: 503,
  authentication: 401,
  "rate-limit": 429,
  session: 400,
  request: 400,
  internal: 500
};
function createCopilotAPIError(error, metadata) {
  const classification = classifyError(error);
  const mergedMetadata = { ...classification, ...metadata };
  const message = error instanceof Error ? error.message : String(error);
  return new provider.APICallError({
    url: "copilot://cli",
    requestBodyValues: {},
    statusCode: STATUS_CODE_MAP[mergedMetadata.category],
    responseHeaders: {},
    message,
    data: mergedMetadata,
    isRetryable: mergedMetadata.isRetryable
  });
}
function mapCopilotError(error, retryAttempts) {
  if (error instanceof Error && error.name === "AbortError") {
    return error;
  }
  const classification = classifyError(error);
  classification.retryAttempts = retryAttempts;
  if (classification.category === "authentication") {
    return new provider.LoadAPIKeyError({
      message: error instanceof Error ? error.message : String(error)
    });
  }
  return createCopilotAPIError(error, classification);
}
function isRetryableError(error) {
  if (error instanceof Error && error.name === "AbortError") {
    return false;
  }
  if (error instanceof provider.APICallError) {
    return error.isRetryable ?? false;
  }
  const classification = classifyError(error);
  return classification.isRetryable;
}
function getRecoveryHint(error) {
  const classification = classifyError(error);
  return classification.recoveryHint;
}
function isErrorCategory(error, category) {
  const classification = classifyError(error);
  return classification.category === category;
}
function createAbortError(message = "Request was aborted") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
function createStreamContext(warnings = []) {
  return {
    textStarted: false,
    reasoningStarted: false,
    warnings,
    toolCalls: [],
    hasToolCalls: false
  };
}
function mapEventToStreamParts(event, context) {
  const parts = [];
  switch (event.type) {
    case "assistant.turn_start":
      context.turnId = event.data.turnId;
      break;
    case "assistant.message_delta": {
      const messageId = event.data.messageId;
      const deltaContent = event.data.deltaContent;
      if (!context.textStarted) {
        context.textBlockId = messageId || crypto$1.randomUUID();
        context.textStarted = true;
        parts.push({
          type: "text-start",
          id: context.textBlockId
        });
      }
      if (deltaContent) {
        parts.push({
          type: "text-delta",
          id: context.textBlockId,
          delta: deltaContent
        });
      }
      break;
    }
    case "assistant.message": {
      if (context.textStarted && context.textBlockId) {
        parts.push({
          type: "text-end",
          id: context.textBlockId
        });
      }
      const toolRequests = event.data.toolRequests;
      if (toolRequests && toolRequests.length > 0) {
        for (const req of toolRequests) {
          const toolCall = {
            type: "tool-call",
            toolCallId: req.toolCallId,
            toolName: req.name,
            input: JSON.stringify(req.arguments ?? {}),
            providerExecuted: false
            // Caller will execute (return-to-caller model)
          };
          parts.push(toolCall);
          context.toolCalls.push(toolCall);
          context.hasToolCalls = true;
        }
      }
      break;
    }
    case "assistant.reasoning_delta": {
      const reasoningId = event.data.reasoningId;
      const deltaContent = event.data.deltaContent;
      if (!context.reasoningStarted) {
        context.reasoningBlockId = reasoningId || crypto$1.randomUUID();
        context.reasoningStarted = true;
        parts.push({
          type: "reasoning-start",
          id: context.reasoningBlockId
        });
      }
      if (deltaContent) {
        parts.push({
          type: "reasoning-delta",
          id: context.reasoningBlockId,
          delta: deltaContent
        });
      }
      break;
    }
    case "assistant.reasoning": {
      if (context.reasoningStarted && context.reasoningBlockId) {
        parts.push({
          type: "reasoning-end",
          id: context.reasoningBlockId
        });
      }
      break;
    }
    case "assistant.usage": {
      context.usage = mapUsageEvent(event.data);
      break;
    }
  }
  return parts;
}
function mapUsageEvent(data) {
  return {
    inputTokens: {
      total: data.inputTokens ?? 0,
      noCache: void 0,
      cacheRead: data.cacheReadTokens,
      cacheWrite: data.cacheWriteTokens
    },
    outputTokens: {
      total: data.outputTokens ?? 0,
      text: void 0,
      reasoning: void 0
    }
  };
}
function mapFinishReason(rawReason, hasToolCalls = false) {
  if (hasToolCalls) {
    return {
      unified: "tool-calls",
      raw: rawReason ?? "tool_calls"
    };
  }
  return {
    unified: "stop",
    raw: rawReason ?? "complete"
  };
}
function getDefaultUsage() {
  return {
    inputTokens: {
      total: 0,
      noCache: void 0,
      cacheRead: void 0,
      cacheWrite: void 0
    },
    outputTokens: {
      total: 0,
      text: void 0,
      reasoning: void 0
    }
  };
}

// src/tool-mapper.ts
function mapToolsWithHandlers(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: cleanJsonSchema(tool.inputSchema),
    handler: async () => {
      return {
        __caller_execution_required: true,
        message: `Tool '${tool.name}' should be executed by the caller.`
      };
    }
  }));
}
function mapToolsToCopilotFormat(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: cleanJsonSchema(tool.inputSchema)
  }));
}
function cleanJsonSchema(schema) {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }
  const cleaned = { ...schema };
  delete cleaned.$schema;
  delete cleaned.$ref;
  delete cleaned.$defs;
  delete cleaned.definitions;
  if (cleaned.properties && typeof cleaned.properties === "object") {
    const cleanedProps = {};
    for (const [key, value] of Object.entries(cleaned.properties)) {
      cleanedProps[key] = cleanJsonSchema(value);
    }
    cleaned.properties = cleanedProps;
  }
  if (cleaned.items) {
    cleaned.items = cleanJsonSchema(cleaned.items);
  }
  if (cleaned.additionalProperties && typeof cleaned.additionalProperties === "object") {
    cleaned.additionalProperties = cleanJsonSchema(
      cleaned.additionalProperties
    );
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    const arrayProp = cleaned[key];
    if (Array.isArray(arrayProp)) {
      cleaned[key] = arrayProp.map(
        (item) => cleanJsonSchema(item)
      );
    }
  }
  if (cleaned.properties && cleaned.type === void 0) {
    cleaned.type = "object";
  }
  return cleaned;
}
function mapToolChoiceToCopilotFormat(toolChoice) {
  switch (toolChoice.type) {
    case "auto":
      return { supported: true };
    case "none":
      return {
        supported: false,
        warning: `Tool choice 'none' is not supported by Copilot provider. Tools will still be available to the model.`
      };
    case "required":
      return {
        supported: false,
        warning: `Tool choice 'required' is not supported by Copilot provider. Model may or may not use tools.`
      };
    case "tool":
      return {
        supported: false,
        warning: `Tool choice 'tool' (forcing specific tool '${toolChoice.toolName}') is not supported by Copilot provider. Model will choose tools automatically.`
      };
    default:
      return {
        supported: false,
        warning: "Unknown tool choice type."
      };
  }
}
function isFunctionTool(tool) {
  return typeof tool === "object" && tool !== null && "type" in tool && tool.type === "function";
}
function extractFunctionTools(tools) {
  return tools.filter(isFunctionTool);
}

// src/structured-output.ts
function processStructuredOutput(config) {
  const warnings = [];
  if (!config.hasSchema || !config.schema) {
    return { warnings };
  }
  warnings.push({
    type: "other",
    message: "JSON schema enforcement via system prompt injection. Results may not strictly conform to schema."
  });
  const schemaName = config.name || "response";
  const schemaDescription = config.description || "";
  let instruction = "\n\n--- JSON Output Requirements ---\n";
  instruction += `You MUST respond with valid JSON that conforms to the following schema.
`;
  if (schemaDescription) {
    instruction += `Description: ${schemaDescription}
`;
  }
  instruction += `
JSON Schema for "${schemaName}":
`;
  instruction += "```json\n";
  instruction += JSON.stringify(config.schema, null, 2);
  instruction += "\n```\n";
  instruction += "\nRespond ONLY with the JSON object. Do not include any explanation, markdown formatting, or code blocks around the JSON.\n";
  instruction += "--- End JSON Requirements ---\n";
  return {
    systemMessageAppend: instruction,
    warnings
  };
}
function parseJsonResponse(response) {
  let jsonText = response.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function createReasoningContext() {
  return {
    reasoningStarted: false,
    accumulatedReasoning: ""
  };
}
function mapReasoningEventToStreamParts(event, context) {
  const parts = [];
  switch (event.type) {
    case "assistant.reasoning_delta": {
      const reasoningId = event.data.reasoningId;
      const deltaContent = event.data.deltaContent;
      if (!context.reasoningStarted) {
        context.reasoningBlockId = reasoningId || crypto$1.randomUUID();
        context.reasoningStarted = true;
        parts.push({
          type: "reasoning-start",
          id: context.reasoningBlockId
        });
      }
      if (deltaContent) {
        context.accumulatedReasoning += deltaContent;
        parts.push({
          type: "reasoning-delta",
          id: context.reasoningBlockId,
          delta: deltaContent
        });
      }
      break;
    }
    case "assistant.reasoning": {
      const reasoningId = event.data.reasoningId;
      const content = event.data.content;
      if (context.reasoningStarted && context.reasoningBlockId) {
        parts.push({
          type: "reasoning-end",
          id: context.reasoningBlockId
        });
      }
      context.accumulatedReasoning = content;
      context.reasoningBlockId = reasoningId;
      break;
    }
  }
  return parts;
}
function createReasoningContent(context) {
  if (!context.accumulatedReasoning) {
    return null;
  }
  return {
    type: "reasoning",
    text: context.accumulatedReasoning,
    providerMetadata: {
      copilot: {
        reasoningId: context.reasoningBlockId
      }
    }
  };
}

// src/mcp-config.ts
function validateMcpConfig(name, config) {
  if (!config.tools || !Array.isArray(config.tools)) {
    return { valid: false, error: `MCP server '${name}' must specify 'tools' array` };
  }
  const type = config.type ?? "local";
  if (type === "local" || type === "stdio") {
    const localConfig = config;
    if (!localConfig.command) {
      return { valid: false, error: `Local MCP server '${name}' must specify 'command'` };
    }
    if (!Array.isArray(localConfig.args)) {
      return { valid: false, error: `Local MCP server '${name}' must specify 'args' array` };
    }
  } else if (type === "http" || type === "sse") {
    const remoteConfig = config;
    if (!remoteConfig.url) {
      return { valid: false, error: `Remote MCP server '${name}' must specify 'url'` };
    }
  } else {
    return { valid: false, error: `MCP server '${name}' has invalid type '${type}'` };
  }
  return { valid: true };
}
function mergeMcpConfigs(providerConfig, callConfig) {
  if (!providerConfig && !callConfig) {
    return void 0;
  }
  return {
    ...providerConfig,
    ...callConfig
  };
}

// src/agent-resolver.ts
var AGENT_PREFIX = "agent/";
function isAgentModelId(modelId) {
  return modelId.startsWith(AGENT_PREFIX);
}
function extractAgentName(modelId) {
  if (!isAgentModelId(modelId)) {
    throw new Error(`Model ID '${modelId}' is not an agent reference`);
  }
  return modelId.slice(AGENT_PREFIX.length);
}
function resolveAgent(modelId, agents) {
  if (!isAgentModelId(modelId)) {
    return null;
  }
  const agentName = extractAgentName(modelId);
  const agent = agents?.find((a) => a.name === agentName);
  if (!agent) {
    const availableAgents = agents?.map((a) => a.name).join(", ") || "none";
    throw new Error(`Custom agent '${agentName}' not found. Available agents: ${availableAgents}`);
  }
  return agent;
}
function getAgentModelId(_agent) {
  return void 0;
}
function buildAgentSystemMessage(agent) {
  return {
    mode: "replace",
    content: agent.prompt
  };
}
function validateAgentConfigs(agents) {
  const agentNames = /* @__PURE__ */ new Set();
  for (const agent of agents) {
    if (!agent.name) {
      throw new Error("Custom agent must have a name");
    }
    if (!agent.prompt) {
      throw new Error(`Custom agent '${agent.name}' must have a prompt`);
    }
    if (agentNames.has(agent.name)) {
      throw new Error(`Duplicate custom agent name: '${agent.name}'`);
    }
    agentNames.add(agent.name);
  }
}

// src/retry.ts
var DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5e3,
  backoffMultiplier: 2,
  jitter: 0.1
};
function mergeRetryOptions(providerOptions, callOptions) {
  return {
    ...DEFAULT_RETRY_OPTIONS,
    ...providerOptions,
    ...callOptions
  };
}
function calculateDelay(attempt, options) {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  const jitterRange = cappedDelay * options.jitter;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, Math.round(cappedDelay + jitter));
}
function shouldRetry(error, attempt, options) {
  if (attempt >= (options.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries)) {
    return false;
  }
  if (options.isRetryable) {
    return options.isRetryable(error);
  }
  return isRetryableError(error);
}
async function withRetry(fn, options = {}, logger) {
  const mergedOptions = mergeRetryOptions(options);
  let lastError;
  for (let attempt = 0; attempt <= mergedOptions.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error, attempt, mergedOptions)) {
        throw error;
      }
      const delay = calculateDelay(attempt, mergedOptions);
      logger?.debug(
        `Retry attempt ${attempt + 1}/${mergedOptions.maxRetries} after ${delay}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
function createRetryable(fn, options = {}, logger) {
  return (...args) => withRetry(() => fn(...args), options, logger);
}

// src/telemetry.ts
var noopLogger = {
  debug: () => {
  },
  info: () => {
  },
  warn: () => {
  },
  error: () => {
  }
};
var consoleLogger = {
  debug: (msg, ...args) => console.debug(`[copilot] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[copilot] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[copilot] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[copilot] ${msg}`, ...args)
};
function getLogger(logger, verbose) {
  if (logger === false) {
    return noopLogger;
  }
  const baseLogger = logger ?? consoleLogger;
  if (!verbose) {
    return createVerboseLogger(baseLogger, false);
  }
  return baseLogger;
}
function createVerboseLogger(baseLogger, verbose) {
  if (verbose) {
    return baseLogger;
  }
  return {
    ...baseLogger,
    debug: () => {
    }
    // Suppress debug unless verbose
  };
}
async function withTiming(fn, logger, operation) {
  const startTime = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    if (logger && operation) {
      logger.debug(`[timing] ${operation} completed in ${durationMs}ms`);
    }
    return { result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    if (logger && operation) {
      logger.debug(`[timing] ${operation} failed after ${durationMs}ms`);
    }
    throw error;
  }
}
function createRequestContext(modelId) {
  return {
    requestId: crypto.randomUUID(),
    modelId,
    startTime: Date.now()
  };
}
function formatWithContext(ctx, message) {
  return `[${ctx.requestId}] ${message}`;
}

// src/copilot-language-model.ts
var noopLogger2 = {
  debug: () => {
  },
  info: () => {
  },
  warn: () => {
  },
  error: () => {
  }
};
var CopilotLanguageModel = class {
  constructor(options) {
    this.options = options;
    this.specificationVersion = "v3";
    this.provider = "copilot";
    this.supportedUrls = {};
    this.modelId = options.modelId;
    this.clientManager = options.clientManager;
    this.logger = options.logger ?? noopLogger2;
  }
  /**
   * Ensures a client exists, creating one if necessary.
   * Uses shared client manager if available, otherwise creates new client.
   */
  async ensureClient() {
    if (this.clientManager) {
      return this.clientManager.acquire();
    }
    if (!this.client) {
      this.client = new copilotSdk.CopilotClient({
        cliPath: this.options.providerOptions.cliPath,
        cliUrl: this.options.providerOptions.cliUrl,
        cwd: this.options.providerOptions.cwd,
        cliArgs: this.options.providerOptions.cliArgs,
        useStdio: this.options.providerOptions.useStdio,
        env: this.options.providerOptions.env,
        logLevel: this.options.providerOptions.logLevel ?? "info"
      });
    }
    return this.client;
  }
  /**
   * Releases client reference when using shared client manager.
   */
  releaseClient() {
    if (this.clientManager) {
      this.clientManager.release();
    }
  }
  /**
   * Ensures a session exists, creating one if necessary.
   * Supports Phase 4 features: BYOK, MCP servers, custom agents, structured output.
   */
  async ensureSession(client, streaming = false, callOptions, structuredOutputAppend, aiSdkTools) {
    let agent = resolveAgent(this.modelId, this.options.providerOptions.customAgents);
    if (callOptions?.agent && !agent) {
      agent = this.options.providerOptions.customAgents?.find((a) => a.name === callOptions.agent) ?? null;
      if (!agent) {
        const availableAgents = this.options.providerOptions.customAgents?.map((a) => a.name).join(", ") || "none";
        throw new Error(`Custom agent '${callOptions.agent}' not found. Available agents: ${availableAgents}`);
      }
    }
    const actualModelId = agent ? getAgentModelId() : isAgentModelId(this.modelId) ? void 0 : this.modelId;
    let systemMessage = agent ? buildAgentSystemMessage(agent) : this.options.settings?.systemMessage;
    if (structuredOutputAppend && systemMessage) {
      if (systemMessage.mode === "replace") {
        systemMessage = {
          mode: "replace",
          content: systemMessage.content + structuredOutputAppend
        };
      } else {
        systemMessage = {
          mode: "append",
          content: (systemMessage.content || "") + structuredOutputAppend
        };
      }
    } else if (structuredOutputAppend) {
      systemMessage = {
        mode: "append",
        content: structuredOutputAppend
      };
    }
    const providerMcpServers = this.options.providerOptions.mcpServers;
    const agentMcpServers = agent?.mcpServers;
    const callMcpServers = callOptions?.mcpServers;
    const mergedMcpServers = mergeMcpConfigs(
      mergeMcpConfigs(providerMcpServers, agentMcpServers),
      callMcpServers
    );
    const providerConfig = this.options.settings?.provider ?? this.options.providerOptions.provider;
    let copilotTools;
    if (aiSdkTools && aiSdkTools.length > 0) {
      const functionTools = extractFunctionTools(aiSdkTools);
      if (functionTools.length > 0) {
        copilotTools = mapToolsWithHandlers(functionTools);
      }
    }
    const session = await client.createSession({
      model: actualModelId,
      provider: providerConfig,
      systemMessage,
      tools: copilotTools,
      // Custom tools from AI SDK with no-op handlers
      availableTools: this.options.settings?.availableTools,
      excludedTools: this.options.settings?.excludedTools,
      streaming,
      mcpServers: mergedMcpServers,
      customAgents: agent ? [agent] : this.options.providerOptions.customAgents
    });
    return session;
  }
  async doGenerate(options) {
    const ctx = createRequestContext(this.modelId);
    this.logger.info(`[${ctx.requestId}] Starting doGenerate for ${this.modelId}`);
    const warnings = [];
    const callOptions = options.providerOptions?.copilot;
    const retryOptions = mergeRetryOptions(
      this.options.providerOptions.retry,
      callOptions?.retry
    );
    try {
      const result = await withRetry(
        async () => {
          const { result: result2, durationMs } = await withTiming(
            () => this.executeGenerate(options, warnings),
            this.logger,
            `generate:${ctx.requestId}`
          );
          this.logger.info(`[${ctx.requestId}] doGenerate completed in ${durationMs}ms`);
          return result2;
        },
        retryOptions,
        this.logger
      );
      return result;
    } catch (error) {
      this.logger.error(`[${ctx.requestId}] doGenerate failed: ${error}`);
      throw mapCopilotError(error);
    }
  }
  async executeGenerate(options, warnings) {
    let structuredOutputAppend;
    if (options.responseFormat?.type === "json" && options.responseFormat.schema) {
      const structuredResult = processStructuredOutput({
        hasSchema: true,
        schema: options.responseFormat.schema,
        name: options.responseFormat.name,
        description: options.responseFormat.description
      });
      warnings.push(...structuredResult.warnings);
      structuredOutputAppend = structuredResult.systemMessageAppend;
    }
    const callOptions = options.providerOptions?.copilot;
    const client = await this.ensureClient();
    const session = await this.ensureSession(client, false, callOptions, structuredOutputAppend, options.tools);
    try {
      if (options.toolChoice) {
        const toolChoiceResult = mapToolChoiceToCopilotFormat(options.toolChoice);
        if (!toolChoiceResult.supported && toolChoiceResult.warning) {
          warnings.push({
            type: "unsupported",
            feature: "toolChoice",
            details: toolChoiceResult.warning
          });
        }
      }
      const prompt = mapPromptToCopilotFormat(options.prompt);
      if (options.abortSignal) {
        options.abortSignal.addEventListener(
          "abort",
          async () => {
            try {
              await session.abort();
            } catch {
            }
          },
          { once: true }
        );
      }
      const reasoningContext = createReasoningContext();
      return new Promise((resolve, reject) => {
        const content = [];
        let usage;
        let finishReason;
        let responseId;
        let responseTimestamp;
        const textParts = [];
        const toolCalls = [];
        const unsubscribe = session.on((event) => {
          switch (event.type) {
            case "assistant.message":
              if ("content" in event.data && typeof event.data.content === "string") {
                textParts.push(event.data.content);
              }
              responseId = event.id;
              responseTimestamp = new Date(event.timestamp);
              const toolRequests = event.data.toolRequests;
              if (toolRequests && toolRequests.length > 0) {
                for (const req of toolRequests) {
                  toolCalls.push({
                    type: "tool-call",
                    toolCallId: req.toolCallId,
                    toolName: req.name,
                    input: JSON.stringify(req.arguments ?? {}),
                    providerExecuted: false
                  });
                }
              }
              break;
            case "assistant.reasoning":
              reasoningContext.accumulatedReasoning = event.data.content;
              reasoningContext.reasoningBlockId = event.data.reasoningId;
              break;
            case "assistant.turn_end":
              unsubscribe();
              const reasoningContent = createReasoningContent(reasoningContext);
              if (reasoningContent) {
                content.push(reasoningContent);
              }
              if (textParts.length > 0) {
                content.push({ type: "text", text: textParts.join("") });
              }
              for (const toolCall of toolCalls) {
                content.push(toolCall);
              }
              finishReason = toolCalls.length > 0 ? { unified: "tool-calls", raw: "tool_calls" } : { unified: "stop", raw: "complete" };
              session.destroy().catch(() => {
              });
              resolve({
                content,
                finishReason: finishReason ?? {
                  unified: "stop",
                  raw: "unknown"
                },
                usage: usage ?? {
                  inputTokens: {
                    total: void 0,
                    noCache: void 0,
                    cacheRead: void 0,
                    cacheWrite: void 0
                  },
                  outputTokens: {
                    total: void 0,
                    text: void 0,
                    reasoning: void 0
                  }
                },
                warnings,
                request: { body: prompt },
                response: {
                  id: responseId ?? crypto.randomUUID(),
                  timestamp: responseTimestamp ?? /* @__PURE__ */ new Date(),
                  modelId: this.modelId
                }
              });
              break;
            case "session.error":
              unsubscribe();
              session.destroy().catch(() => {
              });
              if ("message" in event.data) {
                reject(mapCopilotError(new Error(event.data.message)));
              } else {
                reject(mapCopilotError(new Error("Unknown session error")));
              }
              break;
          }
        });
        session.send({ prompt }).catch((error) => {
          unsubscribe();
          session.destroy().catch(() => {
          });
          reject(mapCopilotError(error));
        });
      });
    } finally {
      this.releaseClient();
    }
  }
  async doStream(options) {
    const ctx = createRequestContext(this.modelId);
    this.logger.info(`[${ctx.requestId}] Starting doStream for ${this.modelId}`);
    const warnings = [];
    let structuredOutputAppend;
    if (options.responseFormat?.type === "json" && options.responseFormat.schema) {
      const structuredResult = processStructuredOutput({
        hasSchema: true,
        schema: options.responseFormat.schema,
        name: options.responseFormat.name,
        description: options.responseFormat.description
      });
      warnings.push(...structuredResult.warnings);
      structuredOutputAppend = structuredResult.systemMessageAppend;
    }
    const callOptions = options.providerOptions?.copilot;
    const client = await this.ensureClient();
    const session = await this.ensureSession(client, true, callOptions, structuredOutputAppend, options.tools);
    if (options.toolChoice) {
      const toolChoiceResult = mapToolChoiceToCopilotFormat(options.toolChoice);
      if (!toolChoiceResult.supported && toolChoiceResult.warning) {
        warnings.push({
          type: "unsupported",
          feature: "toolChoice",
          details: toolChoiceResult.warning
        });
      }
    }
    const prompt = mapPromptToCopilotFormat(options.prompt);
    const context = createStreamContext(warnings);
    const modelId = this.modelId;
    const logger = this.logger;
    const releaseClient = () => this.releaseClient();
    let abortListener;
    const stream = new ReadableStream({
      start: (controller) => {
        if (options.abortSignal) {
          if (options.abortSignal.aborted) {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            releaseClient();
            controller.error(abortError);
            return;
          }
          abortListener = () => {
            session.abort().catch(() => {
            });
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            controller.error(abortError);
          };
          options.abortSignal.addEventListener("abort", abortListener, { once: true });
        }
        controller.enqueue({
          type: "stream-start",
          warnings: context.warnings
        });
        const unsubscribe = session.on((event) => {
          try {
            if (options.abortSignal?.aborted) return;
            switch (event.type) {
              case "assistant.message_delta":
              case "assistant.message":
              case "assistant.reasoning_delta":
              case "assistant.reasoning":
              case "assistant.usage":
              case "assistant.turn_start": {
                const parts = mapEventToStreamParts(event, context);
                for (const part of parts) {
                  controller.enqueue(part);
                }
                break;
              }
              case "assistant.turn_end": {
                if (context.textStarted && context.textBlockId) {
                  controller.enqueue({ type: "text-end", id: context.textBlockId });
                }
                if (context.reasoningStarted && context.reasoningBlockId) {
                  controller.enqueue({ type: "reasoning-end", id: context.reasoningBlockId });
                }
                controller.enqueue({
                  type: "response-metadata",
                  id: event.id,
                  timestamp: new Date(event.timestamp),
                  modelId
                });
                controller.enqueue({
                  type: "finish",
                  finishReason: mapFinishReason(void 0, context.hasToolCalls),
                  usage: context.usage ?? getDefaultUsage()
                });
                unsubscribe();
                if (options.abortSignal && abortListener) {
                  options.abortSignal.removeEventListener("abort", abortListener);
                }
                session.destroy().catch(() => {
                });
                releaseClient();
                logger.info(`[${ctx.requestId}] doStream completed`);
                controller.close();
                break;
              }
              case "session.error": {
                const errorMessage = "message" in event.data ? event.data.message : "Unknown session error";
                controller.enqueue({ type: "error", error: new Error(errorMessage) });
                const errorType = event.data.errorType;
                if (errorType === "fatal") {
                  unsubscribe();
                  if (options.abortSignal && abortListener) {
                    options.abortSignal.removeEventListener("abort", abortListener);
                  }
                  session.destroy().catch(() => {
                  });
                  releaseClient();
                  logger.error(`[${ctx.requestId}] doStream failed: ${errorMessage}`);
                  controller.error(mapCopilotError(new Error(errorMessage)));
                }
                break;
              }
              case "abort": {
                unsubscribe();
                if (options.abortSignal && abortListener) {
                  options.abortSignal.removeEventListener("abort", abortListener);
                }
                const reason = event.data.reason;
                const abortError = new Error(reason || "Request aborted");
                abortError.name = "AbortError";
                session.destroy().catch(() => {
                });
                releaseClient();
                controller.error(abortError);
                break;
              }
            }
          } catch (error) {
            unsubscribe();
            if (options.abortSignal && abortListener) {
              options.abortSignal.removeEventListener("abort", abortListener);
            }
            session.destroy().catch(() => {
            });
            releaseClient();
            logger.error(`[${ctx.requestId}] doStream error: ${error}`);
            controller.error(mapCopilotError(error));
          }
        });
        session.send({ prompt }).catch((error) => {
          unsubscribe();
          if (options.abortSignal && abortListener) {
            options.abortSignal.removeEventListener("abort", abortListener);
          }
          session.destroy().catch(() => {
          });
          releaseClient();
          logger.error(`[${ctx.requestId}] doStream send failed: ${error}`);
          controller.error(mapCopilotError(error));
        });
      },
      cancel: () => {
        if (options.abortSignal && abortListener) {
          options.abortSignal.removeEventListener("abort", abortListener);
        }
        session.abort().catch(() => {
        });
        session.destroy().catch(() => {
        });
        releaseClient();
      }
    });
    return {
      stream,
      request: { body: prompt }
    };
  }
  /**
   * Cleanup resources.
   * Call this when you're done using the model to free up CLI resources.
   * Note: If using a shared client manager from provider, use provider.dispose() instead.
   */
  async dispose() {
    if (this.session) {
      await this.session.destroy();
      this.session = void 0;
    }
    if (this.client) {
      await this.client.stop();
      this.client = void 0;
    }
  }
};
function resolveCliPath() {
  if (process.platform !== "win32") {
    return void 0;
  }
  try {
    const globalPath = child_process.execSync("npm root -g", { encoding: "utf-8" }).trim();
    const jsPath = path.join(globalPath, "@github", "copilot", "index.js");
    if (fs.existsSync(jsPath)) {
      return jsPath;
    }
  } catch {
  }
  return void 0;
}
var ClientManager = class {
  constructor(options) {
    this.referenceCount = 0;
    this.state = "disconnected";
    this.options = options;
    this.logger = getLogger(options.logger, options.verbose);
  }
  /**
   * Gets or creates a shared CopilotClient instance.
   * Increments reference count.
   * 
   * @returns The shared CopilotClient instance
   * @throws Error if the manager is disposing
   */
  async acquire() {
    if (this.state === "disposing") {
      throw new Error("ClientManager is disposing, cannot acquire new client");
    }
    this.referenceCount++;
    this.logger.debug(`Acquiring client (refs: ${this.referenceCount})`);
    if (this.client) {
      return this.client;
    }
    if (!this.clientPromise) {
      this.clientPromise = this.createClient();
    }
    return this.clientPromise;
  }
  /**
   * Releases a reference to the client.
   * When reference count reaches zero, client is not immediately destroyed
   * (allows reuse). Call dispose() for immediate cleanup.
   */
  release() {
    this.referenceCount = Math.max(0, this.referenceCount - 1);
    this.logger.debug(`Releasing client (refs: ${this.referenceCount})`);
  }
  /**
   * Disposes all resources, stopping the client if active.
   * Uses retry with exponential backoff for graceful cleanup.
   */
  async dispose() {
    if (this.state === "disposing") return;
    this.state = "disposing";
    this.logger.debug("Disposing ClientManager");
    if (this.client) {
      try {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const errors = await this.client.stop();
            if (errors.length > 0) {
              this.logger.warn(
                `Errors during client stop: ${errors.map((e) => e.message).join(", ")}`
              );
            }
            break;
          } catch (error) {
            if (attempt < 3) {
              const delay = 100 * Math.pow(2, attempt - 1);
              this.logger.debug(`Stop attempt ${attempt} failed, retrying in ${delay}ms`);
              await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error stopping client: ${error}`);
      }
      this.client = void 0;
    }
    this.clientPromise = void 0;
    this.referenceCount = 0;
    this.state = "disconnected";
  }
  /**
   * Returns current connection state.
   */
  getState() {
    return this.state;
  }
  /**
   * Returns current reference count.
   * Useful for debugging and testing.
   */
  getReferenceCount() {
    return this.referenceCount;
  }
  /**
   * Checks if the manager has an active client.
   */
  isConnected() {
    return this.state === "connected" && !!this.client;
  }
  async createClient() {
    this.state = "connecting";
    this.logger.info("Creating new CopilotClient");
    try {
      const effectiveCliPath = this.options.cliPath ?? resolveCliPath();
      const clientOptions = {
        cliPath: effectiveCliPath,
        cliUrl: this.options.cliUrl,
        cwd: this.options.cwd,
        cliArgs: this.options.cliArgs,
        useStdio: this.options.useStdio,
        env: this.options.env,
        logLevel: this.options.logLevel ?? "info"
      };
      this.client = new copilotSdk.CopilotClient(clientOptions);
      await this.client.start();
      this.state = "connected";
      this.logger.info("CopilotClient connected");
      return this.client;
    } catch (error) {
      this.state = "error";
      this.client = void 0;
      this.clientPromise = void 0;
      throw error;
    }
  }
};
function createClientManager(options) {
  return new ClientManager(options);
}

// src/copilot-provider.ts
function createCopilotProvider(options = {}) {
  const logger = getLogger(options.logger, options.verbose);
  logger.info("Creating Copilot provider");
  if (options.cliPath && options.cliUrl) {
    throw new Error("cliPath and cliUrl are mutually exclusive. Specify only one.");
  }
  if (options.mcpServers) {
    for (const [name, config] of Object.entries(options.mcpServers)) {
      const validation = validateMcpConfig(name, config);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }
  }
  if (options.customAgents) {
    validateAgentConfigs(options.customAgents);
  }
  const clientManager = createClientManager(options);
  const createLanguageModel = (modelId, settings) => {
    if (isAgentModelId(modelId)) {
      resolveAgent(modelId, options.customAgents);
    }
    return new CopilotLanguageModel({
      modelId,
      providerOptions: options,
      settings,
      clientManager,
      logger
    });
  };
  const dispose = async () => {
    logger.info("Disposing provider");
    await clientManager.dispose();
  };
  const provider$1 = Object.assign(
    function(modelId, settings) {
      if (new.target) {
        throw new Error(
          "The provider function cannot be called with the new keyword."
        );
      }
      return createLanguageModel(modelId, settings);
    },
    {
      specificationVersion: "v3",
      languageModel: createLanguageModel,
      chat: createLanguageModel,
      embeddingModel: (modelId) => {
        throw new provider.NoSuchModelError({
          modelId,
          modelType: "embeddingModel",
          message: `Copilot provider does not support embedding models.`
        });
      },
      imageModel: (modelId) => {
        throw new provider.NoSuchModelError({
          modelId,
          modelType: "imageModel",
          message: `Copilot provider does not support image models.`
        });
      },
      dispose
    }
  );
  return provider$1;
}

// src/observability/tracing.ts
var traceApi;
async function getTraceApi() {
  if (!traceApi) {
    try {
      traceApi = await import('./esm-B352X2XJ.cjs');
    } catch {
    }
  }
  return traceApi;
}
var GEN_AI_ATTRIBUTES = {
  SYSTEM: "gen_ai.system",
  REQUEST_MODEL: "gen_ai.request.model",
  REQUEST_MAX_TOKENS: "gen_ai.request.max_tokens",
  REQUEST_TEMPERATURE: "gen_ai.request.temperature",
  REQUEST_TOP_P: "gen_ai.request.top_p",
  RESPONSE_FINISH_REASONS: "gen_ai.response.finish_reasons",
  USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
  USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  // Copilot-specific attributes
  SESSION_ID: "copilot.session.id",
  STREAMING: "copilot.streaming",
  TOOL_COUNT: "copilot.tool_count"
};
function createTracer(config) {
  const serviceName = config.serviceName ?? "copilot-ai-sdk-provider";
  return {
    /**
     * Starts a span for a generation operation.
     *
     * @param options - Span options including operation type and attributes
     * @returns A span handle with helper methods
     */
    async startGenerationSpan(options) {
      const api = await getTraceApi();
      if (!api || !config.tracerProvider) {
        return {
          span: null,
          setSessionId: () => {
          },
          recordUsage: () => {
          },
          recordFinishReason: () => {
          },
          recordError: () => {
          },
          end: () => {
          }
        };
      }
      const tracerProvider = config.tracerProvider;
      const tracer = tracerProvider.getTracer(serviceName, "1.0.0");
      const span = tracer.startSpan(`copilot.${options.operation}`, {
        kind: api.SpanKind.CLIENT,
        attributes: {
          [GEN_AI_ATTRIBUTES.SYSTEM]: "copilot",
          [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: options.modelId,
          [GEN_AI_ATTRIBUTES.STREAMING]: options.streaming ?? false,
          ...options.maxTokens !== void 0 && {
            [GEN_AI_ATTRIBUTES.REQUEST_MAX_TOKENS]: options.maxTokens
          },
          ...options.temperature !== void 0 && {
            [GEN_AI_ATTRIBUTES.REQUEST_TEMPERATURE]: options.temperature
          },
          ...options.topP !== void 0 && {
            [GEN_AI_ATTRIBUTES.REQUEST_TOP_P]: options.topP
          },
          ...options.toolCount !== void 0 && {
            [GEN_AI_ATTRIBUTES.TOOL_COUNT]: options.toolCount
          }
        }
      });
      return {
        span,
        setSessionId(sessionId) {
          span.setAttribute(GEN_AI_ATTRIBUTES.SESSION_ID, sessionId);
        },
        recordUsage(inputTokens, outputTokens) {
          if (inputTokens !== void 0) {
            span.setAttribute(GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS, inputTokens);
          }
          if (outputTokens !== void 0) {
            span.setAttribute(GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS, outputTokens);
          }
        },
        recordFinishReason(reason) {
          span.setAttribute(GEN_AI_ATTRIBUTES.RESPONSE_FINISH_REASONS, [reason]);
        },
        recordError(error) {
          span.recordException(error);
          span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
        },
        end() {
          span.end();
        }
      };
    }
  };
}

// src/observability/metrics.ts
var metricsApi;
async function getMetricsApi() {
  if (!metricsApi) {
    try {
      metricsApi = await import('./esm-B352X2XJ.cjs');
    } catch {
    }
  }
  return metricsApi;
}
var METRIC_NAMES = {
  REQUEST_DURATION: "copilot.request.duration",
  REQUEST_COUNT: "copilot.request.count",
  TOKEN_INPUT: "copilot.token.input",
  TOKEN_OUTPUT: "copilot.token.output",
  ERROR_COUNT: "copilot.error.count",
  SESSION_ACTIVE: "copilot.session.active",
  SESSION_REUSED: "copilot.session.reused"
};
function createMetrics(config) {
  const serviceName = config.serviceName ?? "copilot-ai-sdk-provider";
  let meter;
  let requestDuration;
  let requestCount;
  let tokenInputCount;
  let tokenOutputCount;
  let errorCount;
  async function ensureInitialized() {
    if (meter) return true;
    const api = await getMetricsApi();
    if (!api || !config.meterProvider) return false;
    const meterProvider = config.meterProvider;
    meter = meterProvider.getMeter(serviceName, "1.0.0");
    requestDuration = meter.createHistogram(METRIC_NAMES.REQUEST_DURATION, {
      unit: "ms",
      description: "Duration of LLM requests"
    });
    requestCount = meter.createCounter(METRIC_NAMES.REQUEST_COUNT, {
      description: "Total number of LLM requests"
    });
    tokenInputCount = meter.createCounter(METRIC_NAMES.TOKEN_INPUT, {
      description: "Total input tokens consumed"
    });
    tokenOutputCount = meter.createCounter(METRIC_NAMES.TOKEN_OUTPUT, {
      description: "Total output tokens generated"
    });
    errorCount = meter.createCounter(METRIC_NAMES.ERROR_COUNT, {
      description: "Total errors encountered"
    });
    return true;
  }
  return {
    /**
     * Records a completed request with latency and token usage.
     *
     * @param options - Request recording options
     */
    async recordRequest(options) {
      if (!await ensureInitialized()) return;
      const attributes = {
        model: options.modelId,
        operation: options.operation,
        success: String(options.success)
      };
      requestDuration?.record(options.durationMs, attributes);
      requestCount?.add(1, attributes);
      if (options.inputTokens !== void 0) {
        tokenInputCount?.add(options.inputTokens, { model: options.modelId });
      }
      if (options.outputTokens !== void 0) {
        tokenOutputCount?.add(options.outputTokens, { model: options.modelId });
      }
      if (!options.success && options.errorCategory) {
        errorCount?.add(1, {
          model: options.modelId,
          category: options.errorCategory
        });
      }
    }
  };
}

// src/pool/session-pool.ts
var DEFAULT_POOL_CONFIG = {
  enabled: false,
  maxIdleSessions: 3,
  idleTimeoutMs: 3e5,
  // 5 minutes
  validateBeforeReuse: true
};
function hashConfig(config) {
  const normalized = JSON.stringify(config, Object.keys(config).sort());
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
var noopLogger3 = {
  debug: () => {
  },
  info: () => {
  },
  warn: () => {
  },
  error: () => {
  }
};
var SessionPool = class {
  constructor(config = {}, logger) {
    this.pool = [];
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.logger = logger ?? noopLogger3;
    if (this.config.enabled) {
      this.startCleanupTimer();
    }
  }
  /**
   * Attempts to acquire a session from the pool.
   * Returns null if no matching session available.
   *
   * @param sessionConfig - Configuration to match against pooled sessions
   * @returns A matching session or null
   */
  acquire(sessionConfig) {
    if (!this.config.enabled) return null;
    const configHash = hashConfig(sessionConfig);
    const now = Date.now();
    const index = this.pool.findIndex(
      (ps) => ps.configHash === configHash && now - ps.lastUsed < this.config.idleTimeoutMs
    );
    if (index === -1) {
      this.logger.debug("[pool] No matching session found");
      return null;
    }
    const pooled = this.pool.splice(index, 1)[0];
    pooled.useCount++;
    pooled.lastUsed = now;
    this.logger.debug(`[pool] Reusing session (use count: ${pooled.useCount})`);
    return pooled.session;
  }
  /**
   * Returns a session to the pool for potential reuse.
   *
   * @param session - The session to release
   * @param sessionConfig - Configuration of the session
   */
  release(session, sessionConfig) {
    if (!this.config.enabled) return;
    const configHash = hashConfig(sessionConfig);
    if (this.pool.length >= this.config.maxIdleSessions) {
      const oldest = this.pool.reduce(
        (min, ps) => ps.lastUsed < min.lastUsed ? ps : min
      );
      this.evict(oldest);
    }
    this.pool.push({
      session,
      configHash,
      lastUsed: Date.now(),
      useCount: 0
    });
    this.logger.debug(`[pool] Session released (pool size: ${this.pool.length})`);
  }
  /**
   * Gets current pool statistics.
   */
  getStats() {
    return {
      size: this.pool.length,
      maxSize: this.config.maxIdleSessions
    };
  }
  /**
   * Disposes all pooled sessions.
   */
  async dispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = void 0;
    }
    const sessions = this.pool.splice(0);
    this.logger.debug(`[pool] Disposing ${sessions.length} pooled sessions`);
    await Promise.all(
      sessions.map((ps) => this.destroySession(ps.session).catch(() => {
      }))
    );
  }
  startCleanupTimer() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 6e4);
  }
  cleanup() {
    const now = Date.now();
    const expired = this.pool.filter(
      (ps) => now - ps.lastUsed >= this.config.idleTimeoutMs
    );
    if (expired.length > 0) {
      this.logger.debug(`[pool] Cleaning up ${expired.length} expired sessions`);
      expired.forEach((ps) => this.evict(ps));
    }
  }
  evict(pooled) {
    const index = this.pool.indexOf(pooled);
    if (index !== -1) {
      this.pool.splice(index, 1);
      this.destroySession(pooled.session).catch(() => {
      });
    }
  }
  async destroySession(session) {
    try {
      await session.destroy();
    } catch (error) {
      this.logger.warn(`[pool] Error destroying session: ${error}`);
    }
  }
};

// src/pool/health-monitor.ts
var DEFAULT_HEALTH_CONFIG = {
  failureThreshold: 3,
  failureWindowMs: 6e4,
  // 1 minute
  reconnectBaseDelayMs: 1e3
};
var noopLogger4 = {
  debug: () => {
  },
  info: () => {
  },
  warn: () => {
  },
  error: () => {
  }
};
var HealthMonitor = class {
  constructor(config = {}, logger) {
    this.failures = [];
    this.healthy = true;
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
    this.logger = logger ?? noopLogger4;
  }
  /**
   * Records a successful operation.
   * Clears failure counts and restores healthy status.
   */
  recordSuccess() {
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
    if (!this.healthy) {
      this.healthy = true;
      this.logger.info("[health] Connection restored");
      this.config.onHealthChange?.(true, "recovered");
    }
  }
  /**
   * Records a failed operation.
   * Updates the sliding window and may mark as unhealthy.
   *
   * @param error - The error that occurred
   */
  recordFailure(error) {
    const now = Date.now();
    this.failures.push({ timestamp: now, error: error.message });
    this.failures = this.failures.filter(
      (f) => now - f.timestamp < this.config.failureWindowMs
    );
    this.consecutiveFailures++;
    if (this.failures.length >= this.config.failureThreshold && this.healthy) {
      this.healthy = false;
      this.logger.warn(
        `[health] Marked unhealthy after ${this.failures.length} failures`
      );
      this.config.onHealthChange?.(false, `${this.failures.length} failures in window`);
    }
  }
  /**
   * Returns whether the connection is considered healthy.
   */
  isHealthy() {
    return this.healthy;
  }
  /**
   * Gets the delay before next reconnection attempt.
   * Uses exponential backoff with jitter.
   *
   * @returns Delay in milliseconds
   */
  getReconnectDelay() {
    const baseDelay = this.config.reconnectBaseDelayMs;
    const exponential = baseDelay * Math.pow(2, this.reconnectAttempts);
    const maxDelay = 3e4;
    const delay = Math.min(exponential, maxDelay);
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    this.reconnectAttempts++;
    return Math.round(delay + jitter);
  }
  /**
   * Resets reconnection attempt counter.
   */
  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }
  /**
   * Gets current health status.
   */
  getStatus() {
    return {
      healthy: this.healthy,
      failureCount: this.failures.length,
      consecutiveFailures: this.consecutiveFailures,
      reconnectAttempts: this.reconnectAttempts
    };
  }
  /**
   * Resets all state to initial values.
   */
  reset() {
    this.failures = [];
    this.healthy = true;
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
  }
};

// src/testing/mock-session.ts
function createMockEvent(type, id, data) {
  return {
    type,
    id,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    parentId: null,
    data
  };
}
function createMockSession(options = {}) {
  const listeners = /* @__PURE__ */ new Set();
  let destroyed = false;
  const emit = (event) => {
    if (destroyed) return;
    listeners.forEach((handler) => handler(event));
  };
  const session = {
    sessionId: options.sessionId ?? "mock-session-id",
    on(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    async send(_messageOptions) {
      if (destroyed) {
        throw new Error("Session destroyed");
      }
      if (options.sendError) {
        throw options.sendError;
      }
      if (options.responseDelay) {
        await new Promise((r) => setTimeout(r, options.responseDelay));
      }
      emit(createMockEvent("assistant.turn_start", "mock-turn", { turnId: "mock-turn" }));
      if (options.toolCalls) {
        for (const toolCall of options.toolCalls) {
          emit(createMockEvent("tool.execution_start", `tool-start-${toolCall.toolName}`, {
            toolCallId: `mock-tool-call-${toolCall.toolName}`,
            toolName: toolCall.toolName
          }));
          emit(createMockEvent("tool.execution_complete", `tool-complete-${toolCall.toolName}`, {
            toolCallId: `mock-tool-call-${toolCall.toolName}`,
            success: true
          }));
        }
      }
      if (options.generateResponse) {
        if (options.streamingDelay) {
          const words = options.generateResponse.split(" ");
          for (let i = 0; i < words.length; i++) {
            await new Promise((r) => setTimeout(r, options.streamingDelay));
            const content = words[i] + (i < words.length - 1 ? " " : "");
            emit(createMockEvent("assistant.message_delta", "mock-delta", {
              messageId: "mock-message",
              deltaContent: content
            }));
          }
        }
        emit(createMockEvent("assistant.message", "mock-message", {
          messageId: "mock-message",
          content: options.generateResponse
        }));
      }
      emit({
        type: "assistant.usage",
        id: "mock-usage",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        parentId: null,
        ephemeral: true,
        data: {
          inputTokens: options.usage?.inputTokens ?? 10,
          outputTokens: options.usage?.outputTokens ?? 20
        }
      });
      emit(createMockEvent("assistant.turn_end", "mock-turn-end", { turnId: "mock-turn" }));
      return options.generateResponse ?? "";
    },
    async abort() {
      emit(createMockEvent("abort", "mock-abort", { reason: "User requested abort" }));
    },
    async destroy() {
      destroyed = true;
      listeners.clear();
    },
    async getMessages() {
      return [];
    },
    // Test helpers
    _testing: {
      emit,
      getListenerCount: () => listeners.size,
      isDestroyed: () => destroyed
    }
  };
  return session;
}

// src/testing/mock-client.ts
function createMockClient(options = {}) {
  let state = options.initialState ?? "connected";
  let startCalled = false;
  const sessions = [];
  const client = {
    async start() {
      if (options.startSucceeds === false || options.startError) {
        if (options.startError) {
          throw options.startError;
        }
        throw new Error("Mock start failed");
      }
      state = "connected";
      startCalled = true;
    },
    async stop() {
      state = "disconnected";
      const errors = [];
      for (const session of sessions) {
        try {
          await session.destroy();
        } catch (e) {
          errors.push(e);
        }
      }
      return errors;
    },
    async forceStop() {
      state = "disconnected";
      sessions.length = 0;
    },
    async createSession(config) {
      if (state !== "connected") {
        throw new Error("Client not connected");
      }
      const session = createMockSession({
        ...options.sessionOptions,
        sessionId: config.sessionId,
        model: config.model
      });
      sessions.push(session);
      return session;
    },
    getState() {
      return state;
    },
    // Test helpers
    _testing: {
      getStartCalled: () => startCalled,
      getSessionCount: () => sessions.length,
      setState: (newState) => {
        state = newState;
      },
      getSessions: () => sessions
    }
  };
  return client;
}

Object.defineProperty(exports, "DEFAULT_CACHE_CONFIG", {
  enumerable: true,
  get: function () { return chunkFUZCJ4SC_cjs.DEFAULT_CACHE_CONFIG; }
});
Object.defineProperty(exports, "DEFAULT_MEMORY_CACHE_OPTIONS", {
  enumerable: true,
  get: function () { return chunkFUZCJ4SC_cjs.DEFAULT_MEMORY_CACHE_OPTIONS; }
});
Object.defineProperty(exports, "createMemoryCache", {
  enumerable: true,
  get: function () { return chunkFUZCJ4SC_cjs.createMemoryCache; }
});
Object.defineProperty(exports, "createNoopCache", {
  enumerable: true,
  get: function () { return chunkFUZCJ4SC_cjs.createNoopCache; }
});
Object.defineProperty(exports, "generateCacheKey", {
  enumerable: true,
  get: function () { return chunkFUZCJ4SC_cjs.generateCacheKey; }
});
Object.defineProperty(exports, "hashPrompt", {
  enumerable: true,
  get: function () { return chunkFUZCJ4SC_cjs.hashPrompt; }
});
Object.defineProperty(exports, "wrapWithCache", {
  enumerable: true,
  get: function () { return chunkFUZCJ4SC_cjs.wrapWithCache; }
});
Object.defineProperty(exports, "DEFAULT_PROPAGATION_CONFIG", {
  enumerable: true,
  get: function () { return chunkVHYCCVHD_cjs.DEFAULT_PROPAGATION_CONFIG; }
});
Object.defineProperty(exports, "createPropagator", {
  enumerable: true,
  get: function () { return chunkVHYCCVHD_cjs.createPropagator; }
});
exports.ClientManager = ClientManager;
exports.CopilotLanguageModel = CopilotLanguageModel;
exports.DEFAULT_HEALTH_CONFIG = DEFAULT_HEALTH_CONFIG;
exports.DEFAULT_POOL_CONFIG = DEFAULT_POOL_CONFIG;
exports.DEFAULT_RETRY_OPTIONS = DEFAULT_RETRY_OPTIONS;
exports.GEN_AI_ATTRIBUTES = GEN_AI_ATTRIBUTES;
exports.HealthMonitor = HealthMonitor;
exports.METRIC_NAMES = METRIC_NAMES;
exports.SessionPool = SessionPool;
exports.buildAgentSystemMessage = buildAgentSystemMessage;
exports.calculateDelay = calculateDelay;
exports.classifyError = classifyError;
exports.cleanJsonSchema = cleanJsonSchema;
exports.createAbortError = createAbortError;
exports.createClientManager = createClientManager;
exports.createCopilotAPIError = createCopilotAPIError;
exports.createCopilotProvider = createCopilotProvider;
exports.createMetrics = createMetrics;
exports.createMockClient = createMockClient;
exports.createMockSession = createMockSession;
exports.createReasoningContent = createReasoningContent;
exports.createReasoningContext = createReasoningContext;
exports.createRequestContext = createRequestContext;
exports.createRetryable = createRetryable;
exports.createStreamContext = createStreamContext;
exports.createTracer = createTracer;
exports.createVerboseLogger = createVerboseLogger;
exports.extractAgentName = extractAgentName;
exports.extractFunctionTools = extractFunctionTools;
exports.extractLatestUserMessage = extractLatestUserMessage;
exports.formatWithContext = formatWithContext;
exports.getAgentModelId = getAgentModelId;
exports.getDefaultUsage = getDefaultUsage;
exports.getLogger = getLogger;
exports.getRecoveryHint = getRecoveryHint;
exports.isAgentModelId = isAgentModelId;
exports.isErrorCategory = isErrorCategory;
exports.isFunctionTool = isFunctionTool;
exports.isRetryableError = isRetryableError;
exports.mapCopilotError = mapCopilotError;
exports.mapEventToStreamParts = mapEventToStreamParts;
exports.mapFinishReason = mapFinishReason;
exports.mapPromptToCopilotFormat = mapPromptToCopilotFormat;
exports.mapReasoningEventToStreamParts = mapReasoningEventToStreamParts;
exports.mapToolChoiceToCopilotFormat = mapToolChoiceToCopilotFormat;
exports.mapToolsToCopilotFormat = mapToolsToCopilotFormat;
exports.mapToolsWithHandlers = mapToolsWithHandlers;
exports.mapUsageEvent = mapUsageEvent;
exports.mergeMcpConfigs = mergeMcpConfigs;
exports.mergeRetryOptions = mergeRetryOptions;
exports.parseJsonResponse = parseJsonResponse;
exports.processStructuredOutput = processStructuredOutput;
exports.resolveAgent = resolveAgent;
exports.shouldRetry = shouldRetry;
exports.validateAgentConfigs = validateAgentConfigs;
exports.validateMcpConfig = validateMcpConfig;
exports.withRetry = withRetry;
exports.withTiming = withTiming;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map