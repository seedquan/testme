import { describe, it, expect } from "vitest";
import { parseFindings } from "./parse-findings.js";

describe("parseFindings", () => {
  it("extracts findings from fenced testme-findings block", () => {
    const output = `
Some test output here...

\`\`\`testme-findings
[
  {
    "title": "Install fails on Node 18",
    "description": "npm install throws ERESOLVE error",
    "severity": "critical",
    "category": "installation",
    "stepsToReproduce": ["Run npm install -g foo"],
    "expected": "Successful installation",
    "actual": "ERESOLVE peer dependency conflict"
  }
]
\`\`\`

Done testing.
`;

    const findings = parseFindings(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Install fails on Node 18");
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].category).toBe("installation");
  });

  it("extracts multiple findings", () => {
    const output = `
\`\`\`testme-findings
[
  {
    "title": "Bug 1",
    "description": "desc 1",
    "severity": "major",
    "category": "bug",
    "stepsToReproduce": ["step 1"],
    "expected": "expected 1",
    "actual": "actual 1"
  },
  {
    "title": "Bug 2",
    "description": "desc 2",
    "severity": "minor",
    "category": "ux-friction",
    "stepsToReproduce": ["step 1"],
    "expected": "expected 2",
    "actual": "actual 2"
  }
]
\`\`\`
`;

    const findings = parseFindings(output);
    expect(findings).toHaveLength(2);
    expect(findings[0].title).toBe("Bug 1");
    expect(findings[1].title).toBe("Bug 2");
  });

  it("falls back to JSON array in raw output", () => {
    const output = `Testing complete. Here are my findings:
[{"title":"Broken link","description":"404 on docs","severity":"minor","category":"docs","stepsToReproduce":["Click docs link"],"expected":"Page loads","actual":"404 error"}]
End of report.`;

    const findings = parseFindings(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Broken link");
  });

  it("returns fallback finding for unparseable output", () => {
    const output = "A".repeat(200); // Long but unparseable
    const findings = parseFindings(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("could not be parsed");
  });

  it("returns empty array for short unparseable output", () => {
    const findings = parseFindings("ok");
    expect(findings).toHaveLength(0);
  });

  it("filters out invalid findings", () => {
    const output = `
\`\`\`testme-findings
[
  {
    "title": "Valid",
    "description": "desc",
    "severity": "major",
    "category": "bug",
    "stepsToReproduce": ["step"],
    "expected": "expected",
    "actual": "actual"
  },
  {
    "title": "Missing fields"
  }
]
\`\`\`
`;

    const findings = parseFindings(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Valid");
  });
});
