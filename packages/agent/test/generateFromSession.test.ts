import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type SessionData, runDerivation } from "@backbencher/derive";
import { TestSpecSchema } from "@backbencher/schemas";
import { dataDir } from "@backbencher/shared";
import { openStore } from "@backbencher/store";
import { load as loadYaml } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../../derive/fixtures/sessions.js";
import { proposeCompositionFromSession } from "../src/composeFromSession.js";
import { generateTestSpecFromSession } from "../src/generateFromSession.js";

const H = "https://app.example.net";
const NO_CLEANUP = "spec writes data but has no cleanup entries";

// Same scoped-fixture pattern as composeFromSession.test.ts: real files under dataDir(), removed
// in afterEach, never touching any session this suite didn't create.
const createdDirs: string[] = [];
afterEach(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
  createdDirs.length = 0;
});

function completeSession(
  sessionId: string,
  events: SessionData["events"],
  extraMeta: Partial<SessionData["meta"]> = {},
): SessionData {
  const session = makeSession(sessionId, events);
  return { ...session, meta: { ...session.meta, name: `${sessionId} fixture`, goal: `exercise ${sessionId}`, ...extraMeta } };
}

/** Writes the session to disk, derives it into a fresh in-memory store, returns the store. */
function setup(session: SessionData, mutateDerivation?: (d: ReturnType<typeof runDerivation>) => ReturnType<typeof runDerivation>) {
  const dir = join(dataDir(), "sessions", session.meta.sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(session.meta));
  writeFileSync(join(dir, "events.ndjson"), `${session.events.map((e) => JSON.stringify(e)).join("\n")}\n`);
  createdDirs.push(dir);

  const store = openStore(":memory:");
  const derived = runDerivation([session]);
  store.saveDerivation(mutateDerivation ? mutateDerivation(derived) : derived);
  store.sessions.upsertFromMeta(session.meta);
  return store;
}

/** Proposes from the session, approves with a fixed TestDecision, generates. */
function generate(store: ReturnType<typeof openStore>, sessionId: string) {
  const draft = proposeCompositionFromSession(store, sessionId, "alice");
  store.compositions.upsert({
    ...draft,
    status: "approved",
    testDecision: { inScope: true, strategy: "api_functional", rationale: "r", riskLevel: "low", environments: ["staging"] },
    updatedBy: "alice",
    updatedAt: Date.now(),
  });
  return generateTestSpecFromSession(store, draft.compositionId);
}

describe("generateTestSpecFromSession", () => {
  it("generates a valid, persisted, YAML-round-trippable spec for a single GET", () => {
    resetClock();
    const session = completeSession("sess-gen-1", [...apiCall("g1", { url: `${H}/api/health`, body: { ok: true } })], {
      authProfile: "admin",
    });
    const store = setup(session);

    const result = generate(store, "sess-gen-1");

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.spec?.steps).toHaveLength(1);
    expect(result.spec?.steps[0]?.id).toBe("step0");
    expect(result.spec?.steps[0]?.expect.status).toBe(200);
    expect(result.spec?.environment).toBe("staging");
    expect(result.spec?.authProfile).toBe("admin"); // the session's own recorded profile
    expect(result.spec?.tags).toEqual(["from-session"]);

    const row = store.specs.get(result.specId);
    expect(row?.status).toBe("generated");
    // runs.start / bb test compile read the stored YAML, so it must be a real, parseable spec.
    expect(TestSpecSchema.parse(loadYaml(row?.yaml ?? "")).specId).toBe(result.specId);
  });

it("templates a body field and a custom header from an earlier response; drops the unexplained Authorization header", () => {
  resetClock();
  const token = "eyJhbGciOiJIUzI1NiJ9.XYZ789ABC123DEF";
  const csrf = "csrf-9f8e7d6c5b4a3210";
  const session = completeSession("sess-gen-2", [
    ...apiCall("g1", { method: "POST", url: `${H}/auth/login`, body: { token, csrf } }),
    ...apiCall("g2", {
      method: "POST",
      url: `${H}/api/tickets`,
      // "authorization" never forms a dataflow edge (dataflow.ts skips standard headers), so it has
      // no producer here — it must be dropped, not hardcoded. Auth is supplied at run time from
      // the spec's authProfile (runtime.ts authHeaders).
      reqHeaders: { "x-csrf-token": csrf, authorization: "Bearer static-key-123456" },
      postData: JSON.stringify({ authToken: token, title: "New ticket" }),
      body: { id: "t1" },
    }),
  ]);
  const store = setup(session);

  const result = generate(store, "sess-gen-2");

  // Both calls are POSTs, so the one expected complaint is the (deliberately never auto-inferred)
  // cleanup. That validateSpec reports nothing else also proves every {{steps.*.extract.*}} we
  // emitted points at an earlier step that really declares that extract.
  expect(result.errors).toEqual([NO_CLEANUP]);
  const [login, ticket] = result.spec?.steps ?? [];
  expect(login?.extract).toEqual({ token: "$.token", csrf: "$.csrf" });
  expect(ticket?.request?.body).toEqual({ authToken: "{{steps.step0.extract.token}}", title: "New ticket" });
  expect(ticket?.request?.headers).toEqual({ "x-csrf-token": "{{steps.step0.extract.csrf}}" });
});

it("templates path params and query params from an earlier response", () => {
  resetClock();
  const u1 = "11111111-1111-1111-1111-111111111111";
  const u2 = "22222222-2222-2222-2222-222222222222";
  const session = completeSession("sess-gen-3", [
    ...apiCall("p1", { method: "POST", url: `${H}/api/invoices`, body: { id: u1, ref: "REF-ALPHA-12345" } }),
    ...apiCall("p2", { url: `${H}/api/invoices/${u1}?ref=REF-ALPHA-12345`, body: { id: u1, total: 100 } }),
    ...apiCall("p3", { method: "POST", url: `${H}/api/invoices`, body: { id: u2, ref: "REF-BETA-67890" } }),
    ...apiCall("p4", { url: `${H}/api/invoices/${u2}?ref=REF-BETA-67890`, body: { id: u2, total: 200 } }),
  ]);
  const store = setup(session);

  const result = generate(store, "sess-gen-3");

  expect(result.errors).toEqual([NO_CLEANUP]);
  const steps = result.spec?.steps ?? [];
  expect(steps.map((s) => s.id)).toEqual(["step0", "step1", "step2", "step3"]);
  expect(steps[0]?.extract).toEqual({ id: "$.id", ref: "$.ref" });
  expect(steps[1]?.request?.pathParams).toEqual({ id: "{{steps.step0.extract.id}}" });
  expect(steps[1]?.request?.query).toEqual({ ref: "{{steps.step0.extract.ref}}" });
  // Each GET is fed by its OWN preceding create, not the first one — edges are per-call.
  expect(steps[3]?.request?.pathParams).toEqual({ id: "{{steps.step2.extract.id}}" });
  expect(steps[3]?.request?.query).toEqual({ ref: "{{steps.step2.extract.ref}}" });
});

it("mints a fresh value for a client-generated body field instead of replaying the recorded one", () => {
  resetClock();
  const session = completeSession("sess-gen-4", [
    ...apiCall("g1", {
      method: "POST",
      url: `${H}/api/tickets`,
      postData: JSON.stringify({ idempotencyKey: "req-9f8e7d6c-random-each-time", title: "New ticket" }),
      body: { id: "t1" },
    }),
  ]);
  // Derivation only flags a field client-generated when it varies across >=2 sessions, which a
  // one-session fixture can't show — so declare it the same way derivation would have persisted it.
  const store = setup(session, (d) => ({
    ...d,
    clientGeneratedFields: { [d.operations[0]?.operationId as string]: ["$.idempotencyKey"] },
  }));

  const result = generate(store, "sess-gen-4");

  expect(result.spec?.steps[0]?.request?.body).toEqual({ idempotencyKey: "{{faker.uuid}}", title: "New ticket" });
});

it("lands as invalid when the session writes data, and still stores the spec for hand repair", () => {
  resetClock();
  const session = completeSession("sess-gen-5", [
    ...apiCall("g1", { method: "POST", url: `${H}/api/tickets`, body: { id: "t1" } }),
  ]);
  const store = setup(session);

  const result = generate(store, "sess-gen-5");

  // Cleanup is never auto-inferred from a session (spec §3) — the existing write-implies-cleanup
  // rule in validateSpec() makes this land invalid, the same terminal state a failed LLM spec has.
  expect(result.valid).toBe(false);
  expect(result.errors).toEqual([NO_CLEANUP]);
  const row = store.specs.get(result.specId);
  expect(row?.status).toBe("invalid");
  // The analyst repairs it via specs.updateYaml, which needs a real YAML document to edit.
  expect(TestSpecSchema.parse(loadYaml(row?.yaml ?? "")).steps).toHaveLength(1);
});

  it("leaves a non-JSON (form-encoded) request body exactly as recorded", () => {
    resetClock();
    const session = completeSession("sess-gen-6", [
      ...apiCall("g1", { method: "POST", url: `${H}/api/twofa`, postData: "user_id=ABC123&code=999999", body: { ok: true } }),
    ]);
    const store = setup(session, (d) => ({
      ...d,
      clientGeneratedFields: { [d.operations[0]?.operationId as string]: ["$"] },
    }));

    const result = generate(store, "sess-gen-6");

    expect(result.spec?.steps[0]?.request?.body).toBe("user_id=ABC123&code=999999");
  });
});
