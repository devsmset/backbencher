import { describe, expect, it } from "vitest";
import { dataflowFixture, literalRedactedFixture } from "../fixtures/sessions.js";
import { runDerivation } from "../src/pipeline.js";

describe("buildDataflowGraph", () => {
  it("links a token produced in a response to its use in a later request", () => {
    const result = runDerivation([dataflowFixture()]);
    const edge = result.dataflow.find(
      (e) => e.producer.jsonPath === "$.ticket" && e.consumer.jsonPath === "ref",
    );
    expect(edge).toBeDefined();
    expect(edge?.producer.location).toBe("responseBody");
    expect(edge?.consumer.location).toBe("query");
    expect(edge?.evidenceCount).toBe(1);
    expect(edge?.valueEntropyOk).toBe(true);
  });

  it("links a value that contains the substring REDACTED", () => {
    const result = runDerivation([literalRedactedFixture()]);
    const edge = result.dataflow.find(
      (e) => e.producer.jsonPath === "$.sid" && e.consumer.jsonPath === "sid",
    );
    expect(edge).toBeDefined();
    expect(edge?.producer.location).toBe("responseBody");
    expect(edge?.consumer.location).toBe("query");
  });
});
