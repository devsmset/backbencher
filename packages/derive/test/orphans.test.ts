import type { SessionCallEdge } from "@backbencher/schemas";
import { describe, expect, it } from "vitest";
import { findOrphanedConsumers } from "../src/orphans.js";

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
