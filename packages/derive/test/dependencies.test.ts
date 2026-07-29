import { describe, expect, it } from "vitest";
import { authFixture } from "../fixtures/sessions.js";
import { deriveDependencyGraph } from "../src/dependencies.js";
import { runDerivation } from "../src/pipeline.js";

describe("deriveDependencyGraph", () => {
  it("derives an auth-token dependency from login -> a bearer-authed write endpoint with zero human input beyond marking the login op as an auth side effect", () => {
    const result = runDerivation([authFixture()]);
    const loginOp = result.operations.find((o) => o.pathTemplate.template.includes("login"));
    const ticketsOp = result.operations.find((o) => o.pathTemplate.template.includes("tickets"));
    expect(loginOp).toBeDefined();
    expect(ticketsOp).toBeDefined();

    const graph = deriveDependencyGraph(result.operations, result.dataflow, result.clientGeneratedFields, {
      authOperationIds: new Set([loginOp!.operationId]),
    });

    const dep = graph.byOperation.get(ticketsOp!.operationId);
    expect(dep?.authRequired).toBe(true);
    const slot = dep?.requires.find((r) => r.role === "auth-token");
    expect(slot).toBeDefined();
    expect(slot?.satisfiableBy).toContain(loginOp!.operationId);
  });

  it("marks authRequired even with no known producer, surfacing it as a coverage gap (guide §10 gotcha #1)", () => {
    const result = runDerivation([authFixture()]);
    const ticketsOp = result.operations.find((o) => o.pathTemplate.template.includes("tickets"));
    const graph = deriveDependencyGraph(result.operations, result.dataflow, result.clientGeneratedFields);
    const dep = graph.byOperation.get(ticketsOp!.operationId);
    expect(dep?.authRequired).toBe(true);
    const slot = dep?.requires.find((r) => r.role === "auth-token");
    expect(slot?.satisfiableBy).toEqual([]);
  });
});
