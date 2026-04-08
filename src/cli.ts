import { Command } from "commander";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULTS, loadConfigFile, type Config } from "./config.js";
import { run } from "./orchestrator/index.js";

const execFile = promisify(execFileCb);

export function createCli(): Command {
  const program = new Command();

  program
    .name("testme")
    .description("AI-powered product tester — dogfood any product and file GitHub issues")
    .version("0.1.0");

  // Cleanup subcommand
  program
    .command("cleanup")
    .description("Remove stale Docker containers from previous testme runs")
    .action(async () => {
      try {
        const { stdout } = await execFile("docker", [
          "ps", "-a", "-q", "-f", "label=testme.run=1",
        ]);
        const ids = stdout.trim().split("\n").filter(Boolean);
        if (ids.length === 0) {
          console.log("No stale testme containers found.");
          return;
        }
        await execFile("docker", ["rm", "-f", ...ids]);
        console.log(`Removed ${ids.length} stale container(s).`);
      } catch (err) {
        console.error("Failed to clean up containers. Is Docker running?");
        process.exit(1);
      }
    });

  // Main test command (default)
  program
    .argument("<repo-url>", "GitHub repository URL (e.g. https://github.com/owner/repo)")
    .option("-t, --github-token <token>", "GitHub PAT (or set GITHUB_TOKEN env var)")
    .option("--dry-run", "show findings without creating issues", false)
    .option("--budget <usd>", "max API spend in USD", String(DEFAULTS.budget))
    .option("--timeout <minutes>", "max test time in minutes", String(DEFAULTS.timeout))
    .option("--model <model>", "Claude model to use", DEFAULTS.model)
    .option("--verbose", "stream Claude Code live output", false)
    .option("--skip-web", "skip web UI testing", false)
    .option("--labels <labels>", "extra labels for created issues (comma-separated)", "")
    .option("--json", "output results as JSON to stdout", false)
    .option("--plan-only", "generate test plan and exit (no Docker needed)", false)
    .action(async (repoUrl: string, opts) => {
      const parsed = parseRepoUrl(repoUrl);
      if (!parsed) {
        console.error(`Invalid GitHub URL: ${repoUrl}`);
        console.error("Expected format: https://github.com/owner/repo");
        process.exit(1);
      }

      // Load config file (CLI args take precedence)
      const fileConfig = loadConfigFile(process.cwd());

      const githubToken = opts.githubToken || fileConfig.githubToken || process.env.GITHUB_TOKEN;
      if (!githubToken) {
        console.error("GitHub token required. Use --github-token or set GITHUB_TOKEN env var.");
        process.exit(1);
      }

      if (!opts.planOnly && !process.env.ANTHROPIC_API_KEY) {
        console.error("ANTHROPIC_API_KEY env var required for Claude Code inside Docker.");
        process.exit(1);
      }

      const budget = parseFloat(opts.budget) || fileConfig.budget || DEFAULTS.budget;
      if (isNaN(budget) || budget <= 0 || budget > 100) {
        console.error("Budget must be between $0.01 and $100.");
        process.exit(1);
      }

      const timeout = parseInt(opts.timeout, 10) || fileConfig.timeout || DEFAULTS.timeout;
      if (isNaN(timeout) || timeout < 1 || timeout > 120) {
        console.error("Timeout must be between 1 and 120 minutes.");
        process.exit(1);
      }

      const cliLabels = opts.labels ? opts.labels.split(",").map((l: string) => l.trim()).filter(Boolean) : [];

      const config: Config = {
        owner: parsed.owner,
        repo: parsed.repo,
        githubToken,
        dryRun: opts.dryRun || fileConfig.dryRun || false,
        budget,
        timeout,
        model: fileConfig.model && opts.model === DEFAULTS.model ? fileConfig.model : opts.model,
        verbose: opts.verbose || fileConfig.verbose || false,
        skipWeb: opts.skipWeb || fileConfig.skipWeb || false,
        labels: cliLabels.length > 0 ? cliLabels : (fileConfig.labels || []),
        json: opts.json || false,
        planOnly: opts.planOnly || false,
      };

      await run(config);
    });

  return program;
}

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  // Handle https://github.com/owner/repo or github.com/owner/repo
  const match = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  }
  // Handle owner/repo shorthand
  const shortMatch = url.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }
  return null;
}
