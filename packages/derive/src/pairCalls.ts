import type { PairedCall, SessionData } from "./types.js";

// pairCalls + normalize pass (architecture §5.1 / realignment §3). Joins api_request/api_response
// by correlationId and parses the URL. Sessions are pure API-call sequences — no UI intent to
// attach.

function parseBody(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function pairCalls(session: SessionData): PairedCall[] {
  const sessionId = session.meta.sessionId;
  const responses = new Map<string, Extract<(typeof session.events)[number], { type: "api_response" }>>();
  for (const e of session.events) {
    if (e.type === "api_response") responses.set(e.correlationId, e);
  }

  const calls: PairedCall[] = [];
  for (const req of session.events) {
    if (req.type !== "api_request") continue;
    const res = responses.get(req.correlationId) ?? null;

    let host = "";
    let pathname = "";
    let segments: string[] = [];
    let query: Array<[string, string]> = [];
    try {
      const u = new URL(req.url);
      host = u.host;
      pathname = u.pathname;
      segments = pathname.split("/").filter((s) => s.length > 0);
      query = [...u.searchParams.entries()];
    } catch {
      // unparseable URL — skip enrichment, keep raw
    }

    calls.push({
      sessionId,
      correlationId: req.correlationId,
      method: req.method,
      host,
      pathname,
      segments,
      query,
      requestHeaders: req.headers,
      requestContentType: req.headers["content-type"],
      requestBody: parseBody(req.postData),
      status: res ? res.status : null,
      responseHeaders: res ? res.headers : {},
      responseContentType: res ? res.headers["content-type"] : undefined,
      responseBody: res ? res.body : null,
      responseBodyKind: res ? res.bodyKind : null,
      requestTimestamp: req.timestamp,
      responseTimestamp: res ? res.timestamp : null,
    });
  }

  return calls.sort((a, b) => a.requestTimestamp - b.requestTimestamp);
}
