import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDerivation, writeCuratedEvents } from "@backbencher/derive";
import { type SessionData } from "@backbencher/derive";
import { BbConfigSchema, dataDir } from "@backbencher/shared";
import { openStore } from "@backbencher/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiCall, makeSession, resetClock } from "../../derive/fixtures/sessions.js";
import { assertDeletable } from "../src/curation.js";
import * as derivationJob from "../src/derivationJob.js";
import { appRouter } from "../src/index.js";

const edge = (producer: string, consumer: string) => ({
  producerCorrelationId: producer,
  producerLocation: "responseBody" as const,
  producerJsonPath: "$.token",
  consumerCorrelationId: consumer,
  consumerLocation: "requestHeader" as const,
  consumerJsonPath: "Authorization",
  value: "TOKEN-abcdef123456",
  confidence: "strong" as const,
});

describe("assertDeletable", () => {
  it("passes when another producer survives", () => {
    expect(() => assertDeletable([edge("a", "c"), edge("b", "c")], ["a"])).not.toThrow();
  });

  it("throws listing the orphaned consumer when the sole producer is deleted", () => {
    expect(() => assertDeletable([edge("a", "c")], ["a"])).toThrow(/Authorization/);
  });
});

describe("sessionCuration repo through the store", () => {
  it("records a reference toggle", () => {
    const store = openStore(":memory:");
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    expect(store.sessionCuration.get("s1")?.useAsReference).toBe(true);
    store.close();
  });
});

const H = "https://app.example.net";

function completeSession(sessionId: string, events: SessionData["events"]): SessionData {
  const session = makeSession(sessionId, events, `${H}/start`);
  return {
    ...session,
    meta: {
      ...session.meta,
      name: `${sessionId} fixture`,
      goal: `exercise ${sessionId}`,
    },
  };
}

function writeSession(session: SessionData): string {
  const dir = join(dataDir(), "sessions", session.meta.sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(session.meta));
  writeFileSync(join(dir, "events.ndjson"), `${session.events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  return dir;
}

describe("sessions router", () => {
  const createdDirs: string[] = [];
  let store: ReturnType<typeof openStore>;

  beforeEach(() => {
    store = openStore(":memory:");
    createdDirs.length = 0;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await derivationJob.waitForDerivationIdle();
    store.close();
    for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
  });

  function caller(actor = "tester") {
    return appRouter.createCaller({ store, actor, config: BbConfigSchema.parse({}) });
  }

  function seed(session: SessionData, options?: { derive?: boolean; curatedExcluded?: string[] }) {
    const dir = writeSession(session);
    createdDirs.push(dir);
    if (options?.curatedExcluded) {
      writeCuratedEvents(dir, session, new Set(options.curatedExcluded));
    }
    if (options?.derive) {
      store.saveDerivation(runDerivation([session]));
    }
    return { dir };
  }

  it("persists useAsReference through the tRPC caller", async () => {
    await expect(caller().sessions.setUseAsReference({ sessionId: "s-ref", useAsReference: true })).resolves.toEqual({ ok: true });
    expect(store.sessionCuration.get("s-ref")?.useAsReference).toBe(true);
  });

  it("reports raw and curated call counts", async () => {
    resetClock();
    const session = completeSession("sess-curation-counts", [
      ...apiCall("k1", { url: `${H}/api/a`, body: { id: "AAAA1111BBBB2222" } }),
      ...apiCall("k2", { url: `${H}/api/b`, body: { id: "CCCC3333DDDD4444" } }),
    ]);
    seed(session, { curatedExcluded: ["k2"] });
    store.sessionCuration.setDeleted(session.meta.sessionId, ["k2"], "alice");

    await expect(caller().sessions.curation({ sessionId: session.meta.sessionId })).resolves.toMatchObject({
      deletedCorrelationIds: ["k2"],
      rawCallCount: 2,
      curatedCallCount: 1,
    });
  });

  it("rejects unknown correlationIds with BAD_REQUEST", async () => {
    resetClock();
    const session = completeSession("sess-curation-unknown", [
      ...apiCall("u1", { url: `${H}/api/a`, body: { id: "id-1" } }),
    ]);
    seed(session);

    await expect(
      caller().sessions.deleteCalls({ sessionId: session.meta.sessionId, correlationIds: ["missing"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("missing") });
  });

  it("rejects deletions that would orphan a consumer", async () => {
    resetClock();
    const token = "TOKEN-abcdef123456";
    const session = completeSession("sess-curation-orphan", [
      ...apiCall("p1", { url: `${H}/auth/token`, body: { token } }),
      ...apiCall("c1", {
        method: "POST",
        url: `${H}/api/things`,
        reqHeaders: { "x-token": token },
        postData: JSON.stringify({ ok: true }),
        body: { ok: true },
      }),
    ]);
    seed(session, { derive: true });

    await expect(
      caller().sessions.deleteCalls({ sessionId: session.meta.sessionId, correlationIds: ["p1"] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects deleteCalls while derivation is running", async () => {
    resetClock();
    const session = completeSession("sess-curation-conflict", [
      ...apiCall("r1", { url: `${H}/api/a`, body: { ok: true } }),
    ]);
    seed(session);
    vi.spyOn(derivationJob, "derivationState").mockReturnValue({ status: "running", startedAt: Date.now() });

    await expect(
      caller().sessions.deleteCalls({ sessionId: session.meta.sessionId, correlationIds: ["r1"] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("treats already-deleted ids as an idempotent no-op", async () => {
    resetClock();
    const session = completeSession("sess-curation-idempotent", [
      ...apiCall("d1", { url: `${H}/api/a`, body: { id: "AAAA1111BBBB2222" } }),
      ...apiCall("d2", { url: `${H}/api/b`, body: { id: "CCCC3333DDDD4444" } }),
    ]);
    const { dir } = seed(session, { curatedExcluded: ["d1"] });
    store.sessionCuration.setDeleted(session.meta.sessionId, ["d1"], "alice");
    store.audit.append({
      entityType: "session",
      entityId: session.meta.sessionId,
      action: "curate.delete",
      actor: "alice",
      diff: { correlationIds: ["d1"] },
    });
    const before = readFileSync(join(dir, "curated-events.ndjson"), "utf8");

    await expect(
      caller().sessions.deleteCalls({ sessionId: session.meta.sessionId, correlationIds: ["d1"] }),
    ).resolves.toEqual({ deleted: 0 });

    expect(readFileSync(join(dir, "curated-events.ndjson"), "utf8")).toBe(before);
    expect(
      store.audit.list("session", session.meta.sessionId).filter((entry) => entry.action === "curate.delete"),
    ).toHaveLength(1);
  });

  it("drops only the deleted call from the observed flow", async () => {
    resetClock();
    const session = completeSession("sess-curation-flow", [
      ...apiCall("p1", { url: `${H}/api/one`, body: { ok: true } }),
      ...apiCall("p2", { url: `${H}/api/two`, body: { ok: true } }),
      ...apiCall("p3", { url: `${H}/api/three`, body: { ok: true } }),
      ...apiCall("q1", { url: `${H}/api/final`, body: { ok: true } }),
    ]);
    seed(session, { derive: true });
    const before = store.flows.listBySession(session.meta.sessionId)[0];

    await expect(
      caller().sessions.deleteCalls({ sessionId: session.meta.sessionId, correlationIds: ["p1"] }),
    ).resolves.toEqual({ deleted: 1 });

    // Steps survive verbatim, operationIds included: a deletion filters, it never re-derives.
    expect(store.flows.listBySession(session.meta.sessionId)[0]?.steps).toEqual(
      (before?.steps ?? []).filter((s) => s.correlationId !== "p1"),
    );
    expect(store.flows.listBySession(session.meta.sessionId)[0]?.steps.map((s) => s.correlationId)).toEqual([
      "p2",
      "p3",
      "q1",
    ]);
  });

  it("keeps edges unrelated to the deleted call", async () => {
    resetClock();
    const item1 = "11111111-1111-1111-1111-111111111111";
    const item2 = "22222222-2222-2222-2222-222222222222";
    const session = completeSession("sess-curation-graph-recompute", [
      ...apiCall("p1", { url: `${H}/api/item-source`, body: { itemId: item1 } }),
      ...apiCall("c1", { url: `${H}/api/items/${item1}`, body: { ok: true } }),
      ...apiCall("c2", { url: `${H}/api/items/${item2}`, body: { ok: true } }),
    ]);
    seed(session, { derive: true });
    expect(store.sessionGraphs.listBySession(session.meta.sessionId)).toHaveLength(1);
    const before = store.sessionGraphs.listBySession(session.meta.sessionId);

    await expect(
      caller().sessions.deleteCalls({ sessionId: session.meta.sessionId, correlationIds: ["c2"] }),
    ).resolves.toEqual({ deleted: 1 });

    // c2 touches neither end of p1 -> c1, so that edge must survive untouched.
    expect(store.sessionGraphs.listBySession(session.meta.sessionId)).toEqual(before);
  });

  it("drops only edges touching the deleted call", async () => {
    resetClock();
    const token = "TOKEN-abcdef123456";
    const other = "OTHER-9876543210ab";
    const session = completeSession("sess-curation-graph-partial", [
      ...apiCall("p1", { url: `${H}/auth/token`, body: { token } }),
      ...apiCall("p2", { url: `${H}/auth/other`, body: { other } }),
      ...apiCall("c1", { url: `${H}/api/one`, reqHeaders: { "x-token": token }, body: { ok: true } }),
      ...apiCall("c2", { url: `${H}/api/two`, reqHeaders: { "x-other": other }, body: { ok: true } }),
    ]);
    seed(session, { derive: true });
    expect(store.sessionGraphs.listBySession(session.meta.sessionId)).toHaveLength(2);

    await expect(
      caller().sessions.deleteCalls({ sessionId: session.meta.sessionId, correlationIds: ["c2"] }),
    ).resolves.toEqual({ deleted: 1 });

    expect(
      store.sessionGraphs
        .listBySession(session.meta.sessionId)
        .map((e) => `${e.producerCorrelationId}->${e.consumerCorrelationId}`),
    ).toEqual(["p1->c1"]);
  });

  it("refuses to curate a session that has not been derived", async () => {
    resetClock();
    const session = completeSession("sess-curation-underived", [
      ...apiCall("u1", { url: `${H}/api/a`, body: { id: "AAAA1111BBBB2222" } }),
    ]);
    seed(session);

    await expect(
      caller().sessions.deleteCalls({ sessionId: session.meta.sessionId, correlationIds: ["u1"] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("derived") });
    expect(store.sessionCuration.get(session.meta.sessionId)).toBeFalsy();
  });

  it("filters graph edges to the returned node set", async () => {
    resetClock();
    const session = completeSession("sess-graph-filter", [
      ...apiCall("asset1", {
        url: `${H}/assets/logo.png`,
        resHeaders: { "content-type": "image/png" },
        bodyKind: "binary",
      }),
      ...apiCall("api1", { url: `${H}/api/me`, body: { ok: true } }),
    ]);
    seed(session);
    store.saveDerivation({
      operations: [],
      dataflow: [],
      flows: [
        {
          flowId: `${session.meta.sessionId}:flow`,
          sessionId: session.meta.sessionId,
          steps: [
            { operationId: "op_asset", correlationId: "asset1" },
            { operationId: "op_api", correlationId: "api1" },
          ],
        },
      ],
      sessionGraphs: {
        [session.meta.sessionId]: [
          {
            producerCorrelationId: "asset1",
            producerLocation: "responseBody",
            producerJsonPath: "$.token",
            consumerCorrelationId: "api1",
            consumerLocation: "requestHeader",
            consumerJsonPath: "Authorization",
            value: "TOKEN-abcdef123456",
            confidence: "strong",
          },
        ],
      },
    });

    await expect(caller().sessions.graph({ sessionId: session.meta.sessionId })).resolves.toMatchObject({
      derived: true,
      nodes: [expect.objectContaining({ correlationId: "api1" })],
      edges: [],
    });
  });

  it("compose.proposeFromSession drafts a Composition from a curated session", async () => {
    const session = completeSession("sess-cfs-1", [...apiCall("c1", { url: `${H}/api/health`, body: { ok: true } })]);
    seed(session, { derive: true });
    store.sessions.upsertFromMeta(session.meta);

    const draft = await caller().compose.proposeFromSession({ sessionId: "sess-cfs-1" });

    expect(draft.sourceSessionId).toBe("sess-cfs-1");
    expect(draft.status).toBe("draft");
    expect(draft.goal).toBe("exercise sess-cfs-1"); // the session's own recorded goal
    expect((await caller().compose.drafts()).some((d) => d.compositionId === draft.compositionId)).toBe(true);
  });

  it("compose.proposeFromSession reports unclassified calls as a precondition failure, not a 500", async () => {
    const session = completeSession("sess-cfs-2", [...apiCall("c1", { url: `${H}/api/health`, body: { ok: true } })]);
    seed(session); // not derived: no Flow exists, so every call is unclassified
    store.sessions.upsertFromMeta(session.meta);

    await expect(caller().compose.proposeFromSession({ sessionId: "sess-cfs-2" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("agent.generate uses the deterministic generator for a session-sourced Composition, with no LLM configured", async () => {
    const session = completeSession("sess-cfs-3", [...apiCall("c1", { url: `${H}/api/health`, body: { ok: true } })]);
    seed(session, { derive: true });
    store.sessions.upsertFromMeta(session.meta);
    const draft = await caller().compose.proposeFromSession({ sessionId: "sess-cfs-3" });
    await caller().compose.approve({
      compositionId: draft.compositionId,
      testDecision: { inScope: true, strategy: "api_functional", rationale: "r", riskLevel: "low", environments: ["staging"] },
    });

    // BbConfigSchema.parse({}) configures no model or API key: this only succeeds if agent.generate
    // branches to the deterministic path BEFORE it tries createLlm().
    const res = await caller().agent.generate({ compositionId: draft.compositionId });

    expect(res.valid).toBe(true);
    expect(store.specs.get(res.specId)?.generatedBy).toBe("session-replay");
  });
});