import { LoaderCircleIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "../trpc.js";
import { Icon, Muted, Panel, QueryState } from "../ui.js";
import { MethodBadge, type OpStatus, OperationDetail, STATUS_META, StatusBadge, StatusCodes, statusOf } from "./OperationDetail.js";

// The Catalog is an annotation queue: every Operation derivation found, and how far the analyst is
// through making them Ready. Picking a row opens it beside the list, so annotating is
// Save & next through whatever still needs work rather than a round trip per Operation.

const FILTERS: (OpStatus | "all")[] = ["all", "needs", "suggested", "ready", "ignored"];
// Work first: what needs a human, then what a human should check, then what's done.
const STATUS_ORDER: Record<OpStatus, number> = { needs: 0, suggested: 1, ready: 2, ignored: 3 };

const TH = "border-b border-[--line] px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]";
const TD = "border-b border-[--line] px-3 py-2 align-middle";

function opHref(operationId: string): string {
  return `#/catalog/${encodeURIComponent(operationId)}`;
}

export function Catalog({ selectedId }: { selectedId?: string }) {
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<OpStatus | "all">("all");
  const [area, setArea] = useState("");
  const ops = trpc.operations.list.useQuery(q.trim() ? { q: q.trim() } : undefined);
  const suggest = trpc.suggest.run.useMutation({ onSuccess: () => void utils.operations.invalidate() });

  const all = useMemo(() => (ops.data ?? []).map((op) => ({ op, status: statusOf(op) })), [ops.data]);
  const counts = useMemo(() => {
    const c: Record<OpStatus | "all", number> = { all: all.length, needs: 0, suggested: 0, ready: 0, ignored: 0 };
    for (const r of all) c[r.status]++;
    return c;
  }, [all]);
  const areas = useMemo(
    () => [...new Set(all.map((r) => r.op.productArea).filter((a): a is string => Boolean(a)))].sort(),
    [all],
  );
  const rows = useMemo(
    () =>
      all
        .filter((r) => (filter === "all" || r.status === filter) && (!area || r.op.productArea === area))
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.op.pathTemplate.template.localeCompare(b.op.pathTemplate.template),
        ),
    [all, filter, area],
  );
  const byId = useMemo(() => new Map(all.map((r) => [r.op.operationId, r.op])), [all]);

  const inScope = counts.all - counts.ignored;
  const pctReady = inScope ? Math.round((counts.ready / inScope) * 100) : 0;
  const compact = Boolean(selectedId);

  const close = () => {
    window.location.hash = "#/catalog";
  };
  const openNext = () => {
    // The next row after this one that still needs a human; wraps to the top, closes when none left.
    const i = rows.findIndex((r) => r.op.operationId === selectedId);
    const ordered = [...rows.slice(i + 1), ...rows.slice(0, Math.max(i, 0))];
    const next = ordered.find((r) => r.op.operationId !== selectedId && (r.status === "needs" || r.status === "suggested"));
    window.location.hash = next ? opHref(next.op.operationId) : "#/catalog";
  };

  const opLabel = (id: string) => {
    const other = byId.get(id);
    return (
      <a href={opHref(id)} className="inline-flex items-center gap-1">
        {other ? (other.name ?? `${other.method} ${other.pathTemplate.template}`) : <code>{id}</code>}
      </a>
    );
  };

  return (
    <>
      <Panel
        title="Annotation progress"
        actions={
          <button
            type="button"
            onClick={() => suggest.mutate(undefined)}
            disabled={suggest.isPending || counts.needs === 0}
            title="Ask the model to propose names and descriptions for operations nobody has annotated. You review each one."
          >
            <Icon icon={suggest.isPending ? LoaderCircleIcon : SparklesIcon} spin={suggest.isPending} className="mr-1.5" />
            {suggest.isPending ? "Suggesting…" : "Suggest annotations"}
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="min-w-[220px] flex-1">
            <div className="mb-1.5 flex justify-between text-sm">
              <span>
                <b>{counts.ready}</b> of {inScope} operations Ready
              </span>
              <span className="text-[--muted]">{pctReady}%</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-[--chip]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={inScope}
              aria-valuenow={counts.ready}
              aria-label="Operations Ready"
            >
              <div className="h-full rounded-full bg-[--accent2] transition-[width]" style={{ width: `${pctReady}%` }} />
            </div>
          </div>
          <div className="text-xs text-[--muted]">Only Ready operations can be used by the composer.</div>
        </div>
        <div aria-live="polite" className="text-xs">
          {suggest.data && (
            <div className="mt-2 text-[--muted]">
              Suggested {suggest.data.suggested} of {suggest.data.considered} operations. Review them under{" "}
              <button type="button" className="border-0 bg-transparent p-0 text-[--accent]" onClick={() => setFilter("suggested")}>
                Suggested
              </button>
              .
            </div>
          )}
          {suggest.error && <div className="mt-2 text-[#ff8787]">{suggest.error.message}</div>}
        </div>
      </Panel>

      <div className={compact ? "grid grid-cols-[minmax(0,1fr)_minmax(420px,44%)] max-[1100px]:grid-cols-1" : ""}>
        <div className="min-w-0">
          <Panel
            title="Operations"
            actions={
              <>
                <label className="relative flex items-center">
                  <span className="sr-only">Search paths</span>
                  <Icon icon={SearchIcon} className="pointer-events-none absolute left-2.5 text-[--muted]" />
                  <input className="w-56 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search paths" />
                </label>
                {areas.length > 0 && (
                  <label>
                    <span className="sr-only">Product area</span>
                    <select value={area} onChange={(e) => setArea(e.target.value)}>
                      <option value="">All areas</option>
                      {areas.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            }
          >
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs ${filter === f ? "border-[--accent] bg-[--panel2] text-[--text]" : "text-[--muted]"}`}
                >
                  {f === "all" ? "All" : STATUS_META[f].label}
                  <span className="ml-1.5 text-[--muted]">{counts[f]}</span>
                </button>
              ))}
            </div>

            <QueryState isLoading={ops.isLoading} error={ops.error} />
            {rows.length > 0 && (
              <div className="-mx-6 overflow-x-auto max-[900px]:-mx-4">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={`${TH} w-0 pl-6 max-[900px]:pl-4`}>
                        <span className={compact ? "sr-only" : ""}>Status</span>
                      </th>
                      <th className={TH}>Operation</th>
                      {!compact && (
                        <>
                          <th className={TH}>Area</th>
                          <th className={TH}>Side effect</th>
                          <th className={`${TH} text-right`}>Calls</th>
                          <th className={`${TH} pr-6`}>Responses</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ op, status }) => {
                      const selected = op.operationId === selectedId;
                      return (
                        <tr
                          key={op.operationId}
                          onClick={() => {
                            window.location.hash = opHref(op.operationId);
                          }}
                          className={`cursor-pointer ${
                            selected ? "bg-[--panel2] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[--panel2]"
                          } ${status === "ignored" ? "opacity-60" : ""}`}
                        >
                          <td className={`${TD} pl-6 max-[900px]:pl-4`}>
                            <StatusBadge status={status} compact={compact} />
                          </td>
                          <td className={`${TD} max-w-0`}>
                            <div className="flex min-w-0 items-center gap-2">
                              <MethodBadge method={op.method} />
                              <a
                                href={opHref(op.operationId)}
                                aria-current={selected ? "true" : undefined}
                                className="truncate text-[--text] hover:no-underline"
                                title={op.pathTemplate.template}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <code>{op.pathTemplate.template}</code>
                              </a>
                            </div>
                            <div className="mt-0.5 truncate pl-[66px] text-xs">
                              {op.name ? <span>{op.name}</span> : <Muted>Unnamed</Muted>}
                              {op.does && <span className="text-[--muted]"> — {op.does}</span>}
                            </div>
                          </td>
                          {!compact && (
                            <>
                              <td className={`${TD} whitespace-nowrap`}>{op.productArea ?? <Muted>—</Muted>}</td>
                              <td className={TD}>{op.sideEffect ?? <Muted>—</Muted>}</td>
                              <td className={`${TD} text-right tabular-nums`}>{op.observedCount}</td>
                              <td className={`${TD} pr-6`}>
                                <StatusCodes codes={op.statusCodesObserved} />
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!ops.isLoading && rows.length === 0 && (
              <Muted>
                {counts.all === 0 && !q
                  ? "No operations yet. Record a session, or run `bb derive`."
                  : "No operations match these filters."}
              </Muted>
            )}
          </Panel>
        </div>

        {selectedId && (
          <aside
            aria-label="Operation details"
            className="sticky top-14 h-[calc(100vh-3.5rem)] self-start overflow-y-auto border-l border-[--line] max-[1100px]:static max-[1100px]:h-auto max-[1100px]:border-l-0 max-[1100px]:border-t"
          >
            <OperationDetail key={selectedId} operationId={selectedId} areas={areas} opLabel={opLabel} onClose={close} onSaved={(next) => next && openNext()} />
          </aside>
        )}
      </div>
    </>
  );
}
