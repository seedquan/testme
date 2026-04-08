export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  // GitHub API errors
  if (msg.includes("HttpError") || msg.includes("status")) {
    if (msg.includes("404")) {
      return "Repository not found. Check the URL and ensure your token has access to private repos.";
    }
    if (msg.includes("403")) {
      return "Access denied. Your GitHub token may lack the `repo` scope, or you've hit the API rate limit.";
    }
    if (msg.includes("401")) {
      return "Authentication failed. Check that your GitHub token is valid.";
    }
    if (msg.includes("429")) {
      return "GitHub API rate limit exceeded. Wait a few minutes and try again.";
    }
  }

  // Docker errors
  if (msg.includes("docker") || msg.includes("Docker")) {
    if (msg.includes("Cannot connect") || msg.includes("Is the docker daemon running")) {
      return "Docker is not running. Start Docker Desktop or the Docker daemon and try again.";
    }
    if (msg.includes("No such image")) {
      return "Docker sandbox image not found. Run `docker build -t testme-sandbox:latest -f Dockerfile.testme .`";
    }
  }

  // Claude Code errors
  if (msg.includes("claude") || msg.includes("ANTHROPIC")) {
    if (msg.includes("ENOENT")) {
      return "Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code";
    }
    if (msg.includes("invalid_api_key") || msg.includes("401")) {
      return "Invalid Anthropic API key. Check your ANTHROPIC_API_KEY environment variable.";
    }
  }

  // Network errors
  if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
    return "Network error. Check your internet connection.";
  }

  // Fall back to original message (first line only, no stack)
  return msg.split("\n")[0];
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
