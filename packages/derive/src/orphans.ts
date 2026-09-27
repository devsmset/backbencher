import type { SessionCallEdge } from "@backbencher/schemas";

export interface OrphanedConsumer {
  consumerCorrelationId: string;
  consumerJsonPath: string;
  value: string;
}

// `value` is optional here (unlike the full SessionCallEdge) because callers that trimmed it from
// a payload for size reasons — e.g. the session graph view — still need orphan-checking to work.
type OrphanCheckEdge = Omit<SessionCallEdge, "value"> & { value?: string };

// Evaluated against the whole pending deletion set at once, not one Call at a time: two Calls that
// each cover for the other must be rejected when deleted together.
export function findOrphanedConsumers(
  edges: OrphanCheckEdge[],
  deleting: ReadonlySet<string>,
): OrphanedConsumer[] {
  const slots = new Map<string, { orphan: OrphanedConsumer; survivingProducer: boolean }>();

  for (const e of edges) {
    if (deleting.has(e.consumerCorrelationId)) continue;
    const key = `${e.consumerCorrelationId}\u0000${e.consumerJsonPath}`;
    let slot = slots.get(key);
    if (!slot) {
      slot = {
        orphan: {
          consumerCorrelationId: e.consumerCorrelationId,
          consumerJsonPath: e.consumerJsonPath,
          value: e.value ?? "",
        },
        survivingProducer: false,
      };
      slots.set(key, slot);
    }
    if (!deleting.has(e.producerCorrelationId)) slot.survivingProducer = true;
  }

  return [...slots.values()]
    .filter((s) => !s.survivingProducer)
    .map((s) => s.orphan)
    .sort((a, b) =>
      a.consumerCorrelationId.localeCompare(b.consumerCorrelationId) ||
      a.consumerJsonPath.localeCompare(b.consumerJsonPath),
    );
}

type IsolationEdge = Pick<SessionCallEdge, "producerCorrelationId" | "consumerCorrelationId">;

// Calls with no Dependency edge in or out among `nodeIds`, judged from `edges` (the links shown).
// When the Session has no edge at all among `nodeIds` it is single-level — every call stands alone —
// and nothing counts as isolated. That check uses `allEdges` (every link, before any Links filter)
// when given, so filtering out all of a Session's links makes every call isolated instead of none.
// Edges touching calls outside `nodeIds` (e.g. ones staged for deletion) are ignored.
export function findIsolatedCalls(
  nodeIds: Iterable<string>,
  edges: IsolationEdge[],
  allEdges: IsolationEdge[] = edges,
): string[] {
  const ids = [...nodeIds];
  const present = new Set(ids);
  const within = (e: IsolationEdge) => present.has(e.producerCorrelationId) && present.has(e.consumerCorrelationId);
  if (!allEdges.some(within)) return [];
  const linked = new Set<string>();
  for (const e of edges) {
    if (!within(e)) continue;
    linked.add(e.producerCorrelationId);
    linked.add(e.consumerCorrelationId);
  }
  return ids.filter((id) => !linked.has(id));
}
