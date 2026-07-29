import { type TestSpec, TestSpecSchema } from "@backbencher/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ApiFixture, startApiFixture } from "../src/fixtures/api-app.js";
import { fetchHttp, runTestSpec } from "../src/runtime.js";

const operations = {
  op_create: { method: "POST", template: "/things" },
  op_get: { method: "GET", template: "/things/{id}" },
  op_delete: { method: "DELETE", template: "/things/{id}" },
};

const responseSchemas = {
  op_create: { "201": { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } } },
  op_get: {
    "200": {
      type: "object",
      required: ["id", "name"],
      properties: { id: { type: "string" }, name: { type: "string" }, createdAt: { type: "number" } },
    },
  },
};

const volatileFields = { op_create: ["$.createdAt"], op_get: ["$.createdAt"] };

const spec: TestSpec = TestSpecSchema.parse({
  version: 1,
  specId: "spec-lifecycle",
  scenarioId: "sc1",
  title: "thing lifecycle",
  environment: "local",
  authProfile: "admin",
  tags: [],
  steps: [
    { id: "create", operationId: "op_create", description: "create a thing", request: { body: { name: "widget" } }, extract: { id: "$.id" }, expect: { status: 201 } },
    {
      id: "get",
      operationId: "op_get",
      description: "fetch it via the extracted id",
      request: { pathParams: { id: "{{steps.create.extract.id}}" } },
      expect: { status: 200, jsonAssertions: [{ path: "$.id", op: "exists" }, { path: "$.name", op: "equals", value: "widget" }] },
    },
  ],
  cleanup: [{ operationId: "op_delete", request: { pathParams: { id: "{{steps.create.extract.id}}" } } }],
});

describe("runTestSpec (green run)", () => {
  let fx: ApiFixture;
  beforeAll(async () => {
    fx = await startApiFixture();
  });
  afterAll(async () => {
    await fx.close();
  });

  it("runs an extraction chain + cleanup against the fixture and passes", async () => {
    const result = await runTestSpec(spec, { baseUrl: fx.url, http: fetchHttp, operations, responseSchemas, volatileFields });
    expect(result.steps.flatMap((s) => s.errors)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.cleanupOk).toBe(true);
    expect(result.steps[0]?.extracted.id).toBeTruthy();
    expect(fx.count()).toBe(0); // cleanup deleted the created resource
  });

  it("fails a step whose status expectation is wrong", async () => {
    const bad = TestSpecSchema.parse({
      ...spec,
      specId: "spec-bad",
      steps: [{ id: "create", operationId: "op_create", description: "x", request: { body: { name: "y" } }, expect: { status: 500, schemaConformance: false } }],
      cleanup: [],
    });
    const result = await runTestSpec(bad, { baseUrl: fx.url, http: fetchHttp, operations });
    expect(result.ok).toBe(false);
  });
});
