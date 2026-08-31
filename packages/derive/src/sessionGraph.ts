import type { SessionCallEdge } from "@backbencher/schemas";
import { collectConsumers, collectProducers, entropy } from "./dataflow.js";
import type { OpAccum } from "./templatize.js";
import type { PairedCall } from "./types.js";

// buildSessionCallGraph: single-session variant of buildDataflowGraph (dataflow.ts). Same
// join (producer value == consumer value, producer.ts < consumer.ts, entropy-gated) but keeps
// call identity (correlationId) instead of aggregating to operation level, so the session
// detail page can draw edges between the exact calls involved.
export function buildSessionCallGraph(
  calls: PairedCall[],
  callOp: Map<PairedCall, string>,
  operations: Map<string, OpAccum>,
): SessionCallEdge[] {
  const producers = collectProducers(calls, callOp);
  const consumers = collectConsumers(calls, callOp, operations);

  const prodIndex = new Map<string, typeof producers>();
  for (const p of producers) {
    const key = `${p.sessionId}\u0000${p.value}`;
    const arr = prodIndex.get(key);
    if (arr) arr.push(p);
    else prodIndex.set(key, [p]);
  }

  const seen = new Set<string>();
  const edges: SessionCallEdge[] = [];
  for (const cons of consumers) {
    const gate = entropy(cons.value);
    if (!gate.keep) continue;
    const matches = prodIndex.get(`${cons.sessionId}\u0000${cons.value}`) ?? [];
    for (const prod of matches) {
      if (prod.ts >= cons.ts) continue; // producer must precede consumer
      if (prod.correlationId === cons.correlationId) continue; // a call can't depend on itself

      const key = `${prod.correlationId}\u0000${prod.jsonPath}\u0000${cons.correlationId}\u0000${cons.jsonPath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      edges.push({
        producerCorrelationId: prod.correlationId,
        producerLocation: prod.location as "responseBody" | "responseHeader",
        producerJsonPath: prod.jsonPath,
        consumerCorrelationId: cons.correlationId,
        consumerLocation: cons.location as "path" | "query" | "requestBody" | "requestHeader",
        consumerJsonPath: cons.jsonPath,
        value: cons.value,
        confidence: gate.ok ? "strong" : "weak",
      });
    }
  }

  return edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
