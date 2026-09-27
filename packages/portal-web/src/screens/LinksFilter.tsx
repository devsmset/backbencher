import { SlidersHorizontalIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LinkKeyRow, LinkKeySummary } from "../linkKeySummary.js";
import { Icon } from "../ui.js";

// The dependency graph's Links button and its drop-down panel: every key the graph's links are
// built on, grouped, each switchable off. Changes are reported up immediately; the graph saves
// them (sessions.setExcludedLinkKeys) so its view and the server's delete check never differ.

function GroupCheckbox({ label, keys, disabled, onToggle }: { label: string; keys: LinkKeyRow[]; disabled: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const on = keys.filter((k) => !k.excluded).length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = on > 0 && on < keys.length;
  }, [on, keys.length]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={`All ${label}`}
      className="m-0 h-4 w-4 p-0 accent-[--accent]"
      checked={on === keys.length}
      disabled={disabled}
      onChange={onToggle}
    />
  );
}

export function LinksFilter({
  summary,
  locked,
  saving,
  error,
  onSetExcluded,
  onShowAll,
}: {
  summary: LinkKeySummary;
  locked: boolean;
  saving: boolean;
  error: string | null;
  onSetExcluded: (keys: string[], excluded: boolean) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    // The graph modal closes itself on Esc via a bubble-phase window listener. Catch Esc first, in
    // the capture phase, so it closes only this panel wherever focus is.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const groups = summary.groups
    .map((g) => ({ ...g, keys: g.keys.filter((k) => !needle || k.path.toLowerCase().includes(needle)) }))
    .filter((g) => g.keys.length > 0);
  const shown = summary.totalLinks - summary.hiddenLinks;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        className="rounded-md border border-[--line] px-2 py-1 text-xs font-semibold"
        title="Choose which kinds of values the graph's links are built on"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon icon={SlidersHorizontalIcon} className="mr-1.5" />
        {summary.hiddenLinks === 0 ? "Links" : `Links · ${summary.hiddenLinks} hidden`}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Links filter"
          className="absolute right-0 top-full z-20 mt-1 flex max-h-[60vh] w-[360px] flex-col rounded-lg border border-[--line] bg-[--panel] text-xs shadow-panel"
        >
          <div className="border-b border-[--line] p-2">
            <input
              type="search"
              aria-label="Search keys"
              className="w-full"
              placeholder="Search keys"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // biome-ignore lint/a11y/noAutofocus: the search is the panel's first control
              autoFocus
            />
            {locked && <div className="mt-1.5 text-[#ffc078]">Save or discard your staged changes first</div>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {summary.groups.length === 0 && <div className="text-[--muted]">This session has no links.</div>}
            {summary.groups.length > 0 && groups.length === 0 && <div className="text-[--muted]">No keys match.</div>}
            {groups.map((g) => {
              const allOn = g.keys.every((k) => !k.excluded);
              return (
                <fieldset key={g.group} className="m-0 mb-2 border-0 p-0">
                  <legend className="flex w-full items-center gap-2 p-0 py-1 font-semibold">
                    <GroupCheckbox
                      label={g.label}
                      keys={g.keys}
                      disabled={locked || saving}
                      onToggle={() => onSetExcluded(g.keys.map((k) => k.key), allOn)}
                    />
                    <span>{g.label}</span>
                    <span className="font-normal text-[--muted]">
                      {g.links} links · {g.keys.length} keys
                    </span>
                  </legend>
                  <ul className="m-0 list-none p-0 pl-6">
                    {g.keys.map((k) => (
                      <li key={k.key} className="flex items-center gap-2 py-0.5">
                        <input
                          type="checkbox"
                          aria-label={k.path}
                          className="m-0 h-3.5 w-3.5 p-0 accent-[--accent]"
                          checked={!k.excluded}
                          disabled={locked || saving}
                          onChange={() => onSetExcluded([k.key], !k.excluded)}
                        />
                        <code className="min-w-0 truncate" title={k.path}>
                          {k.path}
                        </code>
                        <span className="text-[--muted]">{k.links}</span>
                        <span className="ml-auto truncate text-[--muted]" title={`from ${k.from}`}>
                          from {k.from}
                        </span>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[--line] p-2">
            <span className="text-[--muted]">
              {shown} of {summary.totalLinks} links shown
            </span>
            <button type="button" disabled={locked || saving || summary.excludedKeys === 0} onClick={onShowAll}>
              Show all
            </button>
          </div>
          {error && <div className="border-t border-[--line] p-2 text-[#ff8787]">{error}</div>}
        </div>
      )}
    </div>
  );
}
