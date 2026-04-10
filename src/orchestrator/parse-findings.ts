import type { Finding } from "../config.js";

export function parseFindings(rawOutput: string): Finding[] {
  // Strategy 1: fenced testme-findings block
  const fencedMatch = rawOutput.match(
    /```testme-findings\s*\n?([\s\S]*?)\n?```/
  );
  if (fencedMatch) {
    const result = tryParseArray(fencedMatch[1]);
    if (result) return result;
  }

  // Strategy 2: any fenced json block containing an array
  const jsonFenceMatch = rawOutput.match(
    /```(?:json)?\s*\n?(\[[\s\S]*?\])\s*\n?```/
  );
  if (jsonFenceMatch) {
    const result = tryParseArray(jsonFenceMatch[1]);
    if (result) return result;
  }

  // Strategy 3: find the outermost [...] using bracket counting (O(n), not O(n²))
  const arrayContent = extractOutermostArray(rawOutput);
  if (arrayContent) {
    const result = tryParseArray(arrayContent);
    if (result) return result;
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

/** Try to parse a string as a JSON array of findings, with trailing comma fix */
function tryParseArray(candidate: string): Finding[] | null {
  const trimmed = candidate.trim();
  // Direct parse
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed.filter(isValidFinding);
      if (valid.length > 0) return valid;
    }
  } catch {
    // Try fixing trailing commas
    const fixed = trimmed.replace(/,\s*([\]}])/g, "$1");
    try {
      const parsed = JSON.parse(fixed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(isValidFinding);
        if (valid.length > 0) return valid;
      }
    } catch {
      // Give up
    }
  }
  return null;
}

/** Extract the outermost [...] from a string using bracket counting — O(n) */
function extractOutermostArray(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        // Quick check: does it contain "title" (finding-like)?
        if (candidate.includes('"title"')) {
          return candidate;
        }
        // Reset and keep looking
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }

  return null;
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
