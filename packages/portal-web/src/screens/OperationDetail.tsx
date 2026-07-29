import type { ReviewState, SideEffect } from "@backbencher/schemas";
import { useEffect, useState } from "react";
import { trpc } from "../trpc.js";
import { Chip, Field, Muted, Panel, QueryState } from "../ui.js";

const REVIEW_STATES: ReviewState[] = ["unreviewed", "in_review", "approved", "deprecated", "ignored"];
const SIDE_EFFECTS: SideEffect[] = ["read", "create", "update", "delete", "auth", "unknown"];

export function OperationDetail({ operationId }: { operationId: string }) {
  const utils = trpc.useUtils();
  const q = trpc.operations.get.useQuery({ operationId });
  const invalidate = () => utils.operations.get.invalidate({ operationId });
  const annotate = trpc.operations.annotate.useMutation({ onSuccess: invalidate });
  const setReview = trpc.operations.setReviewState.useMutation({ onSuccess: invalidate });

  const dependencyQ = trpc.dependencies.forOperation.useQuery({ operationId });

  const [tab, setTab] = useState<"derived" | "annotation" | "diff">("derived");
  const [form, setForm] = useState({
    name: "",
    does: "",
    productArea: "",
    sideEffect: "" as SideEffect | "",
  });

  useEffect(() => {
    const op = q.data?.operation;
    if (op) {
      setForm({
        name: op.name ?? "",
        does: op.does ?? "",
        productArea: op.productArea ?? "",
        sideEffect: op.sideEffect ?? "",
      });
    }
  }, [q.data]);

  if (q.isLoading || !q.data) {
    return (
      <Panel title="Operation">
        <QueryState isLoading={q.isLoading} error={q.error ?? (q.data === null ? new Error("not found") : null)} />
      </Panel>
    );
  }

  const { operation: op, dataflow } = q.data;

  const save = () =>
    annotate.mutate({
      operationId,
      name: form.name || undefined,
      does: form.does || undefined,
      productArea: form.productArea || undefined,
      sideEffect: form.sideEffect || undefined,
    });

  const ready = Boolean((op.name ?? "").trim() && (op.does ?? "").trim());

  return (
    <>
      <Panel
        title={
          <>
            <span className="font-bold">{op.method}</span> <code>{op.pathTemplate.template}</code>
          </>
        }
        actions={
          <>
            <Chip variant={ready ? "ok" : "warn"}>{ready ? "ready" : "needs annotation"}</Chip>
            <Chip variant={op.reviewState === "approved" ? "ok" : "derived"}>{op.reviewState}</Chip>
            <select
              value={op.reviewState}
              onChange={(e) => setReview.mutate({ operationId, reviewState: e.target.value as ReviewState })}
            >
              {REVIEW_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <a href="#/catalog">← catalog</a>
          </>
        }
      >
        <div className="mb-3 flex gap-1">
          {(["derived", "annotation", "diff"] as const).map((t) => (
            <button
              key={t}
              className={
                tab === t
                  ? "rounded-lg border border-[--accent] bg-[--accent] px-2.5 py-1.5 text-[#06121f]"
                  : "rounded-lg border border-[--line] bg-[--panel2] px-2.5 py-1.5 text-[--text]"
              }
              onClick={() => setTab(t)}
              type="button"
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "derived" && (
          <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
            <div>
              <h4>Params</h4>
              {op.pathTemplate.params.length === 0 && <Muted>none</Muted>}
              {op.pathTemplate.params.map((p) => (
                <div key={p.name} className="flex items-center gap-2.5 border-b border-[--line] py-2">
                  <code>{p.name}</code> <Chip>{p.kind}</Chip> <Muted>@{p.position}</Muted>
                </div>
              ))}
              <h4>Query params</h4>
              {op.queryParams.length === 0 && <Muted>none</Muted>}
              {op.queryParams.map((p) => (
                <div key={p.name} className="flex items-center gap-2.5 border-b border-[--line] py-2">
                  <code>{p.name}</code> {p.required && <Chip variant="warn">required</Chip>}
                </div>
              ))}
              <h4>Volatile response fields</h4>
              {op.volatileResponseFields.length === 0 ? (
                <Muted>none</Muted>
              ) : (
                op.volatileResponseFields.map((f) => <Chip key={f}>{f}</Chip>)
              )}
            </div>
            <div>
              <h4>Statuses</h4>
              {Object.entries(op.statusCodesObserved).map(([s, n]) => (
                <Chip key={s}>
                  {s}: {n}
                </Chip>
              ))}
              <h4>Auth</h4>
              <Chip>{op.authObserved}</Chip>
              <h4>Dataflow ({dataflow.length})</h4>
              {dataflow.map((e, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: derived list
                <div key={i} className="flex items-center gap-2.5 border-b border-[--line] py-2">
                  <code>{e.producer.operationId}</code>.{e.producer.jsonPath} →{" "}
                  <code>{e.consumer.operationId}</code>.{e.consumer.jsonPath}
                  {!e.valueEntropyOk && <Chip variant="warn">low-entropy</Chip>}
                </div>
              ))}
              <h4>Response schemas</h4>
              <pre className="max-h-[360px] overflow-auto rounded-[10px] border border-[--line] bg-[#0a1016] p-3 font-mono text-xs leading-[1.55]">
                {JSON.stringify(op.responseSchemas, null, 2)}
              </pre>
            </div>
            <div className="col-span-2 max-[900px]:col-span-1">
              <h4>Dependencies (derived — realignment guide §5)</h4>
              {!dependencyQ.data ? (
                <Muted>{dependencyQ.isLoading ? "loading…" : "no dependency facts yet — run derive"}</Muted>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 py-1">
                    <span>Auth required:</span>
                    <Chip variant={dependencyQ.data.authRequired ? "warn" : "derived"}>
                      {dependencyQ.data.authRequired ? "yes" : "no"}
                    </Chip>
                  </div>
                  <h5>Requires</h5>
                  {dependencyQ.data.requires.length === 0 ? (
                    <Muted>none</Muted>
                  ) : (
                    dependencyQ.data.requires.map((r, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: derived list
                      <div key={i} className="flex items-center gap-2.5 border-b border-[--line] py-2">
                        <code>
                          {r.consumerSlot.location}.{r.consumerSlot.path}
                        </code>
                        {r.role && <Chip>{r.role}</Chip>}
                        {r.satisfiableBy.length === 0 ? (
                          <Chip variant="warn">no known producer</Chip>
                        ) : (
                          <Muted>satisfiableBy: {r.satisfiableBy.join(", ")}</Muted>
                        )}
                      </div>
                    ))
                  )}
                  <h5>Produces</h5>
                  {dependencyQ.data.produces.length === 0 ? (
                    <Muted>none</Muted>
                  ) : (
                    dependencyQ.data.produces.map((p, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: derived list
                      <div key={i} className="flex items-center gap-2.5 border-b border-[--line] py-2">
                        <code>{p.path}</code> {p.role && <Chip>{p.role}</Chip>}
                      </div>
                    ))
                  )}
                  <h5>Client-generated</h5>
                  {dependencyQ.data.clientGenerated.length === 0 ? (
                    <Muted>none</Muted>
                  ) : (
                    dependencyQ.data.clientGenerated.map((f) => <Chip key={f}>{f}</Chip>)
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === "annotation" && (
          <div>
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Product area">
              <input value={form.productArea} onChange={(e) => setForm({ ...form, productArea: e.target.value })} />
            </Field>
            <Field label="Side effect">
              <select
                value={form.sideEffect}
                onChange={(e) => setForm({ ...form, sideEffect: e.target.value as SideEffect | "" })}
              >
                <option value="">—</option>
                {SIDE_EFFECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Does (markdown)">
              <textarea rows={3} value={form.does} onChange={(e) => setForm({ ...form, does: e.target.value })} />
            </Field>
            <div className="mb-2 text-xs text-[--muted]">
              <button type="button" disabled title="Backend suggest endpoint not wired yet">
                Suggest annotation (coming soon)
              </button>
            </div>
            <button
              className="rounded-lg border border-[--accent] bg-[--accent] px-2.5 py-1.5 font-semibold text-[#06121f]"
              type="button"
              onClick={save}
              disabled={annotate.isPending}
            >
              {annotate.isPending ? "Saving…" : "Save annotation"}
            </button>
          </div>
        )}

        {tab === "diff" && (
          <div>
            <Muted>Field-level diff vs the previous derive run appears here once history is retained.</Muted>
            <pre className="max-h-[360px] overflow-auto rounded-[10px] border border-[--line] bg-[#0a1016] p-3 font-mono text-xs leading-[1.55]">
              {JSON.stringify(op, null, 2)}
            </pre>
          </div>
        )}
      </Panel>
    </>
  );
}
