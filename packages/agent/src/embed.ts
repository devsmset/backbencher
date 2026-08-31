import { type LlmRegistry, createLlmRegistry } from "@backbencher/llm";
import { type CatalogAnnotation, type Exemplar, isOperationReady } from "@backbencher/schemas";
import type { BbConfig } from "@backbencher/shared";
import type { EmbeddingKind, MergedOperation, Store } from "@backbencher/store";
import { embeddingTextHash, mergeOperation } from "@backbencher/store";

// Embedding retrieval (realignment guide §6.2) — powers the composer's candidate-endpoint pool
// and few-shot scenario examples. Vectors are cached in the store keyed by (kind, entityId) with
// the model name and a hash of the source text, so editing an annotation or switching embedding
// model misses the cache and re-embeds; nothing else has to remember to invalidate.
// `Embedder` is injectable (mirrors `LlmComplete` in generate.ts) so tests run without credentials.

/** Batched: one network round-trip for every cache miss in a retrieval, not one per item. */
export type Embedder = {
  readonly model: string;
  embed(texts: readonly string[]): Promise<number[][]>;
};

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

/**
 * Deterministic, dependency-free local embedding: hashed char-trigram bag-of-words, L2-normalized.
 * LEXICAL, not semantic — it matches shared character sequences, so "raise a support case" will not
 * find "Create Ticket". Retained only as the offline default for tests; configure a real embedding
 * model (`llm.tasks.embed`) for any real corpus.
 */
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

/** Vectors are L2-normalized by every embedder we use, so the dot product is the cosine. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

function l2normalizeIfNeeded(v: number[]): number[] {
  let sumSquares = 0;
  for (const x of v) sumSquares += x * x;
  return Math.abs(sumSquares - 1) < 1e-6 ? v : l2normalize(v);
}

/** The offline embedder: no credentials, no network, lexical similarity only. */
export const localEmbedder: Embedder = {
  model: "local-trigram-256",
  embed: (texts) => Promise.resolve(texts.map((t) => localEmbed(t))),
};

/** The embedder routed to the `embed` task in bb.config.jsonc. */
export function createEmbedder(cfg: BbConfig, registry?: LlmRegistry): Embedder {
  const provider = (registry ?? createLlmRegistry(cfg)).forTask("embed");
  return {
    model: `${provider.capabilities.provider}:${provider.capabilities.model}`,
    embed: (texts) => provider.embed(texts).then((vs) => vs.map(l2normalizeIfNeeded)),
  };
}

export interface RetrievableItem {
  kind: EmbeddingKind;
  id: string;
  text: string;
}

/**
 * Resolve vectors for `items`, reading cached rows and embedding only the misses in one batch.
 * A miss is a missing row, a different embedding model, or changed source text.
 */
async function vectorsFor(
  store: Store,
  items: readonly RetrievableItem[],
  embedder: Embedder,
): Promise<Map<string, number[]>> {
  const resolved = new Map<string, number[]>();
  const misses: Array<RetrievableItem & { textHash: string }> = [];

  for (const item of items) {
    const textHash = embeddingTextHash(item.text);
    const cached = store.embeddings.get(item.kind, item.id);
    if (cached && cached.model === embedder.model && cached.textHash === textHash) {
      resolved.set(item.id, cached.vector);
    } else {
      misses.push({ ...item, textHash });
    }
  }

  if (misses.length > 0) {
    const fresh = await embedder.embed(misses.map((m) => m.text));
    misses.forEach((miss, i) => {
      const vector = fresh[i] ?? [];
      resolved.set(miss.id, vector);
      store.embeddings.upsert({
        kind: miss.kind,
        entityId: miss.id,
        model: embedder.model,
        textHash: miss.textHash,
        vector,
      });
    });
  }
  return resolved;
}

export async function topK<T extends RetrievableItem>(
  store: Store,
  query: string,
  items: readonly T[],
  k: number,
  embedder: Embedder,
): Promise<Array<T & { score: number }>> {
  if (items.length === 0) return [];
  const [[queryVec], vectors] = await Promise.all([embedder.embed([query]), vectorsFor(store, items, embedder)]);
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(queryVec ?? [], vectors.get(item.id) ?? []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** "{name}. {does}. [{productArea}] {method} {template}" (guide §6.2). */
export function endpointRetrievalText(op: MergedOperation): string {
  return `${op.name ?? ""}. ${op.does ?? ""}. [${op.productArea ?? ""}] ${op.method} ${op.pathTemplate.template}`;
}

/** "{name}. {goal}. steps: {endpoint names joined}" (guide §6.2). */
export function exemplarRetrievalText(exemplar: Exemplar, opNameById: ReadonlyMap<string, string>): string {
  const stepNames = exemplar.steps.map((s) => opNameById.get(s.operationId) ?? s.operationId).join(", ");
  return `${exemplar.name}. ${exemplar.goal}. steps: ${stepNames}`;
}

export interface RetrievalResult {
  endpoints: Array<MergedOperation & { score: number }>;
  exemplars: Array<Exemplar & { score: number }>;
}

export interface RetrieveOptions {
  topEndpoints?: number;
  topExemplars?: number;
  embedder?: Embedder;
}

/**
 * An Exemplar only teaches once every Operation it uses is Ready — otherwise the composer sees a
 * step it cannot name, let alone select (guide gotcha #6). Derived, never set by hand.
 */
export function isExampleReady(exemplar: Exemplar, readyOpIds: ReadonlySet<string>): boolean {
  return exemplar.steps.length > 0 && exemplar.steps.every((s) => readyOpIds.has(s.operationId));
}

/** The corpus that is retrievable today: `ready` operations, plus example-ready Exemplars. */
export function retrievalCorpus(store: Store): {
  endpoints: Array<MergedOperation & RetrievableItem>;
  exemplars: Array<Exemplar & RetrievableItem>;
} {
  const catalogByOp = new Map<string, CatalogAnnotation>(store.annotations.list().map((a) => [a.operationId, a]));
  const testingByOp = new Map(store.testingAnnotations.list().map((a) => [a.operationId, a]));
  const merged = store.operations
    .list()
    .map((op) => mergeOperation(op, catalogByOp.get(op.operationId) ?? null, testingByOp.get(op.operationId) ?? null))
    .filter((op) => isOperationReady(catalogByOp.get(op.operationId)));
  const readyOpIds = new Set(merged.map((op) => op.operationId));
  const opNameById = new Map(merged.map((op) => [op.operationId, op.name ?? op.operationId]));

  return {
    endpoints: merged.map((op) => ({
      ...op,
      kind: "operation" as const,
      id: op.operationId,
      text: endpointRetrievalText(op),
    })),
    exemplars: store.exemplars
      .list()
      .filter((e) => isExampleReady(e, readyOpIds))
      .map((e) => ({
        ...e,
        kind: "exemplar" as const,
        id: e.exemplarId,
        text: exemplarRetrievalText(e, opNameById),
      })),
  };
}

/**
 * Retrieval for a free-text goal (guide §6.2 step 2, pre-dependency-closure): top-M `ready`
 * catalog endpoints as the candidate pool, top-K Exemplars as few-shot compositional examples.
 * Dependency-closure expansion of the endpoint pool happens downstream in compose.ts.
 */
export async function retrieveForGoal(
  store: Store,
  goal: string,
  opts: RetrieveOptions = {},
): Promise<RetrievalResult> {
  const embedder = opts.embedder ?? localEmbedder;
  const corpus = retrievalCorpus(store);

  const [endpoints, exemplars] = await Promise.all([
    topK(store, goal, corpus.endpoints, opts.topEndpoints ?? 12, embedder),
    topK(store, goal, corpus.exemplars, opts.topExemplars ?? 4, embedder),
  ]);
  return { endpoints, exemplars };
}

/** Embed every retrievable item that is missing or stale, so the first compose isn't a cold start. */
export async function warmEmbeddings(
  store: Store,
  embedder: Embedder,
): Promise<{ operations: number; exemplars: number; embedded: number }> {
  const corpus = retrievalCorpus(store);
  const items = [...corpus.endpoints, ...corpus.exemplars];
  const stale = items.filter((i) => {
    const row = store.embeddings.get(i.kind, i.id);
    return !row || row.model !== embedder.model || row.textHash !== embeddingTextHash(i.text);
  }).length;
  await vectorsFor(store, items, embedder);
  return { operations: corpus.endpoints.length, exemplars: corpus.exemplars.length, embedded: stale };
}
