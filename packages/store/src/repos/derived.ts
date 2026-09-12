import { type DataflowEdge, DataflowEdgeSchema, type ObservedFlow, ObservedFlowSchema, type Operation, OperationSchema } from "@backbencher/schemas";
import { eq, like, or } from "drizzle-orm";
import type { Db } from "../dbtypes.js";
import { dataflowEdges, dependencyFacts, observedFlows, operations } from "../schema.js";

// Derived-fact repositories (read side). Writes happen via saveDerivation (full-replace).

export function operationsRepo(db: Db) {
  return {
    list(q?: string): Operation[] {
      const rows = q
        ? db.select().from(operations).where(like(operations.template, `%${q}%`)).all()
        : db.select().from(operations).all();
      return rows.map((r) => OperationSchema.parse(JSON.parse(r.derived)));
    },
    get(operationId: string): Operation | null {
      const r = db.select().from(operations).where(eq(operations.operationId, operationId)).get();
      return r ? OperationSchema.parse(JSON.parse(r.derived)) : null;
    },
  };
}

export function dataflowRepo(db: Db) {
  return {
    all(): DataflowEdge[] {
      return db.select().from(dataflowEdges).all().map((r) => DataflowEdgeSchema.parse(JSON.parse(r.payload)));
    },
    forOperation(operationId: string): DataflowEdge[] {
      return db
        .select()
        .from(dataflowEdges)
        .where(or(eq(dataflowEdges.producerOp, operationId), eq(dataflowEdges.consumerOp, operationId)))
        .all()
        .map((r) => DataflowEdgeSchema.parse(JSON.parse(r.payload)));
    },
  };
}

export function flowsRepo(db: Db) {
  return {
    all(): ObservedFlow[] {
      return db.select().from(observedFlows).all().map((r) => ObservedFlowSchema.parse(JSON.parse(r.payload)));
    },
    listBySession(sessionId: string): ObservedFlow[] {
      return db
        .select()
        .from(observedFlows)
        .where(eq(observedFlows.sessionId, sessionId))
        .all()
        .map((r) => ObservedFlowSchema.parse(JSON.parse(r.payload)));
    },
    get(flowId: string): ObservedFlow | null {
      const r = db.select().from(observedFlows).where(eq(observedFlows.flowId, flowId)).get();
      return r ? ObservedFlowSchema.parse(JSON.parse(r.payload)) : null;
    },
    replaceForSession: (sessionId: string, flow: ObservedFlow): void => {
      db.delete(observedFlows).where(eq(observedFlows.sessionId, sessionId)).run();
      db.insert(observedFlows)
        .values({ flowId: flow.flowId, sessionId, payload: JSON.stringify(flow) })
        .run();
    },
  };
}

export function dependencyFactsRepo(db: Db) {
  return {
    /** operationId -> input JSON paths whose values are client-generated (realignment guide §5). */
    clientGeneratedFields(): Record<string, string[]> {
      const rows = db.select().from(dependencyFacts).all();
      const out: Record<string, string[]> = {};
      for (const r of rows) out[r.operationId] = JSON.parse(r.clientGenerated);
      return out;
    },
  };
}
