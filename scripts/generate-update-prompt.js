#!/usr/bin/env node

/**
 * ============================================================================
 * Generate Update Prompt Script
 * ============================================================================
 * 
 * PURPOSE:
 *   This script helps keep ai-sdk-provider-copilot in sync with its upstream
 *   dependencies. It fetches the latest changes from both:
 *     - @github/copilot-sdk (https://github.com/github/copilot-sdk)
 *     - @ai-sdk/* packages (https://github.com/vercel/ai)
 *   
 *   Then generates a `prompt.md` file containing all NEW upstream changes
 *   (diffs) that haven't been applied locally yet. This prompt can be sent
 *   to an AI agent to analyze and implement the necessary updates.
 * 
 * HOW IT WORKS:
 *   1. Runs `git fetch origin` on both upstream repos
 *   2. Compares local HEAD vs remote HEAD (origin/main or origin/master)
 *   3. Extracts diffs for relevant files only:
 *      - copilot-sdk: nodejs/, README.md, sdk-protocol-version.json
 *      - ai: packages/ai/src/, packages/provider/, packages/provider-utils/
 *   4. Generates prompt.md with diffs, commit logs, and update instructions
 * 
 * USAGE:
 *   node scripts/generate-update-prompt.js [options]
 * 
 * OPTIONS:
 *   --include-context    Appends the current provider source files to prompt.md
 *                        This gives the AI agent full context of the existing
 *                        implementation when suggesting changes. Includes:
 *                          - src/copilot-provider.ts
 *                          - src/copilot-language-model.ts
 *                          - src/types.ts
 *                          - src/message-mapper.ts
 *                          - src/event-mapper.ts
 *                          - src/tool-mapper.ts
 *                        Use this when the agent needs to see how things are
 *                        currently implemented to make accurate updates.
 * 
 *   --help, -h           Show help message
 * 
 * EXAMPLES:
 *   # Basic usage - just show upstream diffs
 *   node scripts/generate-update-prompt.js
 * 
 *   # Include current source code for full context
 *   node scripts/generate-update-prompt.js --include-context
 * 
 * OUTPUT:
 *   Creates/overwrites `prompt.md` in the ai-sdk-provider-copilot root folder.
 *   This file is ready to be copy-pasted or sent to an AI coding agent.
 * 
 * PREREQUISITES:
 *   - Git installed and available in PATH
 *   - Both ../copilot-sdk and ../ai folders exist as git repos
 *   - Network access to fetch from GitHub
 * 
 * ============================================================================
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
    // Relative paths from workspace root
    copilotSdkPath: '../copilot-sdk',
    aiPackagePath: '../ai',
    providerPath: '.',

    // Files to include in copilot-sdk diff
    copilotSdkIncludePaths: [
        'nodejs/',
        'README.md',
        'sdk-protocol-version.json',
        'CONTRIBUTING.md',
    ],

    // Files to include in ai package diff (focus on provider-related changes)
    aiPackageIncludePaths: [
        'packages/ai/src/',
        'packages/provider/',
        'packages/provider-utils/',
        'packages/ai/CHANGELOG.md',
        'CHANGELOG.md',
    ],

    // Output file
    outputFile: 'prompt.md',
};

/**
 * Execute a shell command and return the output
 */
function exec(command, options = {}) {
    try {
        return execSync(command, {
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large diffs
            ...options,
        }).trim();
    } catch (error) {
        if (options.ignoreError) {
            return '';
        }
        console.error(`Command failed: ${command}`);
        console.error(error.message);
        return '';
    }
}

/**
 * Get the absolute path from a relative path
 */
function getAbsolutePath(relativePath) {
    return join(__dirname, '..', relativePath);
}

/**
 * Fetch latest changes from remote
 */
function fetchLatest(repoPath, repoName) {
    console.log(`📥 Fetching latest changes for ${repoName}...`);
    const absPath = getAbsolutePath(repoPath);

    if (!existsSync(absPath)) {
        console.error(`❌ Repository not found: ${absPath}`);
        return false;
    }

    try {
        exec(`git fetch origin`, { cwd: absPath });
        console.log(`✅ Fetched ${repoName}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to fetch ${repoName}: ${error.message}`);
        return false;
    }
}

/**
 * Get the current branch name
 */
function getCurrentBranch(repoPath) {
    const absPath = getAbsolutePath(repoPath);
    return exec('git rev-parse --abbrev-ref HEAD', { cwd: absPath });
}

/**
 * Get the remote tracking branch
 */
function getRemoteBranch(repoPath) {
    const currentBranch = getCurrentBranch(repoPath);
    return `origin/${currentBranch}`;
}

/**
 * Get diff between local HEAD and remote (what's NEW upstream)
 */
function getDiff(repoPath, includePaths) {
    const absPath = getAbsolutePath(repoPath);
    const remoteBranch = getRemoteBranch(repoPath);

    // Get diff: what's in remote that we don't have locally
    // HEAD..origin/main = changes in origin/main that aren't in HEAD
    const pathFilters = includePaths.map(p => `"${p}"`).join(' ');
    const diffCommand = `git diff HEAD..${remoteBranch} -- ${pathFilters}`;

    return exec(diffCommand, { cwd: absPath, ignoreError: true });
}

/**
 * Get log of commits between local and remote (what's NEW upstream)
 */
function getCommitLog(repoPath, includePaths) {
    const absPath = getAbsolutePath(repoPath);
    const remoteBranch = getRemoteBranch(repoPath);

    // HEAD..origin/main = commits in origin/main that aren't in HEAD
    const pathFilters = includePaths.map(p => `"${p}"`).join(' ');
    const logCommand = `git log HEAD..${remoteBranch} --oneline -- ${pathFilters}`;

    return exec(logCommand, { cwd: absPath, ignoreError: true });
}

/**
 * Get current version info
 */
function getVersionInfo(repoPath, packageJsonPath = 'package.json') {
    const absPath = getAbsolutePath(repoPath);
    const pkgPath = join(absPath, packageJsonPath);

    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            return {
                name: pkg.name,
                version: pkg.version,
            };
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Get the current HEAD commit hash
 */
function getHeadCommit(repoPath) {
    const absPath = getAbsolutePath(repoPath);
    return exec('git rev-parse HEAD', { cwd: absPath });
}

/**
 * Get the remote HEAD commit hash
 */
function getRemoteHeadCommit(repoPath) {
    const absPath = getAbsolutePath(repoPath);
    const remoteBranch = getRemoteBranch(repoPath);
    return exec(`git rev-parse ${remoteBranch}`, { cwd: absPath, ignoreError: true });
}

/**
 * Read the provider's key source files for context
 */
function getProviderContext() {
    const files = [
        'src/copilot-provider.ts',
        'src/copilot-language-model.ts',
        'src/types.ts',
        'src/message-mapper.ts',
        'src/event-mapper.ts',
        'src/tool-mapper.ts',
    ];

    let context = '';

    for (const file of files) {
        const filePath = join(__dirname, '..', file);
        if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf-8');
            context += `\n### ${file}\n\`\`\`typescript\n${content}\n\`\`\`\n`;
        }
    }

    return context;
}

/**
 * Generate the prompt.md content
 */
function generatePrompt(copilotSdkDiff, copilotSdkLog, aiDiff, aiLog, options = {}) {
    const timestamp = new Date().toISOString();
    const providerVersion = getVersionInfo(CONFIG.providerPath);
    const copilotSdkVersion = getVersionInfo(CONFIG.copilotSdkPath, 'nodejs/package.json');
    const aiVersion = getVersionInfo(CONFIG.aiPackagePath, 'packages/ai/package.json');

    const copilotSdkLocalCommit = getHeadCommit(CONFIG.copilotSdkPath);
    const copilotSdkRemoteCommit = getRemoteHeadCommit(CONFIG.copilotSdkPath);
    const aiLocalCommit = getHeadCommit(CONFIG.aiPackagePath);
    const aiRemoteCommit = getRemoteHeadCommit(CONFIG.aiPackagePath);

    const copilotHasChanges = copilotSdkLog && copilotSdkLog.trim().length > 0;
    const aiHasChanges = aiLog && aiLog.trim().length > 0;

    let prompt = `# AI SDK Provider Copilot - Update Prompt

> Generated: ${timestamp}
> This file contains upstream changes that need to be reviewed and applied to ai-sdk-provider-copilot

## 🎯 Goal

**Stay as up-to-date as possible** with both upstream dependencies:
1. **@github/copilot-sdk** - The official GitHub Copilot SDK (Node.js)
2. **@ai-sdk/*** - Vercel AI SDK packages

This provider bridges these two ecosystems, allowing users to use GitHub Copilot through the standard Vercel AI SDK interface.

## 📊 Current State

| Package | Local Version | Local Commit | Remote Commit | Status |
|---------|---------------|--------------|---------------|--------|
| ai-sdk-provider-copilot | ${providerVersion?.version || 'unknown'} | - | - | - |
| @github/copilot-sdk | ${copilotSdkVersion?.version || 'unknown'} | \`${copilotSdkLocalCommit?.substring(0, 8) || 'unknown'}\` | \`${copilotSdkRemoteCommit?.substring(0, 8) || 'unknown'}\` | ${copilotHasChanges ? '⚠️ Updates available' : '✅ Up to date'} |
| @ai-sdk packages | ${aiVersion?.version || 'unknown'} | \`${aiLocalCommit?.substring(0, 8) || 'unknown'}\` | \`${aiRemoteCommit?.substring(0, 8) || 'unknown'}\` | ${aiHasChanges ? '⚠️ Updates available' : '✅ Up to date'} |

---

## 📝 Instructions for the Agent

When updating this provider, follow these guidelines:

### Priority Areas
1. **API Changes** - Any changes to the CopilotClient, CopilotSession, or event types in copilot-sdk
2. **Type Definitions** - Changes to TypeScript types that affect our type mappings
3. **New Features** - New capabilities in either SDK that we should expose
4. **Breaking Changes** - Any breaking changes that require updates to our implementation
5. **Bug Fixes** - Fixes that should be incorporated into our provider

### Key Files to Update
- \`src/copilot-provider.ts\` - Main provider factory
- \`src/copilot-language-model.ts\` - Language model implementation
- \`src/types.ts\` - Type definitions (should mirror copilot-sdk types)
- \`src/message-mapper.ts\` - Message format conversion
- \`src/event-mapper.ts\` - Event/streaming conversion
- \`src/tool-mapper.ts\` - Tool/function calling conversion

### Compatibility Requirements
- Maintain backwards compatibility with existing users
- Follow Vercel AI SDK provider conventions
- Keep TypeScript types strict and accurate
- Update tests for any changed functionality
- Update documentation if API changes

---

## 🔄 Copilot SDK Changes (nodejs/)

${copilotHasChanges ? `### New Commits (${copilotSdkLog.split('\n').filter(l => l.trim()).length} commits)
\`\`\`
${copilotSdkLog}
\`\`\`

### Diff
\`\`\`diff
${copilotSdkDiff}
\`\`\`` : '✅ **No new changes** - Local is up to date with upstream.'}

---

## 🔄 AI SDK Changes (@ai-sdk packages)

${aiHasChanges ? `### New Commits (${aiLog.split('\n').filter(l => l.trim()).length} commits)
\`\`\`
${aiLog}
\`\`\`

### Diff
\`\`\`diff
${aiDiff}
\`\`\`` : '✅ **No new changes** - Local is up to date with upstream.'}

---

## 📋 Checklist for Updates

When applying updates, ensure:

- [ ] All new types from copilot-sdk are properly mapped in \`types.ts\`
- [ ] Event handling matches any new event types
- [ ] Message mapping handles any new message formats
- [ ] Tool calling is compatible with any tool API changes
- [ ] Streaming implementation handles any new stream events
- [ ] Error handling covers any new error types
- [ ] Tests are updated/added for changed functionality
- [ ] Documentation is updated if public API changes
- [ ] CHANGELOG.md is updated with notable changes
- [ ] Version bump if needed (semver)

## 🔍 Analysis Required

Please analyze the diffs above and:

1. **Identify breaking changes** that require immediate attention
2. **List new features** that could be exposed to users
3. **Note any bug fixes** that should be incorporated
4. **Highlight deprecations** that we should address
5. **Suggest implementation** approach for each change

Focus on changes that affect:
- The client/session lifecycle
- Message/event formats
- Tool/function calling
- Error handling
- Type definitions

---

${options.includeContext ? `## 📚 Reference: Current Provider Implementation

For context, here are the key files in our provider:

${getProviderContext()}

---` : ''}

*End of update prompt*
`;

    return prompt;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        includeContext: false,
        help: false,
    };

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else if (arg === '--include-context') {
            options.includeContext = true;
        }
    }

    return options;
}

/**
 * Print usage information
 */
function printUsage() {
    console.log(`
Generate Update Prompt - Creates a prompt.md with upstream changes for ai-sdk-provider-copilot

Usage:
  node scripts/generate-update-prompt.js [options]

Options:
  --include-context    Include provider source files in the prompt
  --help, -h           Show this help message

The script automatically:
  1. Fetches latest changes from upstream (github/copilot-sdk and vercel/ai)
  2. Compares your local state to the remote
  3. Generates prompt.md with all NEW changes that need to be applied
`);
}

/**
 * Main function
 */
async function main() {
    const options = parseArgs();

    if (options.help) {
        printUsage();
        process.exit(0);
    }

    console.log('🚀 Generate Update Prompt for ai-sdk-provider-copilot\n');

    // Fetch latest changes
    const copilotFetched = fetchLatest(CONFIG.copilotSdkPath, 'copilot-sdk');
    const aiFetched = fetchLatest(CONFIG.aiPackagePath, 'ai');

    if (!copilotFetched && !aiFetched) {
        console.error('❌ Failed to fetch from any repository');
        process.exit(1);
    }

    console.log('\n📊 Comparing local vs upstream...\n');

    // Get diffs (what's new in upstream)
    const copilotSdkDiff = getDiff(CONFIG.copilotSdkPath, CONFIG.copilotSdkIncludePaths);
    const copilotSdkLog = getCommitLog(CONFIG.copilotSdkPath, CONFIG.copilotSdkIncludePaths);

    const aiDiff = getDiff(CONFIG.aiPackagePath, CONFIG.aiPackageIncludePaths);
    const aiLog = getCommitLog(CONFIG.aiPackagePath, CONFIG.aiPackageIncludePaths);

    // Generate prompt
    console.log('📝 Generating prompt.md...\n');
    const promptContent = generatePrompt(copilotSdkDiff, copilotSdkLog, aiDiff, aiLog, options);

    // Write output file
    const outputPath = join(__dirname, '..', CONFIG.outputFile);
    writeFileSync(outputPath, promptContent, 'utf-8');

    console.log(`✅ Generated: ${outputPath}`);

    // Summary
    const copilotChanges = copilotSdkLog ? copilotSdkLog.split('\n').filter(l => l.trim()).length : 0;
    const aiChanges = aiLog ? aiLog.split('\n').filter(l => l.trim()).length : 0;

    if (copilotChanges === 0 && aiChanges === 0) {
        console.log(`
✅ Everything is up to date! No upstream changes detected.
`);
    } else {
        console.log(`
📈 Upstream Changes Detected:
   - Copilot SDK: ${copilotChanges} new commit(s)
   - AI SDK: ${aiChanges} new commit(s)
   - Output: ${CONFIG.outputFile}

Next steps:
   1. Review the generated prompt.md
   2. Send it to an AI agent for analysis and updates
   3. Pull the upstream changes after applying updates
`);
    }
}

// Run
main().catch(console.error);
