import type { Operation } from "@backbencher/schemas";
import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import type { LlmComplete } from "../src/generate.js";
import { proposeScenario } from "../src/compose.js";

function op(operationId: string, method: string, template: string, authObserved: Operation["authObserved"]): Operation {
  return {
    operationId,
    method,
    host: "h",
    pathTemplate: { template, params: [] },
    observedCount: 1,
    statusCodesObserved: { "200": 1 },
    requestSchema: null,
    responseSchemas: {},
    queryParams: [],
    authObserved,
    contentTypes: ["application/json"],
    exampleCorrelationIds: ["c1"],
    firstSeenSessionId: "s1",
    lastSeenAt: 1,
    volatileResponseFields: [],
  };
}

function seed() {
  const store = openStore(":memory:");
  store.saveDerivation({
    operations: [op("op_login", "POST", "/auth/login", "none"), op("op_create_ticket", "POST", "/api/tickets", "bearer")],
    dataflow: [],
    flows: [],
  });
  store.annotations.upsert({
    operationId: "op_login",
    name: "Login",
    does: "Authenticates the user and returns a bearer token",
    productArea: "Auth",
    sideEffect: "auth",
    reviewState: "approved",
    tags: [],
    updatedBy: "alice",
    updatedAt: 1,
  });
  store.annotations.upsert({
    operationId: "op_create_ticket",
    name: "Create Ticket",
    does: "Creates a support ticket in the current org",
    productArea: "Ticketing",
    sideEffect: "create",
    reviewState: "approved",
    tags: [],
    updatedBy: "alice",
    updatedAt: 1,
  });
  return store;
}

describe("proposeScenario", () => {
  it("auto-adds login via dependency closure when the LLM proposes only the create-ticket step (guide §6 acceptance check)", async () => {
    const store = seed();

    // A deliberately incomplete fake LLM: it only picks the create-ticket step, omitting the
    // auth-token producer it requires. The deterministic validator (compose.ts) must auto-add
    // op_login before op_create_ticket.
    const fakeLlm: LlmComplete = async () =>
      JSON.stringify({
        steps: [{ operationId: "op_create_ticket", intent: "Create a new support ticket" }],
        rationale: "The goal is to create a ticket from scratch.",
        candidateGaps: [],
      });

    const result = await proposeScenario(store, "create a ticket from scratch", { llm: fakeLlm, actor: "alice" });

    expect(result.scenario.origin).toBe("composed");
    expect(result.scenario.reviewState).toBe("unreviewed");
    expect(result.scenario.unmetDependencies).toEqual([]);

    const opIds = result.scenario.steps.map((s) => s.operationId);
    expect(opIds.indexOf("op_login")).toBeGreaterThanOrEqual(0);
    expect(opIds.indexOf("op_login")).toBeLessThan(opIds.indexOf("op_create_ticket"));

    const loginStep = result.scenario.steps.find((s) => s.operationId === "op_login");
    expect(loginStep?.autoAdded).toBe(true);
    const ticketStep = result.scenario.steps.find((s) => s.operationId === "op_create_ticket");
    expect(ticketStep?.autoAdded).toBe(false);

    store.close();
  });

  it("surfaces an unmet dependency when auth has no known producer in the candidate pool", async () => {
    const store = openStore(":memory:");
    store.saveDerivation({
      operations: [op("op_create_ticket", "POST", "/api/tickets", "bearer")],
      dataflow: [],
      flows: [],
    });
    store.annotations.upsert({
      operationId: "op_create_ticket",
      name: "Create Ticket",
      does: "Creates a support ticket in the current org",
      productArea: "Ticketing",
      sideEffect: "create",
      reviewState: "approved",
      tags: [],
      updatedBy: "alice",
      updatedAt: 1,
    });

    const fakeLlm: LlmComplete = async () =>
      JSON.stringify({
        steps: [{ operationId: "op_create_ticket", intent: "Create a new support ticket" }],
        rationale: "The goal is to create a ticket from scratch.",
        candidateGaps: [],
      });

    const result = await proposeScenario(store, "create a ticket from scratch", { llm: fakeLlm, actor: "alice" });

    expect(result.scenario.unmetDependencies.length).toBeGreaterThan(0);
    expect(result.scenario.unmetDependencies[0]?.operationId).toBe("op_create_ticket");

    store.close();
  });
});
