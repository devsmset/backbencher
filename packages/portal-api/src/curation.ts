import { findOrphanedConsumers } from "@backbencher/derive";
import type { SessionCallEdge } from "@backbencher/schemas";
import { TRPCError } from "@trpc/server";

/** Enforced server-side, not only in the UI: the client's pending-set check is a convenience. */
export function assertDeletable(edges: SessionCallEdge[], correlationIds: string[]): void {
  const orphans = findOrphanedConsumers(edges, new Set(correlationIds));
  if (orphans.length === 0) return;
  const detail = orphans
    .map((o) => `${o.consumerCorrelationId} needs ${o.consumerJsonPath}`)
    .join("; ");
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `deleting these calls would leave no producer for: ${detail}`,
  });
}