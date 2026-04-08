import { Octokit } from "@octokit/rest";
import type { Config, RepoContext } from "../config.js";

export async function fetchRepoContext(config: Config): Promise<RepoContext> {
  const octokit = new Octokit({ auth: config.githubToken });
  const { owner, repo } = config;

  // Fetch repo metadata, README, and existing issues in parallel
  const [repoData, readmeData, issuesData, releaseData, rootContents] =
    await Promise.all([
      octokit.repos.get({ owner, repo }),
      octokit.repos.getReadme({ owner, repo }).catch(() => null),
      octokit.issues.listForRepo({
        owner,
        repo,
        labels: "bug",
        state: "open",
        per_page: 50,
      }).catch(() => ({ data: [] })),
      octokit.repos.getLatestRelease({ owner, repo }).catch(() => null),
      octokit.repos.getContent({ owner, repo, path: "" }).catch(() => null),
    ]);

  // Decode README
  const readme = readmeData
    ? Buffer.from(readmeData.data.content, "base64").toString("utf-8")
    : "";

  // Fetch key install-related files from root listing
  const installFiles: Record<string, string> = {};
  const interestingFiles = [
    "package.json",
    "pyproject.toml",
    "setup.py",
    "Makefile",
    "Cargo.toml",
    "go.mod",
    "CONTRIBUTING.md",
    "INSTALL.md",
    "docker-compose.yml",
    "docker-compose.yaml",
  ];

  if (rootContents && Array.isArray(rootContents.data)) {
    const filesToFetch = rootContents.data
      .filter(
        (f: { name: string; type: string }) =>
          f.type === "file" && interestingFiles.includes(f.name)
      )
      .map((f: { name: string }) => f.name);

    const fileResults = await Promise.all(
      filesToFetch.map((name: string) =>
        octokit.repos
          .getContent({ owner, repo, path: name })
          .then((res) => {
            const data = res.data as { content?: string; encoding?: string };
            if (data.content && data.encoding === "base64") {
              return {
                name,
                content: Buffer.from(data.content, "base64").toString("utf-8"),
              };
            }
            return null;
          })
          .catch(() => null)
      )
    );

    for (const result of fileResults) {
      if (result) {
        installFiles[result.name] = result.content;
      }
    }
  }

  // Also try to fetch docs/getting-started.md or similar
  for (const docsPath of [
    "docs/getting-started.md",
    "docs/installation.md",
    "docs/quickstart.md",
  ]) {
    try {
      const res = await octokit.repos.getContent({ owner, repo, path: docsPath });
      const data = res.data as { content?: string; encoding?: string };
      if (data.content && data.encoding === "base64") {
        installFiles[docsPath] = Buffer.from(data.content, "base64").toString(
          "utf-8"
        );
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  return {
    owner,
    repo,
    description: repoData.data.description || "",
    language: repoData.data.language || "unknown",
    readme,
    installFiles,
    existingIssues: issuesData.data.map((issue) => ({
      title: issue.title,
      body: issue.body || "",
      number: issue.number,
    })),
    latestRelease: releaseData
      ? {
          tag: releaseData.data.tag_name,
          name: releaseData.data.name || releaseData.data.tag_name,
        }
      : undefined,
  };
}
