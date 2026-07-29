import { trpc } from "../trpc.js";
import { Chip, Muted, Panel, QueryState } from "../ui.js";

function reviewVariant(state: string): "derived" | "human" | "ok" | "warn" {
  if (state === "approved") return "ok";
  if (state === "ignored" || state === "deprecated") return "warn";
  if (state === "unreviewed") return "derived";
  return "human";
}

export function Scenarios() {
  const scenarios = trpc.scenarios.list.useQuery();
  const generate = trpc.agent.generate.useMutation();

  return (
    <Panel title="Scenarios (recorded + composed)">
      <QueryState isLoading={scenarios.isLoading} error={scenarios.error} />
      {(scenarios.data ?? []).map((s) => (
        <div key={s.scenarioId} className="mb-2 rounded-[10px] border border-[--line] bg-[--panel2] p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <b>{s.name}</b>
            <Chip variant="human">{s.origin ?? "manual"}</Chip>
            <Chip variant={reviewVariant(s.reviewState)}>{s.reviewState}</Chip>
            <Muted>{s.steps.length} steps</Muted>
          </div>
          <div className="text-sm text-[--muted]">{s.description}</div>
          {s.goal && <div className="mt-1 text-sm text-[--muted]">goal: {s.goal}</div>}
          {s.steps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {s.steps.map((st, i) => (
                <Chip key={`${s.scenarioId}-${st.operationId}-${i}`}>{st.operationId}</Chip>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => generate.mutate({ scenarioId: s.scenarioId })} disabled={generate.isPending}>
              {generate.isPending ? "Generating…" : "Generate TestSpec"}
            </button>
            {generate.data?.specId && <Muted>spec {generate.data.specId}</Muted>}
            {generate.error && <span className="text-[#ff8787]">{generate.error.message}</span>}
          </div>
        </div>
      ))}
      {scenarios.data?.length === 0 && <Muted>No scenarios yet. Record sessions and use Compose.</Muted>}
    </Panel>
  );
}
