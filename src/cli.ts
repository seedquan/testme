import { Command } from "commander";
import { DEFAULTS, type Config } from "./config.js";
import { run } from "./orchestrator/index.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("testme")
    .description("AI-powered product tester — dogfood any product and file GitHub issues")
    .version("0.1.0")
    .argument("<repo-url>", "GitHub repository URL (e.g. https://github.com/owner/repo)")
    .option("-t, --github-token <token>", "GitHub PAT (or set GITHUB_TOKEN env var)")
    .option("--dry-run", "show findings without creating issues", false)
    .option("--budget <usd>", "max API spend in USD", String(DEFAULTS.budget))
    .option("--timeout <minutes>", "max test time in minutes", String(DEFAULTS.timeout))
    .option("--model <model>", "Claude model to use", DEFAULTS.model)
    .option("--verbose", "stream Claude Code live output", false)
    .option("--skip-web", "skip web UI testing", false)
    .option("--labels <labels>", "extra labels for created issues (comma-separated)", "")
    .action(async (repoUrl: string, opts) => {
      const parsed = parseRepoUrl(repoUrl);
      if (!parsed) {
        console.error(`Invalid GitHub URL: ${repoUrl}`);
        console.error("Expected format: https://github.com/owner/repo");
        process.exit(1);
      }

      const githubToken = opts.githubToken || process.env.GITHUB_TOKEN;
      if (!githubToken) {
        console.error("GitHub token required. Use --github-token or set GITHUB_TOKEN env var.");
        process.exit(1);
      }

      const config: Config = {
        owner: parsed.owner,
        repo: parsed.repo,
        githubToken,
        dryRun: opts.dryRun,
        budget: parseFloat(opts.budget),
        timeout: parseInt(opts.timeout, 10),
        model: opts.model,
        verbose: opts.verbose,
        skipWeb: opts.skipWeb,
        labels: opts.labels ? opts.labels.split(",").map((l: string) => l.trim()) : [],
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
