import { describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { pairCalls } from "../src/pairCalls.js";
import { findRedundantCalls } from "../src/redundant.js";
import { templatizePaths } from "../src/templatize.js";

const H = "https://app.example.net";

function analyse(events: Parameters<typeof makeSession>[1]) {
  const calls = pairCalls(makeSession("sess-redundant", events));
  const { callOp, operations } = templatizePaths(calls);
  return findRedundantCalls(calls, callOp, operations);
}

describe("findRedundantCalls", () => {
  it("drops a later call to the same operation that produces nothing new", () => {
    resetClock();
    const tenant = "TENANT-9f3a2b7c1d4e";
    const dropped = analyse([
      ...apiCall("t1", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("t2", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("t3", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
    ]);
    expect([...dropped].sort()).toEqual(["t2", "t3"]);
  });

  it("keeps a later call whose new value a different operation consumes", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("p1", { url: `${H}/api/tenant`, body: { tenantId: "TENANT-9f3a2b7c1d4e" } }),
      ...apiCall("p2", { url: `${H}/api/tenant`, body: { tenantId: "TENANT-0011223344ff" } }),
      ...apiCall("u1", { url: `${H}/api/users?tenant=TENANT-0011223344ff` }),
    ]);
    expect(dropped.size).toBe(0);
  });

  it("drops a later call whose new value nothing consumes", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("q1", { url: `${H}/api/tenant`, body: { tenantId: "TENANT-9f3a2b7c1d4e" } }),
      ...apiCall("q2", { url: `${H}/api/tenant`, body: { tenantId: "TENANT-0011223344ff" } }),
    ]);
    expect([...dropped]).toEqual(["q2"]);
  });

  it("drops a repeat that produces no entropy-worthy value", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("n1", { url: `${H}/api/ping`, body: { ok: true } }),
      ...apiCall("n2", { url: `${H}/api/ping`, body: { ok: true } }),
    ]);
    expect([...dropped]).toEqual(["n2"]);
  });

  it("drops a repeat whose new value only its own operation consumes", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("e1", { method: "POST", url: `${H}/api/event`, body: { eventId: "EVT-aaaaaaaaaaaa" } }),
      ...apiCall("e2", { method: "POST", url: `${H}/api/event?prev=EVT-aaaaaaaaaaaa`, body: { eventId: "EVT-bbbbbbbbbbbb" } }),
      ...apiCall("e3", { method: "POST", url: `${H}/api/event?prev=EVT-bbbbbbbbbbbb`, body: { eventId: "EVT-cccccccccccc" } }),
    ]);
    expect([...dropped].sort()).toEqual(["e2", "e3"]);
  });

  it("keeps a repeat that consumes a new value from a different operation", () => {
    resetClock();
    const u1 = "11111111-1111-1111-1111-111111111111";
    const u2 = "22222222-2222-2222-2222-222222222222";
    const dropped = analyse([
      ...apiCall("c1", { method: "POST", url: `${H}/api/invoices`, body: { id: u1 } }),
      ...apiCall("v1", { url: `${H}/api/invoices/${u1}`, body: { id: u1, total: 100 } }),
      ...apiCall("c2", { method: "POST", url: `${H}/api/invoices`, body: { id: u2 } }),
      // Produces nothing anyone uses, but it is how the flow looks at the second invoice.
      ...apiCall("v2", { url: `${H}/api/invoices/${u2}`, body: { id: u2, total: 200 } }),
    ]);
    expect(dropped.size).toBe(0);
  });

  it("drops a repeat that receives a new value but produces only what was already produced", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("a1", { url: `${H}/api/page`, body: { pageId: "PAGE-aaaaaaaaaaaa" } }),
      ...apiCall("a2", { url: `${H}/api/page`, body: { pageId: "PAGE-bbbbbbbbbbbb" } }),
      ...apiCall("t1", { method: "POST", url: `${H}/api/track?page=PAGE-aaaaaaaaaaaa`, body: { site: "SITE-000000000001" } }),
      // Receives a page id t1 never did, yet everything it returns t1 already returned.
      ...apiCall("t2", { method: "POST", url: `${H}/api/track?page=PAGE-bbbbbbbbbbbb`, body: { site: "SITE-000000000001" } }),
    ]);
    expect(dropped.has("t2")).toBe(true);
  });

  it("restores a dropped call that is the only producer for a kept consumer", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("s1", { url: `${H}/api/session`, body: { token: "TOK-aaaaaaaaaaaa" } }),
      // s2's token is consumed only by s3, its own operation, so on its own it looks redundant...
      ...apiCall("s2", { url: `${H}/api/session`, body: { token: "TOK-bbbbbbbbbbbb" } }),
      // ...but s3 is kept (its token feeds /api/data), and s3 needs s2's token.
      ...apiCall("s3", { url: `${H}/api/session?prev=TOK-bbbbbbbbbbbb`, body: { token: "TOK-cccccccccccc" } }),
      ...apiCall("d1", { url: `${H}/api/data?token=TOK-cccccccccccc` }),
    ]);
    expect(dropped.size).toBe(0);
  });

  it("always keeps the first call of an operation", () => {
    resetClock();
    const tenant = "TENANT-9f3a2b7c1d4e";
    const dropped = analyse([
      ...apiCall("f1", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("f2", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
    ]);
    expect(dropped.has("f1")).toBe(false);
  });

  it("is stable under input reordering", () => {
    resetClock();
    const tenant = "TENANT-9f3a2b7c1d4e";
    const events = [
      ...apiCall("s1", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("s2", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
    ];
    const forward = pairCalls(makeSession("sess-a", events));
    const reversed = [...forward].reverse();
    const opsForward = templatizePaths(forward);
    const opsReversed = templatizePaths(reversed);
    expect([...findRedundantCalls(forward, opsForward.callOp, opsForward.operations)].sort()).toEqual(
      [...findRedundantCalls(reversed, opsReversed.callOp, opsReversed.operations)].sort(),
    );
  });
});
