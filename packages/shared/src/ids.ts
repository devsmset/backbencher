import { ulid } from "ulid";

/** Monotonic, lexicographically sortable unique id (used for sessionId, correlationId, ...). */
export function newId(): string {
  return ulid();
}

export { ulid };
