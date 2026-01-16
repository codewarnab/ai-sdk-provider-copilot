/**
 * Testing utilities for the Copilot AI SDK provider.
 *
 * Provides mock implementations of CopilotClient and CopilotSession
 * for unit testing without requiring a real CLI.
 *
 * @module testing
 */

// Mock client
export {
    createMockClient,
    type MockClientOptions,
    type MockClientTestHelpers,
    type MockCopilotClient,
} from './mock-client.js';

// Mock session
export {
    createMockSession,
    type MockSessionOptions,
    type MockSessionTestHelpers,
    type MockCopilotSession,
} from './mock-session.js';
