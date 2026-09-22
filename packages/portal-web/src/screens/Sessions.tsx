import { useEffect, useRef, useState } from "react";
import { curationSummary } from "../curation.js";
import { trpc } from "../trpc.js";
import { Chip, Field, JsonBlock, Muted, Panel, QueryState } from "../ui.js";
import { SessionGraphModal } from "./SessionGraph.js";

function RecordingPanel() {
  const utils = trpc.useUtils();
  const active = trpc.sessions.activeRecordings.useQuery(undefined, { refetchInterval: 1500 });
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) return;
    const running = active.data ?? [];
    if (running.length > 0) {
      setSessionId(running[0] ?? null);
    }
  }, [active.data, sessionId]);

  const start = trpc.sessions.startRecording.useMutation({
    onSuccess: (res) => {
      setSessionId(res.sessionId);
      setLastSummary(null);
      void utils.sessions.activeRecordings.invalidate();
    },
  });
  const stop = trpc.sessions.stopRecording.useMutation({
    onSuccess: (res) => {
      setSessionId(null);
      setName("");
      setGoal("");
      void utils.sessions.activeRecordings.invalidate();
      void utils.sessions.list.invalidate();
      const counts = Object.entries(res.summary.eventCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      setLastSummary(`Saved ${res.summary.totalEvents} events (${counts}) — deriving…`);
    },
  });
  const discard = trpc.sessions.discardRecording.useMutation({
    onSuccess: () => {
      setSessionId(null);
      setName("");
      setGoal("");
      void utils.sessions.activeRecordings.invalidate();
      setLastSummary("Recording discarded — nothing saved.");
    },
  });

  const derivation = trpc.derive.status.useQuery(undefined, { refetchInterval: 1500 });

  const derivationStatus = derivation.data?.status;
  const prevStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    if (prevStatus === "running" && derivationStatus !== "running") {
      void utils.sessions.list.invalidate();
      void utils.operations.list.invalidate();
    }
    prevStatusRef.current = derivationStatus;
  }, [derivationStatus, utils]);

  const recording = sessionId !== null;

  return (
    <Panel title="Record">
      {!recording ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="URL to record">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app-url" />
          </Field>
          <button
            className="rounded-lg border border-[--accent] bg-[--accent] px-2.5 py-1.5 font-semibold text-[#06121f]"
            type="button"
            onClick={() => url.trim() && start.mutate({ url: url.trim() })}
            disabled={start.isPending || !url.trim()}
          >
            {start.isPending ? "Opening browser…" : "Start recording"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Muted>Recording {sessionId} is active. Use the opened browser window, then name it below.</Muted>
          <Field label="Session name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Create ticket from homepage" />
          </Field>
          <Field label="Goal — what were you doing, in your words?">
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="create a ticket from scratch" />
          </Field>
          <button
            className="rounded-lg border border-[--accent] bg-[--accent] px-2.5 py-1.5 font-semibold text-[#06121f]"
            type="button"
            onClick={() =>
              sessionId && stop.mutate({ sessionId, name: name.trim(), goal: goal.trim() })
            }
            disabled={stop.isPending || !name.trim() || !goal.trim()}
          >
            {stop.isPending ? "Stopping…" : "Stop & save"}
          </button>
          <button
            className="rounded-lg border border-[--border] px-2.5 py-1.5"
            type="button"
            onClick={() => sessionId && discard.mutate({ sessionId })}
            disabled={discard.isPending}
          >
            {discard.isPending ? "Discarding…" : "Discard"}
          </button>
          <Muted>A session is only saved once it has a name and a goal — they teach the composer.</Muted>
        </div>
      )}
      {(active.data?.length ?? 0) > 1 && (
        <div className="mt-2.5">
          <div className="inline-block rounded-full border border-[#7a4a1a] bg-[#3a2412] px-2 py-[1px] text-[11px] text-[#ffc078]">
            Multiple active recordings detected. Showing stop control for the first one.
          </div>
        </div>
      )}
      {start.error && (
        <div className="mt-2.5">
          <div className="inline-block rounded-full border border-[#7a4a1a] bg-[#3a2412] px-2 py-[1px] text-[11px] text-[#ffc078]">{start.error.message}</div>
        </div>
      )}
      {stop.error && (
        <div className="mt-2.5">
          <div className="inline-block rounded-full border border-[#7a4a1a] bg-[#3a2412] px-2 py-[1px] text-[11px] text-[#ffc078]">{stop.error.message}</div>
        </div>
      )}
      {lastSummary && (
        <div className="mt-2.5">
          <div className="inline-block rounded-full border border-[#2b7a3a] bg-[#16351f] px-2 py-[1px] text-[11px] text-[#8ce99a]">{lastSummary}</div>
        </div>
      )}
      {derivation.data?.status === "running" && <Muted>Deriving…</Muted>}
      {derivation.data?.status === "failed" && (
        <Muted>Derivation failed: {derivation.data.error}</Muted>
      )}
    </Panel>
  );
}

export function SessionsList() {
  const sessions = trpc.sessions.list.useQuery();
  return (
    <>
      <RecordingPanel />
      <Panel title="Sessions">
        <QueryState isLoading={sessions.isLoading} error={sessions.error} />
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Session</th>
              <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Started</th>
              <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Auth profile</th>
              <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]" />
            </tr>
          </thead>
          <tbody>
            {(sessions.data ?? []).map((s) => (
              <tr key={s.sessionId} className="hover:bg-[--panel2]">
                <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                  <a href={`#/sessions/${s.sessionId}`}>{s.name ?? s.sessionId}</a>
                </td>
                <td className="border-b border-[--line] px-2.5 py-[7px] align-top">{new Date(s.startedAt).toLocaleString()}</td>
                <td className="border-b border-[--line] px-2.5 py-[7px] align-top">{s.authProfile ? <Chip variant="human">{s.authProfile}</Chip> : <Muted>—</Muted>}</td>
                <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                  <a href={`#/sessions/${s.sessionId}`}>calls →</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessions.data?.length === 0 && <Muted>No sessions yet. Record one above, or run `bb record`.</Muted>}
      </Panel>
    </>
  );
}

export interface ApiCallRow {
  correlationId: string;
  ts: number;
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  reqHeaders: Record<string, string>;
  reqBody: string | null;
  resHeaders: Record<string, string>;
  resBody: unknown;
  bodyKind: string | null;
}

const ASSET_PATH_RE = /\.(?:svg|woff2?|ttf|otf|eot|ico|png|jpe?g|gif|webp|avif)(?:$|[?#])/i;
const DROPPED_CONTENT_PREFIXES = ["image/", "font/", "text/css", "text/javascript"];

function headerValue(headers: Record<string, string>, name: string): string {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return "";
}

function isAssetLikeCall(call: ApiCallRow): boolean {
  const responseContentType = headerValue(call.resHeaders, "content-type").toLowerCase();
  const requestContentType = headerValue(call.reqHeaders, "content-type").toLowerCase();
  if (DROPPED_CONTENT_PREFIXES.some((prefix) => responseContentType.startsWith(prefix))) {
    return true;
  }
  if (DROPPED_CONTENT_PREFIXES.some((prefix) => requestContentType.startsWith(prefix))) {
    return true;
  }
  try {
    return ASSET_PATH_RE.test(new URL(call.url).pathname);
  } catch {
    return ASSET_PATH_RE.test(call.url);
  }
}

function buildApiCalls(events: unknown[]): ApiCallRow[] {
  const req = new Map<string, {
    correlationId: string;
    ts: number;
    method: string;
    url: string;
    headers: Record<string, string>;
    postData: string | null;
  }>();
  const rows: ApiCallRow[] = [];

  for (const e of events as Array<Record<string, unknown>>) {
    if (e.type === "api_request") {
      const correlationId = typeof e.correlationId === "string" ? e.correlationId : "";
      if (!correlationId) continue;
      req.set(correlationId, {
        correlationId,
        ts: typeof e.timestamp === "number" ? e.timestamp : 0,
        method: typeof e.method === "string" ? e.method : "",
        url: typeof e.url === "string" ? e.url : "",
        headers: (e.headers as Record<string, string> | undefined) ?? {},
        postData: typeof e.postData === "string" ? e.postData : null,
      });
      continue;
    }
    if (e.type !== "api_response") continue;
    const correlationId = typeof e.correlationId === "string" ? e.correlationId : "";
    const q = req.get(correlationId);
    const timing = (e.timing as { requestStart?: number; responseEnd?: number } | undefined) ?? undefined;
    const durationMs =
      typeof timing?.requestStart === "number" && typeof timing.responseEnd === "number"
        ? Math.max(0, timing.responseEnd - timing.requestStart)
        : null;
    rows.push({
      correlationId,
      ts: q?.ts ?? (typeof e.timestamp === "number" ? e.timestamp : 0),
      method: q?.method ?? "",
      url: q?.url ?? "",
      status: typeof e.status === "number" ? e.status : null,
      durationMs,
      reqHeaders: q?.headers ?? {},
      reqBody: q?.postData ?? null,
      resHeaders: (e.headers as Record<string, string> | undefined) ?? {},
      resBody: e.body ?? null,
      bodyKind: typeof e.bodyKind === "string" ? e.bodyKind : null,
    });
  }
  return rows.filter((row) => !isAssetLikeCall(row)).sort((a, b) => a.ts - b.ts);
}

// <details> only hides its content visually (display:none) — React still mounts whatever's
// inside, open or not. Bodies are captured verbatim and uncapped (ADR-0006), so an outlier call
// can carry a multi-megabyte JSON body; JsonBlock renders one React element per key/array-item/
// scalar, so a single such body can blow up into hundreds of thousands of elements. Gating the
// request/response panel on the details' own open state means that cost is only ever paid for a
// call the analyst actually expands, not for every call in the session on every page load.
export function CallRow({ call: c }: { call: ApiCallRow }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      key={c.correlationId || `${c.ts}-${c.url}`}
      className="mb-2 overflow-hidden rounded-md border border-[--line]"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer px-2.5 py-2">
        <span className="mr-2 font-bold">{c.method || "?"}</span>
        <span className="mr-2 text-[--muted]">{c.url || "(missing url)"}</span>
        {c.status !== null ? <Chip>{String(c.status)}</Chip> : <Chip variant="warn">no status</Chip>}
        {c.durationMs !== null && <span className="ml-2 text-[--muted]">{c.durationMs} ms</span>}
      </summary>
      {open && (
        <div className="flex flex-col gap-3 border-t border-[--line] p-3">
          <div>
            <h4>Request</h4>
            <JsonBlock value={{ headers: c.reqHeaders, body: c.reqBody }} />
          </div>
          <div>
            <h4>Response</h4>
            <JsonBlock value={{ bodyKind: c.bodyKind, headers: c.resHeaders, body: c.resBody }} />
          </div>
        </div>
      )}
    </details>
  );
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();
  const timeline = trpc.sessions.timeline.useQuery({ sessionId });
  const curation = trpc.sessions.curation.useQuery({ sessionId });
  const setUseAsReference = trpc.sessions.setUseAsReference.useMutation({
    onSuccess: () => {
      void utils.sessions.curation.invalidate({ sessionId });
    },
  });
  const calls = buildApiCalls(timeline.data?.events ?? []);
  const [graphOpen, setGraphOpen] = useState(false);
  return (
    <>
      <Panel
        title={`Session ${sessionId}`}
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-[--border] px-2.5 py-1.5"
              onClick={() => setGraphOpen(true)}
            >
              View dependency graph
            </button>
            <a href="#/sessions">← all sessions</a>
          </div>
        }
      >
        <Muted>{timeline.data?.meta?.startUrl ?? ""}</Muted>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={curation.data?.useAsReference ?? false}
              disabled={!curation.data || setUseAsReference.isPending}
              onChange={(e) => setUseAsReference.mutate({ sessionId, useAsReference: e.target.checked })}
            />
            Use as reference for composing
          </label>
          {curation.data && <Muted>{curationSummary(curation.data)}</Muted>}
        </div>
        <QueryState isLoading={curation.isLoading} error={curation.error} />
        {setUseAsReference.error && (
          <div className="mt-1 text-xs text-[--bad]">{setUseAsReference.error.message}</div>
        )}
      </Panel>

      {graphOpen && <SessionGraphModal sessionId={sessionId} onClose={() => setGraphOpen(false)} />}

      <Panel title="API calls">
        <QueryState isLoading={timeline.isLoading} error={timeline.error} />
        <div className="mb-2 text-xs text-[--muted]">{calls.length} paired request/response calls</div>
        {calls.length === 0 && <Muted>No API calls in this session.</Muted>}
        {calls.map((c) => (
          <CallRow key={c.correlationId || `${c.ts}-${c.url}`} call={c} />
        ))}
      </Panel>

      <Panel title="Compose next">
        <Muted>
          Name/annotate key endpoints in Catalog, then use Compose to draft a new scenario from a free-text goal.
        </Muted>
        <div className="mt-2">
          <a href="#/compose">Open Compose →</a>
        </div>
      </Panel>
    </>
  );
}
