import type { DataflowEdge, ObservedFlow, Operation } from "@backbencher/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { type Store, mergeOperation, openStore } from "../src/index.js";

const op: Operation = {
  operationId: "op_abc",
  method: "GET",
  host: "h",
  pathTemplate: { template: "/api/x", params: [] },
  observedCount: 1,
  statusCodesObserved: { "200": 1 },
  requestSchema: null,
  responseSchemas: {},
  queryParams: [{ name: "q", required: false, observedValues: ["1"] }],
  authObserved: "cookie",
  contentTypes: ["application/json"],
  exampleCorrelationIds: ["c1"],
  firstSeenSessionId: "s1",
  lastSeenAt: 1,
  volatileResponseFields: ["$.ts"],
};
const edge: DataflowEdge = {
  producer: { operationId: "op_abc", location: "responseBody", jsonPath: "$.id" },
  consumer: { operationId: "op_def", location: "query", jsonPath: "ref" },
  evidenceCount: 2,
  valueEntropyOk: true,
};
const flow: ObservedFlow = {
  flowId: "s1:flow",
  sessionId: "s1",
  steps: [{ operationId: "op_abc", correlationId: "c1" }],
};

describe("store", () => {
  let store: Store;
  beforeEach(() => {
    store = openStore(":memory:");
  });

  it("persists a derivation and reads it back", () => {
    store.saveDerivation({ operations: [op], dataflow: [edge], flows: [flow] });
    expect(store.operations.list()).toHaveLength(1);
    expect(store.operations.get("op_abc")?.method).toBe("GET");
    expect(store.dataflow.forOperation("op_abc")).toHaveLength(1);
    expect(store.flows.listBySession("s1")).toHaveLength(1);
  });

  it("full-replaces derived tables on each save (idempotent)", () => {
    store.saveDerivation({ operations: [op], dataflow: [edge], flows: [flow] });
    store.saveDerivation({ operations: [op], dataflow: [], flows: [] });
    expect(store.operations.list()).toHaveLength(1);
    expect(store.dataflow.all()).toHaveLength(0);
  });

  it("applies the merge rule (additive + correctionOverrides)", () => {
    store.saveDerivation({ operations: [op], dataflow: [], flows: [] });
    store.annotations.upsert({
      operationId: "op_abc",
      name: "Get X",
      does: "Gets X",
      updatedBy: "alice",
      updatedAt: 1,
    });
    store.testingAnnotations.upsert({
      operationId: "op_abc",
      tags: ["billing"],
      correctionOverrides: { ignoreFields: ["$.extra"] },
      updatedBy: "alice",
      updatedAt: 1,
    });
    const merged = mergeOperation(
      store.operations.get("op_abc") as Operation,
      store.annotations.get("op_abc"),
      store.testingAnnotations.get("op_abc"),
    );
    expect(merged.reviewState).toBe("ready");
    expect(merged.name).toBe("Get X");
    expect(merged.volatileResponseFields).toContain("$.extra");
    expect(merged.volatileResponseFields).toContain("$.ts");
  });

  it("setReviewState creates an annotation when none exists", () => {
    store.annotations.setReviewState("op_zzz", "ignored", "bob");
    expect(store.annotations.get("op_zzz")?.reviewState).toBe("ignored");
  });

  it("records audit entries and sessions", () => {
    store.audit.append({ entityType: "operation", entityId: "op_abc", action: "annotate", actor: "alice" });
    expect(store.audit.list("operation", "op_abc")).toHaveLength(1);
    store.sessions.upsertFromMeta({
      version: 3,
      sessionId: "s1",
      name: "Login and land on homepage",
      goal: "log in as an admin and reach the dashboard",
      startUrl: "https://x/",
      startedAt: 1,
      userAgent: "t",
      recorderVersion: "t",
    });
    expect(store.sessions.get("s1")?.sessionId).toBe("s1");
    expect(store.sessions.get("s1")?.name).toBe("Login and land on homepage");
  });
});
