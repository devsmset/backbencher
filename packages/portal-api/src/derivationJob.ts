import { join } from "node:path";
import { loadAllSessions, runDerivation, writeCuratedEvents } from "@backbencher/derive";
import { childLogger, dataDir } from "@backbencher/shared";
import type { Store } from "@backbencher/store";

// Derivation always runs over every Session: path-template inference needs the whole corpus, and
// saveDerivation full-replaces the derived tables. Triggered by stopping a recording, never by a
// page load. State is in-process; a server restart mid-run is recovered with `bb derive`.

const log = childLogger({ mod: "portal-api" });

interface DerivationJobDeps {
  loadAllSessions: typeof loadAllSessions;
  runDerivation: typeof runDerivation;
  writeCuratedEvents: typeof writeCuratedEvents;
  logError: (err: unknown) => void;
}

const defaultDerivationJobDeps: DerivationJobDeps = {
  loadAllSessions,
  runDerivation,
  writeCuratedEvents,
  logError: (err) => log.error({ err }, "derivation failed"),
};

export interface DerivationSummary {
  sessionsProcessed: number;
  operations: number;
  dataflowEdges: number;
  flows: number;
  callsFiltered: number;
}

export type DerivationState =
  | { status: "idle"; lastFinishedAt?: number; lastResult?: DerivationSummary }
  | { status: "running"; startedAt: number }
  | { status: "failed"; failedAt: number; error: string };

let state: DerivationState = { status: "idle" };
let inFlight: Promise<void> | null = null;
let rerunQueued = false;

export function derivationState(): DerivationState {
  return state;
}

/** Resolves once no derivation is running or queued. Test helper and shutdown hook. */
export async function waitForDerivationIdle(): Promise<void> {
  while (inFlight) await inFlight;
}

function deriveOnce(store: Store, actor: string, deps: DerivationJobDeps): DerivationSummary {
  const sessions = deps.loadAllSessions();
  const result = deps.runDerivation(sessions, { deletedCorrelationIds: store.sessionCuration.deletionMap() });

  let callsFiltered = 0;
  for (const s of sessions) {
    const excluded = new Set(result.autoFiltered[s.meta.sessionId] ?? []);
    for (const id of store.sessionCuration.get(s.meta.sessionId)?.deletedCorrelationIds ?? []) excluded.add(id);
    callsFiltered += excluded.size;
    deps.writeCuratedEvents(join(dataDir(), "sessions", s.meta.sessionId), s, excluded);
  }

  for (const s of sessions) store.sessions.upsertFromMeta(s.meta);
  store.saveDerivation(result);

  store.audit.append({
    entityType: "derivation",
    entityId: "all",
    action: "derive",
    actor,
    diff: { sessions: sessions.length, operations: result.operations.length, callsFiltered },
  });

  return {
    sessionsProcessed: sessions.length,
    operations: result.operations.length,
    dataflowEdges: result.dataflow.length,
    flows: result.flows.length,
    callsFiltered,
  };
}

/** Fire-and-forget. Never throws to the caller; failures land in the state. */
export function runDerivationJob(store: Store, actor: string, depsOverrides?: Partial<DerivationJobDeps>): void {
  if (inFlight) {
    rerunQueued = true; // repeated requests collapse into one follow-up: the pass covers everything
    return;
  }
  const deps: DerivationJobDeps = { ...defaultDerivationJobDeps, ...depsOverrides };
  state = { status: "running", startedAt: Date.now() };
  let promise: Promise<void>;
  // setImmediate, not a microtask: derivation is synchronous and CPU-bound, and a microtask would
  // run before the calling mutation's own continuation — i.e. before its response is flushed.
  promise = new Promise<void>((resolve) => {
    setImmediate(resolve);
  })
    .then(() => {
      let summary = deriveOnce(store, actor, deps);
      while (rerunQueued) {
        rerunQueued = false;
        summary = deriveOnce(store, actor, deps);
      }
      state = { status: "idle", lastFinishedAt: Date.now(), lastResult: summary };
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      deps.logError(err);
      state = { status: "failed", failedAt: Date.now(), error };
    })
    .finally(() => {
      if (inFlight === promise) inFlight = null;
      rerunQueued = false;
    });
  inFlight = promise;
}