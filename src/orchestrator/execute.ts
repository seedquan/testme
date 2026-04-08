import type { Config, RepoContext, TestPlan } from "../config.js";
import { spawnInContainer } from "../docker/container.js";
import { buildSystemPrompt } from "../prompt/system-prompt.js";

export interface ExecutionResult {
  rawOutput: string;
  success: boolean;
}

export async function executeTests(
  containerId: string,
  context: RepoContext,
  testPlan: TestPlan,
  config: Config,
  onProgress?: (message: string) => void
): Promise<ExecutionResult> {
  const systemPrompt = buildSystemPrompt(context, testPlan, {
    skipWeb: config.skipWeb,
  });

  const proc = spawnInContainer(containerId, [
    "claude",
    "-p", systemPrompt,
    "--print",
    "--dangerously-skip-permissions",
    "--model", config.model,
    "--max-budget-usd", String(config.budget),
  ]);

  return new Promise((resolve, reject) => {
    let rawOutput = "";
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ rawOutput, success: false });
    }, config.timeout * 60 * 1000);

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;

      if (config.verbose) {
        process.stdout.write(text);
      }

      // Parse progress from output
      if (onProgress) {
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.includes("Installing") || line.includes("Testing") || line.includes("Running")) {
            onProgress(line.trim().slice(0, 80));
          }
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;
      if (config.verbose) {
        process.stderr.write(text);
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ rawOutput, success: code === 0 });
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
