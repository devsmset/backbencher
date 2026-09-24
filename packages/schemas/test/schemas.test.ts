import { describe, expect, it } from "vitest";
import {
  ApiRequestEventSchema,
  CompositionSchema,
  KnowledgePackSchema,
  OperationSchema,
  RecordingEventSchema,
  RecordingMetaSchema,
  TestSpecSchema,
  SessionGraphNodeSchema,
  schemaRegistry,
} from "../src/index.js";

describe("recording contracts", () => {
  const baseRequest = {
    type: "api_request" as const,
    correlationId: "01J000000000000000000REQ01",
    timestamp: 1785170417629,
    method: "GET",
    url: "https://example.net/bo/userProfile",
    resourceType: "xhr" as const,
    headers: { accept: "*/*" },
    headersSource: "all" as const,
    postData: null,
  };

  it("parses a valid api_request event", () => {
    expect(ApiRequestEventSchema.parse(baseRequest)).toMatchObject({ method: "GET" });
  });

  it("discriminates the union by `type`", () => {
    const parsed = RecordingEventSchema.parse(baseRequest);
    expect(parsed.type).toBe("api_request");
  });

  it("rejects an unknown event type", () => {
    expect(() => RecordingEventSchema.parse({ type: "nope", timestamp: 1 })).toThrow();
  });

  it("rejects a v3 session meta", () => {
    expect(() =>
      RecordingMetaSchema.parse({
        version: 3,
        sessionId: "s1",
        startUrl: "https://example.net/",
        startedAt: 1,
        userAgent: "t",
        recorderVersion: "t",
        name: "n",
        goal: "g",
      }),
    ).toThrow();
  });
});

describe("testspec defaults", () => {
  it("applies schemaConformance + jsonAssertions + cleanup defaults", () => {
    const spec = TestSpecSchema.parse({
      version: 1,
      specId: "s1",
      compositionId: "sc1",
      title: "smoke",
      environment: "staging",
      authProfile: "admin",
      tags: [],
      steps: [
        {
          id: "getProfile",
          operationId: "op_abc",
          description: "fetch profile",
          expect: { status: 200 },
        },
      ],
    });
    expect(spec.steps[0]?.expect.schemaConformance).toBe(true);
    expect(spec.steps[0]?.expect.jsonAssertions).toEqual([]);
    expect(spec.cleanup).toEqual([]);
  });

  it("accepts an array of allowed status codes", () => {
    const spec = TestSpecSchema.parse({
      version: 1,
      specId: "s2",
      compositionId: "sc1",
      title: "negative",
      environment: "staging",
      authProfile: "viewer",
      tags: ["authz"],
      steps: [
        {
          id: "denied",
          operationId: "op_abc",
          description: "expect denial",
          expect: { status: [401, 403] },
        },
      ],
    });
    expect(spec.steps[0]?.expect.status).toEqual([401, 403]);
  });
});

describe("derived + pack contracts", () => {
  it("parses a minimal Operation", () => {
    const op = OperationSchema.parse({
      operationId: "op_abc",
      method: "GET",
      host: "example.net",
      pathTemplate: { template: "/bo/userProfile", params: [] },
      observedCount: 3,
      statusCodesObserved: { "200": 2, "401": 1 },
      requestSchema: null,
      responseSchemas: {},
      queryParams: [],
      authObserved: "cookie",
      contentTypes: ["application/json"],
      exampleCorrelationIds: [],
      firstSeenSessionId: "sess1",
      lastSeenAt: 1785170418673,
      volatileResponseFields: [],
    });
    expect(op.operationId).toBe("op_abc");
  });

  it("parses a minimal KnowledgePack", () => {
    const pack = KnowledgePackSchema.parse({
      version: 1,
      builtAt: 1,
      contentHash: "deadbeef",
      catalog: [],
      operations: {},
      referenceSessions: [],
      compositions: [],
      guides: [],
      dataflow: [],
      authProfiles: [],
      environments: [],
    });
    expect(pack.version).toBe(1);
  });

  it("parses a pack written before Reference Sessions existed", () => {
    const pack = KnowledgePackSchema.parse({
      version: 1,
      builtAt: 1,
      contentHash: "deadbeef",
      catalog: [],
      operations: {},
      exemplars: [{ exemplarId: "x1" }], // the field Reference Sessions replaced
      compositions: [],
      guides: [],
      dataflow: [],
      authProfiles: [],
      environments: [],
    });
    expect(pack.referenceSessions).toEqual([]);
  });
});

describe("schema registry", () => {
  it("exposes every top-level contract", () => {
    expect(Object.keys(schemaRegistry).length).toBeGreaterThanOrEqual(12);
  });
});

describe("session graph node schema", () => {
  it("parses a node with request/response headers and body", () => {
    const node = {
      correlationId: "01J000000000000000000REQ01",
      operationId: "op_abc",
      method: "GET",
      host: "example.net",
      pathname: "/bo/userProfile",
      status: 200,
      requestTimestamp: 1,
      responseTimestamp: 2,
      requestHeaders: { authorization: "Bearer t" },
      requestBody: null,
      responseHeaders: { "content-type": "application/json" },
      responseBody: { ok: true },
      responseBodyKind: "json",
    };
    expect(SessionGraphNodeSchema.parse(node)).toMatchObject({ responseBodyKind: "json" });
  });

  it("rejects a node missing the new required fields", () => {
    expect(() =>
      SessionGraphNodeSchema.parse({
        correlationId: "c1",
        operationId: null,
        method: "GET",
        host: "h",
        pathname: "/x",
        status: null,
        requestTimestamp: 1,
        responseTimestamp: null,
      }),
    ).toThrow();
  });
});

describe("composition provenance", () => {
  const base = {
    goal: "replay session s1",
    status: "draft" as const,
    unmetDependencies: [],
    candidateGaps: [],
    createdBy: "alice",
    createdAt: 1,
    updatedBy: "alice",
    updatedAt: 1,
  };

  it("round-trips the optional session-provenance fields", () => {
    const parsed = CompositionSchema.parse({
      ...base,
      compositionId: "c1",
      sourceSessionId: "s1",
      steps: [{ operationId: "op_a", intent: "GET /a", sourceCorrelationId: "corr-1" }],
    });
    expect(parsed.sourceSessionId).toBe("s1");
    expect(parsed.steps[0]?.sourceCorrelationId).toBe("corr-1");
  });

  it("still parses a Composition that has neither field, as every LLM-authored one does", () => {
    const parsed = CompositionSchema.parse({
      ...base,
      compositionId: "c2",
      steps: [{ operationId: "op_a", intent: "why" }],
    });
    expect(parsed.sourceSessionId).toBeUndefined();
    expect(parsed.steps[0]?.sourceCorrelationId).toBeUndefined();
  });
});
