import type { CatalogReviewState } from "@backbencher/schemas";
import { useState } from "react";
import { trpc } from "../trpc.js";
import { Chip, Muted, Panel, QueryState } from "../ui.js";

const REVIEW_STATES: CatalogReviewState[] = ["unannotated", "ready", "ignored"];

function reviewVariant(state: CatalogReviewState): "derived" | "human" | "ok" | "warn" {
  if (state === "ready") return "ok";
  if (state === "ignored") return "warn";
  return "derived";
}

function isReady(name: string | undefined, does: string | undefined): boolean {
  return Boolean(name && does);
}

export function Catalog() {
  const [q, setQ] = useState("");
  const [reviewState, setReviewState] = useState<CatalogReviewState | "">("");
  const ops = trpc.operations.list.useQuery({
    q: q || undefined,
    reviewState: reviewState || undefined,
  });

  return (
    <Panel
      title="Endpoint catalog"
      actions={
        <>
          <input placeholder="filter template…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={reviewState} onChange={(e) => setReviewState(e.target.value as CatalogReviewState | "")}>
            <option value="">all states</option>
            {REVIEW_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </>
      }
    >
      <QueryState isLoading={ops.isLoading} error={ops.error} />
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Method</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Template</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Name</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Area</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Ready</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Obs</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Statuses</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Review</th>
          </tr>
        </thead>
        <tbody>
          {(ops.data ?? []).map((op) => (
            <tr key={op.operationId} className="hover:bg-[--panel2]">
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top font-bold">{op.method}</td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <a href={`#/op/${op.operationId}`}>
                  <code>{op.pathTemplate.template}</code>
                </a>
              </td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">{op.name ? <Chip variant="human">{op.name}</Chip> : <Muted>—</Muted>}</td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">{op.productArea ?? <Muted>—</Muted>}</td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <Chip variant={isReady(op.name, op.does) ? "ok" : "warn"}>{isReady(op.name, op.does) ? "ready" : "needs annotation"}</Chip>
              </td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">{op.observedCount}</td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                {Object.keys(op.statusCodesObserved)
                  .sort()
                  .map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
              </td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <Chip variant={reviewVariant(op.reviewState)}>{op.reviewState}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ops.data?.length === 0 && <Muted>No operations. Run `bb derive`.</Muted>}
    </Panel>
  );
}
