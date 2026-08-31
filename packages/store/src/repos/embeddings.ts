import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "../dbtypes.js";
import { embeddings } from "../schema.js";

export type EmbeddingKind = "operation" | "exemplar";

export interface EmbeddingRow {
  kind: EmbeddingKind;
  entityId: string;
  model: string;
  textHash: string;
  dim: number;
  vector: number[];
}

/** Identity of the text a vector was computed from — a changed annotation yields a changed hash. */
export function embeddingTextHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export function embeddingsRepo(db: Db) {
  const toRow = (r: typeof embeddings.$inferSelect): EmbeddingRow => ({
    kind: r.kind as EmbeddingKind,
    entityId: r.entityId,
    model: r.model,
    textHash: r.textHash,
    dim: r.dim,
    vector: JSON.parse(r.vector) as number[],
  });

  return {
    get(kind: EmbeddingKind, entityId: string): EmbeddingRow | null {
      const row = db
        .select()
        .from(embeddings)
        .where(and(eq(embeddings.kind, kind), eq(embeddings.entityId, entityId)))
        .get();
      return row ? toRow(row) : null;
    },
    listByKind: (kind: EmbeddingKind): EmbeddingRow[] =>
      db.select().from(embeddings).where(eq(embeddings.kind, kind)).all().map(toRow),
    upsert(row: Omit<EmbeddingRow, "dim">): void {
      const cols = {
        kind: row.kind,
        entityId: row.entityId,
        model: row.model,
        textHash: row.textHash,
        dim: row.vector.length,
        vector: JSON.stringify(row.vector),
        updatedAt: Date.now(),
      };
      db.insert(embeddings)
        .values(cols)
        .onConflictDoUpdate({
          target: [embeddings.kind, embeddings.entityId],
          set: { model: cols.model, textHash: cols.textHash, dim: cols.dim, vector: cols.vector, updatedAt: cols.updatedAt },
        })
        .run();
    },
    remove(kind: EmbeddingKind, entityId: string): void {
      db.delete(embeddings).where(and(eq(embeddings.kind, kind), eq(embeddings.entityId, entityId))).run();
    },
    clear(): void {
      db.delete(embeddings).run();
    },
  };
}
