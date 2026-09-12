import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AnalystGuideSchema,
  CatalogReviewState,
  ExemplarSchema,
  KnowledgePackSchema,
  SideEffect,
  TestDecisionSchema,
  isOperationReady,
} from "@backbencher/schemas";
import { dataDir, newId } from "@backbencher/shared";
import { mergeOperation } from "@backbencher/store";
import {
  buildSessionCallGraph,
  extractObservedFlow,
  loadCuratedOrRawSession,
  loadSession,
  pairCalls,
  templatizePaths,
  writeCuratedEvents,
} from "@backbencher/derive";
import { type RecorderHandle, startRecording } from "@backbencher/recorder";
import {
  buildKnowledgePack,
  computeDependencyGraph,
  createEmbedder,
  createLlm,
  draftExemplarFromSession,
  generateTestSpec,
  latestResults,
  packDiff,
  proposeScenario,
  runRehearsal,
  summarize,
  suggestAnnotations,
} from "@backbencher/agent";
import { loadSpecYaml, runSpecAgainstEnv, generateAuthzMatrix, generateBolaProbes, specToYaml } from "@backbencher/testkit";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertDeletable } from "./curation.js";
import { derivationState, runDerivationJob } from "./derivationJob.js";
import { publicProcedure, router } from "./trpc.js";

// tRPC routers (architecture §6.2). Derived reads are merged with annotations (§6.4); every
// mutation appends to the audit log.

// In-memory registry of in-progress recordings, keyed by sessionId. A recording is a live
// headed browser + Playwright listeners running in this server process (mirrors `bb record`).
const activeRecordings = new Map<string, RecorderHandle>();

const ASSET_PATH_RE = /\.(?:svg|woff2?|ttf|otf|eot|ico|png|jpe?g|gif|webp|avif)(?:$|[?#])/i;
const DROPPED_CONTENT_PREFIXES = ["image/", "font/", "text/css", "text/javascript"];

// Mirrors the frontend's isAssetLikeCall (Sessions.tsx) but for a PairedCall, not the raw
// ndjson-derived row — kept separate since the two shapes differ.
function isAssetLikeCall(c: { pathname: string; requestContentType: string | undefined; responseContentType: string | undefined }): boolean {
  const contentType = (c.responseContentType ?? c.requestContentType ?? "").toLowerCase();
  if (DROPPED_CONTENT_PREFIXES.some((prefix) => contentType.startsWith(prefix))) return true;
  return ASSET_PATH_RE.test(c.pathname);
}

function buildCuratedSessionArtifacts(
  sessionId: string,
  calls: ReturnType<typeof pairCalls>,
  catalogOperations: Array<{
    operationId: string;
    method: string;
    host: string;
    pathTemplate: {
      template: string;
      params: Array<{ name: string; position: number; kind: "uuid" | "numeric" | "slug" | "opaque"; observedValues: string[] }>;
    };
  }>,
) {
  const { operations, callOp: derivedCallOp } = templatizePaths(calls);
  const catalogOpIds = new Map(
    catalogOperations.map((op) => [`${op.method}\u0000${op.host}\u0000${op.pathTemplate.template}`, op.operationId] as const),
  );
  const normalizedOpIds = new Map(
    [...operations.values()].map((op) => [
      op.operationId,
      catalogOpIds.get(`${op.method}\u0000${op.host}\u0000${op.template}`) ?? op.operationId,
    ] as const),
  );
  const callOp = new Map(
    [...derivedCallOp.entries()].flatMap(([call, derivedOpId]) => {
      const operationId = normalizedOpIds.get(derivedOpId);
      return operationId ? [[call, operationId] as const] : [];
    }),
  );
  const opAccums = new Map<string, (typeof operations extends Map<any, infer V> ? V : never)>();
  for (const op of operations.values()) {
    const operationId = normalizedOpIds.get(op.operationId) ?? op.operationId;
    if (!opAccums.has(operationId)) opAccums.set(operationId, { ...op, operationId, calls: [] });
  }
  return {
    flow: extractObservedFlow(sessionId, calls, callOp),
    edges: buildSessionCallGraph(calls, callOp, opAccums),
  };
}

const sessionsRouter = router({
  list: publicProcedure.query(({ ctx }) => ctx.store.sessions.list()),
  get: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => ctx.store.sessions.get(input.sessionId)),
  timeline: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => {
      const dir = join(dataDir(), "sessions", input.sessionId);
      if (!existsSync(dir)) {
        return { meta: ctx.store.sessions.get(input.sessionId)?.meta ?? null, events: [] };
      }
      const session = loadCuratedOrRawSession(dir);
      return { meta: session.meta, events: session.events };
    }),
  graph: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => {
      const dir = join(dataDir(), "sessions", input.sessionId);
      const flows = ctx.store.flows.listBySession(input.sessionId);
      if (!existsSync(dir) || flows.length === 0) return { nodes: [], edges: [], derived: false };

      const opByCorrelation = new Map(
        flows.flatMap((f) => f.steps.map((s) => [s.correlationId, s.operationId] as const)),
      );
      const nodes = pairCalls(loadCuratedOrRawSession(dir))
        .filter((c) => !isAssetLikeCall(c))
        .map((c) => ({
          correlationId: c.correlationId,
          operationId: opByCorrelation.get(c.correlationId) ?? null,
          method: c.method,
          host: c.host,
          pathname: c.pathname,
          status: c.status,
          requestTimestamp: c.requestTimestamp,
          responseTimestamp: c.responseTimestamp,
          requestHeaders: c.requestHeaders,
          requestBody: c.requestBody,
          responseHeaders: c.responseHeaders,
          responseBody: c.responseBody,
          responseBodyKind: c.responseBodyKind,
        }));

      const visibleNodeIds = new Set(nodes.map((node) => node.correlationId));
      const edges = ctx.store.sessionGraphs
        .listBySession(input.sessionId)
        .filter(
          (edge) =>
            visibleNodeIds.has(edge.producerCorrelationId) && visibleNodeIds.has(edge.consumerCorrelationId),
        );

      return { nodes, edges, derived: true };
    }),
  curation: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => {
      const dir = join(dataDir(), "sessions", input.sessionId);
      const row = ctx.store.sessionCuration.get(input.sessionId);
      const deletedCorrelationIds = row?.deletedCorrelationIds ?? [];
      if (!existsSync(dir)) {
        return { useAsReference: row?.useAsReference ?? false, deletedCorrelationIds, rawCallCount: 0, curatedCallCount: 0 };
      }
      return {
        useAsReference: row?.useAsReference ?? false,
        deletedCorrelationIds,
        rawCallCount: pairCalls(loadSession(dir)).length,
        curatedCallCount: pairCalls(loadCuratedOrRawSession(dir)).length,
      };
    }),
  deleteCalls: publicProcedure
    .input(z.object({ sessionId: z.string(), correlationIds: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      if (derivationState().status === "running") {
        throw new TRPCError({ code: "CONFLICT", message: "a derivation is running — try again in a moment" });
      }
      const dir = join(dataDir(), "sessions", input.sessionId);
      if (!existsSync(dir)) throw new TRPCError({ code: "NOT_FOUND", message: "no such session" });
      const requestedIds = [...new Set(input.correlationIds)];
      const existingDeleted = new Set(ctx.store.sessionCuration.get(input.sessionId)?.deletedCorrelationIds ?? []);
      const newlyDeleted = requestedIds.filter((id) => !existingDeleted.has(id));
      if (newlyDeleted.length === 0) return { deleted: 0 };

      const raw = loadSession(dir);
      const known = new Set(raw.events.map((e) => e.correlationId));
      const unknown = requestedIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `unknown correlationIds: ${unknown.join(", ")}` });
      }

      assertDeletable(ctx.store.sessionGraphs.listBySession(input.sessionId), newlyDeleted);

      // Everything already absent from the curated file stays absent: that set is the auto-filtered
      // Redundant Calls, which only a full re-derivation may recompute.
      const existingCuratedCalls = pairCalls(loadCuratedOrRawSession(dir));
      const excluded = new Set(raw.events.map((e) => e.correlationId));
      for (const c of existingCuratedCalls) excluded.delete(c.correlationId);
      for (const id of existingDeleted) excluded.add(id);
      for (const id of newlyDeleted) excluded.add(id);
      writeCuratedEvents(dir, raw, excluded);

      const curatedCalls = pairCalls(raw).filter((call) => !excluded.has(call.correlationId));
      const artifacts = buildCuratedSessionArtifacts(input.sessionId, curatedCalls, ctx.store.operations.list());

      ctx.store.sessionCuration.setDeleted(input.sessionId, newlyDeleted, ctx.actor);
      ctx.store.flows.replaceForSession(input.sessionId, artifacts.flow);
      ctx.store.sessionGraphs.replaceForSession(input.sessionId, artifacts.edges);

      ctx.store.audit.append({
        entityType: "session",
        entityId: input.sessionId,
        action: "curate.delete",
        actor: ctx.actor,
        diff: { correlationIds: newlyDeleted },
      });
      return { deleted: newlyDeleted.length };
    }),
  setUseAsReference: publicProcedure
    .input(z.object({ sessionId: z.string(), useAsReference: z.boolean() }))
    .mutation(({ ctx, input }) => {
      ctx.store.sessionCuration.setUseAsReference(input.sessionId, input.useAsReference, ctx.actor);
      ctx.store.audit.append({
        entityType: "session",
        entityId: input.sessionId,
        action: "curate.reference",
        actor: ctx.actor,
        diff: { useAsReference: input.useAsReference },
      });
      return { ok: true as const };
    }),
  activeRecordings: publicProcedure.query(() => [...activeRecordings.keys()]),
  startRecording: publicProcedure
    .input(z.object({ url: z.string(), authProfile: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const handle = await startRecording({
        url: input.url,
        config: ctx.config,
        headless: false,
        ...(input.authProfile ? { authProfile: input.authProfile } : {}),
      });
      activeRecordings.set(handle.sessionId, handle);
      ctx.store.audit.append({ entityType: "session", entityId: handle.sessionId, action: "record.start", actor: ctx.actor });
      return { sessionId: handle.sessionId };
    }),
  stopRecording: publicProcedure
    .input(z.object({ sessionId: z.string(), name: z.string().trim().min(1), goal: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const handle = activeRecordings.get(input.sessionId);
      if (!handle) throw new TRPCError({ code: "NOT_FOUND", message: "no active recording with that sessionId" });
      activeRecordings.delete(input.sessionId);
      const result = await handle.stop({ name: input.name, goal: input.goal });
      ctx.store.audit.append({ entityType: "session", entityId: input.sessionId, action: "record.stop", actor: ctx.actor, diff: { totalEvents: result.summary.totalEvents } });
      runDerivationJob(ctx.store, ctx.actor);
      return { sessionId: result.sessionId, sessionDir: result.sessionDir, summary: result.summary, derivation: "running" as const };
    }),
  discardRecording: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const handle = activeRecordings.get(input.sessionId);
      if (!handle) throw new TRPCError({ code: "NOT_FOUND", message: "no active recording with that sessionId" });
      activeRecordings.delete(input.sessionId);
      await handle.discard();
      ctx.store.audit.append({ entityType: "session", entityId: input.sessionId, action: "record.discard", actor: ctx.actor });
      return { ok: true };
    }),
});

const deriveRouter = router({
  status: publicProcedure.query(() => derivationState()),
});

const AnnotatePatch = z.object({
  operationId: z.string(),
  name: z.string().optional(),
  does: z.string().optional(),
  productArea: z.string().optional(),
  sideEffect: SideEffect.optional(),
});

const TestingAnnotatePatch = z.object({
  operationId: z.string(),
  paramDocs: z.record(z.string()).optional(),
  testingGuidance: z.string().optional(),
  tags: z.array(z.string()).optional(),
  correctionOverrides: z
    .object({
      pathTemplate: z.string().optional(),
      requiredQueryParams: z.array(z.string()).optional(),
      ignoreFields: z.array(z.string()).optional(),
    })
    .optional(),
});

const operationsRouter = router({
  list: publicProcedure
    .input(z.object({ q: z.string().optional(), reviewState: CatalogReviewState.optional(), area: z.string().optional() }).optional())
    .query(({ ctx, input }) => {
      const annotations = new Map(ctx.store.annotations.list().map((a) => [a.operationId, a]));
      let ops = ctx.store.operations
        .list(input?.q)
        .map((o) => mergeOperation(o, annotations.get(o.operationId) ?? null));
      if (input?.reviewState) ops = ops.filter((o) => o.reviewState === input.reviewState);
      if (input?.area) ops = ops.filter((o) => o.productArea === input.area);
      return ops;
    }),
  get: publicProcedure
    .input(z.object({ operationId: z.string() }))
    .query(({ ctx, input }) => {
      const derived = ctx.store.operations.get(input.operationId);
      if (!derived) return null;
      return {
        operation: mergeOperation(
          derived,
          ctx.store.annotations.get(input.operationId),
          ctx.store.testingAnnotations.get(input.operationId),
        ),
        dataflow: ctx.store.dataflow.forOperation(input.operationId),
      };
    }),
  annotate: publicProcedure.input(AnnotatePatch).mutation(({ ctx, input }) => {
    const existing = ctx.store.annotations.get(input.operationId);
    const { operationId, ...patch } = input;
    const saved = ctx.store.annotations.upsert({
      ...(existing ?? { operationId, suggested: false, reviewState: "unannotated" as const }),
      ...patch,
      operationId,
      suggested: false, // a human touching the annotation is what un-suggests it
      updatedBy: ctx.actor,
      updatedAt: Date.now(),
    });
    ctx.store.audit.append({ entityType: "operation", entityId: operationId, action: "annotate", actor: ctx.actor, diff: patch });
    return saved;
  }),
  annotateTesting: publicProcedure.input(TestingAnnotatePatch).mutation(({ ctx, input }) => {
    const existing = ctx.store.testingAnnotations.get(input.operationId);
    const { operationId, ...patch } = input;
    const saved = ctx.store.testingAnnotations.upsert({
      ...(existing ?? { operationId, tags: [] }),
      ...patch,
      operationId,
      tags: patch.tags ?? existing?.tags ?? [],
      updatedBy: ctx.actor,
      updatedAt: Date.now(),
    });
    ctx.store.audit.append({ entityType: "operation", entityId: operationId, action: "annotateTesting", actor: ctx.actor, diff: patch });
    return saved;
  }),
  setReviewState: publicProcedure
    .input(z.object({ operationId: z.string(), reviewState: CatalogReviewState }))
    .mutation(({ ctx, input }) => {
      const saved = ctx.store.annotations.setReviewState(input.operationId, input.reviewState, ctx.actor);
      ctx.store.audit.append({ entityType: "operation", entityId: input.operationId, action: "setReviewState", actor: ctx.actor, diff: { reviewState: input.reviewState } });
      return saved;
    }),
  merge: publicProcedure
    .input(z.object({ operationIds: z.array(z.string()).min(1), targetTemplate: z.string() }))
    .mutation(({ ctx, input }) => {
      for (const id of input.operationIds) {
        const existing = ctx.store.testingAnnotations.get(id) ?? {
          operationId: id,
          tags: [],
          updatedBy: ctx.actor,
          updatedAt: Date.now(),
        };
        ctx.store.testingAnnotations.upsert({
          ...existing,
          correctionOverrides: { ...(existing.correctionOverrides ?? {}), pathTemplate: input.targetTemplate },
          updatedBy: ctx.actor,
          updatedAt: Date.now(),
        });
      }
      ctx.store.audit.append({ entityType: "operation", entityId: input.operationIds.join(","), action: "merge", actor: ctx.actor, diff: input });
      return { merged: input.operationIds.length, targetTemplate: input.targetTemplate };
    }),
});

const flowsRouter = router({
  listBySession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => ctx.store.flows.listBySession(input.sessionId)),
  get: publicProcedure
    .input(z.object({ flowId: z.string() }))
    .query(({ ctx, input }) => ctx.store.flows.get(input.flowId)),
});

const exemplarsRouter = router({
  list: publicProcedure.query(({ ctx }) => ctx.store.exemplars.list()),
  get: publicProcedure
    .input(z.object({ exemplarId: z.string() }))
    .query(({ ctx, input }) => ctx.store.exemplars.get(input.exemplarId)),
  getBySession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => ctx.store.exemplars.getBySession(input.sessionId)),
  /** Draft an Exemplar from a recorded session; not persisted until the analyst upserts it. */
  fromSession: publicProcedure
    .input(z.object({ sessionId: z.string(), model: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      let llm: ReturnType<typeof createLlm> | undefined;
      try {
        llm = createLlm(ctx.config, "stepIntents", input.model);
      } catch {
        llm = undefined; // no model configured -> draft with empty intents for the analyst to fill in
      }
      return draftExemplarFromSession(ctx.store, input.sessionId, { ...(llm ? { llm } : {}), actor: ctx.actor });
    }),
  upsert: publicProcedure.input(ExemplarSchema).mutation(({ ctx, input }) => {
    const exemplarId = input.exemplarId || newId();
    const saved = ctx.store.exemplars.upsert({ ...input, exemplarId, updatedBy: ctx.actor, updatedAt: Date.now() });
    ctx.store.audit.append({ entityType: "exemplar", entityId: exemplarId, action: "upsert", actor: ctx.actor });
    return saved;
  }),
  remove: publicProcedure.input(z.object({ exemplarId: z.string() })).mutation(({ ctx, input }) => {
    ctx.store.exemplars.remove(input.exemplarId);
    ctx.store.audit.append({ entityType: "exemplar", entityId: input.exemplarId, action: "remove", actor: ctx.actor });
    return { ok: true };
  }),
});

const suggestRouter = router({
  run: publicProcedure
    .input(z.object({ model: z.string().optional(), force: z.boolean().optional(), batchSize: z.number().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      let llm: ReturnType<typeof createLlm>;
      try {
        llm = createLlm(ctx.config, "suggestAnnotation", input?.model);
      } catch (e) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
      }
      const result = await suggestAnnotations(ctx.store, {
        llm,
        actor: ctx.actor,
        ...(input?.force !== undefined ? { force: input.force } : {}),
        ...(input?.batchSize !== undefined ? { batchSize: input.batchSize } : {}),
      });
      ctx.store.audit.append({
        entityType: "operation",
        entityId: "bulk",
        action: "suggest",
        actor: ctx.actor,
        diff: { considered: result.considered, suggested: result.suggested },
      });
      return { considered: result.considered, suggested: result.suggested };
    }),
  accept: publicProcedure.input(z.object({ operationId: z.string() })).mutation(({ ctx, input }) => {
    const saved = ctx.store.annotations.accept(input.operationId, ctx.actor);
    if (!saved) throw new TRPCError({ code: "NOT_FOUND", message: "no annotation to accept" });
    ctx.store.audit.append({ entityType: "operation", entityId: input.operationId, action: "acceptSuggestion", actor: ctx.actor });
    return saved;
  }),
});

const guidesRouter = router({
  list: publicProcedure.query(({ ctx }) => ctx.store.guides.list()),
  get: publicProcedure.input(z.object({ guideId: z.string() })).query(({ ctx, input }) => ctx.store.guides.get(input.guideId)),
  upsert: publicProcedure.input(AnalystGuideSchema).mutation(({ ctx, input }) => {
    const guideId = input.guideId || newId();
    const saved = ctx.store.guides.upsert({ ...input, guideId, updatedBy: ctx.actor, updatedAt: Date.now() });
    ctx.store.audit.append({ entityType: "guide", entityId: guideId, action: "upsert", actor: ctx.actor });
    return saved;
  }),
  remove: publicProcedure.input(z.object({ guideId: z.string() })).mutation(({ ctx, input }) => {
    ctx.store.guides.remove(input.guideId);
    ctx.store.audit.append({ entityType: "guide", entityId: input.guideId, action: "remove", actor: ctx.actor });
    return { ok: true };
  }),
});

const dataflowRouter = router({
  forOperation: publicProcedure
    .input(z.object({ operationId: z.string() }))
    .query(({ ctx, input }) => ctx.store.dataflow.forOperation(input.operationId)),
});

// Read-only dependency graph (realignment guide §5) — rolled up from dataflow edges, never
// hand-edited. Powers the endpoint-detail dependency panel and (Phase 5) the composer's
// validator.
const dependenciesRouter = router({
  forOperation: publicProcedure
    .input(z.object({ operationId: z.string() }))
    .query(({ ctx, input }) => computeDependencyGraph(ctx.store).byOperation.get(input.operationId) ?? null),
  all: publicProcedure.query(({ ctx }) => {
    const graph = computeDependencyGraph(ctx.store);
    return { catalogEdges: graph.catalogEdges, operations: [...graph.byOperation.values()] };
  }),
});

// Free-text scenario composition (realignment guide §6). `propose` runs retrieval + dependency
// closure + LLM select/order + deterministic validation and persists a draft Composition (status:
// "draft"). A human must `approve` (supplying the testDecision — ADR-0002 only sets it at
// approval) or `reject` before it flows into the unchanged agent.generateTestSpec / testkit
// pipeline.
const composeRouter = router({
  propose: publicProcedure
    .input(z.object({ goal: z.string().min(1), model: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      let llm: ReturnType<typeof createLlm>;
      let embedder: ReturnType<typeof createEmbedder>;
      try {
        llm = createLlm(ctx.config, "compose", input.model);
        embedder = createEmbedder(ctx.config);
      } catch (e) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
      }
      const result = await proposeScenario(ctx.store, input.goal, {
        llm,
        actor: ctx.actor,
        retrieve: { embedder },
        ...(input.model ? { model: input.model } : {}),
      });
      ctx.store.audit.append({
        entityType: "composition",
        entityId: result.composition.compositionId,
        action: "compose.propose",
        actor: ctx.actor,
        diff: { goal: input.goal, attempts: result.attempts },
      });
      return { composition: result.composition, attempts: result.attempts };
    }),
  drafts: publicProcedure.query(({ ctx }) => ctx.store.compositions.listByStatus("draft")),
  approve: publicProcedure
    .input(
      z.object({
        compositionId: z.string(),
        steps: z.array(z.object({ operationId: z.string(), intent: z.string() })).optional(),
        testDecision: TestDecisionSchema,
      }),
    )
    .mutation(({ ctx, input }) => {
      const existing = ctx.store.compositions.get(input.compositionId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "composition not found" });
      const steps = input.steps
        ? input.steps.map((s) => ({ ...s, satisfies: [], autoAdded: false, fromSessionIds: [] }))
        : existing.steps;
      const saved = ctx.store.compositions.upsert({
        ...existing,
        steps,
        status: "approved",
        testDecision: input.testDecision,
        updatedBy: ctx.actor,
        updatedAt: Date.now(),
      });
      ctx.store.audit.append({ entityType: "composition", entityId: input.compositionId, action: "compose.approve", actor: ctx.actor });
      return saved;
    }),
  reject: publicProcedure.input(z.object({ compositionId: z.string() })).mutation(({ ctx, input }) => {
    const existing = ctx.store.compositions.get(input.compositionId);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "composition not found" });
    const saved = ctx.store.compositions.upsert({
      ...existing,
      status: "rejected",
      updatedBy: ctx.actor,
      updatedAt: Date.now(),
    });
    ctx.store.audit.append({ entityType: "composition", entityId: input.compositionId, action: "compose.reject", actor: ctx.actor });
    return saved;
  }),
});

const packRouter = router({
  build: publicProcedure.mutation(({ ctx }) => {
    const result = buildKnowledgePack(ctx.store, { environments: ctx.config.environments });
    ctx.store.audit.append({ entityType: "pack", entityId: result.pack.contentHash, action: "build", actor: ctx.actor });
    return { contentHash: result.pack.contentHash, path: result.packJsonPath, operations: result.pack.catalog.length };
  }),
  list: publicProcedure.query(({ ctx }) => ctx.store.packs.list()),
  diff: publicProcedure.input(z.object({ a: z.string(), b: z.string() })).query(({ ctx, input }) => {
    const load = (hash: string) => {
      const rec = ctx.store.packs.get(hash);
      if (!rec || !existsSync(rec.path)) return null;
      return KnowledgePackSchema.parse(JSON.parse(readFileSync(rec.path, "utf8")));
    };
    const a = load(input.a);
    const b = load(input.b);
    return a && b ? packDiff(a, b) : null;
  }),
});

const specsRouter = router({
  get: publicProcedure.input(z.object({ specId: z.string() })).query(({ ctx, input }) => ctx.store.specs.get(input.specId)),
  list: publicProcedure.query(({ ctx }) => ctx.store.specs.list()),
  updateYaml: publicProcedure.input(z.object({ specId: z.string(), yaml: z.string() })).mutation(({ ctx, input }) => {
    ctx.store.specs.updateYaml(input.specId, input.yaml);
    ctx.store.audit.append({ entityType: "spec", entityId: input.specId, action: "updateYaml", actor: ctx.actor });
    return { ok: true };
  }),
  approve: publicProcedure.input(z.object({ specId: z.string() })).mutation(({ ctx, input }) => {
    ctx.store.specs.setStatus(input.specId, "approved");
    ctx.store.audit.append({ entityType: "spec", entityId: input.specId, action: "approve", actor: ctx.actor });
    return { ok: true };
  }),
});

const agentRouter = router({
  generate: publicProcedure
    .input(z.object({ compositionId: z.string(), model: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      let llm: ReturnType<typeof createLlm>;
      try {
        llm = createLlm(ctx.config, "generateSpec", input.model);
      } catch (e) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
      }
      const res = await generateTestSpec(ctx.store, input.compositionId, { llm, ...(input.model ? { model: input.model } : {}) });
      ctx.store.audit.append({ entityType: "composition", entityId: input.compositionId, action: "agent.generate", actor: ctx.actor });
      return { specId: res.specId, valid: res.valid, errors: res.errors, attempts: res.attempts };
    }),
});

const runsRouter = router({
  start: publicProcedure
    .input(z.object({ specId: z.string(), env: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = ctx.store.specs.get(input.specId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "spec not found" });
      const env = ctx.config.environments.find((e) => e.name === input.env);
      if (!env) throw new TRPCError({ code: "BAD_REQUEST", message: `unknown environment "${input.env}"` });
      const spec = loadSpecYaml(row.yaml);
      const runId = newId();
      ctx.store.runs.insert({ runId, specId: input.specId, env: env.name, startedAt: Date.now(), finishedAt: null, status: "running", report: null });
      try {
        const q = await runSpecAgainstEnv(ctx.store, spec, { name: env.name, baseUrl: env.baseUrl, destructive: env.destructive });
        ctx.store.runs.finish(runId, q.status, q.result);
        ctx.store.audit.append({ entityType: "spec", entityId: input.specId, action: "run", actor: ctx.actor, diff: { env: env.name, status: q.status } });
        return { runId, status: q.status };
      } catch (e) {
        ctx.store.runs.finish(runId, "failed", { error: String(e) });
        return { runId, status: "failed" as const };
      }
    }),
  get: publicProcedure.input(z.object({ runId: z.string() })).query(({ ctx, input }) => ctx.store.runs.get(input.runId)),
  listBySpec: publicProcedure.input(z.object({ specId: z.string() })).query(({ ctx, input }) => ctx.store.runs.listBySpec(input.specId)),
});

const securityRouter = router({
  authzMatrix: publicProcedure
    .input(z.object({ environment: z.string(), operationIds: z.array(z.string()).optional() }))
    .mutation(({ ctx, input }) => {
      const roles = [...new Set(ctx.store.sessions.list().map((s) => s.authProfile).filter((r): r is string => Boolean(r)))];
      const ops = input.operationIds
        ? input.operationIds.map((id) => ctx.store.operations.get(id)).filter((o): o is NonNullable<typeof o> => o !== null)
        : ctx.store.operations.list();
      const specs = generateAuthzMatrix({ operations: ops, roles, environment: input.environment });
      for (const spec of specs) {
        ctx.store.specs.upsert({ specId: spec.specId, compositionId: spec.compositionId, yaml: specToYaml(spec), generatedBy: "authz-generator", model: null, packId: null, createdAt: Date.now(), status: "generated" });
      }
      ctx.store.audit.append({ entityType: "security", entityId: "authz", action: "generate", actor: ctx.actor, diff: { count: specs.length } });
      return { generated: specs.length, roles };
    }),
  bolaProbes: publicProcedure
    .input(z.object({ environment: z.string(), operationIds: z.array(z.string()).optional() }))
    .mutation(({ ctx, input }) => {
      const roles = [...new Set(ctx.store.sessions.list().map((s) => s.authProfile).filter((r): r is string => Boolean(r)))];
      const ops = input.operationIds
        ? input.operationIds.map((id) => ctx.store.operations.get(id)).filter((o): o is NonNullable<typeof o> => o !== null)
        : ctx.store.operations.list();
      const specs = generateBolaProbes({ operations: ops, roles, environment: input.environment });
      for (const spec of specs) {
        ctx.store.specs.upsert({ specId: spec.specId, compositionId: spec.compositionId, yaml: specToYaml(spec), generatedBy: "bola-generator", model: null, packId: null, createdAt: Date.now(), status: "generated" });
      }
      ctx.store.audit.append({ entityType: "security", entityId: "bola", action: "generate", actor: ctx.actor, diff: { count: specs.length } });
      return { generated: specs.length, roles };
    }),
});

const driftRouter = router({
  report: publicProcedure.query(({ ctx }) => {
    const ops = ctx.store.operations.list();
    const annotations = new Map(ctx.store.annotations.list().map((a) => [a.operationId, a]));
    const reviewed = [...annotations.values()].filter((a) => a.reviewState !== "unannotated").length;
    const approvedCompositions = ctx.store.compositions.listByStatus("approved");
    const exemplars = ctx.store.exemplars.list();
    const opIds = new Set(ops.map((o) => o.operationId));
    const covered = new Set(
      approvedCompositions.flatMap((c) => c.steps.map((st) => st.operationId)).filter((id) => opIds.has(id)),
    );

    // Phase 7 metrics (realignment guide §9): three coverage lenses over the same catalog, each
    // independent of the others (an op can be dependency-resolvable but have zero example usage).
    const readyOps = ops.filter((o) => isOperationReady(annotations.get(o.operationId) ?? null));
    const exampledOpIds = new Set(exemplars.flatMap((e) => e.steps.map((st) => st.operationId)));
    const readyAndExampled = readyOps.filter((o) => exampledOpIds.has(o.operationId));

    const graph = computeDependencyGraph(ctx.store);
    const resolvable = ops.filter((o) => {
      const dep = graph.byOperation.get(o.operationId);
      if (!dep) return true; // no requires derived at all -> vacuously resolvable
      return dep.requires.every((r) => dep.clientGenerated.includes(r.consumerSlot.path) || r.satisfiableBy.length > 0);
    });

    return {
      hasSpec: false,
      observedNotInSpec: [] as string[],
      specNeverObserved: [] as string[],
      undocumentedFields: [] as string[],
      coverage: {
        totalOperations: ops.length,
        reviewedOperations: reviewed,
        operationsWithApprovedComposition: covered.size,
        annotationReadyOperations: readyOps.length,
        exampleCoveredOperations: readyAndExampled.length,
        dependencyResolvableOperations: resolvable.length,
      },
    };
  }),
});

const rehearsalRouter = router({
  listGoals: publicProcedure.query(({ ctx }) => ctx.store.rehearsal.listGoals()),
  addGoal: publicProcedure.input(z.object({ goal: z.string().min(1), note: z.string().optional() })).mutation(({ ctx, input }) => {
    const saved = ctx.store.rehearsal.upsertGoal({
      goalId: newId(),
      goal: input.goal,
      ...(input.note ? { note: input.note } : {}),
      createdBy: ctx.actor,
      createdAt: Date.now(),
    });
    ctx.store.audit.append({ entityType: "rehearsalGoal", entityId: saved.goalId, action: "add", actor: ctx.actor });
    return saved;
  }),
  removeGoal: publicProcedure.input(z.object({ goalId: z.string() })).mutation(({ ctx, input }) => {
    ctx.store.rehearsal.removeGoal(input.goalId);
    ctx.store.audit.append({ entityType: "rehearsalGoal", entityId: input.goalId, action: "remove", actor: ctx.actor });
    return { ok: true };
  }),
  run: publicProcedure
    .input(z.object({ goalIds: z.array(z.string()).optional(), model: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      let llm: ReturnType<typeof createLlm>;
      let embedder: ReturnType<typeof createEmbedder>;
      try {
        llm = createLlm(ctx.config, "compose", input?.model);
        embedder = createEmbedder(ctx.config);
      } catch (e) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
      }
      const summary = await runRehearsal(ctx.store, {
        llm,
        actor: ctx.actor,
        retrieve: { embedder },
        ...(input?.goalIds ? { goalIds: input.goalIds } : {}),
        ...(input?.model ? { model: input.model } : {}),
      });
      ctx.store.audit.append({ entityType: "rehearsal", entityId: "run", action: "run", actor: ctx.actor, diff: { count: summary.results.length } });
      return summary;
    }),
  latest: publicProcedure.query(({ ctx }) => summarize(latestResults(ctx.store))),
  judge: publicProcedure
    .input(z.object({ resultId: z.string(), verdict: z.enum(["unjudged", "good", "wrong"]), note: z.string().optional() }))
    .mutation(({ ctx, input }) => {
      const results = ctx.store.rehearsal.listResults();
      const existing = results.find((r) => r.resultId === input.resultId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "rehearsal result not found" });
      const saved = ctx.store.rehearsal.upsertResult({
        ...existing,
        humanVerdict: input.verdict,
        ...(input.note ? { humanNote: input.note } : {}),
      });
      ctx.store.audit.append({ entityType: "rehearsalResult", entityId: input.resultId, action: "judge", actor: ctx.actor, diff: { verdict: input.verdict } });
      return saved;
    }),
});

export const appRouter = router({
  sessions: sessionsRouter,
  derive: deriveRouter,
  operations: operationsRouter,
  flows: flowsRouter,
  exemplars: exemplarsRouter,
  suggest: suggestRouter,
  guides: guidesRouter,
  dataflow: dataflowRouter,
  dependencies: dependenciesRouter,
  compose: composeRouter,
  pack: packRouter,
  specs: specsRouter,
  agent: agentRouter,
  runs: runsRouter,
  security: securityRouter,
  drift: driftRouter,
  rehearsal: rehearsalRouter,
});

export type AppRouter = typeof appRouter;
