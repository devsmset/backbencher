import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AnalystGuideSchema,
  KnowledgePackSchema,
  ReviewState,
  ScenarioSchema,
  SideEffect,
  isAnnotationReady,
} from "@backbencher/schemas";
import { dataDir, newId } from "@backbencher/shared";
import { mergeOperation } from "@backbencher/store";
import { loadAllSessions, loadSession, runDerivation } from "@backbencher/derive";
import { type RecorderHandle, startRecording } from "@backbencher/recorder";
import { buildKnowledgePack, computeDependencyGraph, createLlm, generateTestSpec, packDiff, proposeScenario } from "@backbencher/agent";
import { loadSpecYaml, runSpecAgainstEnv, generateAuthzMatrix, generateBolaProbes, specToYaml } from "@backbencher/testkit";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./trpc.js";

// tRPC routers (architecture §6.2). Derived reads are merged with annotations (§6.4); every
// mutation appends to the audit log.

// In-memory registry of in-progress recordings, keyed by sessionId. A recording is a live
// headed browser + Playwright listeners running in this server process (mirrors `bb record`).
const activeRecordings = new Map<string, RecorderHandle>();

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
      const session = loadSession(dir);
      return { meta: session.meta, events: session.events };
    }),
  activeRecordings: publicProcedure.query(() => [...activeRecordings.keys()]),
  startRecording: publicProcedure
    .input(z.object({ url: z.string(), sessionName: z.string().optional(), authProfile: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const handle = await startRecording({
        url: input.url,
        config: ctx.config,
        headless: false,
        ...(input.sessionName ? { sessionName: input.sessionName } : {}),
        ...(input.authProfile ? { authProfile: input.authProfile } : {}),
      });
      activeRecordings.set(handle.sessionId, handle);
      ctx.store.audit.append({ entityType: "session", entityId: handle.sessionId, action: "record.start", actor: ctx.actor });
      return { sessionId: handle.sessionId };
    }),
  stopRecording: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const handle = activeRecordings.get(input.sessionId);
      if (!handle) throw new TRPCError({ code: "NOT_FOUND", message: "no active recording with that sessionId" });
      activeRecordings.delete(input.sessionId);
      const result = await handle.stop();
      ctx.store.audit.append({ entityType: "session", entityId: input.sessionId, action: "record.stop", actor: ctx.actor, diff: { totalEvents: result.summary.totalEvents } });
      return { sessionId: result.sessionId, sessionDir: result.sessionDir, summary: result.summary };
    }),
});

const deriveRouter = router({
  run: publicProcedure
    .input(z.object({ sessionId: z.string().optional() }).optional())
    .mutation(({ ctx, input }) => {
      const sessions = input?.sessionId
        ? [loadSession(join(dataDir(), "sessions", input.sessionId))]
        : loadAllSessions();
      if (sessions.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no sessions found under data/sessions — record one first" });
      }
      const result = runDerivation(sessions);
      for (const s of sessions) ctx.store.sessions.upsertFromMeta(s.meta);
      ctx.store.saveDerivation(result);
      ctx.store.audit.append({
        entityType: "derivation",
        entityId: input?.sessionId ?? "all",
        action: "derive",
        actor: ctx.actor,
        diff: { sessions: sessions.length, operations: result.operations.length },
      });
      return {
        sessionsProcessed: sessions.length,
        operations: result.operations.length,
        dataflowEdges: result.dataflow.length,
        flows: result.flows.length,
      };
    }),
});

const AnnotatePatch = z.object({
  operationId: z.string(),
  name: z.string().optional(),
  does: z.string().optional(),
  productArea: z.string().optional(),
  sideEffect: SideEffect.optional(),
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
    .input(z.object({ q: z.string().optional(), reviewState: ReviewState.optional(), area: z.string().optional() }).optional())
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
        operation: mergeOperation(derived, ctx.store.annotations.get(input.operationId)),
        dataflow: ctx.store.dataflow.forOperation(input.operationId),
      };
    }),
  annotate: publicProcedure.input(AnnotatePatch).mutation(({ ctx, input }) => {
    const existing = ctx.store.annotations.get(input.operationId);
    const base = existing ?? { operationId: input.operationId, reviewState: "unreviewed" as const, tags: [] };
    const { operationId, ...patch } = input;
    const saved = ctx.store.annotations.upsert({
      ...base,
      ...patch,
      operationId,
      tags: patch.tags ?? base.tags,
      reviewState: base.reviewState,
      updatedBy: ctx.actor,
      updatedAt: Date.now(),
    });
    ctx.store.audit.append({ entityType: "operation", entityId: operationId, action: "annotate", actor: ctx.actor, diff: patch });
    return saved;
  }),
  setReviewState: publicProcedure
    .input(z.object({ operationId: z.string(), reviewState: ReviewState }))
    .mutation(({ ctx, input }) => {
      const saved = ctx.store.annotations.setReviewState(input.operationId, input.reviewState, ctx.actor);
      ctx.store.audit.append({ entityType: "operation", entityId: input.operationId, action: "setReviewState", actor: ctx.actor, diff: { reviewState: input.reviewState } });
      return saved;
    }),
  merge: publicProcedure
    .input(z.object({ operationIds: z.array(z.string()).min(1), targetTemplate: z.string() }))
    .mutation(({ ctx, input }) => {
      for (const id of input.operationIds) {
        const existing = ctx.store.annotations.get(id) ?? {
          operationId: id,
          reviewState: "unreviewed" as const,
          tags: [],
          updatedBy: ctx.actor,
          updatedAt: Date.now(),
        };
        ctx.store.annotations.upsert({
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

const scenariosRouter = router({
  list: publicProcedure.query(({ ctx }) => ctx.store.scenarios.list()),
  get: publicProcedure
    .input(z.object({ scenarioId: z.string() }))
    .query(({ ctx, input }) => ctx.store.scenarios.get(input.scenarioId)),
  fromFlow: publicProcedure
    .input(z.object({ flowId: z.string() }))
    .query(({ ctx, input }) => {
      const flow = ctx.store.flows.get(input.flowId);
      if (!flow) return null;
      return {
        scenarioId: "",
        name: "",
        description: "",
        sourceFlowIds: [flow.flowId],
        steps: flow.steps.map((s) => ({ operationId: s.operationId, intent: "" })),
        testDecision: { inScope: true, strategy: "api_functional", rationale: "", riskLevel: "medium", environments: [] },
        reviewState: "unreviewed",
        updatedBy: ctx.actor,
        updatedAt: Date.now(),
      };
    }),
  upsert: publicProcedure.input(ScenarioSchema).mutation(({ ctx, input }) => {
    const scenarioId = input.scenarioId || newId();
    const saved = ctx.store.scenarios.upsert({ ...input, scenarioId, updatedBy: ctx.actor, updatedAt: Date.now() });
    ctx.store.audit.append({ entityType: "scenario", entityId: scenarioId, action: "upsert", actor: ctx.actor });
    return saved;
  }),
  remove: publicProcedure.input(z.object({ scenarioId: z.string() })).mutation(({ ctx, input }) => {
    ctx.store.scenarios.remove(input.scenarioId);
    ctx.store.audit.append({ entityType: "scenario", entityId: input.scenarioId, action: "remove", actor: ctx.actor });
    return { ok: true };
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
// closure + LLM select/order + deterministic validation and persists a draft (reviewState:
// "unreviewed", origin: "composed"). A human must `approve` (or `reject`) before it flows into the
// unchanged agent.generateTestSpec / testkit pipeline.
const composeRouter = router({
  propose: publicProcedure
    .input(z.object({ goal: z.string().min(1), model: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const cfg = input.model ? { ...ctx.config.agent, model: input.model } : ctx.config.agent;
      let llm: ReturnType<typeof createLlm>;
      try {
        llm = createLlm(cfg);
      } catch (e) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
      }
      const result = await proposeScenario(ctx.store, input.goal, {
        llm,
        actor: ctx.actor,
        ...(input.model ? { model: input.model } : {}),
      });
      ctx.store.audit.append({
        entityType: "scenario",
        entityId: result.scenario.scenarioId,
        action: "compose.propose",
        actor: ctx.actor,
        diff: { goal: input.goal, attempts: result.attempts },
      });
      return { scenario: result.scenario, attempts: result.attempts };
    }),
  drafts: publicProcedure.query(({ ctx }) =>
    ctx.store.scenarios.list().filter((s) => s.origin === "composed" && s.reviewState === "unreviewed"),
  ),
  approve: publicProcedure
    .input(
      z.object({
        scenarioId: z.string(),
        steps: z.array(z.object({ operationId: z.string(), intent: z.string() })).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const existing = ctx.store.scenarios.get(input.scenarioId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "scenario not found" });
      const steps = input.steps
        ? input.steps.map((s) => ({ ...s, satisfies: [], autoAdded: false, fromExampleScenarioIds: [] }))
        : existing.steps;
      const saved = ctx.store.scenarios.upsert({
        ...existing,
        steps,
        reviewState: "approved",
        updatedBy: ctx.actor,
        updatedAt: Date.now(),
      });
      ctx.store.audit.append({ entityType: "scenario", entityId: input.scenarioId, action: "compose.approve", actor: ctx.actor });
      return saved;
    }),
  reject: publicProcedure.input(z.object({ scenarioId: z.string() })).mutation(({ ctx, input }) => {
    const existing = ctx.store.scenarios.get(input.scenarioId);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "scenario not found" });
    const saved = ctx.store.scenarios.upsert({
      ...existing,
      reviewState: "ignored",
      updatedBy: ctx.actor,
      updatedAt: Date.now(),
    });
    ctx.store.audit.append({ entityType: "scenario", entityId: input.scenarioId, action: "compose.reject", actor: ctx.actor });
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
    .input(z.object({ scenarioId: z.string(), model: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const cfg = input.model ? { ...ctx.config.agent, model: input.model } : ctx.config.agent;
      let llm: ReturnType<typeof createLlm>;
      try {
        llm = createLlm(cfg);
      } catch (e) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
      }
      const res = await generateTestSpec(ctx.store, input.scenarioId, { llm, ...(input.model ? { model: input.model } : {}) });
      ctx.store.audit.append({ entityType: "scenario", entityId: input.scenarioId, action: "agent.generate", actor: ctx.actor });
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
        ctx.store.specs.upsert({ specId: spec.specId, scenarioId: spec.scenarioId, yaml: specToYaml(spec), generatedBy: "authz-generator", model: null, packId: null, createdAt: Date.now(), status: "generated" });
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
        ctx.store.specs.upsert({ specId: spec.specId, scenarioId: spec.scenarioId, yaml: specToYaml(spec), generatedBy: "bola-generator", model: null, packId: null, createdAt: Date.now(), status: "generated" });
      }
      ctx.store.audit.append({ entityType: "security", entityId: "bola", action: "generate", actor: ctx.actor, diff: { count: specs.length } });
      return { generated: specs.length, roles };
    }),
});

const driftRouter = router({
  report: publicProcedure.query(({ ctx }) => {
    const ops = ctx.store.operations.list();
    const annotations = new Map(ctx.store.annotations.list().map((a) => [a.operationId, a]));
    const reviewed = [...annotations.values()].filter((a) => a.reviewState !== "unreviewed").length;
    const allScenarios = ctx.store.scenarios.list();
    const approved = allScenarios.filter((s) => s.reviewState === "approved");
    const opIds = new Set(ops.map((o) => o.operationId));
    const covered = new Set(approved.flatMap((s) => s.steps.map((st) => st.operationId)).filter((id) => opIds.has(id)));

    // Phase 7 metrics (realignment guide §9): three coverage lenses over the same catalog, each
    // independent of the others (an op can be dependency-resolvable but have zero example usage).
    const readyOps = ops.filter((o) => isAnnotationReady(annotations.get(o.operationId) ?? null));
    const exampledOpIds = new Set(allScenarios.flatMap((s) => s.steps.map((st) => st.operationId)));
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
        operationsWithApprovedScenario: covered.size,
        annotationReadyOperations: readyOps.length,
        exampleCoveredOperations: readyAndExampled.length,
        dependencyResolvableOperations: resolvable.length,
      },
    };
  }),
});

export const appRouter = router({
  sessions: sessionsRouter,
  derive: deriveRouter,
  operations: operationsRouter,
  flows: flowsRouter,
  scenarios: scenariosRouter,
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
});

export type AppRouter = typeof appRouter;
