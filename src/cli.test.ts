import { describe, it, expect } from "vitest";
import { parseRepoUrl } from "./cli.js";

describe("parseRepoUrl", () => {
  // Full URLs
  it("parses https://github.com/owner/repo", () => {
    expect(parseRepoUrl("https://github.com/acme/widget")).toEqual({
      owner: "acme",
      repo: "widget",
    });
  });

  it("parses http://github.com/owner/repo", () => {
    expect(parseRepoUrl("http://github.com/acme/widget")).toEqual({
      owner: "acme",
      repo: "widget",
    });
  });

  it("parses github.com/owner/repo without protocol", () => {
    expect(parseRepoUrl("github.com/acme/widget")).toEqual({
      owner: "acme",
      repo: "widget",
    });
  });

  // Trailing slash
  it("handles trailing slash", () => {
    expect(parseRepoUrl("https://github.com/acme/widget/")).toEqual({
      owner: "acme",
      repo: "widget",
    });
  });

  // .git suffix
  it("strips .git suffix", () => {
    expect(parseRepoUrl("https://github.com/acme/widget.git")).toEqual({
      owner: "acme",
      repo: "widget",
    });
  });

  // Query params
  it("strips query parameters", () => {
    expect(parseRepoUrl("https://github.com/acme/widget?ref=main")).toEqual({
      owner: "acme",
      repo: "widget",
    });
  });

  // Hash fragment
  it("strips hash fragment", () => {
    expect(parseRepoUrl("https://github.com/acme/widget#readme")).toEqual({
      owner: "acme",
      repo: "widget",
    });
  });

  // Shorthand
  it("parses owner/repo shorthand", () => {
    expect(parseRepoUrl("acme/widget")).toEqual({
      owner: "acme",
      repo: "widget",
    });
  });

  // Repo names with special characters
  it("handles hyphenated names", () => {
    expect(parseRepoUrl("my-org/my-cool-tool")).toEqual({
      owner: "my-org",
      repo: "my-cool-tool",
    });
  });

  it("handles dots in repo name", () => {
    expect(parseRepoUrl("https://github.com/acme/widget.js")).toEqual({
      owner: "acme",
      repo: "widget.js",
    });
  });

  it("handles underscores", () => {
    expect(parseRepoUrl("my_org/my_repo")).toEqual({
      owner: "my_org",
      repo: "my_repo",
    });
  });

  // Invalid inputs
  it("returns null for empty string", () => {
    expect(parseRepoUrl("")).toBeNull();
  });

  it("returns null for plain text", () => {
    expect(parseRepoUrl("not-a-url")).toBeNull();
  });

  it("returns null for non-github URL", () => {
    expect(parseRepoUrl("https://gitlab.com/acme/widget")).toBeNull();
  });

  it("returns null for github URL with extra path segments", () => {
    expect(parseRepoUrl("https://github.com/acme/widget/tree/main")).toBeNull();
  });
});
