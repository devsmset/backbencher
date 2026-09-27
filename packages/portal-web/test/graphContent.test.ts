import { replaceEqualDeep } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { graphContentChanged } from "../src/graphContent.js";

// The graph resets its view (mode, ticked calls, node positions) only when its calls or links change.
// A refetch that only brings a new excluded-keys list must not count: React Query's structural
// sharing keeps the unchanged `nodes` and `edges` as the same objects, and the check relies on that.
const response = (excludedLinkKeys: string[], edgeValue = "$.id") => ({
  nodes: [{ correlationId: "a" }, { correlationId: "b" }],
  edges: [{ producerCorrelationId: "a", consumerCorrelationId: "b", producerJsonPath: edgeValue }],
  derived: true,
  excludedLinkKeys,
});

describe("graphContentChanged", () => {
  it("ignores a refetch that only changes the excluded link keys", () => {
    const before = response([]);
    const after = replaceEqualDeep(before, response(["requestHeader:Cookie.sid"]));
    expect(after).not.toBe(before);
    expect(graphContentChanged(before, after)).toBe(false);
  });

  it("reports a change when the links change", () => {
    const before = response([]);
    const after = replaceEqualDeep(before, response([], "$.data.id"));
    expect(graphContentChanged(before, after)).toBe(true);
  });

  it("reports a change when data first arrives", () => {
    expect(graphContentChanged(undefined, response([]))).toBe(true);
  });
});
