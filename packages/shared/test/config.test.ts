import { describe, expect, it } from "vitest";
import { BbConfigSchema } from "../src/config.js";

describe("BbConfigSchema", () => {
  it("has no redaction surface", () => {
    const cfg = BbConfigSchema.parse({});
    expect(cfg).not.toHaveProperty("redaction");
  });

  it("has no body cap", () => {
    const cfg = BbConfigSchema.parse({});
    expect(cfg.recorder).not.toHaveProperty("bodyCapBytes");
  });

  it("still defaults the recorder api filter", () => {
    const cfg = BbConfigSchema.parse({});
    expect(cfg.recorder.apiFilter.dropMethods).toEqual(["OPTIONS"]);
  });
});
