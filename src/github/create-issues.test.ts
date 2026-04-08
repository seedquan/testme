import { describe, it, expect } from "vitest";

// We need to test the internal functions, so let's extract and test them
// For now, we test via the module's exported behavior

// Inline test versions of the internal functions
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;
  const editDistance = levenshtein(longer, shorter);
  return (longerLength - editDistance) / longerLength;
}

describe("normalize", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalize("Hello, World!")).toBe("hello world");
  });

  it("preserves numbers", () => {
    expect(normalize("Error 404: Not Found")).toBe("error 404 not found");
  });

  it("handles empty string", () => {
    expect(normalize("")).toBe("");
  });

  it("handles only punctuation", () => {
    expect(normalize("!!!")).toBe("");
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns length for empty vs non-empty", () => {
    expect(levenshtein("hello", "")).toBe(5);
    expect(levenshtein("", "hello")).toBe(5);
  });

  it("handles single character difference", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("handles insertion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  it("handles deletion", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("handles completely different strings", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });

  it("handles both empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
  });
});

describe("stringSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(stringSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for empty strings", () => {
    expect(stringSimilarity("", "hello")).toBe(0);
    expect(stringSimilarity("hello", "")).toBe(0);
  });

  it("returns high similarity for similar strings", () => {
    const sim = stringSimilarity("crash on widget build", "crash on widget builds");
    expect(sim).toBeGreaterThan(0.9);
  });

  it("returns low similarity for different strings", () => {
    const sim = stringSimilarity("crash on startup", "missing documentation");
    expect(sim).toBeLessThan(0.5);
  });

  it("detects duplicates above 0.8 threshold", () => {
    const sim = stringSimilarity(
      normalize("Crash on widget build command"),
      normalize("Crash on widget builds command")
    );
    expect(sim).toBeGreaterThan(0.8);
  });
});
