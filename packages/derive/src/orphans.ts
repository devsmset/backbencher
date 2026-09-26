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

// Calls with no Dependency edge in or out among `nodeIds`. When no edge survives at all the
// Session is single-level — every call stands alone — and nothing counts as isolated. Edges
// touching calls outside `nodeIds` (e.g. ones staged for deletion) are ignored.
export function findIsolatedCalls(
  nodeIds: Iterable<string>,
  edges: Pick<SessionCallEdge, "producerCorrelationId" | "consumerCorrelationId">[],
): string[] {
  const ids = [...nodeIds];
  const present = new Set(ids);
  const linked = new Set<string>();
  for (const e of edges) {
    if (!present.has(e.producerCorrelationId) || !present.has(e.consumerCorrelationId)) continue;
    linked.add(e.producerCorrelationId);
    linked.add(e.consumerCorrelationId);
  }
  if (linked.size === 0) return [];
  return ids.filter((id) => !linked.has(id));
}
