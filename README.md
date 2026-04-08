# testme

[![CI](https://github.com/seedquan/testme/actions/workflows/ci.yml/badge.svg)](https://github.com/seedquan/testme/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/testme.svg)](https://www.npmjs.com/package/testme)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

## Commands

### Test a product (default)

```bash
testme https://github.com/owner/repo
```

### Initialize (first-time setup)

```bash
testme init          # creates ~/.testme/ with config
testme init --local  # creates .testmerc.json in current directory
```

Sets up the home directory (`~/.testme/`), creates a config file, and checks that Docker, Claude Code, and API keys are available.

### Preview the test plan (no Docker needed)

```bash
testme https://github.com/owner/repo --plan-only
```

### JSON output for CI pipelines

```bash
testme https://github.com/owner/repo --dry-run --json > results.json
```

### Compare reports for regressions

```bash
testme diff .testme-reports/old-report.json .testme-reports/new-report.json
```

Shows new findings (regressions), resolved findings, and persistent findings. Exits with code `1` if regressions are detected — useful in CI to gate merges.

### View past reports

```bash
testme reports
```

Lists all saved test reports from `.testme-reports/` with repo name, finding count, and elapsed time.

### Clean up stale Docker containers

```bash
testme cleanup
```

Removes any Docker containers left behind by crashed or interrupted runs.

### View current configuration

```bash
testme config          # human-readable
testme config --json   # machine-readable
```

Shows active settings, config file locations, and dependency status (Docker, API keys).

### Update to latest version

```bash
testme upgrade
```

### Export / import data

```bash
testme export -o backup.json     # backup config + reports
testme import backup.json        # restore from backup
```

### Reset all data

```bash
testme reset --yes   # delete ~/.testme/ and all reports
```

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
  "labels": ["qa", "automated"],
  "customScenarios": [
    {
      "name": "Test transaction rollback",
      "description": "Verify that failed transactions are properly rolled back",
      "steps": ["Create a transaction", "Force a failure", "Verify rollback"],
      "category": "cli"
    }
  ]
}
```

Custom scenarios are injected into the AI-generated test plan, so you can ensure domain-specific workflows are always tested.

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

## Reports

After each run, testme saves both a JSON and Markdown report to `.testme-reports/`:

```bash
ls .testme-reports/
# acme-widget-2026-04-08T15-30-00-000Z.json   ← machine-readable
# acme-widget-2026-04-08T15-30-00-000Z.md     ← human-readable
```

The markdown report includes findings with severity, steps to reproduce, and an issue summary table — shareable with non-technical stakeholders.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Clean — no issues found |
| `1` | Findings — issues were found (bugs or UX feedback) |
| `2` | Error — runtime failure (Docker, API, etc.) |

Useful for CI/CD: `testme owner/repo --dry-run || echo "Issues found!"`

## GitHub Actions

Use testme in your CI pipeline to automatically test products:

```yaml
name: Product Test
on:
  schedule:
    - cron: '0 9 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g testme
      - run: docker build -t testme-sandbox:latest -f node_modules/testme/Dockerfile.testme .
      - name: Run testme
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: testme ${{ github.repository }} --dry-run --json > report.json
      - uses: actions/upload-artifact@v4
        with:
          name: testme-report
          path: report.json
```

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
