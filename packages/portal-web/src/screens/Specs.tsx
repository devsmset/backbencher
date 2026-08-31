import { useState } from "react";
import { trpc } from "../trpc.js";
import { Chip, Muted, Panel, QueryState } from "../ui.js";

function runVariant(status: string): "ok" | "warn" | "derived" {
  if (status === "passed") return "ok";
  if (status === "flaky" || status === "failed") return "warn";
  return "derived";
}

export function Specs() {
  const utils = trpc.useUtils();
  const specs = trpc.specs.list.useQuery();
  const run = trpc.runs.start.useMutation();
  const authz = trpc.security.authzMatrix.useMutation({ onSuccess: () => utils.specs.list.invalidate() });
  const bola = trpc.security.bolaProbes.useMutation({ onSuccess: () => utils.specs.list.invalidate() });
  const [env, setEnv] = useState("staging");
  const [last, setLast] = useState<Record<string, string>>({});

  return (
    <Panel
      title="TestSpecs"
      actions={
        <>
          <button type="button" disabled={authz.isPending} onClick={() => authz.mutate({ environment: env })}>
            + authz matrix
          </button>
          <button type="button" disabled={bola.isPending} onClick={() => bola.mutate({ environment: env })}>
            + BOLA probes
          </button>
          <label className="flex items-center gap-1.5 text-xs text-[--muted]">
            env
            <input className="w-28" value={env} onChange={(e) => setEnv(e.target.value)} />
          </label>
        </>
      }
    >
      <QueryState isLoading={specs.isLoading} error={specs.error} />
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Spec</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Composition</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Status</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Run</th>
          </tr>
        </thead>
        <tbody>
          {(specs.data ?? []).map((s) => (
            <tr key={s.specId} className="hover:bg-[--panel2]">
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <code>{s.specId}</code>
              </td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <code>{s.compositionId}</code>
              </td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <Chip variant={s.status === "generated" ? "ok" : s.status === "invalid" ? "warn" : "derived"}>
                  {s.status}
                </Chip>
              </td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <button
                  type="button"
                  disabled={run.isPending}
                  onClick={() =>
                    run.mutate(
                      { specId: s.specId, env },
                      { onSuccess: (r) => setLast((prev) => ({ ...prev, [s.specId]: r.status })) },
                    )
                  }
                >
                  Run
                </button>{" "}
                {last[s.specId] && <Chip variant={runVariant(last[s.specId] as string)}>{last[s.specId]}</Chip>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {specs.data?.length === 0 && <Muted>No specs. Generate one from an approved scenario.</Muted>}
      {run.error && <div className="text-[#ff8787]">{run.error.message}</div>}
    </Panel>
  );
}
