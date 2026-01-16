// Quick sanity check for the Copilot provider
import { createCopilotProvider } from './src/index.js';
import { generateText } from 'ai';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Find the underlying copilot JS file (SDK handles .js files correctly on all platforms)
function findCopilotJsPath(): string | undefined {
    try {
        // Get global npm modules path
        const globalPath = execSync('npm root -g', { encoding: 'utf-8' }).trim();
        const jsPath = join(globalPath, '@github', 'copilot', 'index.js');

        if (existsSync(jsPath)) {
            return jsPath;
        }
    } catch {
        // Fallback
    }
    return undefined;
}

async function main() {
    const cliPath = findCopilotJsPath();
    console.log('Detected CLI path:', cliPath);

    if (!cliPath) {
        console.error('❌ Copilot CLI not found. Install with: npm install -g @github/copilot-cli');
        return;
    }

    const copilot = createCopilotProvider({
        cliPath  // SDK will spawn: node <path>/index.js --server
    });

    try {
        console.log('\nTesting Copilot provider...\n');

        const { text, finishReason } = await generateText({
            model: copilot('gpt-4'),
            prompt: 'Say hello in one sentence!'
        });

        console.log('✅ Success!');
        console.log('Response:', text);
        console.log('Finish Reason:', finishReason);
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await copilot.dispose();
        console.log('\nProvider disposed.');
    }
}

main();
