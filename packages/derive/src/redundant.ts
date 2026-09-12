import { collectProducers, entropy } from "./dataflow.js";
import type { PairedCall } from "./types.js";

// A Call is redundant when every entropy-worthy value it produces was already produced by an
// earlier Call to the same Operation in the same Session: a re-fetch that told us nothing new.
// Two properties hold by construction and are relied on downstream — it never orphans a consumer
// (the covering producer is strictly earlier, so producer-before-consumer still holds), and it
// never removes an Operation from the flow (the first Call of each group is always kept).

export function findRedundantCalls(
  calls: PairedCall[],
  callOp: Map<PairedCall, string>,
): Set<string> {
  const producedBy = new Map<string, Set<string>>();
  for (const p of collectProducers(calls, callOp)) {
    if (!entropy(p.value).keep) continue;
    let set = producedBy.get(p.correlationId);
    if (!set) {
      set = new Set();
      producedBy.set(p.correlationId, set);
    }
    set.add(`${p.jsonPath}\u0000${p.value}`);
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
    const seen = new Set<string>();
    for (const call of ordered) {
      const produced = producedBy.get(call.correlationId);
      if (!produced || produced.size === 0) continue;
      let allSeen = true;
      for (const pair of produced) {
        if (!seen.has(pair)) {
          allSeen = false;
          break;
        }
      }
      if (allSeen) {
        redundant.add(call.correlationId);
        continue;
      }
      for (const pair of produced) seen.add(pair);
    }
  }

  return redundant;
}
