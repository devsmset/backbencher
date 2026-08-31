import type { RecordingEvent, RecordingMeta } from "@backbencher/schemas";
import type { SessionData } from "../src/types.js";

// Synthetic fixtures for the derivation pipeline (architecture §8 Phase 3). Values are fake.

let clock = 1_700_000_000_000;
export function resetClock(v = 1_700_000_000_000): void {
  clock = v;
}
function tick(): number {
  clock += 1000;
  return clock;
}

export interface CallSpec {
  method?: string;
  url: string;
  reqHeaders?: Record<string, string>;
  postData?: string | null;
  status?: number;
  resHeaders?: Record<string, string>;
  body?: unknown;
  bodyKind?: "json" | "text" | "empty" | "unavailable" | "binary";
}

export function apiCall(correlationId: string, spec: CallSpec): RecordingEvent[] {
  const req: RecordingEvent = {
    type: "api_request",
    correlationId,
    timestamp: tick(),
    method: spec.method ?? "GET",
    url: spec.url,
    resourceType: "xhr",
    headers: spec.reqHeaders ?? {},
    headersSource: "all",
    postData: spec.postData ?? null,
    pageLabel: "main",
  };
  const res: RecordingEvent = {
    type: "api_response",
    correlationId,
    timestamp: tick(),
    status: spec.status ?? 200,
    headers: spec.resHeaders ?? { "content-type": "application/json" },
    bodyKind: spec.bodyKind ?? (spec.body === undefined ? "empty" : "json"),
    body: spec.body ?? null,
  };
  return [req, res];
}

export function makeSession(
  sessionId: string,
  events: RecordingEvent[],
  startUrl = "https://app.example.net/",
): SessionData {
  const meta: RecordingMeta = {
    version: 4,
    sessionId,
    startUrl,
    startedAt: 1_700_000_000_000,
    userAgent: "test",
    recorderVersion: "test",
  };
  return { meta, events };
}

const H = "https://app.example.net";

export function templatizeFixture(): SessionData {
  resetClock();
  const uuid1 = "11111111-1111-1111-1111-111111111111";
  const uuid2 = "22222222-2222-2222-2222-222222222222";
  return makeSession("sess-templatize", [
    ...apiCall("c1", { url: `${H}/api/invoices/${uuid1}`, body: { id: uuid1, total: 100 } }),
    ...apiCall("c2", { url: `${H}/api/invoices/${uuid2}`, body: { id: uuid2, total: 200 } }),
    // slug ids that regex misses, caught by id-ish corroboration (value appears in response body)
    ...apiCall("c3", { url: `${H}/api/reports/invoice-2024-q1`, body: { ref: "invoice-2024-q1", rows: 5 } }),
    ...apiCall("c4", { url: `${H}/api/reports/invoice-2024-q2`, body: { ref: "invoice-2024-q2", rows: 6 } }),
  ]);
}

export function dataflowFixture(): SessionData {
  resetClock();
  const ticket = "ABC123DEF456GHI"; // length 15 → high entropy
  return makeSession("sess-dataflow", [
    ...apiCall("d1", { url: `${H}/auth/token`, body: { ticket } }),
    ...apiCall("d2", { url: `${H}/api/things?ref=${ticket}`, body: { ok: true } }),
  ]);
}

// A legitimate identifier that happens to contain the substring "REDACTED". The old isRedacted()
// guard dropped any such value, severing a real edge.
export function literalRedactedFixture(): SessionData {
  resetClock();
  const sid = "REDACTED-SESSION-9f8e7d6c";
  return makeSession("sess-literal-redacted", [
    ...apiCall("lr1", { url: `${H}/auth/session`, body: { sid } }),
    ...apiCall("lr2", { url: `${H}/api/things?sid=${sid}`, body: { ok: true } }),
  ]);
}

export function volatileFixture(): SessionData {
  resetClock();
  return makeSession("sess-volatile", [
    ...apiCall("v1", { url: `${H}/api/profile`, body: { id: "u1", updatedAt: 1000 } }),
    ...apiCall("v2", { url: `${H}/api/profile`, body: { id: "u1", updatedAt: 2000 } }),
  ]);
}

export function ssoFixture(): SessionData {
  resetClock();
  return makeSession("sess-sso", [
    ...apiCall("s1", { url: `${H}/bo/userProfile`, status: 401, bodyKind: "empty" }),
    ...apiCall("s2", {
      method: "POST",
      url: `${H}/idm/login`,
      postData: JSON.stringify({ user: "suite-admin" }),
      body: { ok: true },
    }),
    // polling: same endpoint 3x consecutively → collapsed to one repeated step
    ...apiCall("s3", { url: `${H}/api/jobs/status`, body: { state: "pending" } }),
    ...apiCall("s4", { url: `${H}/api/jobs/status`, body: { state: "pending" } }),
    ...apiCall("s5", { url: `${H}/api/jobs/status`, body: { state: "done" } }),
  ]);
}

// Login + a bearer-authenticated write endpoint — for deriveDependencyGraph's auth-token
// detection (realignment guide §5.2). The write call's Authorization header is deliberately
// NOT wired up as a dataflow producer/consumer edge (dataflow.ts treats "authorization" as a
// standard, skipped header — see dependencies.ts's doc comment), so this exercises the
// authObserved-based fallback path, not the catalogEdge path.
export function authFixture(): SessionData {
  resetClock();
  const token = "eyJhbGciOiJIUzI1NiJ9.XYZ789ABC123DEF";
  return makeSession("sess-auth", [
    ...apiCall("a1", {
      method: "POST",
      url: `${H}/auth/login`,
      postData: JSON.stringify({ user: "suite-admin" }),
      body: { token },
    }),
    ...apiCall("a2", {
      method: "POST",
      url: `${H}/api/tickets`,
      reqHeaders: { authorization: `Bearer ${token}` },
      postData: JSON.stringify({ title: "New ticket" }),
      body: { id: "t1" },
    }),
  ]);
}
