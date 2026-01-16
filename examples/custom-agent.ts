/**
 * Custom Agent Example
 *
 * Demonstrates defining and using custom agents.
 */

import { createCopilotProvider } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
    // Create provider with custom agents
    const copilot = createCopilotProvider({
        customAgents: [
            {
                name: 'code-reviewer',
                displayName: 'Code Reviewer',
                description: 'An expert code reviewer focused on best practices',
                prompt: `You are an expert code reviewer with deep knowledge of software engineering best practices.

When reviewing code:
1. Focus on readability, maintainability, and performance
2. Suggest specific improvements with examples
3. Highlight potential bugs or security issues
4. Be constructive and educational in your feedback

Always format your reviews with clear sections for:
- Summary
- Issues Found
- Suggestions for Improvement
- What's Done Well`,
            },
            {
                name: 'explainer',
                displayName: 'Code Explainer',
                description: 'Explains code in simple terms',
                prompt: `You are a patient coding teacher who explains code concepts in simple, accessible terms.

When explaining:
1. Start with a high-level overview
2. Break down complex parts step by step
3. Use analogies from everyday life
4. Provide simple examples when helpful

Assume the reader is a beginner and avoid jargon.`,
            },
        ],
    });

    try {
        // Use an agent via the model ID pattern
        console.log('=== Code Review ===\n');

        const reviewResult = await generateText({
            model: copilot('agent/code-reviewer'),
            prompt: `Please review this code:

\`\`\`typescript
function fetchData(url) {
    fetch(url)
        .then(res => res.json())
        .then(data => {
            console.log(data);
            return data;
        });
}
\`\`\``,
        });

        console.log(reviewResult.text);

        // Use an agent via providerOptions
        console.log('\n=== Code Explanation ===\n');

        const explainResult = await generateText({
            model: copilot('gpt-4'),
            prompt: 'What does the `async/await` syntax do in JavaScript?',
            providerOptions: {
                copilot: {
                    agent: 'explainer',
                },
            },
        });

        console.log(explainResult.text);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await copilot.dispose();
    }
}

main().catch(console.error);
