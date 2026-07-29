import type { ObservedFlow } from "@backbencher/schemas";
import type { PairedCall } from "./types.js";

// extractObservedFlows pass (architecture §5.6). One flow per session: the ordered call chain,
// with consecutive polling (same operation >=3x in a row) collapsed into a single repeated step.

const POLL_COLLAPSE_MIN = 3;

export function extractObservedFlow(
  sessionId: string,
  sessionCalls: PairedCall[],
  callOp: Map<PairedCall, string>,
): ObservedFlow {
  const ordered = [...sessionCalls].sort((a, b) => a.requestTimestamp - b.requestTimestamp);
  const steps: ObservedFlow["steps"] = [];

  let i = 0;
  while (i < ordered.length) {
    const call = ordered[i];
    if (!call) {
      i += 1;
      continue;
    }
    const op = callOp.get(call);
    if (!op) {
      i += 1;
      continue;
    }
    let run = 1;
    while (i + run < ordered.length && callOp.get(ordered[i + run] as PairedCall) === op) run += 1;

    const step: ObservedFlow["steps"][number] = {
      operationId: op,
      correlationId: call.correlationId,
      ...(run >= POLL_COLLAPSE_MIN ? { repeated: run } : {}),
    };
    steps.push(step);
    i += run >= POLL_COLLAPSE_MIN ? run : 1;
  }

  return { flowId: `${sessionId}:flow`, sessionId, steps };
}
