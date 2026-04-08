import type { Finding } from "../config.js";

export function parseFindings(rawOutput: string): Finding[] {
  // Look for the fenced testme-findings block
  const fencedMatch = rawOutput.match(
    /```testme-findings\s*\n?([\s\S]*?)\n?```/
  );

  if (fencedMatch) {
    try {
      const findings = JSON.parse(fencedMatch[1]);
      if (Array.isArray(findings)) {
        return findings.filter(isValidFinding);
      }
    } catch {
      // Fall through to other strategies
    }
  }

  // Fallback: look for any JSON array in the output
  const jsonArrayMatches = rawOutput.match(/\[[\s\S]*?\]/g);
  if (jsonArrayMatches) {
    for (const match of jsonArrayMatches) {
      try {
        const parsed = JSON.parse(match);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title) {
          return parsed.filter(isValidFinding);
        }
      } catch {
        continue;
      }
    }
  }

  // Last resort: create a single finding from the raw output
  if (rawOutput.length > 100) {
    return [
      {
        title: "Test run completed but findings could not be parsed",
        description: `The test agent completed but did not produce structured findings. Raw output excerpt:\n\n${rawOutput.slice(-2000)}`,
        severity: "minor",
        category: "bug",
        stepsToReproduce: ["Run testme against this repo"],
        expected: "Structured test findings",
        actual: "Unstructured output",
      },
    ];
  }

  return [];
}

function isValidFinding(f: unknown): f is Finding {
  if (typeof f !== "object" || f === null) return false;
  const obj = f as Record<string, unknown>;
  return (
    typeof obj.title === "string" &&
    typeof obj.description === "string" &&
    typeof obj.severity === "string" &&
    typeof obj.category === "string" &&
    Array.isArray(obj.stepsToReproduce) &&
    typeof obj.expected === "string" &&
    typeof obj.actual === "string"
  );
}
