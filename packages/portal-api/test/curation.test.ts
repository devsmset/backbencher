import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { assertDeletable } from "../src/curation.js";

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