# testme

AI-powered product tester — dogfood any product and file GitHub issues automatically.

`testme` acts as a professional beta tester. Point it at a GitHub repo, and it will:

1. Read the README and docs (as a real user would)
2. Spin up a fresh Docker sandbox
3. Install and test the product following the official instructions
4. File GitHub issues for bugs and UX friction it finds

## Install

```bash
npm install -g testme
```

## Prerequisites

- **Docker** — must be installed and running
- **GitHub token** — with `repo` scope (for reading repos and creating issues)
- **Anthropic API key** — for Claude Code (the AI brain inside Docker)

## Usage

```bash
# Basic usage
testme https://github.com/owner/repo

# Dry run — see findings without creating issues
testme https://github.com/owner/repo --dry-run

# Shorthand
testme owner/repo --dry-run

# With options
testme https://github.com/owner/repo \
  --budget 10 \
  --timeout 45 \
  --model opus \
  --verbose
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `-t, --github-token <token>` | `GITHUB_TOKEN` env | GitHub personal access token |
| `--dry-run` | `false` | Show findings without creating issues |
| `--budget <usd>` | `5` | Max API spend in USD |
| `--timeout <minutes>` | `30` | Max test time in minutes |
| `--model <model>` | `sonnet` | Claude model to use |
| `--verbose` | `false` | Stream Claude Code's live output |
| `--skip-web` | `false` | Skip web UI testing |
| `--labels <labels>` | | Extra issue labels (comma-separated) |
| `--json` | `false` | Output results as JSON (for CI/scripting) |
| `--plan-only` | `false` | Generate test plan and exit (no Docker needed) |

## Config File

Create a `.testmerc.json` in your project root to persist settings:

```json
{
  "budget": 10,
  "timeout": 45,
  "model": "opus",
  "dryRun": false,
  "verbose": false,
  "skipWeb": false,
  "labels": ["qa", "automated"]
}
```

Supported filenames (checked in order): `.testmerc.json`, `.testmerc`, `testme.config.json`

CLI arguments always take precedence over config file values.

## Environment Variables

```bash
export GITHUB_TOKEN=ghp_...        # GitHub PAT with repo scope
export ANTHROPIC_API_KEY=sk-ant-...  # Anthropic API key
```

## How It Works

```
testme https://github.com/owner/repo
  |
  +-- [1] Fetch repo context via GitHub API (README, docs, existing issues)
  +-- [2] Generate test plan via Claude Code (local, cheap)
  +-- [3] Spin up Docker container (debian + node + chromium + claude)
  +-- [4] Claude Code installs & tests the product inside Docker
  +-- [5] Parse findings, deduplicate against existing issues
  +-- [6] Create GitHub issues with labels and structured reports
  +-- [7] Print summary table
```

The Docker sandbox includes Node.js, Python, Chromium, and Playwright — so it can test CLI tools, web apps, APIs, and libraries.

## Issue Format

Created issues include:
- **Labels**: `testme` + `bug`/`enhancement` + `severity:critical|major|minor`
- **Body**: Description, steps to reproduce, expected vs actual behavior
- **Deduplication**: Skips issues that are >80% similar to existing open bugs

## First Run

On first run, `testme` builds the Docker sandbox image (~1.5GB). Subsequent runs reuse the cached image.

```bash
# Or build manually
docker build -t testme-sandbox:latest -f Dockerfile.testme .
```

## Development

```bash
git clone https://github.com/seedquan/testme
cd testme
npm install
npm run dev -- https://github.com/owner/repo --dry-run
npm run test
npm run build
```

## License

MIT
