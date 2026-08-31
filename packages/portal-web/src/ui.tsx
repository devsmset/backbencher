import type { ReactNode } from "react";

// Small shared UI primitives. Convention (§6.3): derived values = gray chip, human = solid.

export function Chip({
  children,
  variant = "derived",
}: {
  children: ReactNode;
  variant?: "derived" | "human" | "warn" | "ok";
}) {
  const styles: Record<typeof variant, string> = {
    derived: "bg-[--chip] text-[--muted]",
    human: "border-[#3d5a8a] bg-[#2b3a55] text-[#cfe0ff]",
    ok: "border-[#2b7a3a] bg-[#16351f] text-[#8ce99a]",
    warn: "border-[#7a4a1a] bg-[#3a2412] text-[#ffc078]",
  };
  return <span className={`inline-block rounded-full border border-transparent px-2 py-[1px] text-[11px] ${styles[variant]}`}>{children}</span>;
}

export function Panel({
  title,
  actions,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-[--line] shadow-panel [background:color-mix(in_srgb,var(--panel)_94%,black_6%)]">
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-[--line] bg-[--panel2] px-3.5 py-2.5">
          <h3 className="m-0 text-sm">{title}</h3>
          <div className="flex gap-2">{actions}</div>
        </header>
      )}
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-2.5 flex flex-col gap-1">
      <span className="text-xs text-[--muted]">{label}</span>
      {children}
    </label>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-[--muted]">{children}</span>;
}

export function QueryState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) return <div className="text-[--muted]">Loading…</div>;
  if (error) return <div className="text-[#ff8787]">{String((error as Error)?.message ?? error)}</div>;
  return null;
}

function maybeParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function renderJson(value: unknown, depth = 0): JSX.Element {
  const parsed = maybeParseJson(value);
  const pad = "  ".repeat(depth);
  const nextPad = "  ".repeat(depth + 1);

  if (parsed === null) return <span className="text-[#ff9f7a]">null</span>;
  if (typeof parsed === "string") return <span className="text-[#8ce99a]">{JSON.stringify(parsed)}</span>;
  if (typeof parsed === "number") return <span className="text-[#74c0fc]">{String(parsed)}</span>;
  if (typeof parsed === "boolean") return <span className="text-[#ffd43b]">{String(parsed)}</span>;

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return <span>[]</span>;
    return (
      <>
        <span>[</span>
        {parsed.map((item, index) => (
          <div key={`${depth}-${index}`}>
            {nextPad}
            {renderJson(item, depth + 1)}
            {index < parsed.length - 1 ? <span>,</span> : null}
          </div>
        ))}
        <div>
          {pad}
          <span>]</span>
        </div>
      </>
    );
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return <span>{"{}"}</span>;
  return (
    <>
      <span>{"{"}</span>
      {entries.map(([key, entryValue], index) => (
        <div key={`${depth}-${key}`}>
          {nextPad}
          <span className="text-[#c792ea]">{JSON.stringify(key)}</span>
          <span>: </span>
          {renderJson(entryValue, depth + 1)}
          {index < entries.length - 1 ? <span>,</span> : null}
        </div>
      ))}
      <div>
        {pad}
        <span>{"}"}</span>
      </div>
    </>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <div className="overflow-x-hidden whitespace-pre-wrap break-all rounded-[10px] border border-[--line] bg-[#0a1016] p-3 font-mono text-xs leading-[1.55] text-[#dbe5ef]">
      {renderJson(value)}
    </div>
  );
}

