import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULTS } from "./config.js";

// We test the config construction logic by extracting it.
// Since createCli().action() calls process.exit and run(), we test the
// building blocks: parseRepoUrl + config cascade logic.
import { parseRepoUrl } from "./cli.js";

describe("CLI config cascade integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "ghp_test123";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test123";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Simulate the cascade logic from cli.ts
  function buildConfig(
    opts: Record<string, string | boolean>,
    fileConfig: Record<string, unknown> = {}
  ) {
    const parsed = parseRepoUrl(opts.repoUrl as string);
    if (!parsed) throw new Error("Invalid URL");

    const budgetExplicit = opts.budget !== String(DEFAULTS.budget);
    const budget = budgetExplicit
      ? parseFloat(opts.budget as string)
      : ((fileConfig.budget as number) ?? DEFAULTS.budget);

    const timeoutExplicit = opts.timeout !== String(DEFAULTS.timeout);
    const timeout = timeoutExplicit
      ? parseInt(opts.timeout as string, 10)
      : ((fileConfig.timeout as number) ?? DEFAULTS.timeout);

    const model = opts.model !== DEFAULTS.model
      ? opts.model as string
      : ((fileConfig.model as string) ?? DEFAULTS.model);

    return { ...parsed, budget, timeout, model };
  }

  it("uses defaults when no flags or config file", () => {
    const config = buildConfig({
      repoUrl: "acme/widget",
      budget: String(DEFAULTS.budget),
      timeout: String(DEFAULTS.timeout),
      model: DEFAULTS.model,
    });
    expect(config).toEqual({
      owner: "acme",
      repo: "widget",
      budget: DEFAULTS.budget,
      timeout: DEFAULTS.timeout,
      model: DEFAULTS.model,
    });
  });

  it("config file overrides defaults", () => {
    const config = buildConfig(
      {
        repoUrl: "acme/widget",
        budget: String(DEFAULTS.budget),
        timeout: String(DEFAULTS.timeout),
        model: DEFAULTS.model,
      },
      { budget: 10, timeout: 60, model: "opus" }
    );
    expect(config.budget).toBe(10);
    expect(config.timeout).toBe(60);
    expect(config.model).toBe("opus");
  });

  it("explicit CLI flags override config file", () => {
    const config = buildConfig(
      {
        repoUrl: "acme/widget",
        budget: "20",
        timeout: "90",
        model: "haiku",
      },
      { budget: 10, timeout: 60, model: "opus" }
    );
    expect(config.budget).toBe(20);
    expect(config.timeout).toBe(90);
    expect(config.model).toBe("haiku");
  });

  it("explicit CLI flag overrides config even when config has same value as default", () => {
    const config = buildConfig(
      {
        repoUrl: "acme/widget",
        budget: "7",
        timeout: String(DEFAULTS.timeout),
        model: DEFAULTS.model,
      },
      { budget: DEFAULTS.budget }
    );
    // Budget was explicitly passed as "7", should use 7
    expect(config.budget).toBe(7);
    // Timeout was not explicit, config has no override, so default
    expect(config.timeout).toBe(DEFAULTS.timeout);
  });

  it("handles full GitHub URL", () => {
    const config = buildConfig({
      repoUrl: "https://github.com/my-org/my-tool.git",
      budget: String(DEFAULTS.budget),
      timeout: String(DEFAULTS.timeout),
      model: DEFAULTS.model,
    });
    expect(config.owner).toBe("my-org");
    expect(config.repo).toBe("my-tool");
  });

  it("handles URL with query params", () => {
    const config = buildConfig({
      repoUrl: "https://github.com/acme/widget?tab=readme",
      budget: String(DEFAULTS.budget),
      timeout: String(DEFAULTS.timeout),
      model: DEFAULTS.model,
    });
    expect(config.owner).toBe("acme");
    expect(config.repo).toBe("widget");
  });
});
