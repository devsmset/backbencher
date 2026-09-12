import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Drizzle schema (architecture §6.1). JSON-typed columns hold Zod-validated payloads as TEXT.

export const sessions = sqliteTable("sessions", {
  sessionId: text("session_id").primaryKey(),
  name: text("name"),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  authProfile: text("auth_profile"),
  operator: text("operator"),
  meta: text("meta").notNull(),
});

export const operations = sqliteTable("operations", {
  operationId: text("operation_id").primaryKey(),
  method: text("method").notNull(),
  host: text("host").notNull(),
  template: text("template").notNull(),
  derived: text("derived").notNull(),
  lastDerivedAt: integer("last_derived_at").notNull(),
});

export const dataflowEdges = sqliteTable("dataflow_edges", {
  id: text("id").primaryKey(),
  producerOp: text("producer_op").notNull(),
  consumerOp: text("consumer_op").notNull(),
  payload: text("payload").notNull(),
  evidenceCount: integer("evidence_count").notNull(),
});

export const observedFlows = sqliteTable("observed_flows", {
  flowId: text("flow_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  payload: text("payload").notNull(),
});

export const analystGuides = sqliteTable("analyst_guides", {
  guideId: text("guide_id").primaryKey(),
  payload: text("payload").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const knowledgePacks = sqliteTable("knowledge_packs", {
  packId: text("pack_id").primaryKey(),
  builtAt: integer("built_at").notNull(),
  contentHash: text("content_hash").notNull(),
  path: text("path").notNull(),
});

export const testSpecs = sqliteTable("test_specs", {
  specId: text("spec_id").primaryKey(),
  compositionId: text("composition_id").notNull(),
  yaml: text("yaml").notNull(),
  generatedBy: text("generated_by"),
  model: text("model"),
  packId: text("pack_id"),
  createdAt: integer("created_at").notNull(),
  status: text("status").notNull(),
});

export const testRuns = sqliteTable("test_runs", {
  runId: text("run_id").primaryKey(),
  specId: text("spec_id").notNull(),
  env: text("env").notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  status: text("status").notNull(),
  report: text("report"),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  at: integer("at").notNull(),
  diff: text("diff"),
});

// Dependency derivation facts (realignment guide §5) — the one derived signal not representable
// as a producer/consumer edge: which request slots are client-generated (minted fresh, no
// producer to look for). Full-replace on each derivation run, same as operations/dataflow_edges.
export const dependencyFacts = sqliteTable("dependency_facts", {
  operationId: text("operation_id").primaryKey(),
  clientGenerated: text("client_generated").notNull(), // JSON string[] of request json paths
});

// The Analyst's curation of a Session: which Calls they deleted, and whether the Session teaches
// the composer. Human-owned — derivation full-replaces the derived tables and never touches this.
export const sessionCuration = sqliteTable("session_curation", {
  sessionId: text("session_id").primaryKey(),
  deletedCorrelationIds: text("deleted_correlation_ids").notNull(), // JSON string[]
  useAsReference: integer("use_as_reference").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessionCallEdges = sqliteTable(
  "session_call_edges",
  {
    sessionId: text("session_id").notNull(),
    seq: integer("seq").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.seq] }) }),
);

export const catalogAnnotations = sqliteTable("catalog_annotations", {
  operationId: text("operation_id").primaryKey(),
  payload: text("payload").notNull(),
  reviewState: text("review_state").notNull(),
  suggested: integer("suggested").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const testingAnnotations = sqliteTable("testing_annotations", {
  operationId: text("operation_id").primaryKey(),
  payload: text("payload").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const exemplars = sqliteTable("exemplars", {
  exemplarId: text("exemplar_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  payload: text("payload").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const compositions = sqliteTable("compositions", {
  compositionId: text("composition_id").primaryKey(),
  goal: text("goal").notNull(),
  status: text("status").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const rehearsalGoals = sqliteTable("rehearsal_goals", {
  goalId: text("goal_id").primaryKey(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const rehearsalResults = sqliteTable("rehearsal_results", {
  resultId: text("result_id").primaryKey(),
  goalId: text("goal_id").notNull(),
  payload: text("payload").notNull(),
  ranAt: integer("ran_at").notNull(),
});

// Retrieval vectors (ADR-0001). Brute-force cosine over a few thousand rows beats standing up a
// vector store. `model` + `textHash` are part of the identity, so changing the embedding model or
// editing an annotation misses the cache and re-embeds — no explicit invalidation hook needed.
export const embeddings = sqliteTable(
  "embeddings",
  {
    kind: text("kind").notNull(), // "operation" | "exemplar"
    entityId: text("entity_id").notNull(),
    model: text("model").notNull(),
    textHash: text("text_hash").notNull(),
    dim: integer("dim").notNull(),
    vector: text("vector").notNull(), // JSON number[]
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.kind, t.entityId] }) }),
);
