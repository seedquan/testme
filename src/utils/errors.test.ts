import { describe, it, expect } from "vitest";
import { friendlyError, formatElapsed } from "./errors.js";

describe("friendlyError", () => {
  it("handles GitHub 404", () => {
    const msg = friendlyError(new Error("HttpError: Not Found - 404"));
    expect(msg).toContain("not found");
  });

  it("handles GitHub 403", () => {
    const msg = friendlyError(new Error("HttpError: Forbidden - status 403"));
    expect(msg).toContain("rate limit");
  });

  it("handles GitHub 401", () => {
    const msg = friendlyError(new Error("HttpError: 401 Unauthorized"));
    expect(msg).toContain("Authentication failed");
  });

  it("handles Docker not running", () => {
    const msg = friendlyError(new Error("Cannot connect to the Docker daemon"));
    expect(msg).toContain("not running");
  });

  it("handles Claude Code not found", () => {
    const msg = friendlyError(new Error("claude ENOENT"));
    expect(msg).toContain("Claude Code CLI not found");
  });

  it("handles network errors", () => {
    const msg = friendlyError(new Error("getaddrinfo ENOTFOUND api.github.com"));
    expect(msg).toContain("Network error");
  });

  it("falls back to first line of message", () => {
    const msg = friendlyError(new Error("Something went wrong\nstack trace line 1\nstack trace line 2"));
    expect(msg).toBe("Something went wrong");
    expect(msg).not.toContain("stack trace");
  });

  it("handles non-Error values", () => {
    const msg = friendlyError("just a string");
    expect(msg).toBe("just a string");
  });
});

describe("formatElapsed", () => {
  it("formats milliseconds", () => {
    expect(formatElapsed(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatElapsed(5000)).toBe("5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsed(125000)).toBe("2m 5s");
  });

  it("formats exact minutes", () => {
    expect(formatElapsed(60000)).toBe("1m 0s");
  });
});
