import { collectProducers, entropy } from "./dataflow.js";
import { findOrphanedConsumers } from "./orphans.js";
import { buildSessionCallGraph } from "./sessionGraph.js";
import type { OpAccum } from "./templatize.js";
import type { PairedCall } from "./types.js";

// A later Call to an Operation is redundant when every value it produces was already produced by
// an earlier kept Call to the same Operation, or when it exchanges nothing new with a *different*
// Operation — no value it hands on to, or receives from, another Operation that an earlier kept
// Call to this one didn't already. Values nobody uses, and values only passed within the same
// Operation (a telemetry endpoint chaining its own event ids), carry no meaning for the flow. Two properties hold by construction
// and are relied on downstream — it never removes an Operation from the flow (the first Call of
// each group is always kept), and it never orphans a consumer (a repair pass restores any dropped
// Call that a kept consumer still needs, until nothing is orphaned).

const pairKey = (jsonPath: string, value: string) => `${jsonPath}\u0000${value}`;

function addTo(map: Map<string, Set<string>>, id: string, key: string): void {
  let set = map.get(id);
  if (!set) {
    set = new Set();
    map.set(id, set);
  }
  set.add(key);
}

export function findRedundantCalls(
  calls: PairedCall[],
  callOp: Map<PairedCall, string>,
  operations: Map<string, OpAccum>,
): Set<string> {
  const opById = new Map<string, string>();
  for (const c of calls) {
    const op = callOp.get(c);
    if (op) opById.set(c.correlationId, op);
  }

  const producedBy = new Map<string, Set<string>>();
  for (const p of collectProducers(calls, callOp)) {
    if (entropy(p.value).keep) addTo(producedBy, p.correlationId, pairKey(p.jsonPath, p.value));
  }

  const edges = buildSessionCallGraph(calls, callOp, operations);
  // Cross-Operation edges only, seen from both ends: what a Call hands on, and what it receives.
  const usefulBy = new Map<string, Set<string>>();
  const receivedBy = new Map<string, Set<string>>();
  for (const e of edges) {
    if (opById.get(e.producerCorrelationId) === opById.get(e.consumerCorrelationId)) continue;
    addTo(usefulBy, e.producerCorrelationId, pairKey(e.producerJsonPath, e.value));
    addTo(receivedBy, e.consumerCorrelationId, pairKey(e.consumerJsonPath, e.value));
  }

  const byOp = new Map<string, PairedCall[]>();
  for (const c of calls) {
    const op = callOp.get(c);
    if (!op) continue; // unclassified calls are never candidates
    const arr = byOp.get(op);
    if (arr) arr.push(c);
    else byOp.set(op, [c]);
  }

  const redundant = new Set<string>();
  for (const group of byOp.values()) {
    const ordered = [...group].sort(
      (a, b) => a.requestTimestamp - b.requestTimestamp || a.correlationId.localeCompare(b.correlationId),
    );
    // Only kept Calls feed `seen`: a dropped Call's unused values must not make a later Call that
    // actually hands them on look redundant.
    const seen = new Set<string>();
    const seenReceived = new Set<string>();
    ordered.forEach((call, i) => {
      const produced = [...(producedBy.get(call.correlationId) ?? [])];
      // A re-fetch that returned only what was already returned is redundant whatever it received.
      const producedNothingNew = produced.length > 0 && produced.every((pair) => seen.has(pair));
      const handsOnNew = [...(usefulBy.get(call.correlationId) ?? [])].some((pair) => !seen.has(pair));
      const receivesNew = [...(receivedBy.get(call.correlationId) ?? [])].some((pair) => !seenReceived.has(pair));
      if (i > 0 && (producedNothingNew || (!handsOnNew && !receivesNew))) {
        redundant.add(call.correlationId);
        return;
      }
      for (const pair of producedBy.get(call.correlationId) ?? []) seen.add(pair);
      for (const pair of receivedBy.get(call.correlationId) ?? []) seenReceived.add(pair);
    });
  }

  // Restoring a Call can orphan that Call's own inputs, so repeat until stable. Each round only
  // shrinks `redundant`, so this terminates.
  for (;;) {
    const orphans = findOrphanedConsumers(edges, redundant);
    if (orphans.length === 0) break;
    for (const o of orphans) {
      for (const e of edges) {
        if (
          e.consumerCorrelationId === o.consumerCorrelationId &&
          e.consumerJsonPath === o.consumerJsonPath
        ) {
          redundant.delete(e.producerCorrelationId);
        }
      }
    }
  }

  return redundant;
}
