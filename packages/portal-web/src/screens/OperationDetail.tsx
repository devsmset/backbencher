import type { SideEffect } from "@backbencher/schemas";
import {
  ArrowRightIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  type LucideIcon,
  SaveIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { trpc } from "../trpc.js";
import { useSessionName } from "../sessionName.js";
import { Chip, Icon, JsonBlock, Muted, Panel, QueryState } from "../ui.js";

// One Operation, side by side with the catalog list: what a human says about it (the
// CatalogAnnotation that makes it Ready, and optional testing notes) above what derivation observed.

// ---- Shared with the catalog list ---------------------------------------------------------------

/**
 * The one status an analyst needs per Operation. `reviewState` is recomputed by the store from the
 * annotation (see catalogReviewStateFor), so "ready" can't be set by hand — only ignored/restored.
 */
export type OpStatus = "needs" | "suggested" | "ready" | "ignored";

export function statusOf(op: { reviewState: string; suggested: boolean }): OpStatus {
  if (op.reviewState === "ignored") return "ignored";
  if (op.suggested) return "suggested";
  return op.reviewState === "ready" ? "ready" : "needs";
}

export const STATUS_META: Record<OpStatus, { label: string; icon: LucideIcon; className: string }> = {
  needs: { label: "Needs annotation", icon: CircleDashedIcon, className: "text-[#ffc078]" },
  suggested: { label: "Suggested", icon: SparklesIcon, className: "text-[--accent]" },
  ready: { label: "Ready", icon: CircleCheckIcon, className: "text-[#8ce99a]" },
  ignored: { label: "Ignored", icon: EyeOffIcon, className: "text-[--muted]" },
};

export function StatusBadge({ status, compact = false }: { status: OpStatus; compact?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${meta.className}`} title={meta.label}>
      <Icon icon={meta.icon} className="h-3.5 w-3.5" />
      {compact ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}

const METHOD_CLASS: Record<string, string> = {
  GET: "text-[#74c0fc] border-[#1f4a6e]",
  POST: "text-[#8ce99a] border-[#2b7a3a]",
  PUT: "text-[#ffc078] border-[#7a4a1a]",
  PATCH: "text-[#ffc078] border-[#7a4a1a]",
  DELETE: "text-[#ff8787] border-[#8a2b2b]",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-block w-[58px] shrink-0 rounded border px-1 text-center font-mono text-[11px] font-semibold ${
        METHOD_CLASS[method] ?? "border-[--line] text-[--muted]"
      }`}
    >
      {method}
    </span>
  );
}

export function StatusCodes({ codes, withCounts = false }: { codes: Record<string, number>; withCounts?: boolean }) {
  const cls = (code: string) =>
    code.startsWith("2") ? "text-[#8ce99a]" : code.startsWith("4") ? "text-[#ffc078]" : code.startsWith("5") ? "text-[#ff8787]" : "text-[--muted]";
  return (
    <span className="inline-flex flex-wrap gap-x-2 font-mono text-xs">
      {Object.entries(codes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, n]) => (
          <span key={code} className={cls(code)}>
            {code}
            {withCounts && <span className="text-[--muted]">×{n}</span>}
          </span>
        ))}
    </span>
  );
}

// ---- The panel ----------------------------------------------------------------------------------

const SIDE_EFFECTS: SideEffect[] = ["read", "create", "update", "delete", "auth", "unknown"];
const PRIMARY_BUTTON = "rounded-lg border border-[--accent] bg-[--accent] px-3 py-1.5 font-semibold text-[#06121f]";

interface AnnotationForm {
  name: string;
  does: string;
  productArea: string;
  sideEffect: SideEffect | "";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">{title}</h4>
      {children}
    </div>
  );
}

function Fold({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <details className="border-t border-[--line] py-2.5 first:border-t-0">
      <summary className="cursor-pointer text-sm">{title}</summary>
      <div className="mt-2.5">{children}</div>
    </details>
  );
}

export function OperationDetail({
  operationId,
  areas,
  opLabel,
  onClose,
  onSaved,
}: {
  operationId: string;
  areas: string[];
  /** Renders another Operation's id as something a human recognises, linked to it. */
  opLabel: (operationId: string) => ReactNode;
  onClose: () => void;
  /** Called after a save; `next` asks the list to open the next Operation still needing work. */
  onSaved: (next: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const q = trpc.operations.get.useQuery({ operationId });
  const deps = trpc.dependencies.forOperation.useQuery({ operationId });
  const refresh = () => Promise.all([utils.operations.get.invalidate({ operationId }), utils.operations.list.invalidate()]);
  const annotate = trpc.operations.annotate.useMutation();
  const accept = trpc.suggest.accept.useMutation();
  const setReview = trpc.operations.setReviewState.useMutation({ onSuccess: () => void refresh() });
  const annotateTesting = trpc.operations.annotateTesting.useMutation({ onSuccess: () => void refresh() });

  // Initialised once from the loaded Operation (the panel is keyed by operationId), so a background
  // refetch never overwrites what the analyst is typing.
  const [form, setForm] = useState<AnnotationForm | null>(null);
  const [testing, setTesting] = useState<{ guidance: string; tags: string } | null>(null);
  const op = q.data?.operation;
  if (op && !form) {
    setForm({ name: op.name ?? "", does: op.does ?? "", productArea: op.productArea ?? "", sideEffect: op.sideEffect ?? "" });
    setTesting({ guidance: op.testingGuidance ?? "", tags: op.tags.join(", ") });
  }

  if (!q.data || !op || !form || !testing) {
    return (
      <Panel title="Operation" actions={<CloseButton onClose={onClose} />}>
        <QueryState isLoading={q.isLoading} error={q.error ?? (q.data === null ? new Error("Operation not found") : null)} />
      </Panel>
    );
  }

  const { dataflow } = q.data;
  const status = statusOf(op);
  const dirty =
    form.name !== (op.name ?? "") ||
    form.does !== (op.does ?? "") ||
    form.productArea !== (op.productArea ?? "") ||
    form.sideEffect !== (op.sideEffect ?? "");
  const hasName = Boolean(form.name.trim());
  const hasDoes = Boolean(form.does.trim());
  const saving = annotate.isPending || accept.isPending;
  const set = <K extends keyof AnnotationForm>(key: K, value: AnnotationForm[K]) => setForm({ ...form, [key]: value });

  const save = (next: boolean) => {
    const done = { onSuccess: () => void refresh().then(() => onSaved(next)) };
    // An untouched suggestion is accepted as-is; any edit is saved as the analyst's own annotation
    // (which un-suggests it too). Fields are sent even when empty, so clearing one sticks.
    if (status === "suggested" && !dirty) accept.mutate({ operationId }, done);
    else
      annotate.mutate(
        {
          operationId,
          name: form.name.trim(),
          does: form.does.trim(),
          productArea: form.productArea.trim(),
          ...(form.sideEffect ? { sideEffect: form.sideEffect } : {}),
        },
        done,
      );
  };
  const saveLabel = status === "suggested" && !dirty ? "Accept suggestion" : "Save";
  const saveError = annotate.error ?? accept.error;

  return (
    <>
      <Panel
        title={
          <span className="flex min-w-0 items-center gap-2">
            <MethodBadge method={op.method} />
            <code className="truncate text-[13px]" title={op.pathTemplate.template}>
              {op.pathTemplate.template}
            </code>
          </span>
        }
        actions={<CloseButton onClose={onClose} />}
      >
        <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[--muted]">
          <StatusBadge status={status} />
          <span>{op.host}</span>
          <span>{op.observedCount} calls observed</span>
        </div>
      </Panel>

      <Panel title="Annotation">
        {status === "suggested" && (
          <div role="note" className="mb-3 rounded-lg border border-[#1f4a6e] bg-[#0f2436] px-3 py-2 text-[#a5d8ff]">
            <Icon icon={SparklesIcon} className="mr-1.5" />
            Suggested by the model. Check it, edit anything that's off, then accept. Suggestions never make an
            operation Ready on their own.
          </div>
        )}
        {status === "ignored" && (
          <div role="note" className="mb-3 rounded-lg border border-[--line] bg-[--panel2] px-3 py-2 text-[--muted]">
            <Icon icon={EyeOffIcon} className="mr-1.5" />
            Ignored: the composer never uses this operation. Restore it to annotate.
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save(true);
            }
          }}
        >
          <fieldset disabled={status === "ignored"} className="m-0 border-0 p-0">
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-xs text-[--muted]">
                Name <span className="text-[#ffc078]">*</span>
              </span>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Create ticket" />
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-xs text-[--muted]">
                What it does <span className="text-[#ffc078]">*</span>
              </span>
              <textarea
                rows={3}
                value={form.does}
                onChange={(e) => set("does", e.target.value)}
                placeholder="Creates a support ticket in the current org"
                aria-describedby="does-hint"
              />
              <span id="does-hint" className="text-xs text-[--muted]">
                One or two sentences, from the user's point of view. Markdown is fine.
              </span>
            </label>
            <label className="mb-3 flex flex-col gap-1">
              <span className="text-xs text-[--muted]">Product area</span>
              <input
                list="catalog-areas"
                value={form.productArea}
                onChange={(e) => set("productArea", e.target.value)}
                placeholder="Ticketing"
              />
              <datalist id="catalog-areas">
                {areas.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
            <fieldset className="m-0 mb-3 border-0 p-0">
              <legend className="mb-1 p-0 text-xs text-[--muted]">Side effect</legend>
              <div className="flex flex-wrap gap-1.5">
                {SIDE_EFFECTS.map((s) => (
                  <label
                    key={s}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs ${
                      form.sideEffect === s ? "border-[--accent] bg-[--panel2] text-[--text]" : "border-[--line] text-[--muted]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="side-effect"
                      className="sr-only"
                      checked={form.sideEffect === s}
                      onChange={() => set("sideEffect", s)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>

          <ul className="m-0 mb-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs" aria-label="Ready checklist">
            {[
              ["Named", hasName],
              ["Described", hasDoes],
            ].map(([label, ok]) => (
              <li key={label as string} className={ok ? "text-[#8ce99a]" : "text-[--muted]"}>
                <Icon icon={ok ? CheckIcon : CircleIcon} className="mr-1" />
                {label}
              </li>
            ))}
            <li className="text-[--muted]">Both make it Ready for the composer.</li>
          </ul>

          <div className="flex flex-wrap items-center gap-2 border-t border-[--line] pt-3">
            {status === "ignored" ? (
              <button type="button" onClick={() => setReview.mutate({ operationId, reviewState: "unannotated" })} disabled={setReview.isPending}>
                <Icon icon={EyeIcon} className="mr-1.5" />
                Restore
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="mr-auto"
                  onClick={() => setReview.mutate({ operationId, reviewState: "ignored" })}
                  disabled={setReview.isPending}
                  title="Hide from the composer, e.g. analytics or asset calls"
                >
                  <Icon icon={EyeOffIcon} className="mr-1.5" />
                  Ignore
                </button>
                <button type="button" onClick={() => save(false)} disabled={saving}>
                  <Icon icon={saving ? LoaderCircleIcon : SaveIcon} spin={saving} className="mr-1.5" />
                  {saveLabel}
                </button>
                <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
                  {saveLabel} & next
                  <Icon icon={ArrowRightIcon} className="ml-1.5" />
                </button>
              </>
            )}
          </div>
          <div aria-live="polite">
            {(saveError ?? setReview.error) && <div className="mt-2 text-[#ff8787]">{(saveError ?? setReview.error)?.message}</div>}
          </div>
        </form>
      </Panel>

      <Panel title="Observed">
        <dl className="m-0 mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-[--muted]">Responses</dt>
          <dd className="m-0">
            <StatusCodes codes={op.statusCodesObserved} withCounts />
          </dd>
          <dt className="text-[--muted]">Auth</dt>
          <dd className="m-0">{op.authObserved}</dd>
          <dt className="text-[--muted]">Content types</dt>
          <dd className="m-0">{op.contentTypes.join(", ") || <Muted>—</Muted>}</dd>
          <dt className="text-[--muted]">First seen</dt>
          <dd className="m-0">
            <FirstSeen sessionId={op.firstSeenSessionId} />
          </dd>
          <dt className="text-[--muted]">Last seen</dt>
          <dd className="m-0">{new Date(op.lastSeenAt).toLocaleString()}</dd>
          {op.volatileResponseFields.length > 0 && (
            <>
              <dt className="text-[--muted]">Volatile fields</dt>
              <dd className="m-0 flex flex-wrap gap-1">
                {op.volatileResponseFields.map((f) => (
                  <Chip key={f}>{f}</Chip>
                ))}
              </dd>
            </>
          )}
        </dl>

        {(op.pathTemplate.params.length > 0 || op.queryParams.length > 0) && (
          <Section title="Parameters">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {op.pathTemplate.params.map((p) => (
                  <tr key={`path-${p.name}`} className="border-b border-[--line]">
                    <td className="py-1.5 pr-3">
                      <code>{p.name}</code>
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-[--muted]">path · {p.kind}</td>
                    <td className="py-1.5" />
                  </tr>
                ))}
                {op.queryParams.map((p) => (
                  <tr key={`query-${p.name}`} className="border-b border-[--line]">
                    <td className="py-1.5 pr-3">
                      <code>{p.name}</code>
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-[--muted]">query{p.required ? " · required" : ""}</td>
                    <td className="truncate py-1.5 text-xs text-[--muted]" title={p.observedValues.join(", ")}>
                      {p.observedValues.slice(0, 3).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <Section title="Dependencies">
          {!deps.data ? (
            <Muted>{deps.isLoading ? "Loading…" : "No dependency facts yet. Run derive."}</Muted>
          ) : (
            <div className="flex flex-col gap-3">
              {deps.data.authRequired && (
                <div className="text-xs text-[--muted]">
                  <Icon icon={TriangleAlertIcon} className="mr-1.5 text-[#ffc078]" />
                  Needs an authenticated caller.
                </div>
              )}
              <div>
                <div className="mb-1 text-xs text-[--muted]">Needs</div>
                {deps.data.requires.length === 0 ? (
                  <Muted>Nothing from other calls.</Muted>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {deps.data.requires.map((r) => (
                      <li key={`${r.consumerSlot.location}.${r.consumerSlot.path}`} className="border-b border-[--line] py-1.5 last:border-b-0">
                        <code>
                          {r.consumerSlot.location}.{r.consumerSlot.path}
                        </code>
                        {r.role && <span className="ml-2 text-xs text-[--muted]">{r.role}</span>}
                        <div className="mt-0.5 text-xs">
                          {r.satisfiableBy.length === 0 ? (
                            <span className="text-[#ffc078]">
                              <Icon icon={TriangleAlertIcon} className="mr-1" />
                              No known producer
                            </span>
                          ) : (
                            <span className="text-[--muted]">
                              from{" "}
                              {r.satisfiableBy.map((id, i) => (
                                <span key={id}>
                                  {i > 0 && ", "}
                                  {opLabel(id)}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs text-[--muted]">Provides</div>
                {deps.data.produces.length === 0 ? (
                  <Muted>Nothing other calls use.</Muted>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {deps.data.produces.map((p) => (
                      <Chip key={p.path}>
                        {p.path}
                        {p.role ? ` · ${p.role}` : ""}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
              {deps.data.clientGenerated.length > 0 && (
                <div>
                  <div className="mb-1 text-xs text-[--muted]">Generated by the client</div>
                  <div className="flex flex-wrap gap-1.5">
                    {deps.data.clientGenerated.map((f) => (
                      <Chip key={f}>{f}</Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        <Fold title={`Data flow evidence (${dataflow.length})`}>
          {dataflow.length === 0 && <Muted>No observed value flows.</Muted>}
          <ul className="m-0 list-none p-0 text-xs">
            {dataflow.map((e) => (
              <li
                key={`${e.producer.operationId}.${e.producer.jsonPath}>${e.consumer.operationId}.${e.consumer.jsonPath}`}
                className="flex flex-wrap items-center gap-1.5 border-b border-[--line] py-1.5 last:border-b-0"
              >
                {opLabel(e.producer.operationId)}
                <code>{e.producer.jsonPath}</code>
                <Icon icon={ArrowRightIcon} className="text-[--muted]" />
                {opLabel(e.consumer.operationId)}
                <code>{e.consumer.jsonPath}</code>
                {!e.valueEntropyOk && <Chip variant="warn">low-entropy</Chip>}
              </li>
            ))}
          </ul>
        </Fold>
        <Fold title="Response schemas">
          <JsonBlock value={op.responseSchemas} />
        </Fold>
        <Fold title="Raw operation">
          <JsonBlock value={op} />
        </Fold>
      </Panel>

      <Panel title="Testing notes">
        <p className="m-0 mb-3 text-xs text-[--muted]">Only used when generating and running tests. Never affects Ready.</p>
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-xs text-[--muted]">Guidance</span>
          <textarea
            rows={2}
            value={testing.guidance}
            onChange={(e) => setTesting({ ...testing, guidance: e.target.value })}
            placeholder="e.g. never call on a shared environment"
          />
        </label>
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-xs text-[--muted]">Tags</span>
          <input value={testing.tags} onChange={(e) => setTesting({ ...testing, tags: e.target.value })} placeholder="probe-safe" />
          <span className="text-xs text-[--muted]">Comma-separated.</span>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={annotateTesting.isPending}
            onClick={() =>
              annotateTesting.mutate({
                operationId,
                testingGuidance: testing.guidance.trim(),
                tags: testing.tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          >
            <Icon icon={annotateTesting.isPending ? LoaderCircleIcon : SaveIcon} spin={annotateTesting.isPending} className="mr-1.5" />
            Save testing notes
          </button>
          {annotateTesting.isSuccess && (
            <span className="text-xs text-[#8ce99a]">
              <Icon icon={CheckIcon} className="mr-1" />
              Saved
            </span>
          )}
          {annotateTesting.error && <span className="text-xs text-[#ff8787]">{annotateTesting.error.message}</span>}
        </div>
      </Panel>
    </>
  );
}

function FirstSeen({ sessionId }: { sessionId: string }) {
  return <a href={`#/sessions/${sessionId}`}>{useSessionName(sessionId)}</a>;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" aria-label="Close" title="Close" className="border-transparent bg-transparent px-1.5 text-[--muted]" onClick={onClose}>
      <Icon icon={XIcon} className="h-4 w-4" />
    </button>
  );
}
