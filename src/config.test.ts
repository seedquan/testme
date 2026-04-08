import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfigFile } from "./config.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfigFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "testme-config-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty object when no config file exists", () => {
    const config = loadConfigFile(tempDir);
    expect(config).toEqual({});
  });

  it("loads .testmerc.json", () => {
    writeFileSync(
      join(tempDir, ".testmerc.json"),
      JSON.stringify({ budget: 10, model: "opus", labels: ["custom"] })
    );
    const config = loadConfigFile(tempDir);
    expect(config.budget).toBe(10);
    expect(config.model).toBe("opus");
    expect(config.labels).toEqual(["custom"]);
  });

  it("loads .testmerc (no extension)", () => {
    writeFileSync(
      join(tempDir, ".testmerc"),
      JSON.stringify({ dryRun: true, timeout: 60 })
    );
    const config = loadConfigFile(tempDir);
    expect(config.dryRun).toBe(true);
    expect(config.timeout).toBe(60);
  });

  it("loads testme.config.json", () => {
    writeFileSync(
      join(tempDir, "testme.config.json"),
      JSON.stringify({ verbose: true, skipWeb: true })
    );
    const config = loadConfigFile(tempDir);
    expect(config.verbose).toBe(true);
    expect(config.skipWeb).toBe(true);
  });

  it("prefers .testmerc.json over .testmerc", () => {
    writeFileSync(
      join(tempDir, ".testmerc.json"),
      JSON.stringify({ budget: 10 })
    );
    writeFileSync(
      join(tempDir, ".testmerc"),
      JSON.stringify({ budget: 20 })
    );
    const config = loadConfigFile(tempDir);
    expect(config.budget).toBe(10);
  });

  it("skips invalid JSON and tries next file", () => {
    writeFileSync(join(tempDir, ".testmerc.json"), "not json {{{");
    writeFileSync(
      join(tempDir, ".testmerc"),
      JSON.stringify({ budget: 15 })
    );
    const config = loadConfigFile(tempDir);
    expect(config.budget).toBe(15);
  });
});
