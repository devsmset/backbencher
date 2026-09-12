import type { Operation } from "@backbencher/schemas";
import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { retrievalCorpus } from "../src/embed.js";

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

function seed() {
  const store = openStore(":memory:");
  store.saveDerivation({
    operations: [op("op_a", "/api/a")],
    dataflow: [],
    flows: [{ flowId: "s1:flow", sessionId: "s1", steps: [{ operationId: "op_a", correlationId: "c1" }] }],
  });
  store.sessions.upsertFromMeta({
    version: 4,
    sessionId: "s1",
    startUrl: "https://app.example.net/",
    startedAt: 1,
    userAgent: "test",
    recorderVersion: "test",
    name: "Create a thing",
    goal: "create one thing",
  });
  store.annotations.upsert({
    operationId: "op_a",
    name: "A",
    does: "does a",
    productArea: "X",
    updatedBy: "alice",
    updatedAt: 1,
  });
  return store;
}

describe("retrievalCorpus reference sessions", () => {
  it("excludes a session that is not marked as reference", () => {
    const store = seed();
    expect(retrievalCorpus(store).referenceSessions).toHaveLength(0);
    store.close();
  });

  it("includes a marked session whose operations are all Ready", () => {
    const store = seed();
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    expect(retrievalCorpus(store).referenceSessions.map((s) => s.sessionId)).toEqual(["s1"]);
    store.close();
  });

  it("excludes a marked session containing an un-Ready operation", () => {
    const store = seed();
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    store.annotations.upsert({
      operationId: "op_a",
      name: "",
      does: "",
      productArea: "X",
      updatedBy: "alice",
      updatedAt: 2,
    });
    expect(retrievalCorpus(store).referenceSessions).toHaveLength(0);
    store.close();
  });
});