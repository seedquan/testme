import type { Finding } from "../config.js";
import type { JsonReport } from "../output/terminal.js";

export interface DiffResult {
  baseReport: string;
  headReport: string;
  newFindings: Finding[];
  resolvedFindings: Finding[];
  persistentFindings: Finding[];
  summary: {
    new: number;
    resolved: number;
    persistent: number;
    regression: boolean;
  };
}

export function compareReports(
  base: JsonReport,
  head: JsonReport
): DiffResult {
  const baseFindings = base.findings;
  const headFindings = head.findings;

  const newFindings: Finding[] = [];
  const persistentFindings: Finding[] = [];
  const resolvedFindings: Finding[] = [];

  // For each finding in head, check if it existed in base
  for (const finding of headFindings) {
    const match = baseFindings.find((b) => isSimilarFinding(b, finding));
    if (match) {
      persistentFindings.push(finding);
    } else {
      newFindings.push(finding);
    }
  }

  // For each finding in base, check if it still exists in head
  for (const finding of baseFindings) {
    const match = headFindings.find((h) => isSimilarFinding(finding, h));
    if (!match) {
      resolvedFindings.push(finding);
    }
  }

  return {
    baseReport: base.repo,
    headReport: head.repo,
    newFindings,
    resolvedFindings,
    persistentFindings,
    summary: {
      new: newFindings.length,
      resolved: resolvedFindings.length,
      persistent: persistentFindings.length,
      regression: newFindings.length > 0,
    },
  };
}

function isSimilarFinding(a: Finding, b: Finding): boolean {
  // Match by normalized title similarity > 0.7
  const titleA = normalize(a.title);
  const titleB = normalize(b.title);

  if (titleA === titleB) return true;

  // Also check category match + high title overlap
  if (a.category === b.category) {
    const similarity = stringSimilarity(titleA, titleB);
    if (similarity > 0.7) return true;
  }

  return false;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const distance = levenshtein(longer, shorter);
  return (longer.length - distance) / longer.length;
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
