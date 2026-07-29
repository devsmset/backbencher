import type { Operation } from "@backbencher/schemas";
import { describe, expect, it } from "vitest";
import { generateAuthzMatrix, generateBolaProbes } from "../src/security.js";

function op(operationId: string, method: string, template: string, params: Operation["pathTemplate"]["params"] = []): Operation {
  return {
    operationId,
    method,
    host: "app",
    pathTemplate: { template, params },
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

const idParam = [{ name: "id", position: 2, kind: "uuid" as const, observedValues: ["obs-id"] }];

describe("generateAuthzMatrix", () => {
  it("emits a denial spec per role for state-changing operations only", () => {
    const specs = generateAuthzMatrix({
      operations: [op("op_create", "POST", "/things"), op("op_list", "GET", "/things")],
      roles: ["admin", "viewer"],
      environment: "staging",
    });
    expect(specs).toHaveLength(2); // only the POST × 2 roles; GET excluded
    for (const s of specs) {
      expect(s.tags).toContain("authz");
      expect(s.steps[0]?.expect.status).toEqual([401, 403]);
      expect(s.steps[0]?.expect.schemaConformance).toBe(false);
    }
    expect(specs.map((s) => s.authProfile).sort()).toEqual(["admin", "viewer"]);
  });
});

describe("generateBolaProbes", () => {
  it("targets a foreign resource id under each role, expecting non-200", () => {
    const specs = generateBolaProbes({
      operations: [op("op_get", "GET", "/things/{id}", idParam), op("op_create", "POST", "/things")],
      roles: ["viewer"],
      environment: "staging",
    });
    expect(specs).toHaveLength(1); // only the op with a path param
    const spec = specs[0];
    expect(spec?.authProfile).toBe("viewer");
    expect(spec?.tags).toContain("idor");
    expect(spec?.steps[0]?.request?.pathParams?.id).toBe("{{env.BOLA_TARGET_ID}}");
    expect(spec?.steps[0]?.expect.status).toEqual([401, 403, 404]);
  });
});
