import { join } from "node:path";
import { isAssetLikeCall, loadCuratedOrRawSession, pairCalls } from "@backbencher/derive";
import { type Composition, CompositionSchema } from "@backbencher/schemas";
import { dataDir, newId } from "@backbencher/shared";
import type { Store } from "@backbencher/store";

// Deterministic composer (spec: docs/superpowers/specs/2026-09-24-session-script-generation-design.md
// §2). A second, model-free way to arrive at a draft Composition, sourced from a curated Session's
// real observed calls instead of a free-text goal. Every downstream step (approve, TestDecision,
// generation) is shared with the LLM path — only proposal differs.

export class UnclassifiedCallsError extends Error {
  constructor(public readonly calls: Array<{ correlationId: string; method: string; pathname: string }>) {
    super(
      `session has ${calls.length} call(s) with no derived operationId — re-derive or exclude them first: ` +
        calls.map((c) => `${c.method} ${c.pathname} (${c.correlationId})`).join(", "),
    );
    this.name = "UnclassifiedCallsError";
  }
}

export class UnansweredCallsError extends Error {
  constructor(
    public readonly calls: Array<{ correlationId: string; method: string; pathname: string; status: number | null }>,
  ) {
    super(
      `session has ${calls.length} call(s) with no usable response (failed, in flight or unanswered) — delete those calls in the session graph first: ` +
        calls.map((c) => `${c.method} ${c.pathname} (${c.correlationId}, status ${c.status})`).join(", "),
    );
    this.name = "UnansweredCallsError";
  }
}

export class NoReplayableCallsError extends Error {
  constructor(public readonly sessionId: string) {
    super(`session ${sessionId} has no replayable API calls (it is empty, or every call is a static asset)`);
    this.name = "NoReplayableCallsError";
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

  // status is null when no response event arrived; the recorder writes 0 for a failed request and
  // -1 for one still in flight at stop. None of those can be asserted on at replay time.
  const unanswered = calls.filter((c) => c.status === null || c.status <= 0);
  if (unanswered.length > 0) {
    throw new UnansweredCallsError(
      unanswered.map((c) => ({ correlationId: c.correlationId, method: c.method, pathname: c.pathname, status: c.status })),
    );
  }
  if (calls.length === 0) throw new NoReplayableCallsError(sessionId);

  const annotationsById =new Map(store.annotations.list().map((a) => [a.operationId, a]));

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
