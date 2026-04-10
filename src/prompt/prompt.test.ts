import { describe, it, expect } from "vitest";
import { buildTestPlanPrompt } from "./test-plan-prompt.js";
import { buildSystemPrompt } from "./system-prompt.js";
import type { RepoContext, TestPlan } from "../config.js";

const baseContext: RepoContext = {
  owner: "acme",
  repo: "widget",
  description: "A widget CLI tool",
  language: "TypeScript",
  readme: "# Widget\n\nInstall with `npm install -g widget`.\n\n## Usage\n\n```\nwidget init\nwidget build\n```",
  installFiles: { "package.json": '{"name":"widget","version":"1.0.0"}' },
  existingIssues: [],
  latestRelease: { tag: "v1.0.0", name: "First release" },
};

const basePlan: TestPlan = {
  productType: "cli",
  installMethod: "npm install -g widget",
  installPrerequisites: ["Node.js 18+"],
  cliCommands: ["widget init", "widget build"],
  webUrls: [],
  testScenarios: [
    {
      name: "Install via npm",
      description: "Install the widget CLI globally",
      steps: ["Run npm install -g widget", "Verify widget --version works"],
      category: "installation",
    },
  ],
};

describe("buildTestPlanPrompt", () => {
  it("includes repo owner, name, and description", () => {
    const prompt = buildTestPlanPrompt(baseContext);
    expect(prompt).toContain("acme/widget");
    expect(prompt).toContain("A widget CLI tool");
    expect(prompt).toContain("TypeScript");
  });

  it("includes README content", () => {
    const prompt = buildTestPlanPrompt(baseContext);
    expect(prompt).toContain("npm install -g widget");
    expect(prompt).toContain("widget init");
  });

  it("includes latest release info", () => {
    const prompt = buildTestPlanPrompt(baseContext);
    expect(prompt).toContain("v1.0.0");
    expect(prompt).toContain("First release");
  });

  it("handles empty README gracefully", () => {
    const ctx = { ...baseContext, readme: "" };
    const prompt = buildTestPlanPrompt(ctx);
    expect(prompt).toContain("acme/widget");
    expect(prompt).toContain("## README");
    // Should not throw
  });

  it("handles missing release", () => {
    const ctx = { ...baseContext, latestRelease: undefined };
    const prompt = buildTestPlanPrompt(ctx);
    expect(prompt).not.toContain("Latest Release");
  });

  it("truncates very long README", () => {
    const longReadme = "x".repeat(50000);
    const ctx = { ...baseContext, readme: longReadme };
    const prompt = buildTestPlanPrompt(ctx);
    // Should be truncated to 30000
    expect(prompt.length).toBeLessThan(longReadme.length);
  });

  it("truncates long install files", () => {
    const longFile = "y".repeat(10000);
    const ctx = { ...baseContext, installFiles: { "package.json": longFile } };
    const prompt = buildTestPlanPrompt(ctx);
    // File content should be truncated to 5000
    const fileSection = prompt.split("package.json")[1];
    expect(fileSection.length).toBeLessThan(longFile.length);
  });

  it("handles empty installFiles", () => {
    const ctx = { ...baseContext, installFiles: {} };
    const prompt = buildTestPlanPrompt(ctx);
    expect(prompt).not.toContain("## Project Files");
  });
});

describe("buildSystemPrompt", () => {
  it("includes the tester persona", () => {
    const prompt = buildSystemPrompt(baseContext, basePlan, { skipWeb: false });
    expect(prompt).toContain("professional beta tester");
  });

  it("includes repo and product info", () => {
    const prompt = buildSystemPrompt(baseContext, basePlan, { skipWeb: false });
    expect(prompt).toContain("acme/widget");
    expect(prompt).toContain("npm install -g widget");
  });

  it("includes test scenarios", () => {
    const prompt = buildSystemPrompt(baseContext, basePlan, { skipWeb: false });
    expect(prompt).toContain("Install via npm");
    expect(prompt).toContain("installation");
  });

  it("includes web UI instructions when not skipped", () => {
    const prompt = buildSystemPrompt(baseContext, basePlan, { skipWeb: false });
    expect(prompt).toContain("Playwright");
    expect(prompt).toContain("Chromium");
  });

  it("skips web UI instructions when skipWeb is true", () => {
    const prompt = buildSystemPrompt(baseContext, basePlan, { skipWeb: true });
    expect(prompt).toContain("SKIP");
    expect(prompt).not.toContain("Playwright");
  });

  it("includes output format instructions", () => {
    const prompt = buildSystemPrompt(baseContext, basePlan, { skipWeb: false });
    expect(prompt).toContain("testme-findings");
    expect(prompt).toContain("stepsToReproduce");
  });

  it("handles empty README", () => {
    const ctx = { ...baseContext, readme: "" };
    const prompt = buildSystemPrompt(ctx, basePlan, { skipWeb: false });
    expect(prompt).toContain("acme/widget");
    // Should not crash
  });

  it("handles empty description", () => {
    const ctx = { ...baseContext, description: "" };
    const prompt = buildSystemPrompt(ctx, basePlan, { skipWeb: false });
    expect(prompt).toContain("acme/widget");
  });

  it("includes existing issues to prevent duplicates", () => {
    const ctx = {
      ...baseContext,
      existingIssues: [
        { title: "Install fails on M1", body: "npm error", number: 42 },
        { title: "Docs are outdated", body: "missing v2 docs", number: 57 },
      ],
    };
    const prompt = buildSystemPrompt(ctx, basePlan, { skipWeb: false });
    expect(prompt).toContain("DO NOT DUPLICATE");
    expect(prompt).toContain("#42: Install fails on M1");
    expect(prompt).toContain("#57: Docs are outdated");
  });

  it("shows no issues message when none exist", () => {
    const prompt = buildSystemPrompt(baseContext, basePlan, { skipWeb: false });
    expect(prompt).toContain("No existing issues found");
  });
});
