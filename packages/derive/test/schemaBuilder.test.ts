import { describe, expect, it } from "vitest";
import { inferUnion } from "../src/schemaBuilder.js";

const opts = { requiredThreshold: 0.95, enumMinObservations: 5, enumMaxDistinct: 8 };

describe("schema builder", () => {
  it("marks required only for fields present in >= threshold of observations", () => {
    const schema = inferUnion([{ a: 1, b: 2 }, { a: 1 }, { a: 1 }], opts) as Record<string, unknown>;
    expect(schema.required).toEqual(["a"]);
  });

  it("emits x-observed-enum for low-cardinality strings", () => {
    const schema = inferUnion(["red", "red", "blue", "red", "blue"], opts) as Record<string, unknown>;
    expect(schema["x-observed-enum"]).toEqual(["blue", "red"]);
  });

  it("widens integer to number when both are seen", () => {
    const schema = inferUnion([1, 2.5], opts) as Record<string, unknown>;
    expect(schema.type).toBe("number");
  });
});
