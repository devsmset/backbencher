import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LlmError } from "./errors.js";

export type JsonSchemaObject = Record<string, unknown>;

/** Bare, self-contained JSON Schema — no $refs, since not every provider resolves them. */
export function toJsonSchema(schema: z.ZodType<unknown>): JsonSchemaObject {
  const json = zodToJsonSchema(schema, { $refStrategy: "none" }) as JsonSchemaObject;
  const { $schema, ...rest } = json;
  void $schema;
  return rest;
}

const GEMINI_UNSUPPORTED = new Set([
  "$schema",
  "additionalProperties",
  "definitions",
  "$defs",
  "default",
  "const",
  "examples",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "patternProperties",
  "not",
  "oneOf",
  "allOf",
]);

/** Gemini accepts an OpenAPI-flavoured subset; unknown keywords are rejected outright. */
export function toGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiSchema);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (GEMINI_UNSUPPORTED.has(key)) continue;
    out[key] = toGeminiSchema(val);
  }
  return out;
}

export function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json|ya?ml)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/**
 * Last-resort parse for models without native constrained output: strip fences, then fall back to
 * the outermost brace/bracket span if the model wrapped its JSON in prose.
 */
export function parseJsonLoose(raw: string): unknown {
  const text = stripFences(raw);
  try {
    return JSON.parse(text);
  } catch {
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through to the error below */
      }
    }
    throw new LlmError(`Model did not return parseable JSON: ${text.slice(0, 200)}`);
  }
}
