import { z } from "zod";

// TestSpec (architecture §2.5) — the agent's declarative output. The compiler turns it into
// Playwright; the LLM never writes runnable code directly.
//
// Template syntax in string values (resolved by the compiler; unknown templates are a
// compile error — the main guardrail against agent hallucination):
//   {{steps.<stepId>.extract.<var>}}, {{env.<key>}}, {{faker.uuid}}, {{faker.email}}, {{now.iso}}

export const JsonAssertionSchema = z.object({
  path: z.string(),
  op: z.enum([
    "equals",
    "notEquals",
    "contains",
    "matches",
    "exists",
    "absent",
    "gt",
    "lt",
    "lengthGte",
  ]),
  value: z.unknown().optional(),
});
export type JsonAssertion = z.infer<typeof JsonAssertionSchema>;

export const TestSpecStepSchema = z.object({
  id: z.string(), // "createInvoice"
  operationId: z.string(),
  description: z.string(),
  request: z
    .object({
      pathParams: z.record(z.string()).optional(), // values or "{{steps.login.extract.token}}"
      query: z.record(z.string()).optional(),
      headers: z.record(z.string()).optional(),
      body: z.unknown().optional(), // may contain {{templates}} and {{faker.*}}
    })
    .optional(),
  extract: z.record(z.string()).optional(), // varName -> JSONPath into response
  expect: z.object({
    status: z.number().int().or(z.array(z.number().int())),
    schemaConformance: z.boolean().default(true),
    jsonAssertions: z.array(JsonAssertionSchema).default([]),
  }),
  poll: z
    .object({
      untilStatus: z.number().optional(),
      untilPath: z.string().optional(),
      untilValue: z.unknown().optional(),
      timeoutMs: z.number(),
      intervalMs: z.number(),
    })
    .optional(),
  continueOnFailure: z.boolean().default(false),
});
export type TestSpecStep = z.infer<typeof TestSpecStepSchema>;

export const TestSpecSchema = z.object({
  version: z.literal(1),
  specId: z.string(),
  compositionId: z.string(),
  title: z.string(),
  environment: z.string(),
  authProfile: z.string(),
  tags: z.array(z.string()),
  steps: z.array(TestSpecStepSchema),
  cleanup: z
    .array(
      z.object({
        operationId: z.string(),
        request: z.unknown().optional(),
        ignoreFailure: z.boolean().default(true),
      }),
    )
    .default([]),
});
export type TestSpec = z.infer<typeof TestSpecSchema>;
