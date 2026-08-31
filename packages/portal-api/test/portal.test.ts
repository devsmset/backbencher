import type { Operation } from "@backbencher/schemas";
import { BbConfigSchema } from "@backbencher/shared";
import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { appRouter, buildServer } from "../src/index.js";

const op: Operation = {
  operationId: "op_abc",
  method: "GET",
  host: "h",
  pathTemplate: { template: "/api/x", params: [] },
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

describe("portal-api", () => {
  it("lists/annotates operations and builds a pack via the tRPC caller", async () => {
    const store = openStore(":memory:");
    store.saveDerivation({ operations: [op], dataflow: [], flows: [] });
    const caller = appRouter.createCaller({ store, actor: "tester", config: BbConfigSchema.parse({}) });

    expect(await caller.operations.list({})).toHaveLength(1);
    await caller.operations.annotate({ operationId: "op_abc", name: "Get X", does: "Gets X" });
    const got = await caller.operations.get({ operationId: "op_abc" });
    expect(got?.operation.reviewState).toBe("ready");

    const pack = await caller.pack.build();
    expect(pack.contentHash).toBeTruthy();
    expect(store.audit.list("operation", "op_abc").length).toBeGreaterThanOrEqual(1);
    store.close();
  });

  it("enforces the shared-token auth hook", async () => {
    const store = openStore(":memory:");
    const { app } = buildServer({ store, portalToken: "secret", config: BbConfigSchema.parse({}) });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const unauthorized = await app.inject({ method: "POST", url: "/trpc/pack.build" });
    expect(unauthorized.statusCode).toBe(401);

    await app.close();
    store.close();
  });
});
