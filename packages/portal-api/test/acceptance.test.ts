import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Operation } from "@backbencher/schemas";
import {
  buildCompileContext,
  compileSpecFile,
  runSpecAgainstEnv,
  startApiFixture,
} from "@backbencher/testkit";
import { type LlmComplete, generateTestSpec } from "@backbencher/agent";
import { openStore } from "@backbencher/store";
import { afterAll, describe, expect, it } from "vitest";

// Phase 6 acceptance (architecture §8): approved scenario → generated YAML → compiled Playwright
// file → green run against the fixture app, including one extraction chain and one cleanup.

function op(operationId: string, method: string, template: string): Operation {
  return {
    operationId,
    method,
    host: "app",
    pathTemplate: { template, params: [] },
    observedCount: 1,
    statusCodesObserved: { "200": 1 },
    requestSchema: null,
    responseSchemas: {},
    queryParams: [],
    authObserved: "cookie",
    contentTypes: ["application/json"],
    exampleCorrelationIds: ["c1"],
    firstSeenSessionId: "s1",
    lastSeenAt: 1,
    volatileResponseFields: [],
  };
}

const VALID_YAML = `
steps:
  - id: create
    operationId: op_create
    description: create a thing
    request:
      body:
        name: widget
    extract:
      id: $.id
    expect:
      status: 201
  - id: get
    operationId: op_get
    description: fetch it via the extracted id
    request:
      pathParams:
        id: "{{steps.create.extract.id}}"
    expect:
      status: 200
cleanup:
  - operationId: op_delete
    request:
      pathParams:
        id: "{{steps.create.extract.id}}"
`;

const outDir = mkdtempSync(join(tmpdir(), "bb-testkit-"));

describe("Phase 6 acceptance", () => {
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it("scenario → generate → compile → green run (extraction chain + cleanup)", async () => {
    const store = openStore(":memory:");
    store.saveDerivation({
      operations: [op("op_create", "POST", "/things"), op("op_get", "GET", "/things/{id}"), op("op_delete", "DELETE", "/things/{id}")],
      dataflow: [],
      flows: [],
    });
    store.compositions.upsert({
      compositionId: "sc1",
      goal: "create then read a thing",
      status: "approved",
      steps: [
        { operationId: "op_create", intent: "create", satisfies: [], autoAdded: false, fromExemplarIds: [] },
        { operationId: "op_get", intent: "get", satisfies: [], autoAdded: false, fromExemplarIds: [] },
      ],
      unmetDependencies: [],
      candidateGaps: [],
      testDecision: { inScope: true, strategy: "api_functional", rationale: "r", riskLevel: "low", environments: ["local"] },
      createdBy: "a",
      createdAt: 1,
      updatedBy: "a",
      updatedAt: 1,
    });

    // generate (mock LLM stands in for @anthropic-ai/sdk)
    const llm: LlmComplete = async () => VALID_YAML;
    const gen = await generateTestSpec(store, "sc1", { llm });
    expect(gen.valid).toBe(true);
    const spec = gen.spec;
    if (!spec) throw new Error("no spec generated");

    // compile → a real Playwright file on disk
    const ctx = buildCompileContext(store, spec);
    const file = compileSpecFile(spec, ctx, outDir);
    expect(existsSync(file)).toBe(true);
    const code = readFileSync(file, "utf8");
    expect(code).toContain('import { expect, test } from "@playwright/test"');
    expect(code).toContain("op_create");

    // green run against the fixture (same runtime the compiled file uses)
    const fx = await startApiFixture();
    const run = await runSpecAgainstEnv(store, spec, { name: "local", baseUrl: fx.url, destructive: true });
    expect(run.status).toBe("passed");
    expect(run.result.steps[0]?.extracted.id).toBeTruthy();
    expect(run.result.cleanupOk).toBe(true);
    expect(fx.count()).toBe(0); // cleanup deleted the created resource
    await fx.close();
    store.close();
  });
});
