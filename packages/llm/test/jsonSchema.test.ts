import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonLoose, stripFences, toGeminiSchema, toJsonSchema } from "../src/jsonSchema.js";

describe("toJsonSchema", () => {
  it("emits an inline schema with no $schema key or refs", () => {
    const schema = toJsonSchema(z.object({ name: z.string(), steps: z.array(z.object({ id: z.string() })) }));
    expect(schema.$schema).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain("$ref");
    expect(schema.type).toBe("object");
  });
});

describe("toGeminiSchema", () => {
  it("strips keywords Gemini rejects, recursively", () => {
    const sanitized = toGeminiSchema({
      type: "object",
      additionalProperties: false,
      properties: { steps: { type: "array", items: { type: "object", additionalProperties: false } } },
    }) as Record<string, unknown>;
    expect(sanitized.additionalProperties).toBeUndefined();
    expect(JSON.stringify(sanitized)).not.toContain("additionalProperties");
    expect(sanitized.type).toBe("object");
  });
});

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses fenced JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers JSON wrapped in prose", () => {
    expect(parseJsonLoose('Sure! Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it("throws with a readable message when there is no JSON at all", () => {
    expect(() => parseJsonLoose("I cannot help with that")).toThrow(/did not return parseable JSON/);
  });
});

describe("stripFences", () => {
  it("removes yaml fences too", () => {
    expect(stripFences("```yaml\nkey: value\n```")).toBe("key: value");
  });
});
