import { trpc } from "../trpc.js";
import { Muted, Panel, QueryState, Stat } from "../ui.js";

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
          <div className="flex flex-wrap gap-y-4">
            <Stat value={d.coverage.totalOperations} label="operations" />
            <Stat value={d.coverage.reviewedOperations} label="reviewed" />
            <Stat value={d.coverage.operationsWithApprovedComposition} label="with approved composition" />
          </div>
        )}
      </Panel>
      <Panel title="Composability (realignment guide §7)">
        <QueryState isLoading={drift.isLoading} error={drift.error} />
        {d && (
          <div className="flex flex-wrap gap-y-4">
            <Stat
              value={pct(d.coverage.annotationReadyOperations, d.coverage.totalOperations)}
              label={<>annotation-ready ({d.coverage.annotationReadyOperations}/{d.coverage.totalOperations})</>}
            />
            <Stat
              value={pct(d.coverage.exampleCoveredOperations, d.coverage.annotationReadyOperations)}
              label={<>example-covered, of ready ({d.coverage.exampleCoveredOperations}/{d.coverage.annotationReadyOperations})</>}
            />
            <Stat
              value={pct(d.coverage.dependencyResolvableOperations, d.coverage.totalOperations)}
              label={<>dependency-resolvable ({d.coverage.dependencyResolvableOperations}/{d.coverage.totalOperations})</>}
            />
          </div>
        )}
      </Panel>
      <Panel title="Drift">
        <Muted>OpenAPI reconciliation not configured (hasSpec: {String(d?.hasSpec ?? false)}).</Muted>
      </Panel>
    </>
  );
}
