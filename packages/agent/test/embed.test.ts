import type { Operation } from "@backbencher/schemas";
import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { type Embedder, retrieveForGoal } from "../src/embed.js";

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

    store.exemplars.upsert({
      exemplarId: "sc_ticket",
      sessionId: "s_ticket",
      name: "Create ticket from homepage",
      goal: "create a ticket from scratch",
      steps: [{ operationId: "op_create_ticket", intent: "Create the ticket" }],
      sourceFlowIds: [],
      updatedBy: "alice",
      updatedAt: 1,
    });
    store.exemplars.upsert({
      exemplarId: "sc_users",
      sessionId: "s_users",
      name: "List all users",
      goal: "see who is in the org",
      steps: [{ operationId: "op_list_users", intent: "List users" }],
      sourceFlowIds: [],
      updatedBy: "alice",
      updatedAt: 1,
    });

    const result = await retrieveForGoal(store, "create a ticket", { topEndpoints: 2, topExemplars: 1 });

    expect(result.endpoints.map((e) => e.operationId)).toContain("op_create_ticket");
    expect(result.endpoints.map((e) => e.operationId)).not.toContain("op_list_users");
    expect(result.exemplars[0]?.exemplarId).toBe("sc_ticket");

    store.close();
  });
});

describe("embedding cache", () => {
  function seed(): ReturnType<typeof openStore> {
    const store = openStore(":memory:");
    store.saveDerivation({ operations: [op("op_a", "POST", "/api/a")], dataflow: [], flows: [] });
    annotate(store, "op_a", "Create Thing", "Creates a thing", "Things");
    return store;
  }

  function countingEmbedder(model: string): Embedder & { texts: string[] } {
    const texts: string[] = [];
    return {
      model,
      texts,
      embed(input) {
        texts.push(...input);
        return Promise.resolve(input.map(() => [1, 0, 0]));
      },
    };
  }

  it("persists a vector on first retrieval and reuses it on the second", async () => {
    const store = seed();
    const embedder = countingEmbedder("test:v1");

    await retrieveForGoal(store, "make a thing", { embedder });
    const cached = store.embeddings.get("operation", "op_a");
    expect(cached?.model).toBe("test:v1");
    expect(cached?.vector).toEqual([1, 0, 0]);

    embedder.texts.length = 0;
    await retrieveForGoal(store, "make a thing", { embedder });
    // Only the goal is embedded the second time; the operation comes from the cache.
    expect(embedder.texts).toEqual(["make a thing"]);

    store.close();
  });

  it("re-embeds when the annotation text changes", async () => {
    const store = seed();
    const embedder = countingEmbedder("test:v1");
    await retrieveForGoal(store, "g", { embedder });
    const firstHash = store.embeddings.get("operation", "op_a")?.textHash;

    annotate(store, "op_a", "Create Widget", "Creates a widget", "Widgets");
    embedder.texts.length = 0;
    await retrieveForGoal(store, "g", { embedder });

    expect(embedder.texts.some((t) => t.includes("Create Widget"))).toBe(true);
    expect(store.embeddings.get("operation", "op_a")?.textHash).not.toBe(firstHash);

    store.close();
  });

  it("re-embeds everything when the embedding model changes", async () => {
    const store = seed();
    await retrieveForGoal(store, "g", { embedder: countingEmbedder("test:v1") });

    const v2 = countingEmbedder("test:v2");
    await retrieveForGoal(store, "g", { embedder: v2 });

    expect(v2.texts.some((t) => t.includes("Create Thing"))).toBe(true);
    expect(store.embeddings.get("operation", "op_a")?.model).toBe("test:v2");

    store.close();
  });
});
