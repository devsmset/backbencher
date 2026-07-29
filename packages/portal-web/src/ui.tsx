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
