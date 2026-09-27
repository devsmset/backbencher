/**
 * Whether a sessions.graph response changed the graph's contents — its calls or links — as opposed
 * to only, say, the saved excluded-keys list. The graph resets its view (mode, ticked calls, node
 * positions) only for a content change. React Query keeps unchanged parts of a refetched response as
 * the same objects, so identity is enough.
 */
export function graphContentChanged(
  prev: { nodes: unknown; edges: unknown } | undefined,
  next: { nodes: unknown; edges: unknown } | undefined,
): boolean {
  return prev?.nodes !== next?.nodes || prev?.edges !== next?.edges;
}
