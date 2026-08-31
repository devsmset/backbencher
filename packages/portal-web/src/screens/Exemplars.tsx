import { trpc } from "../trpc.js";
import { Chip, Muted, Panel, QueryState } from "../ui.js";

export function Exemplars() {
  const exemplars = trpc.exemplars.list.useQuery();

  return (
    <Panel title="Exemplars (recorded, teaching examples)">
      <QueryState isLoading={exemplars.isLoading} error={exemplars.error} />
      {(exemplars.data ?? []).map((e) => (
        <div key={e.exemplarId} className="mb-2 rounded-[10px] border border-[--line] bg-[--panel2] p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <b>{e.name}</b>
            <Muted>{e.steps.length} steps</Muted>
          </div>
          <div className="text-sm text-[--muted]">goal: {e.goal}</div>
          {e.steps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {e.steps.map((st, i) => (
                <Chip key={`${e.exemplarId}-${st.operationId}-${i}`}>{st.operationId}</Chip>
              ))}
            </div>
          )}
        </div>
      ))}
      {exemplars.data?.length === 0 && <Muted>No exemplars yet. Promote a recorded session.</Muted>}
    </Panel>
  );
}
