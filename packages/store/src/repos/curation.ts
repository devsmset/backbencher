import { type SessionCallEdge, SessionCallEdgeSchema } from "@backbencher/schemas";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../dbtypes.js";
import { sessionCallEdges, sessionCuration } from "../schema.js";

export interface SessionCurationRow {
  sessionId: string;
  deletedCorrelationIds: string[];
  useAsReference: boolean;
  /** Link keys (see @backbencher/derive linkKeys) the analyst switched off in this Session's graph. */
  excludedLinkKeys: string[];
  updatedBy: string;
  updatedAt: number;
}

export function sessionCurationRepo(db: Db) {
  const toRow = (r: typeof sessionCuration.$inferSelect): SessionCurationRow => ({
    sessionId: r.sessionId,
    deletedCorrelationIds: JSON.parse(r.deletedCorrelationIds) as string[],
    useAsReference: r.useAsReference === 1,
    excludedLinkKeys: JSON.parse(r.excludedLinkKeys) as string[],
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
  });

  function upsert(
    sessionId: string,
    patch: { deleted?: string[]; useAsReference?: boolean; excludedLinkKeys?: string[] },
    actor: string,
  ): void {
    const existing = db.select().from(sessionCuration).where(eq(sessionCuration.sessionId, sessionId)).get();
    const current = existing ? toRow(existing) : null;
    const deleted = patch.deleted ?? current?.deletedCorrelationIds ?? [];
    const useAsReference = patch.useAsReference ?? current?.useAsReference ?? false;
    const excludedLinkKeys = patch.excludedLinkKeys ?? current?.excludedLinkKeys ?? [];
    const values = {
      sessionId,
      deletedCorrelationIds: JSON.stringify([...new Set(deleted)].sort()),
      useAsReference: useAsReference ? 1 : 0,
      excludedLinkKeys: JSON.stringify([...new Set(excludedLinkKeys)].sort()),
      updatedBy: actor,
      updatedAt: Date.now(),
    };
    db.insert(sessionCuration)
      .values(values)
      .onConflictDoUpdate({ target: sessionCuration.sessionId, set: values })
      .run();
  }

  return {
    get: (sessionId: string): SessionCurationRow | null => {
      const r = db.select().from(sessionCuration).where(eq(sessionCuration.sessionId, sessionId)).get();
      return r ? toRow(r) : null;
    },
    list: (): SessionCurationRow[] => db.select().from(sessionCuration).all().map(toRow),
    /** sessionId -> deleted correlationIds, the shape runDerivation expects. */
    deletionMap: (): Map<string, Set<string>> =>
      new Map(
        db
          .select()
          .from(sessionCuration)
          .all()
          .map(toRow)
          .map((r) => [r.sessionId, new Set(r.deletedCorrelationIds)] as const),
      ),
    /** Deletions accumulate; an already-deleted id is a no-op. */
    setDeleted: (sessionId: string, correlationIds: string[], actor: string): void => {
      const existing = db.select().from(sessionCuration).where(eq(sessionCuration.sessionId, sessionId)).get();
      const merged = [...(existing ? toRow(existing).deletedCorrelationIds : []), ...correlationIds];
      upsert(sessionId, { deleted: merged }, actor);
    },
    setUseAsReference: (sessionId: string, on: boolean, actor: string): void => {
      upsert(sessionId, { useAsReference: on }, actor);
    },
    /** Replaces the Session's excluded link keys; the graph and deleteCalls ignore links with them. */
    setExcludedLinkKeys: (sessionId: string, keys: string[], actor: string): void => {
      upsert(sessionId, { excludedLinkKeys: keys }, actor);
    },
  };
}

export function sessionGraphsRepo(db: Db) {
  return {
    listBySession: (sessionId: string): SessionCallEdge[] =>
      db
        .select()
        .from(sessionCallEdges)
        .where(eq(sessionCallEdges.sessionId, sessionId))
        .orderBy(asc(sessionCallEdges.seq))
        .all()
        .map((r) => SessionCallEdgeSchema.parse(JSON.parse(r.payload))),
    replaceForSession: (sessionId: string, edges: SessionCallEdge[]): void => {
      db.delete(sessionCallEdges).where(eq(sessionCallEdges.sessionId, sessionId)).run();
      edges.forEach((e, seq) => {
        db.insert(sessionCallEdges).values({ sessionId, seq, payload: JSON.stringify(e) }).run();
      });
    },
  };
}