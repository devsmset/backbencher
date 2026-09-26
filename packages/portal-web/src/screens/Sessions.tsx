import { ArrowLeftIcon, ArrowRightIcon, ChevronRightIcon, CircleCheckIcon, LoaderCircleIcon, PlayIcon, SquareIcon, Trash2Icon, VideoIcon, WorkflowIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { curationSummary } from "../curation.js";
import { trpc } from "../trpc.js";
import { useSessionName } from "../sessionName.js";
import { Chip, Dialog, Field, Icon, JsonBlock, Muted, Panel, QueryState } from "../ui.js";
import { SessionGraphModal } from "./SessionGraph.js";

const PRIMARY_BUTTON = "rounded-lg border border-[--accent] bg-[--accent] px-3 py-1.5 font-semibold text-[#06121f]";

// The whole recording lifecycle lives in one dialog: details → recording → stopped. It closes itself
// once the recording is saved or discarded, handing a one-line outcome back to the list.
function RecordingDialog({
  activeId,
  otherActive,
  onClose,
}: {
  activeId: string | null;
  otherActive: number;
  onClose: (outcome: { sessionId: string | null; message: string | null }) => void;
}) {
  const utils = trpc.useUtils();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(activeId);

  const start = trpc.sessions.startRecording.useMutation({
    onSuccess: (res) => {
      setSessionId(res.sessionId);
      void utils.sessions.activeRecordings.invalidate();
    },
  });
  const stop = trpc.sessions.stopRecording.useMutation({
    onSuccess: (res) => {
      void utils.sessions.activeRecordings.invalidate();
      void utils.sessions.list.invalidate();
      const counts = Object.entries(res.summary.eventCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      onClose({ sessionId, message: `Saved “${name.trim()}”: ${res.summary.totalEvents} events (${counts}).` });
    },
  });
  const discard = trpc.sessions.discardRecording.useMutation({
    onSuccess: () => {
      void utils.sessions.activeRecordings.invalidate();
      onClose({ sessionId, message: "Recording discarded — nothing saved." });
    },
  });

  const recording = sessionId !== null;
  const canSave = Boolean(name.trim() && goal.trim());
  const error = start.error ?? stop.error ?? discard.error;

  return (
    <Dialog
      title={recording ? "Recording session" : "New recording"}
      dismissable={!recording}
      onClose={() => onClose({ sessionId: null, message: null })}
      footer={
        recording ? (
          <>
            <button type="button" className="mr-auto" onClick={() => sessionId && discard.mutate({ sessionId })} disabled={discard.isPending || stop.isPending}>
              <Icon icon={discard.isPending ? LoaderCircleIcon : Trash2Icon} spin={discard.isPending} className="mr-1.5" />
              {discard.isPending ? "Discarding…" : "Discard"}
            </button>
            <button type="submit" form="recording-form" className={PRIMARY_BUTTON} disabled={stop.isPending || !canSave}>
              <Icon icon={stop.isPending ? LoaderCircleIcon : SquareIcon} spin={stop.isPending} className="mr-1.5" />
              {stop.isPending ? "Saving…" : "Stop & save"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onClose({ sessionId: null, message: null })}>
              Cancel
            </button>
            <button type="submit" form="recording-form" className={PRIMARY_BUTTON} disabled={start.isPending || !url.trim()}>
              <Icon icon={start.isPending ? LoaderCircleIcon : PlayIcon} spin={start.isPending} className="mr-1.5" />
              {start.isPending ? "Opening browser…" : "Start recording"}
            </button>
          </>
        )
      }
    >
      <form
        id="recording-form"
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (!recording) {
            if (url.trim()) start.mutate({ url: url.trim() });
          } else if (canSave) {
            stop.mutate({ sessionId, name: name.trim(), goal: goal.trim() });
          }
        }}
      >
        {recording ? (
          <div role="status" className="mb-3.5 flex items-center gap-2.5 rounded-lg border border-[#8a2b2b] bg-[#2a1416] px-3 py-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b] motion-safe:animate-pulse" />
            <span>
              <b>Recording</b> <Muted>— use the browser window that opened, then stop here.</Muted>
            </span>
          </div>
        ) : (
          <Field label="URL to record">
            {/* biome-ignore lint/a11y/noAutofocus: first field of a just-opened dialog */}
            <input autoFocus inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app-url" />
          </Field>
        )}
        <Field label="Session name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Create ticket from homepage" />
        </Field>
        <Field label="Goal — what are you doing, in your words?">
          <textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="create a ticket from scratch" />
        </Field>
        <Muted>
          <span className="text-xs">
            {recording ? "Name and goal are required to save — they teach the composer." : "Name and goal can also be filled in while you record."}
          </span>
        </Muted>
        {otherActive > 0 && (
          <div className="mt-2.5 text-xs text-[#ffc078]">
            {otherActive} other active {otherActive === 1 ? "recording" : "recordings"} detected; this dialog controls
            one of them.
          </div>
        )}
        <div aria-live="polite">{error && <div className="mt-2.5 text-[#ff8787]">{error.message}</div>}</div>
      </form>
    </Dialog>
  );
}

export function SessionsList() {
  const utils = trpc.useUtils();
  const sessions = trpc.sessions.list.useQuery();
  const active = trpc.sessions.activeRecordings.useQuery(undefined, { refetchInterval: 1500 });
  const derivation = trpc.derive.status.useQuery(undefined, { refetchInterval: 1500 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  // Recordings this page has already finished. activeRecordings lags a poll behind a stop, so
  // without this a just-stopped session would reopen the dialog.
  const finished = useRef(new Set<string>());

  const activeIds = (active.data ?? []).filter((id) => !finished.current.has(id));
  const activeId = activeIds[0] ?? null;

  useEffect(() => {
    // A live recording (e.g. after a reload) can only be stopped from the dialog, so reopen it.
    if (activeId && !dialogOpen) setDialogOpen(true);
  }, [activeId, dialogOpen]);

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

  return (
    <>
      {dialogOpen && (
        <RecordingDialog
          activeId={activeId}
          otherActive={Math.max(0, activeIds.length - 1)}
          onClose={({ sessionId, message }) => {
            if (sessionId) finished.current.add(sessionId);
            setDialogOpen(false);
            if (message) setOutcome(message);
          }}
        />
      )}
      <Panel
        title="Sessions"
        actions={
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => {
              setOutcome(null);
              setDialogOpen(true);
            }}
          >
            <Icon icon={VideoIcon} className="mr-1.5" />
            New recording
          </button>
        }
      >
        {(outcome || derivationStatus === "running" || derivationStatus === "failed") && (
          <div role="status" className="mb-3 flex flex-wrap gap-x-3 text-[--muted]">
            {outcome && (
              <span className="text-[#8ce99a]">
                <Icon icon={CircleCheckIcon} className="mr-1.5" />
                {outcome}
              </span>
            )}
            {derivationStatus === "running" && (
              <span>
                <Icon icon={LoaderCircleIcon} spin className="mr-1.5" />
                Deriving operations…
              </span>
            )}
            {derivationStatus === "failed" && derivation.data?.status === "failed" && (
              <span className="text-[#ff8787]">Derivation failed: {derivation.data.error}</span>
            )}
          </div>
        )}
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
                  <a href={`#/sessions/${s.sessionId}`}>{s.name ?? "Untitled session"}</a>
                </td>
                <td className="border-b border-[--line] px-2.5 py-[7px] align-top">{new Date(s.startedAt).toLocaleString()}</td>
                <td className="border-b border-[--line] px-2.5 py-[7px] align-top">{s.authProfile ? <Chip variant="human">{s.authProfile}</Chip> : <Muted>—</Muted>}</td>
                <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                  <a href={`#/sessions/${s.sessionId}`}>
                    calls
                    <Icon icon={ChevronRightIcon} className="ml-1.5" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessions.data?.length === 0 && <Muted>No sessions yet. Start a new recording, or run `bb record`.</Muted>}
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
  const sessionName = useSessionName(sessionId);
  return (
    <>
      <Panel
        title={sessionName}
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-[--border] px-2.5 py-1.5"
              onClick={() => setGraphOpen(true)}
            >
              <Icon icon={WorkflowIcon} className="mr-1.5" />
              View dependency graph
            </button>
            <a href="#/sessions">
              <Icon icon={ArrowLeftIcon} className="mr-1.5" />
              all sessions
            </a>
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
          <a href="#/compose">
            Open Compose
            <Icon icon={ArrowRightIcon} className="ml-1.5" />
          </a>
        </div>
      </Panel>
    </>
  );
}
