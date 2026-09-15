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
