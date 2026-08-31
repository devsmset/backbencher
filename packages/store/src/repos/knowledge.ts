import {
  type AnalystGuide,
  AnalystGuideSchema,
  type CatalogAnnotation,
  CatalogAnnotationSchema,
  type CatalogReviewState,
  type Composition,
  CompositionSchema,
  type Exemplar,
  ExemplarSchema,
  type RehearsalGoal,
  RehearsalGoalSchema,
  type RehearsalResult,
  RehearsalResultSchema,
  type TestingAnnotation,
  TestingAnnotationSchema,
  catalogReviewStateFor,
} from "@backbencher/schemas";
import { eq } from "drizzle-orm";
import type { Db } from "../dbtypes.js";
import {
  analystGuides,
  catalogAnnotations,
  compositions,
  exemplars,
  rehearsalGoals,
  rehearsalResults,
  testingAnnotations,
} from "../schema.js";

// Human-knowledge repositories (write side). Portal mutations go through these ONLY, never
// touching derived tables.

export function catalogAnnotationsRepo(db: Db) {
  const get = (operationId: string): CatalogAnnotation | null => {
    const r = db.select().from(catalogAnnotations).where(eq(catalogAnnotations.operationId, operationId)).get();
    return r ? CatalogAnnotationSchema.parse(JSON.parse(r.payload)) : null;
  };
  const upsert = (annotation: CatalogAnnotation): CatalogAnnotation => {
    const input = CatalogAnnotationSchema.parse(annotation);
    // reviewState is never taken on trust: it is a function of the annotation body.
    const parsed: CatalogAnnotation = { ...input, reviewState: catalogReviewStateFor(input) };
    const payload = JSON.stringify(parsed);
    const cols = {
      operationId: parsed.operationId,
      payload,
      reviewState: parsed.reviewState,
      suggested: parsed.suggested ? 1 : 0,
      updatedBy: parsed.updatedBy,
      updatedAt: parsed.updatedAt,
    };
    db.insert(catalogAnnotations)
      .values(cols)
      .onConflictDoUpdate({ target: catalogAnnotations.operationId, set: cols })
      .run();
    return parsed;
  };
  return {
    get,
    upsert,
    list: (): CatalogAnnotation[] =>
      db.select().from(catalogAnnotations).all().map((r) => CatalogAnnotationSchema.parse(JSON.parse(r.payload))),
    /** Accept a machine suggestion as human-owned, which is what makes the Operation Ready. */
    accept: (operationId: string, updatedBy: string): CatalogAnnotation | null => {
      const existing = get(operationId);
      return existing ? upsert({ ...existing, suggested: false, updatedBy, updatedAt: Date.now() }) : null;
    },
    setReviewState: (operationId: string, reviewState: CatalogReviewState, updatedBy: string): CatalogAnnotation => {
      const existing = get(operationId);
      return upsert({
        ...(existing ?? { operationId, suggested: false }),
        reviewState,
        updatedBy,
        updatedAt: Date.now(),
      } as CatalogAnnotation);
    },
  };
}

export function testingAnnotationsRepo(db: Db) {
  return {
    get: (operationId: string): TestingAnnotation | null => {
      const r = db.select().from(testingAnnotations).where(eq(testingAnnotations.operationId, operationId)).get();
      return r ? TestingAnnotationSchema.parse(JSON.parse(r.payload)) : null;
    },
    list: (): TestingAnnotation[] =>
      db.select().from(testingAnnotations).all().map((r) => TestingAnnotationSchema.parse(JSON.parse(r.payload))),
    upsert: (annotation: TestingAnnotation): TestingAnnotation => {
      const parsed = TestingAnnotationSchema.parse(annotation);
      const cols = {
        operationId: parsed.operationId,
        payload: JSON.stringify(parsed),
        updatedBy: parsed.updatedBy,
        updatedAt: parsed.updatedAt,
      };
      db.insert(testingAnnotations)
        .values(cols)
        .onConflictDoUpdate({ target: testingAnnotations.operationId, set: cols })
        .run();
      return parsed;
    },
  };
}

export function exemplarsRepo(db: Db) {
  const toExemplar = (r: { payload: string }): Exemplar => ExemplarSchema.parse(JSON.parse(r.payload));
  return {
    get: (exemplarId: string): Exemplar | null => {
      const r = db.select().from(exemplars).where(eq(exemplars.exemplarId, exemplarId)).get();
      return r ? toExemplar(r) : null;
    },
    getBySession: (sessionId: string): Exemplar | null => {
      const r = db.select().from(exemplars).where(eq(exemplars.sessionId, sessionId)).get();
      return r ? toExemplar(r) : null;
    },
    list: (): Exemplar[] => db.select().from(exemplars).all().map(toExemplar),
    upsert: (exemplar: Exemplar): Exemplar => {
      const parsed = ExemplarSchema.parse(exemplar);
      const cols = {
        exemplarId: parsed.exemplarId,
        sessionId: parsed.sessionId,
        payload: JSON.stringify(parsed),
        updatedBy: parsed.updatedBy,
        updatedAt: parsed.updatedAt,
      };
      db.insert(exemplars).values(cols).onConflictDoUpdate({ target: exemplars.exemplarId, set: cols }).run();
      return parsed;
    },
    remove: (exemplarId: string): void => {
      db.delete(exemplars).where(eq(exemplars.exemplarId, exemplarId)).run();
    },
  };
}

export function compositionsRepo(db: Db) {
  const toComposition = (r: { payload: string }): Composition => CompositionSchema.parse(JSON.parse(r.payload));
  return {
    get: (compositionId: string): Composition | null => {
      const r = db.select().from(compositions).where(eq(compositions.compositionId, compositionId)).get();
      return r ? toComposition(r) : null;
    },
    list: (): Composition[] => db.select().from(compositions).all().map(toComposition),
    listByStatus: (status: Composition["status"]): Composition[] =>
      db.select().from(compositions).where(eq(compositions.status, status)).all().map(toComposition),
    upsert: (composition: Composition): Composition => {
      const parsed = CompositionSchema.parse(composition);
      const cols = {
        compositionId: parsed.compositionId,
        goal: parsed.goal,
        status: parsed.status,
        payload: JSON.stringify(parsed),
        createdAt: parsed.createdAt,
        updatedBy: parsed.updatedBy,
        updatedAt: parsed.updatedAt,
      };
      db.insert(compositions).values(cols).onConflictDoUpdate({ target: compositions.compositionId, set: cols }).run();
      return parsed;
    },
    remove: (compositionId: string): void => {
      db.delete(compositions).where(eq(compositions.compositionId, compositionId)).run();
    },
  };
}

export function rehearsalRepo(db: Db) {
  return {
    listGoals: (): RehearsalGoal[] =>
      db.select().from(rehearsalGoals).all().map((r) => RehearsalGoalSchema.parse(JSON.parse(r.payload))),
    upsertGoal: (goal: RehearsalGoal): RehearsalGoal => {
      const parsed = RehearsalGoalSchema.parse(goal);
      const cols = { goalId: parsed.goalId, payload: JSON.stringify(parsed), createdAt: parsed.createdAt };
      db.insert(rehearsalGoals).values(cols).onConflictDoUpdate({ target: rehearsalGoals.goalId, set: cols }).run();
      return parsed;
    },
    removeGoal: (goalId: string): void => {
      db.delete(rehearsalGoals).where(eq(rehearsalGoals.goalId, goalId)).run();
    },
    listResults: (): RehearsalResult[] =>
      db.select().from(rehearsalResults).all().map((r) => RehearsalResultSchema.parse(JSON.parse(r.payload))),
    upsertResult: (result: RehearsalResult): RehearsalResult => {
      const parsed = RehearsalResultSchema.parse(result);
      const cols = {
        resultId: parsed.resultId,
        goalId: parsed.goalId,
        payload: JSON.stringify(parsed),
        ranAt: parsed.ranAt,
      };
      db.insert(rehearsalResults)
        .values(cols)
        .onConflictDoUpdate({ target: rehearsalResults.resultId, set: cols })
        .run();
      return parsed;
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
