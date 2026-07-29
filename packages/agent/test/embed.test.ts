import type { Operation } from "@backbencher/schemas";
import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { retrieveForGoal } from "../src/embed.js";

function op(operationId: string, method: string, template: string): Operation {
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
    authObserved: "cookie",
    contentTypes: ["application/json"],
    exampleCorrelationIds: ["c1"],
    firstSeenSessionId: "s1",
    lastSeenAt: 1,
    volatileResponseFields: [],
  };
}

function annotate(store: ReturnType<typeof openStore>, operationId: string, name: string, does: string, productArea: string) {
  store.annotations.upsert({
    operationId,
    name,
    does,
    productArea,
    reviewState: "approved",
    tags: [],
    updatedBy: "alice",
    updatedAt: 1,
  });
}

describe("retrieveForGoal", () => {
  it("ranks ticket-related endpoints and the create-ticket scenario at the top for a ticket goal", async () => {
    const store = openStore(":memory:");
    store.saveDerivation({
      operations: [
        op("op_create_ticket", "POST", "/api/tickets"),
        op("op_get_ticket", "GET", "/api/tickets/{id}"),
        op("op_list_users", "GET", "/api/users"),
      ],
      dataflow: [],
      flows: [],
    });
    annotate(store, "op_create_ticket", "Create Ticket", "Creates a support ticket in the current org", "Ticketing");
    annotate(store, "op_get_ticket", "Get Ticket", "Fetches a single ticket by id", "Ticketing");
    annotate(store, "op_list_users", "List Users", "Lists all users in the org", "Users");

    store.scenarios.upsert({
      scenarioId: "sc_ticket",
      name: "Create ticket from homepage",
      description: "Create a new support ticket",
      goal: "create a ticket from scratch",
      origin: "recorded",
      sourceFlowIds: [],
      steps: [{ operationId: "op_create_ticket", intent: "Create the ticket" }],
      testDecision: { inScope: true, strategy: "api_functional", rationale: "r", riskLevel: "low", environments: [] },
      reviewState: "unreviewed",
      updatedBy: "alice",
      updatedAt: 1,
    });
    store.scenarios.upsert({
      scenarioId: "sc_users",
      name: "List all users",
      description: "Browse the users list",
      goal: "see who is in the org",
      origin: "recorded",
      sourceFlowIds: [],
      steps: [{ operationId: "op_list_users", intent: "List users" }],
      testDecision: { inScope: true, strategy: "api_functional", rationale: "r", riskLevel: "low", environments: [] },
      reviewState: "unreviewed",
      updatedBy: "alice",
      updatedAt: 1,
    });

    const result = await retrieveForGoal(store, "create a ticket", { topEndpoints: 2, topScenarios: 1 });

    expect(result.endpoints.map((e) => e.operationId)).toContain("op_create_ticket");
    expect(result.endpoints.map((e) => e.operationId)).not.toContain("op_list_users");
    expect(result.scenarios[0]?.scenarioId).toBe("sc_ticket");

    store.close();
  });
});
