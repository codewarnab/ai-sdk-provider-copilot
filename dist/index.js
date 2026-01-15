// src/copilot-provider.ts
import { NoSuchModelError } from "@ai-sdk/provider";

// src/copilot-language-model.ts
import {
  CopilotClient
} from "@github/copilot-sdk";

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

// src/error.ts
import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";
function mapCopilotError(error) {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return error;
    }
    const message = error.message.toLowerCase();
    if (message.includes("unauthorized") || message.includes("authentication") || message.includes("api key") || message.includes("credentials") || message.includes("not authenticated") || message.includes("login required")) {
      return new LoadAPIKeyError({ message: error.message });
    }
    if (message.includes("rate limit") || message.includes("quota") || message.includes("too many requests")) {
      return new APICallError({
        url: "copilot://cli",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: {},
        message: error.message,
        isRetryable: true
      });
    }
    if (message.includes("connection") || message.includes("econnrefused") || message.includes("enotfound") || message.includes("timeout") || message.includes("network")) {
      return new APICallError({
        url: "copilot://cli",
        requestBodyValues: {},
        statusCode: 503,
        responseHeaders: {},
        message: error.message,
        isRetryable: true
      });
    }
    if (message.includes("cli not found") || message.includes("spawn") || message.includes("process") || message.includes("executable")) {
      return new APICallError({
        url: "copilot://cli",
        requestBodyValues: {},
        statusCode: 500,
        responseHeaders: {},
        message: `Copilot CLI error: ${error.message}. Ensure the Copilot CLI is installed and accessible.`,
        isRetryable: false
      });
    }
    if (message.includes("session")) {
      return new APICallError({
        url: "copilot://cli",
        requestBodyValues: {},
        statusCode: 400,
        responseHeaders: {},
        message: error.message,
        isRetryable: false
      });
    }
    if (message.includes("model") && message.includes("not found")) {
      return new APICallError({
        url: "copilot://cli",
        requestBodyValues: {},
        statusCode: 404,
        responseHeaders: {},
        message: error.message,
        isRetryable: false
      });
    }
    return new APICallError({
      url: "copilot://cli",
      requestBodyValues: {},
      statusCode: 500,
      responseHeaders: {},
      message: error.message,
      isRetryable: true
    });
  }
  return new APICallError({
    url: "copilot://cli",
    requestBodyValues: {},
    statusCode: 500,
    responseHeaders: {},
    message: "An unknown error occurred",
    isRetryable: true
  });
}
function isRetryableError(error) {
  if (error instanceof APICallError) {
    return error.isRetryable ?? false;
  }
  return false;
}
function createAbortError(message = "Request was aborted") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

// src/event-mapper.ts
import { randomUUID } from "crypto";
function createStreamContext(warnings = []) {
  return {
    textStarted: false,
    reasoningStarted: false,
    warnings
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
        context.textBlockId = messageId || randomUUID();
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
      break;
    }
    case "assistant.reasoning_delta": {
      const reasoningId = event.data.reasoningId;
      const deltaContent = event.data.deltaContent;
      if (!context.reasoningStarted) {
        context.reasoningBlockId = reasoningId || randomUUID();
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
function mapFinishReason(rawReason) {
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

// src/copilot-language-model.ts
var CopilotLanguageModel = class {
  constructor(options) {
    this.options = options;
    this.specificationVersion = "v3";
    this.provider = "copilot";
    this.supportedUrls = {};
    this.modelId = options.modelId;
  }
  /**
   * Ensures a client exists, creating one if necessary.
   */
  ensureClient() {
    if (!this.client) {
      this.client = new CopilotClient({
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
   * Ensures a session exists, creating one if necessary.
   */
  async ensureSession(streaming = false) {
    const client = this.ensureClient();
    const session = await client.createSession({
      model: this.modelId,
      provider: this.options.providerOptions.provider,
      systemMessage: this.options.settings?.systemMessage,
      availableTools: this.options.settings?.availableTools,
      excludedTools: this.options.settings?.excludedTools,
      streaming
    });
    return session;
  }
  async doGenerate(options) {
    const session = await this.ensureSession(false);
    const warnings = [];
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
    return new Promise((resolve, reject) => {
      const content = [];
      let usage;
      let finishReason;
      let responseId;
      let responseTimestamp;
      const textParts = [];
      const unsubscribe = session.on((event) => {
        switch (event.type) {
          case "assistant.message":
            if ("content" in event.data && typeof event.data.content === "string") {
              textParts.push(event.data.content);
            }
            responseId = event.id;
            responseTimestamp = new Date(event.timestamp);
            break;
          case "turn.end":
            unsubscribe();
            if (textParts.length > 0) {
              content.push({ type: "text", text: textParts.join("") });
            }
            finishReason = { unified: "stop", raw: "complete" };
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
  }
  async doStream(options) {
    const session = await this.ensureSession(true);
    const warnings = [];
    const prompt = mapPromptToCopilotFormat(options.prompt);
    const context = createStreamContext(warnings);
    const modelId = this.modelId;
    let abortListener;
    const stream = new ReadableStream({
      start: (controller) => {
        if (options.abortSignal) {
          if (options.abortSignal.aborted) {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
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
              case "turn.end": {
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
                  finishReason: mapFinishReason(),
                  usage: context.usage ?? getDefaultUsage()
                });
                unsubscribe();
                if (options.abortSignal && abortListener) {
                  options.abortSignal.removeEventListener("abort", abortListener);
                }
                session.destroy().catch(() => {
                });
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
   */
  async dispose() {
    if (this.session) {
      await this.session.destroy();
      this.session = void 0;
      this.sessionPromise = void 0;
    }
    if (this.client) {
      await this.client.stop();
      this.client = void 0;
    }
  }
};

// src/copilot-provider.ts
function createCopilotProvider(options = {}) {
  const createLanguageModel = (modelId, settings) => {
    return new CopilotLanguageModel({
      modelId,
      providerOptions: options,
      settings
    });
  };
  const provider = Object.assign(
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
        throw new NoSuchModelError({
          modelId,
          modelType: "embeddingModel",
          message: `Copilot provider does not support embedding models.`
        });
      },
      imageModel: (modelId) => {
        throw new NoSuchModelError({
          modelId,
          modelType: "imageModel",
          message: `Copilot provider does not support image models.`
        });
      }
    }
  );
  return provider;
}
export {
  CopilotLanguageModel,
  createAbortError,
  createCopilotProvider,
  createStreamContext,
  extractLatestUserMessage,
  getDefaultUsage,
  isRetryableError,
  mapCopilotError,
  mapEventToStreamParts,
  mapFinishReason,
  mapPromptToCopilotFormat,
  mapUsageEvent
};
//# sourceMappingURL=index.js.map