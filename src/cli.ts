import { Command } from "commander";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULTS, loadConfigFile, type Config } from "./config.js";
import { run } from "./orchestrator/index.js";
import { VERSION } from "./version.js";
import type { JsonReport } from "./output/terminal.js";

const execFile = promisify(execFileCb);

export function createCli(): Command {
  const program = new Command();

  program
    .name("testme")
    .description("AI-powered product tester — dogfood any product and file GitHub issues")
    .version(VERSION);

  // Init subcommand
  program
    .command("init")
    .description("Create a .testmerc.json config file in the current directory")
    .action(() => {
      const filepath = resolve(process.cwd(), ".testmerc.json");
      if (existsSync(filepath)) {
        console.error(".testmerc.json already exists. Delete it first to re-initialize.");
        process.exit(1);
      }
      const template = {
        budget: DEFAULTS.budget,
        timeout: DEFAULTS.timeout,
        model: DEFAULTS.model,
        dryRun: false,
        verbose: false,
        skipWeb: false,
        labels: [],
        customScenarios: [],
      };
      writeFileSync(filepath, JSON.stringify(template, null, 2) + "\n");
      console.log("Created .testmerc.json with default settings.");
      console.log("Edit it to customize budget, timeout, model, labels, and custom test scenarios.");
    });

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

  // Reports subcommand
  program
    .command("reports")
    .description("List past test reports from .testme-reports/")
    .option("--dir <path>", "reports directory", ".testme-reports")
    .action((opts) => {
      const dir = resolve(process.cwd(), opts.dir);
      if (!existsSync(dir)) {
        console.log("No reports found. Run testme against a repo first.");
        return;
      }
      const files = readdirSync(dir)
        .filter((f: string) => f.endsWith(".json"))
        .sort()
        .reverse();

      if (files.length === 0) {
        console.log("No reports found.");
        return;
      }

      console.log(`\n  ${files.length} report(s) in ${opts.dir}/\n`);
      for (const file of files) {
        try {
          const raw = readFileSync(resolve(dir, file), "utf-8");
          const report = JSON.parse(raw) as JsonReport;
          const findings = report.summary?.total ?? 0;
          const elapsed = report.elapsedMs
            ? `${Math.round(report.elapsedMs / 1000)}s`
            : "?";
          console.log(
            `  ${file}`
          );
          console.log(
            `    ${report.repo} — ${findings} finding(s), ${elapsed}`
          );
        } catch {
          console.log(`  ${file} (unreadable)`);
        }
      }
      console.log();
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

      // Budget/timeout cascade: explicit CLI flag > config file > default
      // Commander sets opts.budget to the default string "5" if not provided,
      // so we detect "user explicitly passed a flag" by checking if it differs from the default string.
      const budgetExplicit = opts.budget !== String(DEFAULTS.budget);
      const budget = budgetExplicit
        ? parseFloat(opts.budget)
        : (fileConfig.budget ?? DEFAULTS.budget);
      if (isNaN(budget) || budget <= 0 || budget > 100) {
        console.error("Budget must be between $0.01 and $100.");
        process.exit(1);
      }

      const timeoutExplicit = opts.timeout !== String(DEFAULTS.timeout);
      const timeout = timeoutExplicit
        ? parseInt(opts.timeout, 10)
        : (fileConfig.timeout ?? DEFAULTS.timeout);
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
        model: opts.model !== DEFAULTS.model
          ? opts.model  // user explicitly passed --model
          : (fileConfig.model ?? DEFAULTS.model),
        verbose: opts.verbose || fileConfig.verbose || false,
        skipWeb: opts.skipWeb || fileConfig.skipWeb || false,
        labels: cliLabels.length > 0 ? cliLabels : (fileConfig.labels || []),
        json: opts.json || false,
        planOnly: opts.planOnly || false,
        customScenarios: fileConfig.customScenarios || [],
      };

      await run(config);
    });

  return program;
}

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  // Strip query params and hash
  const cleaned = url.split("?")[0].split("#")[0];

  // Handle https://github.com/owner/repo or github.com/owner/repo
  const match = cleaned.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+?)\/?$/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  }
  // Handle owner/repo shorthand
  const shortMatch = cleaned.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }
  return null;
}
