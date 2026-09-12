import { z } from "zod";

// Human knowledge layer. Analyst-authored; NEVER in the same rows as derived facts. The composer
// and the pack builder consume a merged view where human input wins.
//
// Two deliberate splits live here (docs/adr/0002-exemplar-composition-split.md):
//   CatalogAnnotation (composition-facing) vs TestingAnnotation (testkit-facing)
//   Exemplar (teaches, never approved) vs Composition (proposed, must be approved)

export const SideEffect = z.enum(["read", "create", "update", "delete", "auth", "unknown"]);
export type SideEffect = z.infer<typeof SideEffect>;

export const CatalogReviewState = z.enum(["unannotated", "ready", "ignored"]);
export type CatalogReviewState = z.infer<typeof CatalogReviewState>;

/**
 * What an analyst says about an Operation so the composer can select it: a name and a one-line
 * description, optionally a product area and a read/write kind. Nothing here is about testing.
 */
export const CatalogAnnotationSchema = z.object({
  operationId: z.string(),
  name: z.string().optional(), // "Create Ticket"
  does: z.string().optional(), // "Creates a support ticket in the current org"
  productArea: z.string().optional(), // "Ticketing" — cheap, sharply improves retrieval grouping
  sideEffect: SideEffect.optional(), // one click; lets the composer reason about ordering/destructiveness
  /** Machine-proposed and awaiting a human. Suggested meta never makes an Operation Ready. */
  suggested: z.boolean().default(false),
  reviewState: CatalogReviewState.default("unannotated"),
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
export type CatalogAnnotation = z.infer<typeof CatalogAnnotationSchema>;

/** An Operation is Ready — selectable by the composer — once a human has named and described it. */
export function isOperationReady(a: CatalogAnnotation | null | undefined): boolean {
  return Boolean(a && !a.suggested && a.reviewState !== "ignored" && a.name && a.does);
}

/** The single place `reviewState` is decided, so it can never disagree with the annotation body. */
export function catalogReviewStateFor(a: CatalogAnnotation): CatalogReviewState {
  if (a.reviewState === "ignored") return "ignored";
  return isOperationReady({ ...a, reviewState: "unannotated" }) ? "ready" : "unannotated";
}

/** Meta consumed only when generating and running tests. Never affects Ready or retrieval. */
export const TestingAnnotationSchema = z.object({
  operationId: z.string(),
  testingGuidance: z.string().optional(), // markdown: "never call DELETE on shared env", etc.
  paramDocs: z.record(z.string()).optional(), // paramName -> markdown
  correctionOverrides: z
    .object({
      pathTemplate: z.string().optional(), // fix wrong templatization
      requiredQueryParams: z.array(z.string()).optional(),
      ignoreFields: z.array(z.string()).optional(), // extra volatile/irrelevant fields
    })
    .partial()
    .optional(),
  tags: z.array(z.string()).default([]), // e.g. "probe-safe"
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
export type TestingAnnotation = z.infer<typeof TestingAnnotationSchema>;

export const AnalystGuideSchema = z.object({
  guideId: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  scope: z.object({
    productArea: z.string().optional(),
    operationIds: z.array(z.string()).default([]),
    flowIds: z.array(z.string()).default([]),
  }),
  audience: z.literal("qa_agent"),
  priority: z.enum(["must_read", "reference"]),
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
export type AnalystGuide = z.infer<typeof AnalystGuideSchema>;

export const ExemplarStepSchema = z.object({
  operationId: z.string(),
  intent: z.string(), // one line, in the goal's terms; may be model-drafted then edited
  notes: z.string().optional(),
});

/**
 * A promoted Session. Teaches the composer how Operations are ordered in practice, so it carries
 * the analyst's own name and goal. It is never approved and never tested.
 */
export const ExemplarSchema = z.object({
  exemplarId: z.string(),
  sessionId: z.string(),
  name: z.string().min(1), // the analyst's session name
  goal: z.string().min(1), // the analyst's own words — what a composition goal is matched against
  steps: z.array(ExemplarStepSchema),
  sourceFlowIds: z.array(z.string()).default([]),
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
export type Exemplar = z.infer<typeof ExemplarSchema>;

export const CompositionStatus = z.enum(["draft", "approved", "rejected"]);
export type CompositionStatus = z.infer<typeof CompositionStatus>;

export const CompositionStepSchema = z.object({
  operationId: z.string(),
  intent: z.string(), // the model's one-line why-this-step, in the goal's terms
  satisfies: z.array(z.string()).default([]), // downstream requires-slots this step feeds
  autoAdded: z.boolean().default(false), // inserted by dependency auto-completion, not the model
  fromSessionIds: z.array(z.string()).default([]), // provenance: which Reference Sessions showed this
});

export const TestDecisionSchema = z.object({
  inScope: z.boolean(),
  strategy: z.enum(["api_functional", "api_negative", "authz", "contract_only", "skip"]),
  rationale: z.string(),
  riskLevel: z.enum(["critical", "high", "medium", "low"]),
  environments: z.array(z.string()), // which envs this may run against
});
export type TestDecision = z.infer<typeof TestDecisionSchema>;

/**
 * A model's proposed answer to a free-text goal. Starts as a draft with no human judgement in it;
 * only an approved Composition may become a test, and only then does it carry a testDecision.
 */
export const CompositionSchema = z.object({
  compositionId: z.string(),
  goal: z.string().min(1), // the analyst's free text
  status: CompositionStatus.default("draft"),
  steps: z.array(CompositionStepSchema),
  unmetDependencies: z
    .array(z.object({ operationId: z.string(), slot: z.string(), note: z.string() }))
    .default([]),
  candidateGaps: z
    .array(z.object({ description: z.string(), suggestedName: z.string().optional() }))
    .default([]),
  rationale: z.string().optional(), // the model's short narrative of the composed flow
  modelInfo: z
    .object({ model: z.string(), packHash: z.string().optional(), promptHash: z.string().optional() })
    .optional(),
  testDecision: TestDecisionSchema.optional(), // set at approval, not at proposal
  createdBy: z.string(),
  createdAt: z.number().int(),
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
export type Composition = z.infer<typeof CompositionSchema>;

/** A held-out goal used to measure whether the corpus is getting better (guide §8). */
export const RehearsalGoalSchema = z.object({
  goalId: z.string(),
  goal: z.string().min(1),
  note: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.number().int(),
});
export type RehearsalGoal = z.infer<typeof RehearsalGoalSchema>;

/**
 * One rehearsal of one goal. `autoPass` only says the draft is dependency-consistent — which the
 * deterministic validator already guarantees — so a human verdict is what actually tracks quality.
 */
export const RehearsalResultSchema = z.object({
  resultId: z.string(),
  goalId: z.string(),
  compositionId: z.string(),
  unmetCount: z.number().int(),
  gapCount: z.number().int(),
  stepCount: z.number().int(),
  autoPass: z.boolean(),
  humanVerdict: z.enum(["unjudged", "good", "wrong"]).default("unjudged"),
  humanNote: z.string().optional(),
  ranBy: z.string(),
  ranAt: z.number().int(),
});
export type RehearsalResult = z.infer<typeof RehearsalResultSchema>;
