import type Database from "better-sqlite3";

// Embedded, ordered migrations (architecture §6.1). Applied idempotently and tracked in
// _migrations. Kept as embedded SQL so the compiled dist is self-contained (no file copying).

export const MIGRATIONS: ReadonlyArray<{ id: string; sql: string }> = [
  {
    id: "0000_init",
    sql: `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  name TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  auth_profile TEXT,
  operator TEXT,
  meta TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS operations (
  operation_id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  host TEXT NOT NULL,
  template TEXT NOT NULL,
  derived TEXT NOT NULL,
  last_derived_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS operation_annotations (
  operation_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  review_state TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dataflow_edges (
  id TEXT PRIMARY KEY,
  producer_op TEXT NOT NULL,
  consumer_op TEXT NOT NULL,
  payload TEXT NOT NULL,
  evidence_count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dataflow_producer ON dataflow_edges (producer_op);
CREATE INDEX IF NOT EXISTS idx_dataflow_consumer ON dataflow_edges (consumer_op);
CREATE TABLE IF NOT EXISTS observed_flows (
  flow_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flows_session ON observed_flows (session_id);
CREATE TABLE IF NOT EXISTS scenarios (
  scenario_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  review_state TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS analyst_guides (
  guide_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_packs (
  pack_id TEXT PRIMARY KEY,
  built_at INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  path TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_specs (
  spec_id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  yaml TEXT NOT NULL,
  generated_by TEXT,
  model TEXT,
  pack_id TEXT,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
  run_id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  env TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,
  report TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  at INTEGER NOT NULL,
  diff TEXT
);
`,
  },
  {
    id: "0001_dependency_facts",
    sql: `
CREATE TABLE IF NOT EXISTS dependency_facts (
  operation_id TEXT PRIMARY KEY,
  client_generated TEXT NOT NULL
);
`,
  },
];

export function runMigrations(raw: Database.Database): void {
  raw.exec("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = new Set(
    (raw.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id),
  );
  const insert = raw.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)");
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const tx = raw.transaction(() => {
      raw.exec(m.sql);
      insert.run(m.id, Date.now());
    });
    tx();
  }
}
