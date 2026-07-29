import { type TestSpec, TestSpecSchema } from "@backbencher/schemas";
import { describe, expect, it } from "vitest";
import { compileToPlaywright } from "../src/compiler.js";

const spec: TestSpec = TestSpecSchema.parse({
  version: 1,
  specId: "spec-1",
  scenarioId: "sc1",
  title: "smoke",
  environment: "staging",
  authProfile: "admin",
  tags: [],
  steps: [{ id: "get", operationId: "op_get", description: "d", expect: { status: 200 } }],
});

describe("compileToPlaywright", () => {
  it("emits a self-contained Playwright test wired to the shared runtime", () => {
    const code = compileToPlaywright(spec, { operations: { op_get: { method: "GET", template: "/api/x" } } });
    expect(code).toContain('import { expect, test } from "@playwright/test"');
    expect(code).toContain('import { runTestSpec } from "@backbencher/testkit"');
    expect(code).toContain('test("smoke"');
    expect(code).toContain('"op_get"');
    expect(code).toContain("request.fetch");
    expect(code).toContain("BB_AUTH_");
  });
});
