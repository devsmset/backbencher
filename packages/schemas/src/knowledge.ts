import { z } from "zod";

// Human knowledge layer (architecture §2.3). Analyst-authored; NEVER in the same rows as
// derived facts. The agent consumes a merged view where human input wins.

export const ReviewState = z.enum([
  "unreviewed",
  "in_review",
  "approved",
  "deprecated",
  "ignored",
]);
export type ReviewState = z.infer<typeof ReviewState>;

export const SideEffect = z.enum(["read", "create", "update", "delete", "auth", "unknown"]);
export type SideEffect = z.infer<typeof SideEffect>;

export const OperationAnnotationSchema = z.object({
  operationId: z.string(),
  name: z.string().optional(), // "Create Ticket" — required (in practice) for an endpoint to be "ready"
  does: z.string().optional(), // "Creates a support ticket in the current org" — required for "ready"
  productArea: z.string().optional(), // "Ticketing" — cheap, sharply improves retrieval grouping
  sideEffect: SideEffect.optional(), // one click; lets the composer reason about ordering/destructiveness
  reviewState: ReviewState,
  paramDocs: z.record(z.string()).optional(), // paramName -> markdown
  correctionOverrides: z
    .object({
      // human beats derivation
      pathTemplate: z.string().optional(), // fix wrong templatization
      requiredQueryParams: z.array(z.string()).optional(),
      ignoreFields: z.array(z.string()).optional(), // extra volatile/irrelevant fields
    })
    .partial()
    .optional(),
  testingGuidance: z.string().optional(), // markdown: "never call DELETE on shared env", etc.
  tags: z.array(z.string()).default([]),
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
export type OperationAnnotation = z.infer<typeof OperationAnnotationSchema>;

/** An endpoint is composable once it has at least a name + a one-line description. */
export function isAnnotationReady(a: OperationAnnotation | null | undefined): boolean {
  return Boolean(a?.name && a?.does);
}

export const AnalystGuideSchema = z.object({
  // free-form product knowledge docs
  guideId: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  scope: z.object({
    // what this guide attaches to
    productArea: z.string().optional(),
    operationIds: z.array(z.string()).default([]),
    flowIds: z.array(z.string()).default([]),
  }),
  audience: z.literal("qa_agent"), // future: "human"
  priority: z.enum(["must_read", "reference"]),
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
export type AnalystGuide = z.infer<typeof AnalystGuideSchema>;

export const ScenarioSchema = z.object({
  // curated, testable business scenario — either distilled from a recorded session/flow, or
  // composed by the LLM from a free-text goal (realignment guide §6). `origin` distinguishes them;
  // `reviewState` doubles as the draft/approved/rejected lifecycle for composed scenarios
  // (unreviewed = draft, approved = approved, deprecated/ignored = rejected).
  scenarioId: z.string(),
  name: z.string(), // "Invoice lifecycle: create -> send -> void"
  description: z.string(), // markdown, analyst-written intent
  origin: z.enum(["recorded", "composed", "manual"]).default("manual"),
  goal: z.string().optional(), // the free-text goal, for composed scenarios
  sourceFlowIds: z.array(z.string()), // observed flows this was distilled from
  steps: z.array(
    z.object({
      operationId: z.string(),
      intent: z.string(), // "Create a draft invoice for the test customer"
      notes: z.string().optional(),
      satisfies: z.array(z.string()).default([]), // downstream requires-slots this step feeds
      autoAdded: z.boolean().default(false), // inserted by dependency auto-completion, not the LLM
      fromExampleScenarioIds: z.array(z.string()).default([]), // provenance: where the LLM saw this used
    }),
  ),
  unmetDependencies: z
    .array(z.object({ operationId: z.string(), slot: z.string(), note: z.string() }))
    .default([]),
  candidateGaps: z
    .array(z.object({ description: z.string(), suggestedName: z.string().optional() }))
    .default([]),
  rationale: z.string().optional(), // LLM's short narrative of the composed flow
  modelInfo: z
    .object({ model: z.string(), packHash: z.string().optional(), promptHash: z.string().optional() })
    .optional(),
  preconditions: z.string().optional(), // markdown
  dataRequirements: z.string().optional(), // "needs a customer with credit terms"
  testDecision: z.object({
    // the analyst's testing decision record
    inScope: z.boolean(),
    strategy: z.enum(["api_functional", "api_negative", "authz", "contract_only", "skip"]),
    rationale: z.string(),
    riskLevel: z.enum(["critical", "high", "medium", "low"]),
    environments: z.array(z.string()), // which envs this may run against
  }),
  reviewState: ReviewState,
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
