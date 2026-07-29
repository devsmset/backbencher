import { type Server, createServer } from "node:http";
import type { Operation } from "@backbencher/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ProbeHttp, probeVolatileFields } from "../src/probe.js";

function op(template: string): Operation {
  return {
    operationId: "op_clock",
    method: "GET",
    host: "h",
    pathTemplate: { template, params: [] },
    observedCount: 1,
    statusCodesObserved: { "200": 1 },
    requestSchema: null,
    responseSchemas: {},
    queryParams: [],
    authObserved: "none",
    contentTypes: ["application/json"],
    exampleCorrelationIds: ["c1"],
    firstSeenSessionId: "s1",
    lastSeenAt: 1,
    volatileResponseFields: [],
  };
}

const http: ProbeHttp = async ({ url }) => {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
};

describe("probeVolatileFields", () => {
  let server: Server;
  let baseUrl = "";
  let counter = 0;
  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "constant", n: counter++ }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });
  afterAll(() => {
    server.close();
  });

  it("detects a changing field across two idempotent GETs", async () => {
    const [probed] = await probeVolatileFields([op("/clock")], { baseUrl, http });
    expect(probed?.volatileResponseFields).toContain("$.n");
    expect(probed?.volatileResponseFields).not.toContain("$.id");
  });

  it("skips operations not marked safe", async () => {
    const [probed] = await probeVolatileFields([op("/clock")], { baseUrl, http, safeOperationIds: new Set(["other"]) });
    expect(probed?.volatileResponseFields).toEqual([]);
  });
});
