import { z } from "zod";

// Derived API model (architecture §2.2). Produced by `derive`, stored in DB, never hand-edited.

export const PathTemplateSchema = z.object({
  template: z.string(), // "/bo/api/v1/invoices/{invoiceId}"
  params: z.array(
    z.object({
      name: z.string(), // "invoiceId"
      position: z.number().int(), // path segment index
      kind: z.enum(["uuid", "numeric", "slug", "opaque"]),
      observedValues: z.array(z.string()).max(20),
    }),
  ),
});
export type PathTemplate = z.infer<typeof PathTemplateSchema>;

export const OperationSchema = z.object({
  operationId: z.string(), // stable hash of method+template
  method: z.string(),
  host: z.string(),
  pathTemplate: PathTemplateSchema,
  observedCount: z.number().int(),
  statusCodesObserved: z.record(z.number().int()), // {"200": 41, "401": 2}
  requestSchema: z.unknown().nullable(), // JSON Schema, unioned across observations
  responseSchemas: z.record(z.unknown()), // keyed by status code
  queryParams: z.array(
    z.object({
      name: z.string(),
      required: z.boolean(), // required = seen in >=95% of observations
      observedValues: z.array(z.string()).max(10),
    }),
  ),
  authObserved: z.enum(["cookie", "bearer", "none", "mixed"]),
  contentTypes: z.array(z.string()),
  exampleCorrelationIds: z.array(z.string()).max(5), // pointers back into sessions
  firstSeenSessionId: z.string(),
  lastSeenAt: z.number().int(),
  volatileResponseFields: z.array(z.string()), // JSON paths differing across identical calls
});
export type Operation = z.infer<typeof OperationSchema>;

export const DataflowEdgeSchema = z.object({
  producer: z.object({
    operationId: z.string(),
    location: z.enum(["responseBody", "responseHeader"]),
    jsonPath: z.string(),
  }),
  consumer: z.object({
    operationId: z.string(),
    location: z.enum(["path", "query", "requestBody", "requestHeader"]),
    jsonPath: z.string(),
  }),
  evidenceCount: z.number().int(), // sessions in which this link was observed
  valueEntropyOk: z.boolean(), // false = low-entropy match, treat as suspect
});
export type DataflowEdge = z.infer<typeof DataflowEdgeSchema>;

// Session-scoped call graph (single session, call-level — not aggregated across sessions).
// Powers the session detail page's dependency graph view.

export const SessionGraphNodeSchema = z.object({
  correlationId: z.string(),
  operationId: z.string().nullable(), // null if templatization couldn't classify this call
  method: z.string(),
  host: z.string(),
  pathname: z.string(),
  status: z.number().int().nullable(),
  requestTimestamp: z.number().int(),
  responseTimestamp: z.number().int().nullable(),
});
export type SessionGraphNode = z.infer<typeof SessionGraphNodeSchema>;

export const SessionCallEdgeSchema = z.object({
  producerCorrelationId: z.string(),
  producerLocation: z.enum(["responseBody", "responseHeader"]),
  producerJsonPath: z.string(),
  consumerCorrelationId: z.string(),
  consumerLocation: z.enum(["path", "query", "requestBody", "requestHeader"]),
  consumerJsonPath: z.string(),
  value: z.string(),
  confidence: z.enum(["strong", "weak"]),
});
export type SessionCallEdge = z.infer<typeof SessionCallEdgeSchema>;

export const SessionGraphSchema = z.object({
  nodes: z.array(SessionGraphNodeSchema),
  edges: z.array(SessionCallEdgeSchema),
});
export type SessionGraph = z.infer<typeof SessionGraphSchema>;

export const ObservedFlowSchema = z.object({
  // per-session call chain, pre-human
  flowId: z.string(),
  sessionId: z.string(),
  steps: z.array(
    z.object({
      operationId: z.string(),
      correlationId: z.string(),
      repeated: z.number().int().optional(), // collapsed polling count (§5.6)
    }),
  ),
});
export type ObservedFlow = z.infer<typeof ObservedFlowSchema>;

// Catalog-level dependency graph (realignment guide §5) — aggregated from DataflowEdge across
// all sessions, keyed by operationId, with a lightweight inferred semantic `role`. Derived only;
// never hand-entered.

export const DependencySlotSchema = z.object({
  location: z.enum(["path", "query", "header", "body"]),
  path: z.string(), // "Authorization", "$.orgId", path param name, ...
});
export type DependencySlot = z.infer<typeof DependencySlotSchema>;

export const CatalogDependencyEdgeSchema = z.object({
  producerOp: z.string(), // operationId that yields the value
  producerPath: z.string(), // "$.token", "$.data.id"
  consumerOp: z.string(), // operationId that needs it
  consumerSlot: DependencySlotSchema,
  role: z.string().optional(), // inferred: "auth-token" | "resource-id:<area>" | undefined
  evidenceSessions: z.number().int(), // sessions in which this producer->consumer link was observed
  confidence: z.enum(["strong", "weak"]),
});
export type CatalogDependencyEdge = z.infer<typeof CatalogDependencyEdgeSchema>;

export const OperationDependencySchema = z.object({
  operationId: z.string(),
  requires: z.array(
    z.object({
      consumerSlot: DependencySlotSchema,
      role: z.string().optional(),
      satisfiableBy: z.array(z.string()), // operationIds that can satisfy this slot
    }),
  ),
  produces: z.array(z.object({ path: z.string(), role: z.string().optional() })),
  clientGenerated: z.array(z.string()), // slots needing fresh-minted values, no producer anywhere
  authRequired: z.boolean(), // derived: consumes an auth-token role in >=1 session
});
export type OperationDependency = z.infer<typeof OperationDependencySchema>;
