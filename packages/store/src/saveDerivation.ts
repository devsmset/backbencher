import { createHash } from "node:crypto";
import type { DataflowEdge, ObservedFlow, Operation } from "@backbencher/schemas";
import type { Db } from "./dbtypes.js";
import { dataflowEdges, dependencyFacts, observedFlows, operations } from "./schema.js";

// Persist a derivation run (architecture §5.1 persist / §6.1 rules). Derivation writes ONLY
// operations / dataflow_edges / observed_flows / dependency_facts, as a full replace inside one
// transaction.

export interface DerivationInput {
  operations: Operation[];
  dataflow: DataflowEdge[];
  flows: ObservedFlow[];
  /** operationId -> input JSON paths whose values are client-generated (§5.5.6 / realignment §5). */
  clientGeneratedFields?: Record<string, string[]>;
}

function edgeId(e: DataflowEdge): string {
  return createHash("sha1")
    .update(JSON.stringify({ p: e.producer, c: e.consumer }))
    .digest("hex")
    .slice(0, 16);
}

export function saveDerivation(db: Db, input: DerivationInput): void {
  const now = Date.now();
  db.transaction((tx) => {
    tx.delete(operations).run();
    tx.delete(dataflowEdges).run();
    tx.delete(observedFlows).run();
    tx.delete(dependencyFacts).run();

    for (const op of input.operations) {
      tx.insert(operations)
        .values({
          operationId: op.operationId,
          method: op.method,
          host: op.host,
          template: op.pathTemplate.template,
          derived: JSON.stringify(op),
          lastDerivedAt: now,
        })
        .run();
    }
    for (const e of input.dataflow) {
      tx.insert(dataflowEdges)
        .values({
          id: edgeId(e),
          producerOp: e.producer.operationId,
          consumerOp: e.consumer.operationId,
          payload: JSON.stringify(e),
          evidenceCount: e.evidenceCount,
        })
        .run();
    }
    for (const f of input.flows) {
      tx.insert(observedFlows)
        .values({ flowId: f.flowId, sessionId: f.sessionId, payload: JSON.stringify(f) })
        .run();
    }
    for (const [operationId, paths] of Object.entries(input.clientGeneratedFields ?? {})) {
      tx.insert(dependencyFacts)
        .values({ operationId, clientGenerated: JSON.stringify(paths) })
        .run();
    }
  });
}
