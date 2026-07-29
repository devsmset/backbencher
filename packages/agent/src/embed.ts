import { type OperationAnnotation, type Scenario, isAnnotationReady } from "@backbencher/schemas";
import type { MergedOperation, Store } from "@backbencher/store";
import { mergeOperation } from "@backbencher/store";

// Embedding retrieval (realignment guide §6.2) — powers the composer's candidate-endpoint pool
// and few-shot scenario examples. Deliberately dependency-free: no vector DB, no external
// embedding API required. The corpus (annotated endpoints + scenarios) is small, so a brute-force
// top-K cosine scan over locally-computed vectors is fast and fully inspectable. `Embed` is
// injectable (mirrors `LlmComplete` in generate.ts) so a real embedding API can be swapped in
// later without touching any caller.

export type Embed = (text: string) => Promise<number[]> | number[];

const DIM = 256;

function grams(token: string, n = 3): string[] {
  if (token.length <= n) return [token];
  const out: string[] = [];
  for (let i = 0; i <= token.length - n; i++) out.push(token.slice(i, i + n));
  return out;
}

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function l2normalize(v: number[]): number[] {
  let sumSquares = 0;
  for (const x of v) sumSquares += x * x;
  const mag = Math.sqrt(sumSquares) || 1;
  return v.map((x) => x / mag);
}

/** Deterministic, dependency-free local embedding: hashed char-trigram bag-of-words, L2-normalized. */
export function localEmbed(text: string): number[] {
  const vec: number[] = new Array(DIM).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return l2normalize(vec);
  for (const token of normalized.split(/\s+/)) {
    for (const g of grams(token)) {
      const idx = fnv1a(g) % DIM;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
  }
  return l2normalize(vec);
}

/** Both inputs are assumed L2-normalized (as `localEmbed` returns), so dot product == cosine similarity. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

export interface RetrievableItem {
  id: string;
  text: string;
}

export async function topK<T extends RetrievableItem>(
  query: string,
  items: readonly T[],
  k: number,
  embed: Embed = localEmbed,
): Promise<Array<T & { score: number }>> {
  const queryVec = await embed(query);
  const scored = await Promise.all(
    items.map(async (item) => ({ ...item, score: cosineSimilarity(queryVec, await embed(item.text)) })),
  );
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

/** "{name}. {does}. [{productArea}] {method} {template}" (guide §6.2). */
export function endpointRetrievalText(op: MergedOperation): string {
  return `${op.name ?? ""}. ${op.does ?? ""}. [${op.productArea ?? ""}] ${op.method} ${op.pathTemplate.template}`;
}

/** "{name}. {goal}. steps: {endpoint names joined}" (guide §6.2). */
export function scenarioRetrievalText(scenario: Scenario, opNameById: ReadonlyMap<string, string>): string {
  const stepNames = scenario.steps.map((s) => opNameById.get(s.operationId) ?? s.operationId).join(", ");
  return `${scenario.name}. ${scenario.goal ?? scenario.description}. steps: ${stepNames}`;
}

export interface RetrievalResult {
  endpoints: Array<MergedOperation & { score: number }>;
  scenarios: Array<Scenario & { score: number }>;
}

export interface RetrieveOptions {
  topEndpoints?: number;
  topScenarios?: number;
  embed?: Embed;
}

/**
 * Retrieval for a free-text goal (guide §6.2 step 2, pre-dependency-closure): top-M `ready`
 * catalog endpoints as the candidate pool, top-K scenarios (recorded or approved-composed) as
 * few-shot compositional examples. Dependency-closure expansion of the endpoint pool happens
 * downstream in compose.ts (§6.2 step 2 continued), not here — this module only does retrieval.
 */
export function retrieveForGoal(store: Store, goal: string, opts: RetrieveOptions = {}): Promise<RetrievalResult> {
  const embed = opts.embed ?? localEmbed;
  const topEndpoints = opts.topEndpoints ?? 12;
  const topScenarios = opts.topScenarios ?? 4;

  const annotationsByOp = new Map<string, OperationAnnotation>(store.annotations.list().map((a) => [a.operationId, a]));
  const merged = store.operations
    .list()
    .map((op) => mergeOperation(op, annotationsByOp.get(op.operationId) ?? null))
    .filter((op) => isAnnotationReady(annotationsByOp.get(op.operationId)));
  const opNameById = new Map(merged.map((op) => [op.operationId, op.name ?? op.operationId]));

  const scenarios = store.scenarios.list().filter((s) => s.origin === "recorded" || s.reviewState === "approved");

  return Promise.all([
    topK(goal, merged.map((op) => ({ ...op, id: op.operationId, text: endpointRetrievalText(op) })), topEndpoints, embed),
    topK(goal, scenarios.map((s) => ({ ...s, id: s.scenarioId, text: scenarioRetrievalText(s, opNameById) })), topScenarios, embed),
  ]).then(([topEndpointsResult, topScenariosResult]) => ({ endpoints: topEndpointsResult, scenarios: topScenariosResult }));
}
