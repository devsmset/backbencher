import {
  type AnalystGuide,
  AnalystGuideSchema,
  type OperationAnnotation,
  OperationAnnotationSchema,
  type ReviewState,
  type Scenario,
  ScenarioSchema,
} from "@backbencher/schemas";
import { eq } from "drizzle-orm";
import type { Db } from "../dbtypes.js";
import { analystGuides, operationAnnotations, scenarios } from "../schema.js";

// Human-knowledge repositories (write side). Portal mutations go through these ONLY, never
// touching derived tables (architecture §6.1).

export function annotationsRepo(db: Db) {
  const get = (operationId: string): OperationAnnotation | null => {
    const r = db
      .select()
      .from(operationAnnotations)
      .where(eq(operationAnnotations.operationId, operationId))
      .get();
    return r ? OperationAnnotationSchema.parse(JSON.parse(r.payload)) : null;
  };
  const upsert = (annotation: OperationAnnotation): OperationAnnotation => {
    const parsed = OperationAnnotationSchema.parse(annotation);
    const payload = JSON.stringify(parsed);
    const cols = {
      operationId: parsed.operationId,
      payload,
      reviewState: parsed.reviewState,
      updatedBy: parsed.updatedBy,
      updatedAt: parsed.updatedAt,
    };
    db.insert(operationAnnotations)
      .values(cols)
      .onConflictDoUpdate({
        target: operationAnnotations.operationId,
        set: { payload, reviewState: parsed.reviewState, updatedBy: parsed.updatedBy, updatedAt: parsed.updatedAt },
      })
      .run();
    return parsed;
  };
  return {
    get,
    upsert,
    list: (): OperationAnnotation[] =>
      db.select().from(operationAnnotations).all().map((r) => OperationAnnotationSchema.parse(JSON.parse(r.payload))),
    setReviewState: (
      operationId: string,
      reviewState: ReviewState,
      updatedBy: string,
    ): OperationAnnotation => {
      const existing = get(operationId);
      const next: OperationAnnotation = existing
        ? { ...existing, reviewState, updatedBy, updatedAt: Date.now() }
        : { operationId, reviewState, tags: [], updatedBy, updatedAt: Date.now() };
      return upsert(next);
    },
  };
}

export function scenariosRepo(db: Db) {
  return {
    get: (scenarioId: string): Scenario | null => {
      const r = db.select().from(scenarios).where(eq(scenarios.scenarioId, scenarioId)).get();
      return r ? ScenarioSchema.parse(JSON.parse(r.payload)) : null;
    },
    list: (): Scenario[] =>
      db.select().from(scenarios).all().map((r) => ScenarioSchema.parse(JSON.parse(r.payload))),
    upsert: (scenario: Scenario): Scenario => {
      const parsed = ScenarioSchema.parse(scenario);
      const payload = JSON.stringify(parsed);
      db.insert(scenarios)
        .values({ scenarioId: parsed.scenarioId, payload, reviewState: parsed.reviewState, updatedBy: parsed.updatedBy, updatedAt: parsed.updatedAt })
        .onConflictDoUpdate({
          target: scenarios.scenarioId,
          set: { payload, reviewState: parsed.reviewState, updatedBy: parsed.updatedBy, updatedAt: parsed.updatedAt },
        })
        .run();
      return parsed;
    },
    remove: (scenarioId: string): void => {
      db.delete(scenarios).where(eq(scenarios.scenarioId, scenarioId)).run();
    },
  };
}

export function guidesRepo(db: Db) {
  return {
    get: (guideId: string): AnalystGuide | null => {
      const r = db.select().from(analystGuides).where(eq(analystGuides.guideId, guideId)).get();
      return r ? AnalystGuideSchema.parse(JSON.parse(r.payload)) : null;
    },
    list: (): AnalystGuide[] =>
      db.select().from(analystGuides).all().map((r) => AnalystGuideSchema.parse(JSON.parse(r.payload))),
    upsert: (guide: AnalystGuide): AnalystGuide => {
      const parsed = AnalystGuideSchema.parse(guide);
      const payload = JSON.stringify(parsed);
      db.insert(analystGuides)
        .values({ guideId: parsed.guideId, payload, updatedBy: parsed.updatedBy, updatedAt: parsed.updatedAt })
        .onConflictDoUpdate({
          target: analystGuides.guideId,
          set: { payload, updatedBy: parsed.updatedBy, updatedAt: parsed.updatedAt },
        })
        .run();
      return parsed;
    },
    remove: (guideId: string): void => {
      db.delete(analystGuides).where(eq(analystGuides.guideId, guideId)).run();
    },
  };
}
