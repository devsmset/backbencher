import { trpc } from "../trpc.js";
import { Muted, Panel, QueryState } from "../ui.js";

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function Dashboard() {
  const drift = trpc.drift.report.useQuery();
  const d = drift.data;
  return (
    <>
      <Panel title="Coverage">
        <QueryState isLoading={drift.isLoading} error={drift.error} />
        {d && (
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex min-w-44 flex-col gap-0.5 rounded-[10px] border border-[--line] bg-[--panel2] px-[18px] py-3">
              <b className="text-[26px]">{d.coverage.totalOperations}</b>
              <span className="text-xs text-[--muted]">operations</span>
            </div>
            <div className="inline-flex min-w-44 flex-col gap-0.5 rounded-[10px] border border-[--line] bg-[--panel2] px-[18px] py-3">
              <b className="text-[26px]">{d.coverage.reviewedOperations}</b>
              <span className="text-xs text-[--muted]">reviewed</span>
            </div>
            <div className="inline-flex min-w-44 flex-col gap-0.5 rounded-[10px] border border-[--line] bg-[--panel2] px-[18px] py-3">
              <b className="text-[26px]">{d.coverage.operationsWithApprovedScenario}</b>
              <span className="text-xs text-[--muted]">with approved scenario</span>
            </div>
          </div>
        )}
      </Panel>
      <Panel title="Composability (realignment guide §7)">
        <QueryState isLoading={drift.isLoading} error={drift.error} />
        {d && (
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex min-w-44 flex-col gap-0.5 rounded-[10px] border border-[--line] bg-[--panel2] px-[18px] py-3">
              <b className="text-[26px]">{pct(d.coverage.annotationReadyOperations, d.coverage.totalOperations)}</b>
              <span className="text-xs text-[--muted]">
                annotation-ready ({d.coverage.annotationReadyOperations}/{d.coverage.totalOperations})
              </span>
            </div>
            <div className="inline-flex min-w-44 flex-col gap-0.5 rounded-[10px] border border-[--line] bg-[--panel2] px-[18px] py-3">
              <b className="text-[26px]">{pct(d.coverage.exampleCoveredOperations, d.coverage.annotationReadyOperations)}</b>
              <span className="text-xs text-[--muted]">
                example-covered, of ready ({d.coverage.exampleCoveredOperations}/{d.coverage.annotationReadyOperations})
              </span>
            </div>
            <div className="inline-flex min-w-44 flex-col gap-0.5 rounded-[10px] border border-[--line] bg-[--panel2] px-[18px] py-3">
              <b className="text-[26px]">{pct(d.coverage.dependencyResolvableOperations, d.coverage.totalOperations)}</b>
              <span className="text-xs text-[--muted]">
                dependency-resolvable ({d.coverage.dependencyResolvableOperations}/{d.coverage.totalOperations})
              </span>
            </div>
          </div>
        )}
      </Panel>
      <Panel title="Drift">
        <Muted>OpenAPI reconciliation not configured (hasSpec: {String(d?.hasSpec ?? false)}).</Muted>
      </Panel>
    </>
  );
}
