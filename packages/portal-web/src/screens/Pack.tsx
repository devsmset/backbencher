import { HammerIcon, LoaderCircleIcon } from "lucide-react";
import { trpc } from "../trpc.js";
import { Icon, Muted, Panel, QueryState } from "../ui.js";

export function Pack() {
  const utils = trpc.useUtils();
  const packs = trpc.pack.list.useQuery();
  const build = trpc.pack.build.useMutation({ onSuccess: () => utils.pack.list.invalidate() });

  return (
    <Panel
      title="Knowledge packs"
      actions={
        <button
          className="rounded-lg border border-[--accent] bg-[--accent] px-2.5 py-1.5 font-semibold text-[#06121f]"
          type="button"
          onClick={() => build.mutate()}
          disabled={build.isPending}
        >
          <Icon icon={build.isPending ? LoaderCircleIcon : HammerIcon} spin={build.isPending} className="mr-1.5" />
          {build.isPending ? "Building…" : "Build pack"}
        </button>
      }
    >
      {build.data && (
        <div className="inline-block rounded-full border border-[#2b7a3a] bg-[#16351f] px-2 py-[1px] text-[11px] text-[#8ce99a]">
          Built {build.data.contentHash} · {build.data.operations} operations
        </div>
      )}
      <QueryState isLoading={packs.isLoading} error={packs.error} />
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Content hash</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Built</th>
            <th className="border-b border-[--line] px-2.5 py-[7px] text-left text-xs font-semibold uppercase tracking-[0.4px] text-[--muted]">Path</th>
          </tr>
        </thead>
        <tbody>
          {(packs.data ?? []).map((p) => (
            <tr key={p.packId} className="hover:bg-[--panel2]">
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <code>{p.contentHash}</code>
              </td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">{new Date(p.builtAt).toLocaleString()}</td>
              <td className="border-b border-[--line] px-2.5 py-[7px] align-top">
                <Muted>{p.path}</Muted>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {packs.data?.length === 0 && <Muted>No packs built yet.</Muted>}
      <p>
        <Muted>Agent TestSpec generation arrives in Phase 6.</Muted>
      </p>
    </Panel>
  );
}
