import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { Finding, IssueResult, TestPlan } from "../config.js";
import { formatElapsed } from "../utils/errors.js";
import { VERSION } from "../version.js";

export function createSpinner(text: string): Ora {
  return ora({ text, color: "cyan" }).start();
}

export function printHeader(): void {
  console.log();
  console.log(chalk.bold.cyan("  testme") + chalk.dim(` v${VERSION} — AI-powered product tester`));
  console.log();
}

export function printTestPlan(plan: TestPlan): void {
  console.log(chalk.dim(`  Product type: ${plan.productType}`));
  console.log(chalk.dim(`  Install: ${plan.installMethod}`));
  console.log(chalk.dim(`  Scenarios: ${plan.testScenarios.length} test scenarios`));
  console.log();
}

export function printResults(results: IssueResult[], dryRun: boolean): void {
  const created = results.filter((r) => r.status === "created");
  const skipped = results.filter((r) => r.status === "skipped-duplicate");
  const failed = results.filter((r) => r.status === "failed");

  console.log();
  console.log(chalk.bold("  Results"));
  console.log(chalk.dim("  " + "─".repeat(70)));

  // Table header
  console.log(
    "  " +
      chalk.dim(
        padRight("#", 10) +
          padRight("Severity", 12) +
          padRight("Category", 16) +
          padRight("Title", 40)
      )
  );
  console.log(chalk.dim("  " + "─".repeat(70)));

  for (const result of results) {
    const num =
      result.status === "created" && result.issueNumber
        ? `#${result.issueNumber}`
        : result.status === "skipped-duplicate"
          ? "(skip)"
          : "(fail)";

    const severityColor = getSeverityColor(result.finding.severity);
    const statusSuffix =
      result.status === "skipped-duplicate"
        ? chalk.dim(` ← #${result.duplicateOf}`)
        : "";

    console.log(
      "  " +
        padRight(num, 10) +
        severityColor(padRight(result.finding.severity, 12)) +
        padRight(result.finding.category, 16) +
        result.finding.title.slice(0, 38) +
        statusSuffix
    );
  }

  console.log(chalk.dim("  " + "─".repeat(70)));

  const summary = [
    `${created.length} ${dryRun ? "found" : "created"}`,
    skipped.length > 0 ? `${skipped.length} duplicates skipped` : null,
    failed.length > 0 ? `${failed.length} failed` : null,
  ]
    .filter(Boolean)
    .join(", ");

  console.log("  " + chalk.bold(summary));
  console.log();
}

export function printDryRunFindings(findings: Finding[]): void {
  console.log();
  console.log(chalk.bold.yellow("  DRY RUN — issues not created"));
  console.log();

  for (const finding of findings) {
    const severityColor = getSeverityColor(finding.severity);
    console.log(
      `  ${severityColor("●")} ${chalk.bold(finding.title)} ${chalk.dim(`[${finding.severity}/${finding.category}]`)}`
    );
    console.log(`    ${chalk.dim(finding.description.slice(0, 120))}`);
    console.log();
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case "critical":
      return chalk.red;
    case "major":
      return chalk.yellow;
    case "minor":
      return chalk.blue;
    default:
      return chalk.dim;
  }
}

export interface JsonReport {
  repo: string;
  findings: Finding[];
  results: IssueResult[];
  summary: {
    total: number;
    created: number;
    skipped: number;
    failed: number;
  };
  elapsedMs?: number;
}

export function formatJsonReport(
  repo: string,
  findings: Finding[],
  results: IssueResult[],
  elapsedMs?: number
): JsonReport {
  return {
    repo,
    findings,
    results,
    summary: {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped-duplicate").length,
      failed: results.filter((r) => r.status === "failed").length,
    },
    ...(elapsedMs !== undefined && { elapsedMs }),
  };
}

export function printSummaryFooter(elapsedMs: number): void {
  console.log(chalk.dim(`  Completed in ${formatElapsed(elapsedMs)}`));
  console.log();
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}
