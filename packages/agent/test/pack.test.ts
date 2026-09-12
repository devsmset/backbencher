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
    store.annotations.upsert({
      operationId: "op_1",
      name: "Op One",
      does: "Does the first thing",
      updatedBy: "alice",
      updatedAt: 1,
    });
    store.annotations.setReviewState("op_2", "ignored", "alice");
    store.sessions.upsertFromMeta({
      version: 4,
      sessionId: "s1",
      startUrl: "https://example.net/",
      startedAt: 1,
      endedAt: 2,
      userAgent: "ua",
      recorderVersion: "rec-1",
      name: "S",
      goal: "go do the first thing",
    });
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    store.flows.replaceForSession("s1", {
      flowId: "f1",
      sessionId: "s1",
      steps: [{ correlationId: "c1", operationId: "op_1" }],
    });
    store.sessionGraphs.replaceForSession("s1", []);
    store.compositions.upsert({
      compositionId: "comp1",
      goal: "go do the first thing",
      status: "approved",
      steps: [{ operationId: "op_1", intent: "go", satisfies: [], autoAdded: false, fromSessionIds: [] }],
      unmetDependencies: [],
      candidateGaps: [],
      testDecision: {
        inScope: true,
        strategy: "api_functional",
        rationale: "r",
        riskLevel: "low",
        environments: ["staging"],
      },
      createdBy: "alice",
      createdAt: 1,
      updatedBy: "alice",
      updatedAt: 1,
    });

    const r1 = buildKnowledgePack(store, { environments, outDir: join(tmp, "a") });
    const r2 = buildKnowledgePack(store, { environments, outDir: join(tmp, "b") });

    expect(r1.pack.contentHash).toBe(r2.pack.contentHash); // hash-stable across builds
    expect(r1.pack.catalog.map((c) => c.operationId)).toEqual(["op_1"]); // ignored excluded
    expect(r1.pack.referenceSessions).toHaveLength(1);
    expect(r1.pack.compositions).toHaveLength(1);
    expect(existsSync(r1.packJsonPath)).toBe(true);
    expect(existsSync(r1.catalogMdPath)).toBe(true);
    expect(store.packs.list().length).toBeGreaterThanOrEqual(1);
    store.close();
  });
});
