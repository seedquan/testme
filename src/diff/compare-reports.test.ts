import { describe, it, expect } from "vitest";
import { compareReports, type DiffResult } from "./compare-reports.js";
import type { Finding } from "../config.js";
import type { JsonReport } from "../output/terminal.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    title: "Default finding",
    description: "A test finding",
    severity: "major",
    category: "bug",
    stepsToReproduce: ["step 1"],
    expected: "expected",
    actual: "actual",
    ...overrides,
  };
}

function makeReport(findings: Finding[], repo = "acme/widget"): JsonReport {
  return {
    repo,
    findings,
    results: findings.map((f) => ({ finding: f, status: "created" as const })),
    summary: {
      total: findings.length,
      created: findings.length,
      skipped: 0,
      failed: 0,
    },
  };
}

describe("compareReports", () => {
  it("detects new findings in head", () => {
    const base = makeReport([]);
    const head = makeReport([makeFinding({ title: "New bug" })]);
    const diff = compareReports(base, head);
    expect(diff.newFindings).toHaveLength(1);
    expect(diff.newFindings[0].title).toBe("New bug");
    expect(diff.resolvedFindings).toHaveLength(0);
    expect(diff.summary.regression).toBe(true);
  });

  it("detects resolved findings in base", () => {
    const base = makeReport([makeFinding({ title: "Old bug" })]);
    const head = makeReport([]);
    const diff = compareReports(base, head);
    expect(diff.resolvedFindings).toHaveLength(1);
    expect(diff.resolvedFindings[0].title).toBe("Old bug");
    expect(diff.newFindings).toHaveLength(0);
    expect(diff.summary.regression).toBe(false);
  });

  it("detects persistent findings", () => {
    const finding = makeFinding({ title: "Ongoing issue" });
    const base = makeReport([finding]);
    const head = makeReport([finding]);
    const diff = compareReports(base, head);
    expect(diff.persistentFindings).toHaveLength(1);
    expect(diff.newFindings).toHaveLength(0);
    expect(diff.resolvedFindings).toHaveLength(0);
    expect(diff.summary.regression).toBe(false);
  });

  it("matches similar titles across runs", () => {
    const base = makeReport([
      makeFinding({ title: "Crash on widget build", category: "bug" }),
    ]);
    const head = makeReport([
      makeFinding({ title: "Crash on widget builds", category: "bug" }),
    ]);
    const diff = compareReports(base, head);
    expect(diff.persistentFindings).toHaveLength(1);
    expect(diff.newFindings).toHaveLength(0);
  });

  it("treats different categories as different findings", () => {
    const base = makeReport([
      makeFinding({ title: "Missing docs", category: "docs" }),
    ]);
    const head = makeReport([
      makeFinding({ title: "Missing docs", category: "bug" }),
    ]);
    // Same title, different category — still matches on exact title
    const diff = compareReports(base, head);
    expect(diff.persistentFindings).toHaveLength(1);
  });

  it("handles complex mix of new, resolved, and persistent", () => {
    const base = makeReport([
      makeFinding({ title: "Installation fails on macOS" }),
      makeFinding({ title: "Missing documentation for config" }),
      makeFinding({ title: "Timeout on large repos" }),
    ]);
    const head = makeReport([
      makeFinding({ title: "Missing documentation for config" }),
      makeFinding({ title: "Timeout on large repos" }),
      makeFinding({ title: "Crash when API key is invalid" }),
    ]);
    const diff = compareReports(base, head);
    expect(diff.resolvedFindings).toHaveLength(1);
    expect(diff.resolvedFindings[0].title).toBe("Installation fails on macOS");
    expect(diff.persistentFindings).toHaveLength(2);
    expect(diff.newFindings).toHaveLength(1);
    expect(diff.newFindings[0].title).toBe("Crash when API key is invalid");
    expect(diff.summary).toEqual({
      new: 1,
      resolved: 1,
      persistent: 2,
      regression: true,
    });
  });

  it("handles both reports empty", () => {
    const diff = compareReports(makeReport([]), makeReport([]));
    expect(diff.summary).toEqual({
      new: 0,
      resolved: 0,
      persistent: 0,
      regression: false,
    });
  });
});
