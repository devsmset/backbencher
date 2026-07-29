import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EnvironmentConfig, Operation } from "@backbencher/schemas";
import { openStore } from "@backbencher/store";
import { afterAll, describe, expect, it } from "vitest";
import { buildKnowledgePack } from "../src/pack.js";

function op(operationId: string, template: string): Operation {
  return {
    operationId,
    method: "GET",
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

const environments: EnvironmentConfig[] = [
  { name: "staging", baseUrl: "https://staging.example.net/", destructive: true },
];

const tmp = mkdtempSync(join(tmpdir(), "bb-pack-"));

describe("buildKnowledgePack", () => {
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("is hash-stable, excludes ignored ops, and includes approved scenarios", () => {
    const store = openStore(":memory:");
    store.saveDerivation({ operations: [op("op_1", "/api/one"), op("op_2", "/api/two")], dataflow: [], flows: [] });
    store.annotations.setReviewState("op_1", "approved", "alice");
    store.annotations.setReviewState("op_2", "ignored", "alice");
    store.scenarios.upsert({
      scenarioId: "sc1",
      name: "S",
      description: "d",
      sourceFlowIds: [],
      steps: [{ operationId: "op_1", intent: "go" }],
      testDecision: {
        inScope: true,
        strategy: "api_functional",
        rationale: "r",
        riskLevel: "low",
        environments: ["staging"],
      },
      reviewState: "approved",
      updatedBy: "alice",
      updatedAt: 1,
    });

    const r1 = buildKnowledgePack(store, { environments, outDir: join(tmp, "a") });
    const r2 = buildKnowledgePack(store, { environments, outDir: join(tmp, "b") });

    expect(r1.pack.contentHash).toBe(r2.pack.contentHash); // hash-stable across builds
    expect(r1.pack.catalog.map((c) => c.operationId)).toEqual(["op_1"]); // ignored excluded
    expect(r1.pack.flows).toHaveLength(1);
    expect(existsSync(r1.packJsonPath)).toBe(true);
    expect(existsSync(r1.catalogMdPath)).toBe(true);
    expect(store.packs.list().length).toBeGreaterThanOrEqual(1);
    store.close();
  });
});
