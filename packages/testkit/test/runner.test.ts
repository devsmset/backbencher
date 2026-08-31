import { type TestSpec, TestSpecSchema } from "@backbencher/schemas";
import { describe, expect, it } from "vitest";
import { applyJsonAssertions } from "../src/assertions.js";
import type { HttpClient } from "../src/runtime.js";
import { runWithQuarantine } from "../src/runner.js";

const oneStep = (specId: string): TestSpec =>
  TestSpecSchema.parse({
    version: 1,
    specId,
    compositionId: "s",
    title: "t",
    environment: "e",
    authProfile: "admin",
    tags: [],
    steps: [{ id: "one", operationId: "op", description: "d", expect: { status: 200, schemaConformance: false } }],
  });

const operations = { op: { method: "GET", template: "/x" } };

describe("applyJsonAssertions", () => {
  it("evaluates the assertion operators", () => {
    const body = { name: "widget", count: 3, tags: ["a", "b"] };
    expect(applyJsonAssertions(body, [{ path: "$.name", op: "equals", value: "widget" }])).toEqual([]);
    expect(applyJsonAssertions(body, [{ path: "$.count", op: "gt", value: 2 }])).toEqual([]);
    expect(applyJsonAssertions(body, [{ path: "$.tags", op: "lengthGte", value: 2 }])).toEqual([]);
    expect(applyJsonAssertions(body, [{ path: "$.missing", op: "exists" }])).toHaveLength(1);
    expect(applyJsonAssertions(body, [{ path: "$.name", op: "matches", value: "^wid" }])).toEqual([]);
  });
});

describe("runWithQuarantine", () => {
  it("marks a pass-on-retry as flaky, not failed", async () => {
    let calls = 0;
    const http: HttpClient = async () => {
      calls += 1;
      return { status: calls <= 1 ? 500 : 200, headers: {}, body: { ok: true } };
    };
    const q = await runWithQuarantine(oneStep("flaky"), { baseUrl: "http://x", http, operations });
    expect(q.status).toBe("flaky");
  });

  it("marks a consistent failure as failed", async () => {
    const http: HttpClient = async () => ({ status: 500, headers: {}, body: {} });
    const q = await runWithQuarantine(oneStep("fail"), { baseUrl: "http://x", http, operations });
    expect(q.status).toBe("failed");
  });
});
