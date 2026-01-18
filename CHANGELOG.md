# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.4] (2026-01-18)

### Improvements

*   **build:** Reduced package size by ~75% (from 1.5MB to ~400KB)
    *   Removed source files (`src/`) from published package
    *   Externalized `@ai-sdk/provider` and `@ai-sdk/provider-utils` dependencies
    *   Added `.npmignore` for comprehensive exclusion of dev files

### [0.1.3] (2026-01-17)

### Features

*   **tool-calling:** Added support for custom tools using Zod schemas alongside built-in Copilot tools
*   **session-pool:** Implemented session pooling for efficient connection reuse
*   **health-monitor:** Added health monitoring and automatic recovery for CLI connections
*   **agents:** Enhanced custom agents with display names, descriptions, and multiple usage patterns
*   **telemetry:** Improved OpenTelemetry configuration structure

### [0.1.2] (2026-01-16)

### Features

*   **examples:** Added MCP server example with DeepWiki for GitHub code search

### Bug Fixes

*   **examples:** Fixed dotenv import in caching example (use namespace import)

### [0.1.1] (2026-01-16)

### Docs

*   **readme:** Clarified serverless limitation note - the provider spawns the CLI automatically, users don't need to run it manually

### [0.1.0] (2025-05-20)

### Features

*   **provider:** Initial release of Copilot AI SDK Provider (#1)
*   **caching:** Added memory cache and caching middleware for improved performance
*   **propagation:** Added W3C TraceContext propagation for distributed tracing with OpenTelemetry support
*   **mcp:** Support for Model Context Protocol (MCP) servers
*   **agents:** Support for custom agent definitions (`@agent_name`)
*   **observability:** OpenTelemetry native integration for metrics and tracing
