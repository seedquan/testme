import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface Config {
  owner: string;
  repo: string;
  githubToken: string;
  dryRun: boolean;
  budget: number;
  timeout: number;
  model: string;
  verbose: boolean;
  skipWeb: boolean;
  labels: string[];
}

export interface RepoContext {
  owner: string;
  repo: string;
  description: string;
  language: string;
  readme: string;
  installFiles: Record<string, string>;
  existingIssues: Array<{ title: string; body: string; number: number }>;
  latestRelease?: { tag: string; name: string };
}

export interface TestPlan {
  productType: "cli" | "library" | "web-app" | "api" | "desktop-app";
  installMethod: string;
  installPrerequisites: string[];
  cliCommands: string[];
  webUrls: string[];
  testScenarios: Array<{
    name: string;
    description: string;
    steps: string[];
    category: "installation" | "cli" | "web-ui" | "api" | "docs";
  }>;
}

export interface Finding {
  title: string;
  description: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  category: "bug" | "ux-friction" | "docs" | "installation" | "performance";
  stepsToReproduce: string[];
  expected: string;
  actual: string;
  environment?: string;
}

export interface IssueResult {
  finding: Finding;
  status: "created" | "skipped-duplicate" | "failed";
  issueNumber?: number;
  issueUrl?: string;
  duplicateOf?: number;
}

export const DEFAULTS = {
  budget: 5,
  timeout: 30,
  model: "sonnet",
  dockerImage: "testme-sandbox:latest",
} as const;

export interface ConfigFile {
  githubToken?: string;
  dryRun?: boolean;
  budget?: number;
  timeout?: number;
  model?: string;
  verbose?: boolean;
  skipWeb?: boolean;
  labels?: string[];
}

export const CONFIG_FILENAMES = [".testmerc.json", ".testmerc", "testme.config.json"];

export function loadConfigFile(cwd: string): ConfigFile {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = join(cwd, filename);
    if (existsSync(filepath)) {
      try {
        const raw = readFileSync(filepath, "utf-8");
        return JSON.parse(raw) as ConfigFile;
      } catch {
        // Invalid JSON, skip
      }
    }
  }
  return {};
}
