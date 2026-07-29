import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const operationAnnotations = sqliteTable("operation_annotations", {
  operationId: text("operation_id").primaryKey(),
  payload: text("payload").notNull(),
  reviewState: text("review_state").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
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

export const scenarios = sqliteTable("scenarios", {
  scenarioId: text("scenario_id").primaryKey(),
  payload: text("payload").notNull(),
  reviewState: text("review_state").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
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
  scenarioId: text("scenario_id").notNull(),
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
