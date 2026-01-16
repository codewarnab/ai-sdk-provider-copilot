# Copilot SDK Types Migration Report

## Summary

The `@github/copilot-sdk` package **now ships with proper TypeScript declaration files (`.d.ts`)**. The custom type declarations in `copilot-sdk.d.ts` have been removed.

## Changes Made

### 1. Removed Custom Declaration File
- **Deleted:** `src/copilot-sdk.d.ts`
- This file contained manual type declarations that are now provided by the SDK

### 2. Updated tsup Configuration
**File:** `tsup.config.ts`

```diff
- dts: false, // TODO: Enable when @github/copilot-sdk ships proper .d.ts files
+ dts: true,
```

### 3. Fixed Event Type Names
The SDK uses `assistant.turn_end` instead of `turn.end`:

**Files updated:**
- `src/copilot-language-model.ts` - Changed `'turn.end'` to `'assistant.turn_end'`
- `src/testing/mock-session.ts` - Updated mock events
- `src/__tests__/testing/mock-session.test.ts` - Updated test expectations

### 4. Updated Mock Types
The SDK's `CopilotClient` and `CopilotSession` are classes with private members. Created interface types for mocking:

**`src/testing/mock-session.ts`:**
```typescript
export interface CopilotSessionLike {
    readonly sessionId: string;
    on(handler: SessionEventHandler): () => void;
    send(options: MessageOptions): Promise<string>;
    abort(): Promise<void>;
    destroy(): Promise<void>;
    getMessages(): Promise<SessionEvent[]>;
}
```

**`src/testing/mock-client.ts`:**
```typescript
export interface CopilotClientLike {
    start(): Promise<void>;
    stop(): Promise<Error[]>;
    forceStop(): Promise<void>;
    createSession(config?: SessionConfig): Promise<CopilotSessionLike>;
    getState(): ConnectionState;
}
```

### 5. Updated Mock Event Generation
SDK events require:
- `timestamp` as ISO string (not number)
- `parentId: string | null` field
- `ephemeral` field for certain event types

Added helper function:
```typescript
function createMockEvent<T extends SessionEvent['type']>(
    type: T,
    id: string,
    data: Extract<SessionEvent, { type: T }>['data']
): SessionEvent
```

---

## Current State

### Custom Type Declaration File (`src/copilot-sdk.d.ts`)

The provider currently uses a custom module declaration file with the following types:

| Type | Status | Notes |
|------|--------|-------|
| `CopilotClientOptions` | ✅ Available in SDK | Can be removed |
| `SystemMessageConfig` | ✅ Available in SDK | Can be removed |
| `SessionConfig` | ✅ Available in SDK | Can be removed |
| `SessionEvent` | ✅ Available in SDK | Can be removed |
| `SessionEventHandler` | ✅ Available in SDK | Can be removed |
| `MessageOptions` | ✅ Available in SDK | Can be removed |
| `CopilotSession` (class) | ✅ Available in SDK | Can be removed |
| `CopilotClient` (class) | ✅ Available in SDK | Can be removed |
| `ConnectionState` | ✅ Available in SDK | Can be removed |

### tsup Configuration (`tsup.config.ts`)

```typescript
dts: false, // TODO: Enable when @github/copilot-sdk ships proper .d.ts files
```

This can now be changed to `dts: true`.

---

## SDK Exports (from `@github/copilot-sdk`)

The official SDK now exports these types:

### Classes
- `CopilotClient`
- `CopilotSession`

### Functions
- `defineTool`

### Types
- `ConnectionState`
- `CopilotClientOptions`
- `CustomAgentConfig`
- `MCPLocalServerConfig`
- `MCPRemoteServerConfig`
- `MCPServerConfig`
- `MessageOptions`
- `PermissionHandler`
- `PermissionRequest`
- `PermissionRequestResult`
- `ResumeSessionConfig`
- `SessionConfig`
- `SessionEvent`
- `SessionEventHandler`
- `SessionMetadata`
- `SystemMessageAppendConfig`
- `SystemMessageConfig`
- `SystemMessageReplaceConfig`
- `Tool`
- `ToolHandler`
- `ToolInvocation`
- `ToolResultObject`
- `ZodSchema`

---

## Files Using `@github/copilot-sdk` Types

The following files import from `@github/copilot-sdk`:

| File | Imports |
|------|---------|
| `src/types.ts` | `CopilotClientOptions`, `SystemMessageConfig` |
| `src/client-manager.ts` | `CopilotClient`, `CopilotClientOptions` |
| `src/copilot-language-model.ts` | `CopilotClient`, `CopilotSession`, `SessionEvent` |
| `src/event-mapper.ts` | `SessionEvent` |
| `src/reasoning-mapper.ts` | `SessionEvent` |
| `src/pool/session-pool.ts` | `CopilotSession` |
| `src/testing/mock-client.ts` | `CopilotClient`, `CopilotSession`, `SessionConfig`, `ConnectionState` |
| `src/testing/mock-session.ts` | `CopilotSession`, `SessionEvent`, `SessionEventHandler`, `MessageOptions` |
| `src/__tests__/agent-resolver.test.ts` | `CustomAgentConfig` |
| `src/__tests__/mcp-config.test.ts` | `MCPServerConfig`, `MCPLocalServerConfig`, `MCPRemoteServerConfig` |
| `src/__tests__/pool/session-pool.test.ts` | `CopilotSession` |

---

## Type Comparison: Custom vs SDK

### `SessionEvent`

**Custom (simplified):**
```typescript
export interface SessionEvent {
    id: string;
    type: string;
    timestamp: number;  // ❌ Wrong type
    data: Record<string, unknown>;
}
```

**SDK (accurate):**
```typescript
export type SessionEvent = 
  | { id: string; timestamp: string; parentId: string | null; ephemeral?: boolean; type: "session.start"; data: {...} }
  | { id: string; timestamp: string; parentId: string | null; ephemeral?: boolean; type: "session.resume"; data: {...} }
  | { id: string; timestamp: string; parentId: string | null; ephemeral?: boolean; type: "assistant.message"; data: {...} }
  // ... 20+ more event types with discriminated unions
```

**Impact:** The SDK provides a much more accurate discriminated union type with proper `timestamp: string` (not number), `parentId`, and `ephemeral` fields. This enables better type narrowing when handling events.

### `SessionConfig`

**Custom (partial):**
```typescript
export interface SessionConfig {
    sessionId?: string;
    model?: string;
    tools?: unknown[];
    systemMessage?: SystemMessageConfig;
    availableTools?: string[];
    excludedTools?: string[];
    provider?: {...};
    onPermissionRequest?: unknown;  // ❌ Missing proper type
    streaming?: boolean;
    mcpServers?: unknown;  // ❌ Missing proper type
    customAgents?: unknown[];  // ❌ Missing proper type
}
```

**SDK (complete):**
```typescript
export interface SessionConfig {
    sessionId?: string;
    model?: string;
    tools?: Tool<any>[];  // ✅ Proper Tool type
    systemMessage?: SystemMessageConfig;
    availableTools?: string[];
    excludedTools?: string[];
    provider?: ProviderConfig;
    onPermissionRequest?: PermissionHandler;  // ✅ Proper handler type
    streaming?: boolean;
    mcpServers?: Record<string, MCPServerConfig>;  // ✅ Proper MCP types
    customAgents?: CustomAgentConfig[];  // ✅ Proper agent type
}
```

---

## Required Changes

### 1. Delete Custom Declaration File

```
DELETE: src/copilot-sdk.d.ts
```

### 2. Update tsup Configuration

**File:** `tsup.config.ts`

```diff
export default defineConfig({
    entry: ['src/index.ts', 'src/cache/index.ts', 'src/propagation/index.ts'],
    format: ['cjs', 'esm'],
-   dts: false, // TODO: Enable when @github/copilot-sdk ships proper .d.ts files
+   dts: true,
    clean: true,
    sourcemap: true,
    splitting: true,
    treeshake: true,
});
```

### 3. Verify Type Compatibility

After removing the custom declarations, run type checking to ensure compatibility:

```bash
npm run type-check
```

#### Potential Issues to Watch For:

1. **`SessionEvent.timestamp`**: The custom type uses `number`, SDK uses `string`. Check if any code assumes numeric timestamp.

2. **`SessionEvent` discriminated union**: The SDK uses a discriminated union with specific `type` values. Code that accesses `event.data` may need type narrowing.

3. **`provider` in `SessionConfig`**: SDK uses `ProviderConfig` type with slightly different structure.

---

## Migration Steps

1. **Create a branch:**
   ```bash
   git checkout -b fix/use-copilot-sdk-types
   ```

2. **Delete the custom declaration file:**
   ```bash
   rm src/copilot-sdk.d.ts
   ```

3. **Update tsup.config.ts:**
   Change `dts: false` to `dts: true`

4. **Run type checking:**
   ```bash
   npm run type-check
   ```

5. **Fix any type errors** (if any arise from the more accurate SDK types)

6. **Run tests:**
   ```bash
   npm test
   ```

7. **Build and verify:**
   ```bash
   npm run build
   ```

8. **Create PR**

---

## Benefits of Migration

1. **Accurate Types**: SDK provides discriminated unions for `SessionEvent` with proper type narrowing
2. **Complete Types**: All MCP, Agent, and Tool types are properly defined
3. **Maintained**: Types stay in sync with SDK updates automatically
4. **Better IDE Support**: Full IntelliSense for all SDK types
5. **Reduced Maintenance**: No need to manually update custom declarations

---

## Verification

After migration, verify the published package includes `.d.ts` files:

```bash
npm run build
ls dist/*.d.ts
```

Expected output should include:
- `dist/index.d.ts`
- `dist/cache/index.d.ts`
- `dist/propagation/index.d.ts`
