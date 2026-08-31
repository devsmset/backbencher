import { type Operation, TestSpecSchema } from "@backbencher/schemas";
import { BbConfigSchema } from "@backbencher/shared";
import { openStore } from "@backbencher/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LlmComplete, assembleContext, createLlm, generateTestSpec, validateSpec } from "../src/generate.js";

function op(operationId: string, method: string, template: string): Operation {
  return {
    operationId,
    method,
    host: "h",
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

const INVALID_YAML = `
steps:
  - id: bad
    operationId: op_nonexistent
    description: references a missing operation
    expect:
      status: 200
cleanup: []
`;

function seed() {
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
    testDecision: { inScope: true, strategy: "api_functional", rationale: "r", riskLevel: "low", environments: ["staging"] },
    createdBy: "a",
    createdAt: 1,
    updatedBy: "a",
    updatedAt: 1,
  });
  return store;
}

describe("generateTestSpec", () => {
  let store: ReturnType<typeof seed>;
  beforeEach(() => {
    store = seed();
  });

  it("produces a valid, persisted TestSpec from a scenario (mock LLM)", async () => {
    const llm: LlmComplete = async () => VALID_YAML;
    const result = await generateTestSpec(store, "sc1", { llm });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.spec?.steps).toHaveLength(2);
    expect(result.attempts).toBe(1);
    expect(store.specs.get(result.specId)?.status).toBe("generated");
  });

  it("repairs an invalid first attempt in one round-trip", async () => {
    let n = 0;
    const llm: LlmComplete = async () => {
      n += 1;
      return n === 1 ? INVALID_YAML : VALID_YAML;
    };
    const result = await generateTestSpec(store, "sc1", { llm, maxRepairs: 1 });
    expect(result.attempts).toBe(2);
    expect(result.valid).toBe(true);
  });
});

describe("validateSpec", () => {
  it("flags unknown operationIds and dangling extract references", () => {
    const spec = TestSpecSchema.parse({
      version: 1,
      specId: "s",
      compositionId: "sc",
      title: "t",
      environment: "staging",
      authProfile: "admin",
      tags: [],
      steps: [
        { id: "a", operationId: "op_missing", description: "d", request: { query: { ref: "{{steps.nope.extract.x}}" } }, expect: { status: 200 } },
      ],
    });
    const errors = validateSpec(spec, { validOperationIds: new Set(["op_get"]), operationMethods: { op_get: "GET" } });
    expect(errors.some((e) => e.includes("unknown operationId"))).toBe(true);
    expect(errors.some((e) => e.includes("no earlier step"))).toBe(true);
  });
});

describe("assembleContext strategy variants", () => {
  it("injects strategy-specific guidance into the prompt", () => {
    const store = seed();
    const base = store.compositions.get("sc1");
    if (!base) throw new Error("seed composition missing");

    store.compositions.upsert({ ...base, compositionId: "neg", testDecision: { ...base.testDecision, strategy: "api_negative" } as NonNullable<typeof base.testDecision> });
    expect(assembleContext(store, store.compositions.get("neg") as typeof base).user).toContain("missing-required");

    store.compositions.upsert({ ...base, compositionId: "az", testDecision: { ...base.testDecision, strategy: "authz" } as NonNullable<typeof base.testDecision> });
    expect(assembleContext(store, store.compositions.get("az") as typeof base).user.toLowerCase()).toContain("role");

    store.compositions.upsert({ ...base, compositionId: "co", testDecision: { ...base.testDecision, strategy: "contract_only" } as NonNullable<typeof base.testDecision> });
    expect(assembleContext(store, store.compositions.get("co") as typeof base).user).toContain("GET-only");
  });
});

describe("createLlm provider selection", () => {
  const keys = [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_VERTEX_PROJECT_ID",
    "GOOGLE_CLOUD_PROJECT",
    "BB_LLM_MODEL",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "CLOUD_ML_REGION",
    "ANTHROPIC_VERTEX_REGION",
  ];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("throws a clear error when the anthropic key is missing", () => {
    const cfg = BbConfigSchema.parse({ agent: { provider: "anthropic" } });
    expect(() => createLlm(cfg)).toThrow(/ANTHROPIC_API_KEY/);
  });
  it("throws when the vertex project id is missing", () => {
    const cfg = BbConfigSchema.parse({ agent: { provider: "vertex" } });
    expect(() => createLlm(cfg)).toThrow(/project/i);
  });
  it("builds a callable when the vertex project id is present (no network)", () => {
    const cfg = BbConfigSchema.parse({
      agent: { provider: "vertex", vertex: { projectId: "p", region: "us-east5" } },
    });
    expect(typeof createLlm(cfg)).toBe("function");
  });
  it("rejects a --model override that names no configured model", () => {
    const cfg = BbConfigSchema.parse({
      llm: {
        models: { local: { provider: "openai-compatible", model: "gemma3:12b", baseUrl: "http://x/v1" } },
        tasks: { default: "local" },
      },
    });
    expect(() => createLlm(cfg, "compose", "nope")).toThrow(/Unknown model "nope"/);
  });
});
