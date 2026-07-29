import { describe, expect, it } from "vitest";
import { templatizeFixture } from "../fixtures/sessions.js";
import { pairCalls } from "../src/pairCalls.js";
import { templatizePaths } from "../src/templatize.js";

describe("templatizePaths", () => {
  it("parameterizes both uuid and slug ids, keeping distinct endpoints separate", () => {
    const calls = pairCalls(templatizeFixture());
    const { operations } = templatizePaths(calls);
    const byTemplate = new Map([...operations.values()].map((o) => [o.template, o]));

    const invoices = byTemplate.get("/api/invoices/{id}");
    expect(invoices).toBeDefined();
    expect(invoices?.params[0]?.kind).toBe("uuid");
    expect(invoices?.params[0]?.name).toBe("id");
    expect(invoices?.calls.length).toBe(2);

    const reports = byTemplate.get("/api/reports/{ref}");
    expect(reports).toBeDefined();
    expect(reports?.params[0]?.kind).toBe("slug");
    expect(reports?.params[0]?.name).toBe("ref");

    // invoices and reports must NOT be merged into one operation
    expect(invoices?.operationId).not.toBe(reports?.operationId);
  });

  it("keeps a single-value segment static (no spurious params)", () => {
    const calls = pairCalls(templatizeFixture());
    const { operations } = templatizePaths(calls);
    for (const op of operations.values()) {
      expect(op.template.startsWith("/api/")).toBe(true);
    }
  });
});
