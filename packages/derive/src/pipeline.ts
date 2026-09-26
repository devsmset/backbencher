import { type Operation, OperationSchema, type SessionCallEdge } from "@backbencher/schemas";
import { buildDataflowGraph } from "./dataflow.js";
import { extractObservedFlow } from "./flows.js";
import {
  deriveAuthObserved,
  deriveContentTypes,
  deriveQueryParams,
  inferRequestSchema,
  inferResponseSchemas,
} from "./inferSchemas.js";
import { pairCalls } from "./pairCalls.js";
import { findRedundantCalls } from "./redundant.js";
import { buildSessionCallGraph } from "./sessionGraph.js";
import { templatizePaths } from "./templatize.js";
import type { DerivationResult, PairedCall, RunDerivationOptions, SessionData } from "./types.js";
import { detectVolatileFields } from "./volatile.js";

// Deterministic, idempotent orchestration of every §5 pass: sessions in -> facts out. No LLM.

export function runDerivation(sessions: SessionData[], opts: RunDerivationOptions = {}): DerivationResult {
  const allCalls: PairedCall[] = sessions.flatMap((s) => pairCalls(s));
  const { operations: accums, callOp } = templatizePaths(allCalls);

  const operations: Operation[] = [];
  for (const accum of accums.values()) {
    const calls = [...accum.calls].sort((a, b) => a.requestTimestamp - b.requestTimestamp);
    const first = calls[0];
    if (!first) continue;

    const statusCodesObserved: Record<string, number> = {};
    for (const c of calls) {
      if (c.status !== null) {
        statusCodesObserved[String(c.status)] = (statusCodesObserved[String(c.status)] ?? 0) + 1;
      }
    }
    const lastSeenAt = calls.reduce((m, c) => Math.max(m, c.requestTimestamp), 0);

    const op: Operation = OperationSchema.parse({
      operationId: accum.operationId,
      method: accum.method,
      host: accum.host,
      pathTemplate: {
        template: accum.template,
        params: accum.params.map((p) => ({
          name: p.name,
          position: p.position,
          kind: p.kind,
          observedValues: p.observedValues,
        })),
      },
      observedCount: calls.length,
      statusCodesObserved,
      requestSchema: inferRequestSchema(calls),
      responseSchemas: inferResponseSchemas(calls),
      queryParams: deriveQueryParams(calls),
      authObserved: deriveAuthObserved(calls),
      contentTypes: deriveContentTypes(calls),
      exampleCorrelationIds: calls.slice(0, 5).map((c) => c.correlationId),
      firstSeenSessionId: first.sessionId,
      lastSeenAt,
      volatileResponseFields: detectVolatileFields(calls),
    });
    operations.push(op);
  }
  operations.sort((a, b) => a.operationId.localeCompare(b.operationId));

  const { edges, clientGeneratedFields } = buildDataflowGraph(allCalls, callOp, accums);

  // Catalog-level facts above are always derived from raw Calls, so curation can never shrink the
  // Catalog. Only the per-Session narrative artifacts below use the curated Call set.
  const bySession = new Map<string, PairedCall[]>();
  for (const c of allCalls) {
    const arr = bySession.get(c.sessionId);
    if (arr) arr.push(c);
    else bySession.set(c.sessionId, [c]);
  }

  const flows: DerivationResult["flows"] = [];
  const sessionGraphs: Record<string, SessionCallEdge[]> = {};
  const autoFiltered: Record<string, string[]> = {};

  for (const [sessionId, calls] of [...bySession.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const redundant = findRedundantCalls(calls, callOp, accums);
    autoFiltered[sessionId] = [...redundant].sort();

    const deleted = opts.deletedCorrelationIds?.get(sessionId);
    const excluded = new Set(redundant);
    if (deleted) for (const id of deleted) excluded.add(id);

    const curated = calls.filter((c) => !excluded.has(c.correlationId));
    flows.push(extractObservedFlow(sessionId, curated, callOp));
    sessionGraphs[sessionId] = buildSessionCallGraph(curated, callOp, accums);
  }

  return { operations, dataflow: edges, flows, clientGeneratedFields, sessionGraphs, autoFiltered };
}
