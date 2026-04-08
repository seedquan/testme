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
} from "../output/terminal.js";
import { withRetry } from "../utils/retry.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(config: Config): Promise<void> {
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
    process.exit(1);
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
      process.exit(1);
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
    fetchSpinner.fail("Failed to fetch repo context");
    console.error(err);
    process.exit(1);
  }

  // Step 2: Generate test plan
  const planSpinner = createSpinner("Generating test plan...");
  let testPlan;
  try {
    testPlan = await generateTestPlan(context, config);
    planSpinner.succeed(
      `Test plan ready (${testPlan.testScenarios.length} scenarios)`
    );
    printTestPlan(testPlan);
  } catch (err) {
    planSpinner.fail("Failed to generate test plan");
    console.error(err);
    process.exit(1);
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
    dockerSpinner.fail("Failed to start Docker container after 3 attempts");
    console.error(err);
    process.exit(1);
  }

  // Register cleanup
  const cleanup = async () => {
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
    testSpinner.fail("Test execution failed");
    console.error(err);
    await cleanup();
    process.exit(1);
  }

  // Step 5: Parse findings
  const parseSpinner = createSpinner("Processing findings...");
  const findings = parseFindings(executionResult.rawOutput);
  parseSpinner.succeed(`Found ${findings.length} findings`);

  // Step 6: Cleanup Docker
  await cleanup();

  if (findings.length === 0) {
    if (config.json) {
      console.log(JSON.stringify(formatJsonReport(`${config.owner}/${config.repo}`, [], []), null, 2));
    } else {
      console.log("\n  No issues found. The product looks good!");
    }
    return;
  }

  // Step 7: Create issues
  if (config.dryRun) {
    const results = findings.map((f) => ({
      finding: f,
      status: "created" as const,
    }));
    if (config.json) {
      console.log(JSON.stringify(formatJsonReport(`${config.owner}/${config.repo}`, findings, results), null, 2));
    } else {
      printResults(results, true);
    }
  } else {
    const issueSpinner = config.json ? null : createSpinner("Creating GitHub issues...");
    try {
      const results = await createIssues(findings, context, config);
      const created = results.filter((r) => r.status === "created").length;
      issueSpinner?.succeed(`Created ${created} issues`);
      if (config.json) {
        console.log(JSON.stringify(formatJsonReport(`${config.owner}/${config.repo}`, findings, results), null, 2));
      } else {
        printResults(results, false);
      }
    } catch (err) {
      issueSpinner?.fail("Failed to create issues");
      console.error(err);
      process.exit(1);
    }
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
    process.exit(1);
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
    process.exit(1);
  }
}
