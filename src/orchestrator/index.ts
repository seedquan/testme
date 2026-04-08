import type { Config } from "../config.js";
import { fetchRepoContext } from "../github/fetch-repo-context.js";
import { createIssues } from "../github/create-issues.js";
import {
  createAndStartContainer,
  stopAndRemove,
  isDockerAvailable,
  imageExists,
  buildImage,
} from "../docker/container.js";
import { generateTestPlan } from "./plan.js";
import { executeTests } from "./execute.js";
import { parseFindings } from "./parse-findings.js";
import {
  printHeader,
  printTestPlan,
  printResults,
  createSpinner,
  formatJsonReport,
  formatMarkdownReport,
  printSummaryFooter,
} from "../output/terminal.js";
import { withRetry } from "../utils/retry.js";
import { friendlyError } from "../utils/errors.js";
import { ensureHomeDir, HOME_REPORTS_DIR } from "../config.js";
import chalk from "chalk";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

// Exit codes: 0=clean, 1=findings found, 2=runtime error
const EXIT_CLEAN = 0;
const EXIT_FINDINGS = 1;
const EXIT_ERROR = 2;

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(config: Config): Promise<void> {
  const runStart = Date.now();

  if (!config.json) {
    printHeader();
  }

  // Plan-only mode: skip Docker entirely
  if (config.planOnly) {
    return runPlanOnly(config);
  }

  // Preflight checks
  const spinner = createSpinner("Checking Docker...");

  if (!(await isDockerAvailable())) {
    spinner.fail("Docker is not available. Please install and start Docker.");
    process.exit(EXIT_ERROR);
  }

  if (!(await imageExists("testme-sandbox:latest"))) {
    spinner.text = "Building testme-sandbox Docker image (first run)...";
    const dockerfilePath = resolve(__dirname, "../../Dockerfile.testme");
    try {
      await buildImage(dockerfilePath);
      spinner.succeed("Docker image built");
    } catch (err) {
      spinner.fail("Failed to build Docker image");
      console.error(err);
      process.exit(EXIT_ERROR);
    }
  } else {
    spinner.succeed("Docker ready");
  }

  // Step 1: Fetch repo context
  const fetchSpinner = createSpinner(
    `Fetching repo context for ${config.owner}/${config.repo}...`
  );
  let context;
  try {
    context = await fetchRepoContext(config);
    fetchSpinner.succeed(
      `Repo context fetched (README: ${context.readme.length} chars, ${context.existingIssues.length} existing issues)`
    );
  } catch (err) {
    fetchSpinner.fail(`Failed to fetch repo context: ${friendlyError(err)}`);
    process.exit(EXIT_ERROR);
  }

  // Step 2: Generate test plan
  const planSpinner = createSpinner("Generating test plan...");
  let testPlan;
  try {
    testPlan = await generateTestPlan(context, config);
    if (testPlan.testScenarios.length === 0) {
      planSpinner.warn("Test plan generated but has 0 scenarios — nothing to test");
      if (!config.json) {
        console.log("  The product may lack documentation or installable artifacts.");
      }
      return;
    }
    planSpinner.succeed(
      `Test plan ready (${testPlan.testScenarios.length} scenarios)`
    );
    printTestPlan(testPlan);
  } catch (err) {
    planSpinner.fail(`Failed to generate test plan: ${friendlyError(err)}`);
    process.exit(EXIT_ERROR);
  }

  // Step 3: Start Docker container (with retry)
  const dockerSpinner = createSpinner("Starting Docker container...");
  let container;
  try {
    container = await withRetry(
      () => createAndStartContainer(config),
      {
        maxAttempts: 3,
        delayMs: 2000,
        onRetry: (attempt) => {
          dockerSpinner.text = `Starting Docker container (retry ${attempt}/2)...`;
        },
      }
    );
    dockerSpinner.succeed("Docker container running");
  } catch (err) {
    dockerSpinner.fail(`Failed to start Docker container: ${friendlyError(err)}`);
    process.exit(EXIT_ERROR);
  }

  // Register cleanup (idempotent — safe to call multiple times)
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await stopAndRemove(container.id).catch(() => {});
  };
  process.on("SIGINT", async () => {
    console.log("\n  Cleaning up...");
    await cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });

  // Step 4: Execute tests
  const testSpinner = createSpinner("Running tests inside Docker...");
  let executionResult;
  try {
    executionResult = await executeTests(
      container.id,
      context,
      testPlan,
      config,
      (msg) => {
        testSpinner.text = msg;
      }
    );
    if (executionResult.success) {
      testSpinner.succeed("Tests completed");
    } else {
      testSpinner.warn("Tests completed with issues");
    }
  } catch (err) {
    testSpinner.fail(`Test execution failed: ${friendlyError(err)}`);
    await cleanup();
    process.exit(EXIT_ERROR);
  }

  // Warn if Claude Code produced no output
  if (!executionResult.rawOutput || executionResult.rawOutput.length < 50) {
    if (!config.json) {
      console.log("  Warning: Claude Code produced little or no output — it may have crashed or timed out.");
    }
  }

  // Step 5: Parse findings
  const parseSpinner = createSpinner("Processing findings...");
  const findings = parseFindings(executionResult.rawOutput);
  parseSpinner.succeed(`Found ${findings.length} findings`);

  // Step 6: Cleanup Docker
  await cleanup();

  const elapsed = Date.now() - runStart;

  const repo = `${config.owner}/${config.repo}`;

  if (findings.length === 0) {
    const report = formatJsonReport(repo, [], [], elapsed);
    saveReport(config, report);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("\n  No issues found. The product looks good!");
      printSummaryFooter(elapsed);
    }
    process.exit(EXIT_CLEAN);
  }

  // Step 7: Create issues
  if (config.dryRun) {
    const results = findings.map((f) => ({
      finding: f,
      status: "created" as const,
    }));
    const report = formatJsonReport(repo, findings, results, elapsed);
    saveReport(config, report);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printResults(results, true);
      printSummaryFooter(elapsed);
    }
    process.exit(EXIT_FINDINGS);
  } else {
    const issueSpinner = config.json ? null : createSpinner("Creating GitHub issues...");
    try {
      const results = await createIssues(findings, context, config);
      const created = results.filter((r) => r.status === "created").length;
      issueSpinner?.succeed(`Created ${created} issues`);
      const report = formatJsonReport(repo, findings, results, elapsed);
      saveReport(config, report);
      if (config.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printResults(results, false);
        printSummaryFooter(elapsed);
      }
      process.exit(EXIT_FINDINGS);
    } catch (err) {
      issueSpinner?.fail(`Failed to create issues: ${friendlyError(err)}`);
      process.exit(EXIT_ERROR);
    }
  }
}

function saveReport(config: Config, report: ReturnType<typeof formatJsonReport>): void {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `${config.owner}-${config.repo}-${timestamp}`;
    const jsonContent = JSON.stringify(report, null, 2);
    const mdContent = formatMarkdownReport(report);

    // Save to CWD .testme-reports/ (backward compat)
    const cwdDir = resolve(process.cwd(), ".testme-reports");
    mkdirSync(cwdDir, { recursive: true });
    writeFileSync(resolve(cwdDir, `${baseName}.json`), jsonContent);
    writeFileSync(resolve(cwdDir, `${baseName}.md`), mdContent);

    // Also save to home directory
    try {
      ensureHomeDir();
      writeFileSync(resolve(HOME_REPORTS_DIR, `${baseName}.json`), jsonContent);
      writeFileSync(resolve(HOME_REPORTS_DIR, `${baseName}.md`), mdContent);
    } catch {
      // Home dir save is best-effort
    }

    if (!config.json) {
      console.log(chalk.dim(`  Reports saved to .testme-reports/${baseName}.{json,md}`));
    }
  } catch {
    // Non-critical — don't fail the run if we can't save
  }
}

async function runPlanOnly(config: Config): Promise<void> {
  const fetchSpinner = config.json ? null : createSpinner(
    `Fetching repo context for ${config.owner}/${config.repo}...`
  );
  let context;
  try {
    context = await fetchRepoContext(config);
    fetchSpinner?.succeed(
      `Repo context fetched (README: ${context.readme.length} chars)`
    );
  } catch (err) {
    fetchSpinner?.fail("Failed to fetch repo context");
    console.error(err);
    process.exit(EXIT_ERROR);
  }

  const planSpinner = config.json ? null : createSpinner("Generating test plan...");
  try {
    const testPlan = await generateTestPlan(context, config);
    planSpinner?.succeed(
      `Test plan ready (${testPlan.testScenarios.length} scenarios)`
    );

    if (config.json) {
      console.log(JSON.stringify({ repo: `${config.owner}/${config.repo}`, plan: testPlan }, null, 2));
    } else {
      printTestPlan(testPlan);
      console.log("  Scenarios:");
      for (const s of testPlan.testScenarios) {
        console.log(`    - ${s.name} (${s.category}): ${s.description}`);
      }
      console.log();
    }
  } catch (err) {
    planSpinner?.fail("Failed to generate test plan");
    console.error(err);
    process.exit(EXIT_ERROR);
  }
}
