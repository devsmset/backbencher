import { join } from "node:path";
import { type PairedCall, loadCuratedOrRawSession, pairCalls } from "@backbencher/derive";
import { type Composition, CompositionSchema } from "@backbencher/schemas";
import { dataDir, newId } from "@backbencher/shared";
import type { Store } from "@backbencher/store";

// Deterministic composer (spec: docs/superpowers/specs/2026-09-24-session-script-generation-design.md
// §2). A second, model-free way to arrive at a draft Composition, sourced from a curated Session's
// real observed calls instead of a free-text goal. Every downstream step (approve, TestDecision,
// generation) is shared with the LLM path — only proposal differs.

// Duplicated from packages/portal-api/src/routers.ts's `isAssetLikeCall` (PairedCall-shaped
// version) rather than shared — matches that file's own precedent of keeping this per-consumer
// rather than factored out (see its comment: "kept separate since the two shapes differ").
const ASSET_PATH_RE = /\.(?:svg|woff2?|ttf|otf|eot|ico|png|jpe?g|gif|webp|avif)(?:$|[?#])/i;
const DROPPED_CONTENT_PREFIXES = ["image/", "font/", "text/css", "text/javascript"];

function isAssetLikeCall(c: Pick<PairedCall, "pathname" | "requestContentType" | "responseContentType">): boolean {
  const contentType = (c.responseContentType ?? c.requestContentType ?? "").toLowerCase();
  if (DROPPED_CONTENT_PREFIXES.some((prefix) => contentType.startsWith(prefix))) return true;
  return ASSET_PATH_RE.test(c.pathname);
}

export class UnclassifiedCallsError extends Error {
  constructor(public readonly calls: Array<{ correlationId: string; method: string; pathname: string }>) {
    super(
      `session has ${calls.length} call(s) with no derived operationId — re-derive or exclude them first: ` +
        calls.map((c) => `${c.method} ${c.pathname} (${c.correlationId})`).join(", "),
    );
    this.name = "UnclassifiedCallsError";
  }
}

export function proposeCompositionFromSession(store: Store, sessionId: string, actor: string): Composition {
  const session = store.sessions.get(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);

  const dir = join(dataDir(), "sessions", sessionId);
  const calls = pairCalls(loadCuratedOrRawSession(dir)).filter((c) => !isAssetLikeCall(c));

  const flow = store.flows.listBySession(sessionId)[0];
  const opByCorrelation = new Map((flow?.steps ?? []).map((s) => [s.correlationId, s.operationId] as const));

  const unclassified = calls.filter((c) => !opByCorrelation.has(c.correlationId));
  if (unclassified.length > 0) {
    throw new UnclassifiedCallsError(
      unclassified.map((c) => ({ correlationId: c.correlationId, method: c.method, pathname: c.pathname })),
    );
  }

  const annotationsById = new Map(store.annotations.list().map((a) => [a.operationId, a]));

  const steps = calls.map((c) => {
    const operationId = opByCorrelation.get(c.correlationId) as string;
    const does = annotationsById.get(operationId)?.does;
    return {
      operationId,
      sourceCorrelationId: c.correlationId,
      intent: does ?? `${c.method} ${c.pathname}`,
      satisfies: [],
      autoAdded: false,
      fromSessionIds: [sessionId],
    };
  });

  const now = Date.now();
  const composition = CompositionSchema.parse({
    compositionId: newId(),
    goal: session.meta.goal,
    status: "draft",
    sourceSessionId: sessionId,
    steps,
    unmetDependencies: [],
    candidateGaps: [],
    rationale: `Replayed from session ${sessionId}: ${session.meta.name}`,
    createdBy: actor,
    createdAt: now,
    updatedBy: actor,
    updatedAt: now,
  });

  return store.compositions.upsert(composition);
}
