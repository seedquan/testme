import { describe, it, expect } from "vitest";

// Test the extractJson logic (inlined since it's not exported)
function extractJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]) as T;
      } catch {
        // fall through
      }
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        // fall through
      }
    }
  }
  return null;
}

describe("extractJson", () => {
  it("parses direct JSON", () => {
    const result = extractJson<{ name: string }>('{"name": "test"}');
    expect(result).toEqual({ name: "test" });
  });

  it("extracts JSON from code block", () => {
    const text = 'Here is the plan:\n```json\n{"name": "test"}\n```\nDone.';
    const result = extractJson<{ name: string }>(text);
    expect(result).toEqual({ name: "test" });
  });

  it("extracts JSON from untagged code block", () => {
    const text = 'Result:\n```\n{"name": "test"}\n```';
    const result = extractJson<{ name: string }>(text);
    expect(result).toEqual({ name: "test" });
  });

  it("extracts JSON object from mixed text", () => {
    const text = 'The output is {"name": "test"} and that is all.';
    const result = extractJson<{ name: string }>(text);
    expect(result).toEqual({ name: "test" });
  });

  it("returns null for non-JSON text", () => {
    const result = extractJson("just some regular text");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = extractJson("");
    expect(result).toBeNull();
  });

  it("handles nested JSON objects", () => {
    const json = '{"plan": {"steps": [1, 2, 3]}, "type": "cli"}';
    const result = extractJson<{ plan: { steps: number[] } }>(json);
    expect(result?.plan.steps).toEqual([1, 2, 3]);
  });
});
