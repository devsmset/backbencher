import { describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { pairCalls } from "../src/pairCalls.js";
import { findRedundantCalls } from "../src/redundant.js";
import { templatizePaths } from "../src/templatize.js";

const H = "https://app.example.net";

function analyse(events: Parameters<typeof makeSession>[1]) {
  const calls = pairCalls(makeSession("sess-redundant", events));
  const { callOp } = templatizePaths(calls);
  return findRedundantCalls(calls, callOp);
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

  it("keeps a later call that produces a value the earlier one did not", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("p1", { url: `${H}/api/tenant`, body: { tenantId: "TENANT-9f3a2b7c1d4e" } }),
      ...apiCall("p2", { url: `${H}/api/tenant`, body: { tenantId: "TENANT-0011223344ff" } }),
    ]);
    expect(dropped.size).toBe(0);
  });

  it("never drops a call that produces no entropy-worthy value", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("n1", { url: `${H}/api/ping`, body: { ok: true } }),
      ...apiCall("n2", { url: `${H}/api/ping`, body: { ok: true } }),
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
    expect([...findRedundantCalls(forward, opsForward.callOp)].sort()).toEqual(
      [...findRedundantCalls(reversed, opsReversed.callOp)].sort(),
    );
  });
});
