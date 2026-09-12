import { describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { runDerivation } from "../src/pipeline.js";

const H = "https://app.example.net";

function sessions() {
  resetClock();
  const tenant = "TENANT-9f3a2b7c1d4e";
  return [
    makeSession("sess-curation", [
      ...apiCall("c1", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("c2", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("c3", { method: "POST", url: `${H}/api/tickets`, postData: JSON.stringify({ tenantId: tenant }), body: { ok: true } }),
    ]),
  ];
}

describe("runDerivation curation", () => {
  it("reports auto-filtered redundant calls per session", () => {
    const result = runDerivation(sessions());
    expect(result.autoFiltered["sess-curation"]).toEqual(["c2"]);
  });

  it("keeps the redundant call out of the flow but keeps its operation in the catalog", () => {
    const result = runDerivation(sessions());
    const flow = result.flows.find((f) => f.sessionId === "sess-curation");
    expect(flow?.steps.map((s) => s.correlationId)).toEqual(["c1", "c3"]);
    expect(result.operations).toHaveLength(2);
  });

  it("emits a session call graph built from the curated calls only", () => {
    const result = runDerivation(sessions());
    const edges = result.sessionGraphs["sess-curation"] ?? [];
    expect(edges.some((e) => e.producerCorrelationId === "c1" && e.consumerCorrelationId === "c3")).toBe(true);
    expect(edges.some((e) => e.producerCorrelationId === "c2")).toBe(false);
  });

  it("honours analyst deletions without shrinking the catalog", () => {
    const deleted = new Map([["sess-curation", new Set(["c3"])]]);
    const result = runDerivation(sessions(), { deletedCorrelationIds: deleted });
    const flow = result.flows.find((f) => f.sessionId === "sess-curation");
    expect(flow?.steps.map((s) => s.correlationId)).toEqual(["c1"]);
    expect(result.operations).toHaveLength(2);
  });

  it("is idempotent", () => {
    expect(JSON.stringify(runDerivation(sessions()))).toBe(JSON.stringify(runDerivation(sessions())));
  });
});