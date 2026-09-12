import { describe, expect, it } from "vitest";
import { ssoFixture } from "../fixtures/sessions.js";
import { runDerivation } from "../src/pipeline.js";

describe("runDerivation (SSO integration)", () => {
  it("produces operations and a flow with collapsed polling", () => {
    const result = runDerivation([ssoFixture()]);

    // /api/jobs/status observed 3x
    const jobs = result.operations.find((o) => o.pathTemplate.template === "/api/jobs/status");
    expect(jobs?.observedCount).toBe(3);

    const flow = result.flows.find((f) => f.sessionId === "sess-sso");
    expect(flow).toBeDefined();

    expect(result.autoFiltered["sess-sso"]).toEqual(["s4"]);
    expect(flow?.steps.map((s) => s.correlationId)).toEqual(["s1", "s2", "s3", "s5"]);

    const login = flow?.steps.find((s) => s.correlationId === "s2");
    expect(login).toBeDefined();
  });

  it("is deterministic across runs", () => {
    const a = JSON.stringify(runDerivation([ssoFixture()]));
    const b = JSON.stringify(runDerivation([ssoFixture()]));
    expect(a).toBe(b);
  });
});
