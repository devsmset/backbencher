import { type LucideIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

// Small shared UI primitives. Convention (§6.3): derived values = gray chip, human = solid.
// Screens are a stack of flat, full-width Panels separated by hairlines — no floating cards.

// Lucide icon, sized to the surrounding text (1em) so it lines up with labels. Always decorative:
// the text beside it, or the control's aria-label, carries the meaning. Leading icons take `mr-1.5`,
// trailing ones `ml-1.5`; a size class (e.g. `h-4 w-4`) overrides the 1em default.
// `spin` is for pending states and stops under prefers-reduced-motion.
export function Icon({ icon: Glyph, className = "", spin = false }: { icon: LucideIcon; className?: string; spin?: boolean }) {
  return (
    <Glyph
      size="1em"
      aria-hidden="true"
      className={`inline-block shrink-0 align-[-0.125em] ${className}${spin ? " motion-safe:animate-spin" : ""}`}
    />
  );
}

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
    <section className="border-b border-[--line]">
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-6 pt-5 max-[900px]:px-4">
          <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="px-6 py-4 max-[900px]:px-4">{children}</div>
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


export function Stat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="flex min-w-44 flex-col gap-0.5 border-l-2 border-[--line] pl-4 pr-6">
      <b className="text-[26px] font-semibold">{value}</b>
      <span className="text-xs text-[--muted]">{label}</span>
    </div>
  );
}

// Modal dialog on the native <dialog>: focus is trapped and Esc closes it, unless `dismissable` is
// false (e.g. while a recording is live), when only the dialog's own actions can close it.
// `size="full"` fills the viewport (less a 16px margin) and scrolls its body, for reading-heavy
// content such as a TestSpec; children then bring their own padding (e.g. Panels).
export function Dialog({
  title,
  onClose,
  dismissable = true,
  size = "default",
  footer,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  dismissable?: boolean;
  size?: "default" | "full";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissable) onClose();
      }}
      className={`rounded-xl border border-[--line] bg-[--panel] p-0 text-[--text] shadow-panel backdrop:bg-black/70 ${
        size === "full"
          ? "h-[calc(100vh-32px)] max-h-none w-[calc(100vw-32px)] max-w-none flex-col open:flex"
          : "w-[560px] max-w-[calc(100vw-32px)]"
      }`}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[--line] bg-[--panel2] px-5 py-3.5">
        <h2 id={titleId} className="m-0 min-w-0 truncate text-[15px] font-semibold">
          {title}
        </h2>
        {dismissable && (
          <button type="button" aria-label="Close" className="border-transparent bg-transparent px-2 py-0.5 text-lg leading-none text-[--muted]" onClick={onClose}>
            <Icon icon={XIcon} />
          </button>
        )}
      </header>
      <div className={size === "full" ? "min-h-0 flex-1 overflow-y-auto" : "px-5 py-4"}>{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[--line] px-5 py-3">{footer}</footer>}
    </dialog>
  );
}
