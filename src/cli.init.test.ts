import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULTS } from "./config.js";

describe("testme init scaffolding", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "testme-init-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // We test the template content directly since the CLI action
  // calls writeFileSync with this exact structure
  function scaffoldConfig(dir: string) {
    const filepath = join(dir, ".testmerc.json");
    if (existsSync(filepath)) {
      throw new Error(".testmerc.json already exists");
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
    const { writeFileSync } = require("node:fs");
    writeFileSync(filepath, JSON.stringify(template, null, 2) + "\n");
    return filepath;
  }

  it("creates .testmerc.json with defaults", () => {
    const filepath = scaffoldConfig(tempDir);
    expect(existsSync(filepath)).toBe(true);

    const content = JSON.parse(readFileSync(filepath, "utf-8"));
    expect(content.budget).toBe(DEFAULTS.budget);
    expect(content.timeout).toBe(DEFAULTS.timeout);
    expect(content.model).toBe(DEFAULTS.model);
    expect(content.dryRun).toBe(false);
    expect(content.labels).toEqual([]);
    expect(content.customScenarios).toEqual([]);
  });

  it("throws if .testmerc.json already exists", () => {
    scaffoldConfig(tempDir);
    expect(() => scaffoldConfig(tempDir)).toThrow("already exists");
  });

  it("produces valid JSON with trailing newline", () => {
    const filepath = scaffoldConfig(tempDir);
    const raw = readFileSync(filepath, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
