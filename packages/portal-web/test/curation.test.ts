import { describe, expect, it } from "vitest";
import { curationCounts, curationSummary } from "../src/curation.js";

describe("curationCounts", () => {
  it("derives redundant and deleted counts from raw/curated call counts", () => {
    expect(
      curationCounts({ rawCallCount: 10, curatedCallCount: 6, deletedCorrelationIds: ["a", "b"] }),
    ).toEqual({ redundant: 2, deleted: 2 });
  });

  it("clamps redundant to zero when deletions are recorded but no curated file exists yet", () => {
    expect(
      curationCounts({ rawCallCount: 5, curatedCallCount: 0, deletedCorrelationIds: ["a", "b", "c", "d", "e"] }),
    ).toEqual({ redundant: 0, deleted: 5 });
  });
});

describe("curationSummary", () => {
  it("renders the redundant/deleted counts as a sentence", () => {
    expect(
      curationSummary({ rawCallCount: 10, curatedCallCount: 6, deletedCorrelationIds: ["a", "b"] }),
    ).toBe("2 redundant calls filtered, 2 deleted by you");
  });
});
