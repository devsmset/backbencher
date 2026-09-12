import { createHash } from "node:crypto";
import type { DependencyGraph } from "@backbencher/derive";
import { type Composition, CompositionSchema, type OperationDependency } from "@backbencher/schemas";
import { newId } from "@backbencher/shared";
import { type MergedOperation, type Store, mergeOperation } from "@backbencher/store";
import { z } from "zod";
import { computeDependencyGraph } from "./dependencies.js";
import { type ReferenceSession, type RetrieveOptions, endpointRetrievalText, retrieveForGoal } from "./embed.js";
import type { LlmComplete } from "./generate.js";

// The composition engine (realignment guide §6) — the heart of the vision. A free-text goal
// becomes a draft `Scenario` (origin: "composed") via retrieval → dependency-closure expansion →
// prompt assembly → LLM select/order → deterministic dependency validation/auto-completion → one
// repair round-trip → persist as an unreviewed draft for human approval. The human never hand-
// picks the endpoint list.

const SYSTEM = `You compose an ordered API scenario from a catalog to achieve a goal.
HARD RULES:
- Choose only from the CANDIDATE ENDPOINTS below, referencing them by operationId; never invent an operationId.
- Output ONLY a single JSON object (no prose, no code fences) matching this shape:
  {"steps":[{"operationId":"...","intent":"..."}],"rationale":"...","candidateGaps":[{"description":"...","suggestedName":"..."}]}
- "intent" is a one-line explanation of why this step is needed, in the goal's own terms.
- If the goal needs a capability that is absent from the candidates, describe it in candidateGaps
  instead of inventing an operationId.
- You may use the DEPENDENCY FACTS to help order steps sensibly, but a machine validator will
  check and auto-complete dependencies after you — focus on picking the right endpoints for the
  goal and a narrative order that reflects real product usage.
- REFERENCE SESSIONS show how values have actually flowed between endpoints in practice; the
  DEPENDENCY FACTS block remains the authoritative, machine-derived statement.`;

const ComposeProposalSchema = z.object({
  steps: z.array(z.object({ operationId: z.string(), intent: z.string() })).min(1),
  rationale: z.string().optional(),
  candidateGaps: z.array(z.object({ description: z.string(), suggestedName: z.string().optional() })).default([]),
});
type ComposeProposal = z.infer<typeof ComposeProposalSchema>;

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function promptHash(system: string, user: string): string {
  return createHash("sha1").update(system).update("\u0000").update(user).digest("hex").slice(0, 16);
}

/** Dependency-closure expansion (guide §6.2 step 2): pull in every transitive producer of every
 * candidate's requires-slots, so e.g. login is in the pool even if the goal never mentions auth. */
function expandDependencyClosure(seedOperationIds: readonly string[], graph: DependencyGraph): Set<string> {
  const pool = new Set(seedOperationIds);
  const queue = [...seedOperationIds];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const dep = graph.byOperation.get(id);
    if (!dep) continue;
    for (const slot of dep.requires) {
      for (const producerId of slot.satisfiableBy) {
        if (!pool.has(producerId)) {
          pool.add(producerId);
          queue.push(producerId);
        }
      }
    }
  }
  return pool;
}

function formatOperationForPrompt(op: MergedOperation, dep: OperationDependency | undefined): string {
  const requires = (dep?.requires ?? [])
    .map((r: OperationDependency["requires"][number]) => `${r.role ?? r.consumerSlot.path}${r.satisfiableBy.length ? ` (satisfiableBy: ${r.satisfiableBy.join(", ")})` : ""}`)
    .join(", ");
  const produces = (dep?.produces ?? []).map((p: OperationDependency["produces"][number]) => p.role ?? p.path).join(", ");
  return [
    `${op.operationId}: ${op.name ?? op.operationId} — ${op.does ?? "(no description)"} [${op.productArea ?? "?"}] ${op.method} ${op.pathTemplate.template}`,
    `  requires: [${requires}]  produces: [${produces}]  sideEffect: ${op.sideEffect ?? "unknown"}`,
  ].join("\n");
}

function buildPrompt(
  goal: string,
  candidates: MergedOperation[],
  graph: DependencyGraph,
  referenceSessions: ReferenceSession[],
  opNameById: ReadonlyMap<string, string>,
  repairErrors?: string[],
): { system: string; user: string } {
  const dependencyFacts = candidates
    .map((op) => graph.byOperation.get(op.operationId))
    .filter((d): d is OperationDependency => d !== undefined)
    .flatMap((dep) =>
      dep.requires
        .filter((r: OperationDependency["requires"][number]) => r.satisfiableBy.length > 0)
        .map(
          (r: OperationDependency["requires"][number]) =>
            `${dep.operationId} requires ${r.role ?? r.consumerSlot.path} (satisfiableBy: ${r.satisfiableBy.join(", ")})`,
        ),
    )
    .join("\n");

  const examples = referenceSessions
    .map((s) => {
      const opLabel = (operationId: string) => opNameById.get(operationId) ?? operationId;
      const nameByCorrelation = new Map(s.steps.map((st) => [st.correlationId, opLabel(st.operationId)] as const));
      const label = (correlationId: string) => nameByCorrelation.get(correlationId) ?? "(pruned call)";
      const flowLines = [
        ...new Set(
          s.edges.map(
            (e) =>
              `${label(e.producerCorrelationId)}.${e.producerJsonPath} -> ${label(e.consumerCorrelationId)}.${e.consumerJsonPath}`,
          ),
        ),
      ].sort();
      return [
        `"${s.name}" — goal: "${s.goal}"`,
        `  steps: ${s.steps.map((st) => opLabel(st.operationId)).join(", ")}`,
        ...(flowLines.length > 0 ? [`  dataflow: ${flowLines.join("; ")}`] : []),
      ].join("\n");
    })
    .join("\n");

  const user = [
    `GOAL: "${goal}"`,
    "",
    "CANDIDATE ENDPOINTS (retrieved + dependency-closure):",
    candidates.map((op) => formatOperationForPrompt(op, graph.byOperation.get(op.operationId))).join("\n"),
    "",
    "REFERENCE SESSIONS (real recorded flows, curated by an analyst):",
    examples || "(none yet)",
    "",
    "DEPENDENCY FACTS (authoritative, machine-derived):",
    dependencyFacts || "(none)",
    "",
    "TASK: produce the JSON object described in the system prompt.",
    ...(repairErrors && repairErrors.length > 0
      ? ["", "PREVIOUS ATTEMPT WAS INVALID. Fix these issues and re-emit the full JSON object:", ...repairErrors.map((e) => `- ${e}`)]
      : []),
  ].join("\n");

  return { system: SYSTEM, user };
}

interface ReconciledStep {
  operationId: string;
  intent: string;
  satisfies: string[];
  autoAdded: boolean;
}

interface UnmetDependency {
  operationId: string;
  slot: string;
  note: string;
}

/**
 * Deterministic dependency validation + auto-completion (guide §6.4). Walks the LLM's proposed
 * step order; for each step's requires-slot, satisfies it from an already-placed step, mints it
 * (clientGenerated), auto-inserts the sole known producer immediately before the step that needs
 * it (recursively satisfying that producer's own requires first), or — if ambiguous / unknown —
 * records it in `unmetDependencies` for the human. This is a simplification of a full topological
 * sort: it does not reorder steps wholesale (the guide explicitly warns a naive topo sort can
 * discard real product-flow ordering the LLM got right); it only inserts what's missing, as early
 * as the single step that needs it.
 */
function reconcileDependencies(
  proposalSteps: ComposeProposal["steps"],
  graph: DependencyGraph,
): { steps: ReconciledStep[]; unmetDependencies: UnmetDependency[] } {
  const steps: ReconciledStep[] = [];
  const present = new Set<string>();
  const unmetDependencies: UnmetDependency[] = [];

  function autoInsert(operationId: string, forOperationId: string, depth: number): void {
    if (present.has(operationId) || depth > 6) return;
    const dep = graph.byOperation.get(operationId);
    if (dep) {
      for (const slot of dep.requires) {
        if (dep.clientGenerated.includes(slot.consumerSlot.path)) continue;
        if (slot.satisfiableBy.some((id) => present.has(id))) continue;
        if (slot.satisfiableBy.length === 1) autoInsert(slot.satisfiableBy[0] as string, operationId, depth + 1);
      }
    }
    steps.push({ operationId, intent: "(auto-added dependency)", satisfies: [forOperationId], autoAdded: true });
    present.add(operationId);
  }

  for (const s of proposalSteps) {
    if (present.has(s.operationId)) continue; // LLM repeated an endpoint; keep first occurrence's position
    const dep = graph.byOperation.get(s.operationId);
    const satisfies: string[] = [];
    if (dep) {
      for (const slot of dep.requires) {
        const slotKey = `${slot.role ?? slot.consumerSlot.path}`;
        if (dep.clientGenerated.includes(slot.consumerSlot.path)) continue; // minted fresh, always satisfied
        if (slot.satisfiableBy.some((id) => present.has(id))) {
          satisfies.push(slotKey);
          continue;
        }
        if (slot.satisfiableBy.length === 1) {
          autoInsert(slot.satisfiableBy[0] as string, s.operationId, 0);
          satisfies.push(slotKey);
        } else if (slot.satisfiableBy.length === 0) {
          unmetDependencies.push({ operationId: s.operationId, slot: slotKey, note: `no known producer for ${slotKey}` });
        } else {
          unmetDependencies.push({
            operationId: s.operationId,
            slot: slotKey,
            note: `ambiguous producer among: ${slot.satisfiableBy.join(", ")}`,
          });
        }
      }
    }
    steps.push({ operationId: s.operationId, intent: s.intent, satisfies, autoAdded: false });
    present.add(s.operationId);
  }

  return { steps, unmetDependencies };
}

export interface ComposeOptions {
  llm: LlmComplete;
  model?: string;
  actor: string;
  maxRepairs?: number;
  retrieve?: RetrieveOptions;
}

export interface ComposeResult {
  composition: Composition;
  rawModelOutput: string;
  attempts: number;
}

export async function proposeScenario(store: Store, goal: string, opts: ComposeOptions): Promise<ComposeResult> {
  const graph = computeDependencyGraph(store);
  const retrieval = await retrieveForGoal(store, goal, opts.retrieve);

  const annotationsByOp = new Map(store.annotations.list().map((a) => [a.operationId, a]));
  const seedIds = retrieval.endpoints.map((e) => e.operationId);  const closureIds = expandDependencyClosure(seedIds, graph);
  const candidates = [...closureIds]
    .map((id) => store.operations.get(id))
    .filter((op): op is NonNullable<typeof op> => op !== null)
    .map((op) => mergeOperation(op, annotationsByOp.get(op.operationId) ?? null));

  const opNameById = new Map(candidates.map((op) => [op.operationId, op.name ?? op.operationId]));
  for (const op of store.operations.list()) {
    if (!opNameById.has(op.operationId)) {
      const merged = mergeOperation(op, annotationsByOp.get(op.operationId) ?? null);
      opNameById.set(op.operationId, merged.name ?? op.operationId);
    }
  }

  const maxRepairs = opts.maxRepairs ?? 1;
  let attempts = 0;
  let proposal: ComposeProposal | null = null;
  let rawModelOutput = "";
  let repairErrors: string[] | undefined;
  let reconciled: { steps: ReconciledStep[]; unmetDependencies: UnmetDependency[] } = { steps: [], unmetDependencies: [] };
  let system = "";
  let user = "";

  while (attempts <= maxRepairs) {
    attempts += 1;
    ({ system, user } = buildPrompt(goal, candidates, graph, retrieval.referenceSessions, opNameById, repairErrors));
    rawModelOutput = stripFences(await opts.llm(system, user));

    try {
      const parsed: unknown = JSON.parse(rawModelOutput);
      proposal = ComposeProposalSchema.parse(parsed);
    } catch (e) {
      proposal = null;
      repairErrors = [`could not parse composition JSON: ${(e as Error).message}`];
      continue;
    }

    const knownOpIds = new Set(candidates.map((c) => c.operationId));
    const invented = proposal.steps.filter((s) => !knownOpIds.has(s.operationId)).map((s) => s.operationId);
    if (invented.length > 0) {
      repairErrors = [`invented operationId(s) not in the candidate list: ${invented.join(", ")}`];
      proposal = null;
      continue;
    }

    reconciled = reconcileDependencies(proposal.steps, graph);
    if (reconciled.unmetDependencies.length === 0) break;
    repairErrors = reconciled.unmetDependencies.map((u) => `${u.operationId}: ${u.slot} — ${u.note}`);
  }

  const sessionIdsUsed = retrieval.referenceSessions.map((s) => s.sessionId);
  const compositionId = newId();
  const now = Date.now();
  const composition = CompositionSchema.parse({
    compositionId,
    goal,
    status: "draft",
    steps: reconciled.steps.map((s) => ({
      operationId: s.operationId,
      intent: s.intent,
      satisfies: s.satisfies,
      autoAdded: s.autoAdded,
      fromSessionIds: s.autoAdded ? [] : sessionIdsUsed,
    })),
    unmetDependencies: reconciled.unmetDependencies,
    candidateGaps: proposal?.candidateGaps ?? [],
    rationale: proposal?.rationale,
    modelInfo: { model: opts.model ?? "unknown", promptHash: promptHash(system, user) },
    createdBy: opts.actor,
    createdAt: now,
    updatedBy: opts.actor,
    updatedAt: now,
  });

  const saved = store.compositions.upsert(composition);
  return { composition: saved, rawModelOutput, attempts };
}

// Re-exported so callers (e.g. the portal-api compose router) can format the retrieved pool
// without recomputing endpointRetrievalText themselves.
export { endpointRetrievalText };
