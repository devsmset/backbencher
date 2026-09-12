import { type ReactNode, useEffect, useState } from "react";
import { Catalog } from "./screens/Catalog.js";
import { Compose } from "./screens/Compose.js";
import { Dashboard } from "./screens/Dashboard.js";
import { Guides } from "./screens/Guides.js";
import { OperationDetail } from "./screens/OperationDetail.js";
import { Pack } from "./screens/Pack.js";
import { SessionDetail, SessionsList } from "./screens/Sessions.js";
import { Specs } from "./screens/Specs.js";

function useRoute(): { hash: string; parts: string[] } {
  const [hash, setHash] = useState(() => window.location.hash || "#/dashboard");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/dashboard");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return { hash, parts: hash.replace(/^#\//, "").split("/") };
}

const NAV: [string, string][] = [
  ["#/dashboard", "Dashboard"],
  ["#/sessions", "Sessions"],
  ["#/catalog", "Catalog"],
  ["#/compose", "Compose"],
  ["#/guides", "Guides"],
  ["#/pack", "Pack"],
  ["#/specs", "Specs"],
];

export function App() {
  const { hash, parts } = useRoute();
  const [analyst, setAnalyst] = useState(() => localStorage.getItem("bb.analyst") ?? "analyst");
  useEffect(() => {
    localStorage.setItem("bb.analyst", analyst);
  }, [analyst]);

  let screen: ReactNode;
  switch (parts[0]) {
    case "sessions":
      screen = parts[1] ? <SessionDetail sessionId={parts[1]} /> : <SessionsList />;
      break;
    case "catalog":
      screen = <Catalog />;
      break;
    case "op":
      screen = <OperationDetail operationId={parts[1] ?? ""} />;
      break;
    case "compose":
      screen = <Compose />;
      break;
    case "guides":
      screen = <Guides />;
      break;
    case "pack":
      screen = <Pack />;
      break;
    case "specs":
      screen = <Specs />;
      break;
    default:
      screen = <Dashboard />;
  }

  return (
    <div className="grid min-h-screen grid-cols-[260px_minmax(0,1fr)] max-[900px]:grid-cols-1">
      <aside className="sticky top-0 flex h-screen flex-col gap-3.5 border-r border-[--line] p-4 [background:color-mix(in_srgb,var(--panel)_92%,black_8%)] max-[900px]:static max-[900px]:h-auto max-[900px]:border-b max-[900px]:border-r-0">
        <div className="ml-1.5 mt-1 text-[0.95rem] font-bold lowercase tracking-[0.6px] text-[#f4f8fc]">backbencher</div>
        <nav className="flex flex-col gap-1 max-[900px]:flex-row max-[900px]:flex-wrap">
          {NAV.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className={
                hash.startsWith(href)
                  ? "rounded-[10px] border border-[--line] px-2.5 py-2 text-white [background:color-mix(in_srgb,var(--panel2)_90%,black_10%)]"
                  : "rounded-[10px] border border-transparent px-2.5 py-2 text-[--muted] transition-colors hover:text-[#d9e7f7] hover:no-underline [background:transparent] hover:[background:color-mix(in_srgb,var(--panel2)_86%,black_14%)]"
              }
            >
              {label}
            </a>
          ))}
        </nav>
        <label className="mt-auto flex flex-col items-stretch gap-1.5 rounded-[10px] border border-[--line] p-2.5 text-xs text-[--muted] [background:color-mix(in_srgb,var(--panel2)_88%,black_12%)]">
          analyst
          <input value={analyst} onChange={(e) => setAnalyst(e.target.value)} />
        </label>
      </aside>
      <main className="mx-auto w-full max-w-[1240px] p-5 max-[900px]:p-3.5">{screen}</main>
    </div>
  );
}
