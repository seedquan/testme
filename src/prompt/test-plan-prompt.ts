import type { RepoContext } from "../config.js";

export function buildTestPlanPrompt(context: RepoContext): string {
  const installFilesSection = Object.entries(context.installFiles)
    .map(([name, content]) => `### ${name}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``)
    .join("\n\n");

  return `You are a professional product tester analyzing a product before testing it.

## Product: ${context.owner}/${context.repo}

**Description:** ${context.description}
**Primary Language:** ${context.language}
${context.latestRelease ? `**Latest Release:** ${context.latestRelease.tag} (${context.latestRelease.name})` : ""}

## README

${context.readme.slice(0, 30000)}

${installFilesSection ? `## Project Files\n\n${installFilesSection}` : ""}

## Your Task

Analyze this product and create a structured test plan. You are testing this product **as a real user would** — you will install it following the official instructions and use it.

Respond with a JSON object matching this schema:

{
  "productType": "cli" | "library" | "web-app" | "api" | "desktop-app",
  "installMethod": "the exact install command(s) a user would run",
  "installPrerequisites": ["list of required tools/runtimes"],
  "cliCommands": ["commands to test, if any"],
  "webUrls": ["URLs to test if it starts a web server, e.g. http://localhost:3000"],
  "testScenarios": [
    {
      "name": "scenario name",
      "description": "what to test",
      "steps": ["step 1", "step 2"],
      "category": "installation" | "cli" | "web-ui" | "api" | "docs"
    }
  ]
}

Focus on:
1. Installation experience — does the install flow work as documented?
2. Core functionality — do the main features work?
3. Error handling — what happens with bad input?
4. Documentation accuracy — does the product match what the docs say?
5. Web UI (if applicable) — is the UI functional and usable?

Generate 5-10 concrete test scenarios. Be specific about the steps.`;
}
