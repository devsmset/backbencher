import { type DependencyGraph, deriveDependencyGraph } from "@backbencher/derive";
import type { Store } from "@backbencher/store";

// Assembles deriveDependencyGraph's inputs from the store (realignment guide §5). Used by the
// portal's read-only dependency panel (Phase 3) and by the composition engine (Phase 5) to
// validate/auto-complete an LLM-proposed step order.
export function computeDependencyGraph(store: Store): DependencyGraph {
  const operations = store.operations.list();
  const edges = store.dataflow.all();
  const clientGeneratedFields = store.dependencyFacts.clientGeneratedFields();
  const productAreaByOperation = new Map<string, string>();
  const authOperationIds = new Set<string>();
  for (const a of store.annotations.list()) {
    if (a.productArea) productAreaByOperation.set(a.operationId, a.productArea);
    if (a.sideEffect === "auth") authOperationIds.add(a.operationId);
  }
  return deriveDependencyGraph(operations, edges, clientGeneratedFields, { productAreaByOperation, authOperationIds });
}
