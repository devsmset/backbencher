import { trpc } from "./trpc.js";

/**
 * A Session's human name for display. Ids are for machines; screens show this instead, falling back
 * to "Untitled session" while loading or when the recording was never named.
 */
export function useSessionName(sessionId: string | null | undefined): string {
  const q = trpc.sessions.get.useQuery({ sessionId: sessionId ?? "" }, { enabled: Boolean(sessionId) });
  return q.data?.name ?? "Untitled session";
}
