import type { SessionCallEdge } from "@backbencher/schemas";
import { describe, expect, it } from "vitest";
import { findIsolatedCalls, findOrphanedConsumers } from "../src/orphans.js";

function edge(producer: string, consumer: string, value = "TOKEN-abcdef123456"): SessionCallEdge {
  return {
    producerCorrelationId: producer,
    producerLocation: "responseBody",
    producerJsonPath: "$.token",
    consumerCorrelationId: consumer,
    consumerLocation: "requestHeader",
    consumerJsonPath: "Authorization",
    value,
    confidence: "strong",
  };
}

describe("findOrphanedConsumers", () => {
  it("allows deleting a producer when another surviving producer feeds the same slot", () => {
    const edges = [edge("a", "c"), edge("b", "c")];
    expect(findOrphanedConsumers(edges, new Set(["a"]))).toEqual([]);
  });

  it("blocks deleting the only producer of a surviving consumer's slot", () => {
    const edges = [edge("a", "c")];
    const orphans = findOrphanedConsumers(edges, new Set(["a"]));
    expect(orphans).toEqual([
      { consumerCorrelationId: "c", consumerJsonPath: "Authorization", value: "TOKEN-abcdef123456" },
    ]);
  });

  it("blocks deleting two producers that only cover for each other", () => {
    const edges = [edge("a", "c"), edge("b", "c")];
    expect(findOrphanedConsumers(edges, new Set(["a", "b"]))).toHaveLength(1);
  });

  it("ignores slots whose consumer is itself being deleted", () => {
    const edges = [edge("a", "c")];
    expect(findOrphanedConsumers(edges, new Set(["a", "c"]))).toEqual([]);
  });
});

describe("findIsolatedCalls", () => {
  it("returns nothing for a single-level session with no edges at all", () => {
    expect(findIsolatedCalls(["a", "b", "c"], [])).toEqual([]);
  });

  it("returns only the calls with no edge in or out when the session has edges", () => {
    expect(findIsolatedCalls(["a", "x", "b", "y"], [edge("a", "b")])).toEqual(["x", "y"]);
  });

  it("ignores edges touching calls outside the given set", () => {
    // b is staged for deletion, so a is left with no live edge — and with no edge left at all,
    // the session is single-level again.
    expect(findIsolatedCalls(["a", "x"], [edge("a", "b")])).toEqual([]);
    expect(findIsolatedCalls(["a", "c", "x"], [edge("a", "b"), edge("c", "d"), edge("c", "a")])).toEqual(["x"]);
  });
});

describe("findIsolatedCalls with a link filter", () => {
  it("keeps the two-argument behaviour", () => {
    expect(findIsolatedCalls(["a", "b", "c"], [edge("a", "b")])).toEqual(["c"]);
    expect(findIsolatedCalls(["a", "b"], [])).toEqual([]);
  });

  it("reports no orphans for a session that never had links", () => {
    expect(findIsolatedCalls(["a", "b"], [], [])).toEqual([]);
  });

  it("reports every call when all of a session's links are filtered out", () => {
    expect(findIsolatedCalls(["a", "b", "c"], [], [edge("a", "b")])).toEqual(["a", "b", "c"]);
  });

  it("isolates a call linked only through a filtered-out link", () => {
    const all = [edge("a", "b"), edge("b", "c")];
    const shown = [edge("b", "c")];
    expect(findIsolatedCalls(["a", "b", "c"], shown, all)).toEqual(["a"]);
  });

  it("judges single-level only from links between the given calls", () => {
    // the only link touches a call outside nodeIds (e.g. staged for deletion)
    expect(findIsolatedCalls(["a", "b"], [], [edge("a", "x")])).toEqual([]);
  });
});
