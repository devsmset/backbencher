import { type RecordingMeta, RecordingMetaSchema } from "@backbencher/schemas";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../dbtypes.js";
import { auditLog, knowledgePacks, sessions, testRuns, testSpecs } from "../schema.js";

export interface SessionRow {
  sessionId: string;
  name: string | null;
  startedAt: number;
  endedAt: number | null;
  authProfile: string | null;
  operator: string | null;
  meta: RecordingMeta;
}

export function sessionsRepo(db: Db) {
  const toRow = (r: typeof sessions.$inferSelect): SessionRow => ({
    sessionId: r.sessionId,
    name: r.name,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    authProfile: r.authProfile,
    operator: r.operator,
    meta: RecordingMetaSchema.parse(JSON.parse(r.meta)),
  });
  return {
    upsertFromMeta(meta: RecordingMeta): void {
      const cols = {
        sessionId: meta.sessionId,
        name: meta.sessionName ?? null,
        startedAt: meta.startedAt,
        endedAt: meta.endedAt ?? null,
        authProfile: meta.authProfile ?? null,
        operator: meta.operator ?? null,
        meta: JSON.stringify(meta),
      };
      db.insert(sessions)
        .values(cols)
        .onConflictDoUpdate({
          target: sessions.sessionId,
          set: { name: cols.name, endedAt: cols.endedAt, authProfile: cols.authProfile, operator: cols.operator, meta: cols.meta },
        })
        .run();
    },
    list: (): SessionRow[] => db.select().from(sessions).orderBy(desc(sessions.startedAt)).all().map(toRow),
    get: (sessionId: string): SessionRow | null => {
      const r = db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).get();
      return r ? toRow(r) : null;
    },
  };
}

export interface PackRecord {
  packId: string;
  builtAt: number;
  contentHash: string;
  path: string;
}

export function packsRepo(db: Db) {
  return {
    insert: (rec: PackRecord): void => {
      db.insert(knowledgePacks)
        .values(rec)
        .onConflictDoUpdate({ target: knowledgePacks.packId, set: { builtAt: rec.builtAt, contentHash: rec.contentHash, path: rec.path } })
        .run();
    },
    list: (): PackRecord[] => db.select().from(knowledgePacks).orderBy(desc(knowledgePacks.builtAt)).all(),
    get: (packId: string): PackRecord | null =>
      db.select().from(knowledgePacks).where(eq(knowledgePacks.packId, packId)).get() ?? null,
  };
}

export type SpecRow = typeof testSpecs.$inferSelect;

export function specsRepo(db: Db) {
  return {
    upsert: (row: SpecRow): void => {
      db.insert(testSpecs)
        .values(row)
        .onConflictDoUpdate({
          target: testSpecs.specId,
          set: { yaml: row.yaml, status: row.status, model: row.model, packId: row.packId, generatedBy: row.generatedBy },
        })
        .run();
    },
    get: (specId: string): SpecRow | null =>
      db.select().from(testSpecs).where(eq(testSpecs.specId, specId)).get() ?? null,
    list: (): SpecRow[] => db.select().from(testSpecs).orderBy(desc(testSpecs.createdAt)).all(),
    setStatus: (specId: string, status: string): void => {
      db.update(testSpecs).set({ status }).where(eq(testSpecs.specId, specId)).run();
    },
    updateYaml: (specId: string, yaml: string): void => {
      db.update(testSpecs).set({ yaml }).where(eq(testSpecs.specId, specId)).run();
    },
  };
}

export type RunRow = typeof testRuns.$inferSelect;

export function runsRepo(db: Db) {
  return {
    insert: (row: RunRow): void => {
      db.insert(testRuns).values(row).run();
    },
    get: (runId: string): RunRow | null =>
      db.select().from(testRuns).where(eq(testRuns.runId, runId)).get() ?? null,
    listBySpec: (specId: string): RunRow[] =>
      db.select().from(testRuns).where(eq(testRuns.specId, specId)).orderBy(desc(testRuns.startedAt)).all(),
    finish: (runId: string, status: string, report: unknown): void => {
      db.update(testRuns)
        .set({ status, finishedAt: Date.now(), report: JSON.stringify(report) })
        .where(eq(testRuns.runId, runId))
        .run();
    },
  };
}

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  diff?: unknown;
}

export function auditRepo(db: Db) {
  return {
    append: (entry: AuditEntry): void => {
      db.insert(auditLog)
        .values({
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          actor: entry.actor,
          at: Date.now(),
          diff: entry.diff === undefined ? null : JSON.stringify(entry.diff),
        })
        .run();
    },
    list: (entityType?: string, entityId?: string): (typeof auditLog.$inferSelect)[] => {
      const where =
        entityType && entityId
          ? and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId))
          : entityType
            ? eq(auditLog.entityType, entityType)
            : undefined;
      const base = db.select().from(auditLog);
      return (where ? base.where(where) : base).orderBy(desc(auditLog.at)).all();
    },
  };
}
