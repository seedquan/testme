import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { Config, RepoContext, TestPlan } from "../config.js";
import { buildTestPlanPrompt } from "../prompt/test-plan-prompt.js";

const execFile = promisify(execFileCb);

export async function generateTestPlan(
  context: RepoContext,
  config: Config
): Promise<TestPlan> {
  const prompt = buildTestPlanPrompt(context);

  const { stdout } = await execFile(
    "claude",
    [
      "-p", prompt,
      "--output-format", "json",
      "--model", config.model,
      "--max-budget-usd", "0.50",
    ],
    { timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }
  );

  // Parse the response — Claude returns a JSON object with a "result" field
  const response = JSON.parse(stdout);
  const text = typeof response === "string" ? response : response.result || JSON.stringify(response);

  // Extract JSON from the response text
  const plan = extractJson<TestPlan>(text);
  if (!plan) {
    throw new Error("Failed to extract test plan from Claude response");
  }

  // Inject custom scenarios from config
  if (config.customScenarios.length > 0) {
    plan.testScenarios.push(...config.customScenarios);
  }

  return plan;
}

function extractJson<T>(text: string): T | null {
  // Try parsing directly first
  try {
    return JSON.parse(text) as T;
  } catch {
    // Look for JSON inside code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]) as T;
      } catch {
        // fall through
      }
    }

    // Look for JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        // fall through
      }
    }
  }
  return null;
}
