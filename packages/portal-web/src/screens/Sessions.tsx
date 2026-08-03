import { useEffect, useState } from "react";
import { trpc } from "../trpc.js";
import { Chip, Field, Muted, Panel, QueryState } from "../ui.js";

function maybeParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function renderJson(value: unknown, depth = 0): JSX.Element {
  const parsed = maybeParseJson(value);
  const pad = "  ".repeat(depth);
  const nextPad = "  ".repeat(depth + 1);

  if (parsed === null) return <span className="text-[#ff9f7a]">null</span>;
  if (typeof parsed === "string") return <span className="text-[#8ce99a]">{JSON.stringify(parsed)}</span>;
  if (typeof parsed === "number") return <span className="text-[#74c0fc]">{String(parsed)}</span>;
  if (typeof parsed === "boolean") return <span className="text-[#ffd43b]">{String(parsed)}</span>;

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return <span>[]</span>;
    return (
      <>
        <span>[</span>
        {parsed.map((item, index) => (
          <div key={`${depth}-${index}`}>
            {nextPad}
            {renderJson(item, depth + 1)}
            {index < parsed.length - 1 ? <span>,</span> : null}
          </div>
        ))}
        <div>
          {pad}
          <span>]</span>
        </div>
      </>
    );
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return <span>{"{}"}</span>;
  return (
    <>
      <span>{"{"}</span>
      {entries.map(([key, entryValue], index) => (
        <div key={`${depth}-${key}`}>
          {nextPad}
          <span className="text-[#c792ea]">{JSON.stringify(key)}</span>
          <span>: </span>
          {renderJson(entryValue, depth + 1)}
          {index < entries.length - 1 ? <span>,</span> : null}
        </div>
      ))}
      <div>
        {pad}
        <span>{"}"}</span>
      </div>
    </>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <div className="overflow-x-hidden whitespace-pre-wrap break-all rounded-[10px] border border-[--line] bg-[#0a1016] p-3 font-mono text-xs leading-[1.55] text-[#dbe5ef]">
      {renderJson(value)}
    </div>
  );
}

function RecordingPanel() {
  const utils = trpc.useUtils();
  const active = trpc.sessions.activeRecordings.useQuery(undefined, { refetchInterval: 1500 });
  const [url, setUrl] = useState("");
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
      void utils.sessions.activeRecordings.invalidate();
      void utils.sessions.list.invalidate();
      const counts = Object.entries(res.summary.eventCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      setLastSummary(`Saved ${res.summary.totalEvents} events (${counts}) — now click "Derive all sessions".`);
    },
  });
  const derive = trpc.derive.run.useMutation({
    onSuccess: () => {
      void utils.sessions.list.invalidate();
      void utils.operations.list.invalidate();
    },
  });

  const recording = sessionId !== null;

  return (
    <Panel
      title="Record & derive"
      actions={
        <button
          className="rounded-lg border border-[--accent] bg-[--accent] px-2.5 py-1.5 font-semibold text-[#06121f]"
          type="button"
          onClick={() => derive.mutate()}
          disabled={derive.isPending || recording}
        >
          {derive.isPending ? "Deriving…" : "Derive all sessions"}
        </button>
      }
    >
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
          <Muted>
            Recording {sessionId} is active. Use the opened browser window, then click Stop recording.
          </Muted>
          <button
            className="rounded-lg border border-[--accent] bg-[--accent] px-2.5 py-1.5 font-semibold text-[#06121f]"
            type="button"
            onClick={() => sessionId && stop.mutate({ sessionId })}
            disabled={stop.isPending}
          >
            {stop.isPending ? "Stopping…" : "Stop recording"}
          </button>
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
      {derive.data && (
        <div className="mt-2.5">
          <div className="inline-block rounded-full border border-[#2b7a3a] bg-[#16351f] px-2 py-[1px] text-[11px] text-[#8ce99a]">
            Derived {derive.data.operations} operations, {derive.data.dataflowEdges} dataflow edges,{" "}
            {derive.data.flows} flow(s) from {derive.data.sessionsProcessed} session(s)
          </div>
        </div>
      )}
      {derive.error && (
        <div className="mt-2.5">
          <div className="inline-block rounded-full border border-[#7a4a1a] bg-[#3a2412] px-2 py-[1px] text-[11px] text-[#ffc078]">{derive.error.message}</div>
        </div>
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

interface ApiCallRow {
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
  return rows.sort((a, b) => a.ts - b.ts);
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const timeline = trpc.sessions.timeline.useQuery({ sessionId });
  const calls = buildApiCalls(timeline.data?.events ?? []);
  return (
    <>
      <Panel
        title={`Session ${sessionId}`}
        actions={<a href="#/sessions">← all sessions</a>}
      >
        <Muted>{timeline.data?.meta?.startUrl ?? ""}</Muted>
      </Panel>

      <Panel title="API calls">
        <QueryState isLoading={timeline.isLoading} error={timeline.error} />
        <div className="mb-2 text-xs text-[--muted]">{calls.length} paired request/response calls</div>
        {calls.length === 0 && <Muted>No API calls in this session.</Muted>}
        {calls.map((c) => (
          <details key={c.correlationId || `${c.ts}-${c.url}`} className="mb-2 overflow-hidden rounded-md border border-[--line]">
            <summary className="cursor-pointer px-2.5 py-2">
              <span className="mr-2 font-bold">{c.method || "?"}</span>
              <span className="mr-2 text-[--muted]">{c.url || "(missing url)"}</span>
              {c.status !== null ? <Chip>{String(c.status)}</Chip> : <Chip variant="warn">no status</Chip>}
              {c.durationMs !== null && <span className="ml-2 text-[--muted]">{c.durationMs} ms</span>}
            </summary>
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
          </details>
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
