import { describe, expect, it } from "bun:test";
import { extractJson } from "./llm";

describe("extractJson", () => {
  it("returns content inside ```json fences", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(extractJson(input)).toBe('{"key": "value"}');
  });

  it("returns content inside bare ``` fences", () => {
    const input = '```\n{"key": "value"}\n```';
    expect(extractJson(input)).toBe('{"key": "value"}');
  });

  it("returns the raw text when no fences are present", () => {
    const input = '{"key": "value"}';
    expect(extractJson(input)).toBe('{"key": "value"}');
  });

  it("trims surrounding whitespace from fenced content", () => {
    const input = '```json\n\n  { "a": 1 }  \n\n```';
    expect(extractJson(input)).toBe('{ "a": 1 }');
  });

  it("trims surrounding whitespace from bare text", () => {
    const input = '  { "a": 1 }  ';
    expect(extractJson(input)).toBe('{ "a": 1 }');
  });

  it("handles multi-line JSON inside fences", () => {
    const input = '```json\n{\n  "reasoning": "ok",\n  "steps": []\n}\n```';
    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.reasoning).toBe("ok");
    expect(parsed.steps).toEqual([]);
  });

  it("handles LLM output with text before the fence", () => {
    const input = 'Here is the result:\n```json\n{"ok": true}\n```';
    expect(extractJson(input)).toBe('{"ok": true}');
  });

  it("returns empty string unchanged", () => {
    expect(extractJson("")).toBe("");
  });
});
