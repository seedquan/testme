import { Octokit } from "@octokit/rest";
import type { Config, Finding, IssueResult, RepoContext } from "../config.js";
import { withRetry } from "../utils/retry.js";

export async function createIssues(
  findings: Finding[],
  context: RepoContext,
  config: Config
): Promise<IssueResult[]> {
  const octokit = new Octokit({ auth: config.githubToken });
  const results: IssueResult[] = [];

  // Ensure all needed labels exist on the repo
  if (!config.dryRun) {
    await ensureLabelsExist(octokit, config, findings);
  }

  for (const finding of findings) {
    // Check for duplicates
    const duplicate = findDuplicate(finding, context.existingIssues);
    if (duplicate) {
      results.push({
        finding,
        status: "skipped-duplicate",
        duplicateOf: duplicate.number,
      });
      continue;
    }

    if (config.dryRun) {
      results.push({ finding, status: "created" });
      continue;
    }

    try {
      const labels = buildLabels(finding, config.labels);
      const body = formatIssueBody(finding);

      const issue = await withRetry(
        () =>
          octokit.issues.create({
            owner: config.owner,
            repo: config.repo,
            title: finding.title,
            body,
            labels,
          }),
        { maxAttempts: 3, delayMs: 2000 }
      );

      results.push({
        finding,
        status: "created",
        issueNumber: issue.data.number,
        issueUrl: issue.data.html_url,
      });

      // Rate limit: 1s between issue creation
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      results.push({ finding, status: "failed" });
    }
  }

  return results;
}

function findDuplicate(
  finding: Finding,
  existingIssues: RepoContext["existingIssues"]
): { number: number } | null {
  const normalizedTitle = normalize(finding.title);

  for (const issue of existingIssues) {
    const similarity = stringSimilarity(normalizedTitle, normalize(issue.title));
    if (similarity > 0.8) {
      return { number: issue.number };
    }
  }
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;

  const editDistance = levenshtein(longer, shorter);
  return (longerLength - editDistance) / longerLength;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

const LABEL_COLORS: Record<string, string> = {
  testme: "7057ff",
  bug: "d73a4a",
  enhancement: "a2eeef",
  "severity:critical": "b60205",
  "severity:major": "e99695",
  "severity:minor": "f9d0c4",
  "severity:suggestion": "c5def5",
};

async function ensureLabelsExist(
  octokit: InstanceType<typeof Octokit>,
  config: Config,
  findings: Finding[]
): Promise<void> {
  // Collect all labels we'll need
  const neededLabels = new Set<string>();
  for (const finding of findings) {
    for (const label of buildLabels(finding, config.labels)) {
      neededLabels.add(label);
    }
  }

  // Fetch existing labels
  let existingLabels: Set<string>;
  try {
    const { data } = await octokit.issues.listLabelsForRepo({
      owner: config.owner,
      repo: config.repo,
      per_page: 100,
    });
    existingLabels = new Set(data.map((l) => l.name));
  } catch {
    return; // If we can't list labels, issue creation will handle errors
  }

  // Create missing labels
  for (const label of neededLabels) {
    if (!existingLabels.has(label)) {
      try {
        await octokit.issues.createLabel({
          owner: config.owner,
          repo: config.repo,
          name: label,
          color: LABEL_COLORS[label] || "ededed",
        });
      } catch {
        // Label may have been created concurrently, or we lack permission — continue
      }
    }
  }
}

function buildLabels(finding: Finding, extraLabels: string[]): string[] {
  const labels = ["testme"];

  if (finding.category === "bug" || finding.category === "installation") {
    labels.push("bug");
  } else {
    labels.push("enhancement");
  }

  labels.push(`severity:${finding.severity}`);

  for (const label of extraLabels) {
    if (label) labels.push(label);
  }

  return labels;
}

function formatIssueBody(finding: Finding): string {
  const steps = finding.stepsToReproduce
    .map((step, i) => `${i + 1}. ${step}`)
    .join("\n");

  return `## Description

${finding.description}

## Steps to Reproduce

${steps}

## Expected Behavior

${finding.expected}

## Actual Behavior

${finding.actual}

${finding.environment ? `## Environment\n\n${finding.environment}\n` : ""}
---

*This issue was found by [testme](https://github.com/seedquan/testme) — an AI-powered product tester.*`;
}
