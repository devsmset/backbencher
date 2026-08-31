import { describe, expect, it } from "vitest";
import { apiCall, dataflowFixture, makeSession, resetClock } from "../fixtures/sessions.js";
import { pairCalls } from "../src/pairCalls.js";
import { buildSessionCallGraph } from "../src/sessionGraph.js";
import { templatizePaths } from "../src/templatize.js";

describe("buildSessionCallGraph", () => {
  it("links a value produced by one call to its use in a later call, by correlationId", () => {
    const calls = pairCalls(dataflowFixture());
    const { operations, callOp } = templatizePaths(calls);
    const edges = buildSessionCallGraph(calls, callOp, operations);

    const edge = edges.find((e) => e.producerJsonPath === "$.ticket" && e.consumerJsonPath === "ref");
    expect(edge).toBeDefined();
    expect(edge?.producerCorrelationId).toBe("d1");
    expect(edge?.consumerCorrelationId).toBe("d2");
    expect(edge?.producerLocation).toBe("responseBody");
    expect(edge?.consumerLocation).toBe("query");
    expect(edge?.confidence).toBe("strong");
  });

  it("does not link a call to itself, but does link two distinct calls to the same operation", () => {
    resetClock();
    const ticket = "ABC123DEF456GHI";
    const H = "https://app.example.net";
    const session = makeSession("sess-repeat", [
      ...apiCall("r1", { url: `${H}/auth/token`, body: { ticket } }),
      ...apiCall("r2", { url: `${H}/auth/token?ref=${ticket}`, body: { ticket } }),
    ]);
    const calls = pairCalls(session);
    const { operations, callOp } = templatizePaths(calls);
    const edges = buildSessionCallGraph(calls, callOp, operations);

    // r1 -> r2 (r1's ticket used as r2's query param), never r1 -> r1 or r2 -> r2
    expect(edges.some((e) => e.producerCorrelationId === e.consumerCorrelationId)).toBe(false);
    expect(edges.some((e) => e.producerCorrelationId === "r1" && e.consumerCorrelationId === "r2")).toBe(true);
  });

  it("does not link a producer that occurs after the consumer", () => {
    resetClock();
    const ticket = "ABC123DEF456GHI";
    const H = "https://app.example.net";
    // consumer (query) comes first, producer (response body) comes second — no valid ordering
    const session = makeSession("sess-order", [
      ...apiCall("o1", { url: `${H}/api/things?ref=${ticket}`, body: { ok: true } }),
      ...apiCall("o2", { url: `${H}/auth/token`, body: { ticket } }),
    ]);
    const calls = pairCalls(session);
    const { operations, callOp } = templatizePaths(calls);
    const edges = buildSessionCallGraph(calls, callOp, operations);

    expect(edges.some((e) => e.producerCorrelationId === "o2" && e.consumerCorrelationId === "o1")).toBe(false);
  });
});
