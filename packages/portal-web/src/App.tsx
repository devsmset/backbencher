import { ArchiveIcon, BookOpenIcon, CompassIcon, FlaskConicalIcon, GaugeIcon, VideoIcon, WandSparklesIcon, type LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Catalog } from "./screens/Catalog.js";
import { Compose } from "./screens/Compose.js";
import { Dashboard } from "./screens/Dashboard.js";
import { Guides } from "./screens/Guides.js";
import { Pack } from "./screens/Pack.js";
import { SessionDetail, SessionsList } from "./screens/Sessions.js";
import { Specs } from "./screens/Specs.js";
import { Icon } from "./ui.js";

function useRoute(): { hash: string; parts: string[] } {
  const [hash, setHash] = useState(() => window.location.hash || "#/dashboard");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/dashboard");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return { hash, parts: hash.replace(/^#\//, "").split("/") };
}

// Dashboard, Guides and Pack are hidden from the sidebar for now (none is part of the day-to-day
// flow) but stay reachable at their routes, and keep their titles here.
const HIDDEN_FROM_NAV = new Set(["#/dashboard", "#/guides", "#/pack"]);

const NAV: [string, string, LucideIcon][] = [
  ["#/dashboard", "Dashboard", GaugeIcon],
  ["#/sessions", "Sessions", VideoIcon],
  ["#/catalog", "Catalog", BookOpenIcon],
  ["#/compose", "Compose", WandSparklesIcon],
  ["#/guides", "Guides", CompassIcon],
  ["#/pack", "Pack", ArchiveIcon],
  ["#/specs", "Specs", FlaskConicalIcon],
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
    // #/op/<id> is the older link form for the same view.
    case "catalog":
    case "op":
      screen = <Catalog {...(parts[1] ? { selectedId: decodeURIComponent(parts[1]) } : {})} />;
      break;
    case "compose":
      screen = <Compose {...(parts[1] ? { compositionId: parts[1] } : {})} />;
      break;
    case "guides":
      screen = <Guides />;
      break;
    case "pack":
      screen = <Pack />;
      break;
    case "specs":
      screen = <Specs {...(parts[1] ? { selectedId: decodeURIComponent(parts[1]) } : {})} />;
      break;
    default:
      screen = <Dashboard />;
  }

  // One title bar for every screen; the older #/op/<id> links belong to the Catalog.
  const section = parts[0] === "op" ? "catalog" : parts[0];
  const title = NAV.find(([href]) => href === `#/${section}`)?.[1] ?? "Dashboard";

  return (
    <div className="grid min-h-screen grid-cols-[260px_minmax(0,1fr)] max-[900px]:grid-cols-1">
      <aside className="sticky top-0 flex h-screen flex-col gap-3.5 border-r border-[--line] p-4 [background:color-mix(in_srgb,var(--panel)_92%,black_8%)] max-[900px]:static max-[900px]:h-auto max-[900px]:border-b max-[900px]:border-r-0">
        <div className="ml-1.5 mt-1 text-[0.95rem] font-bold lowercase tracking-[0.6px] text-[#f4f8fc]">backbencher</div>
        <nav className="flex flex-col gap-1 max-[900px]:flex-row max-[900px]:flex-wrap">
          {NAV.filter(([href]) => !HIDDEN_FROM_NAV.has(href)).map(([href, label, icon]) => (
            <a
              key={href}
              href={href}
              className={
                `#/${section}` === href || hash.startsWith(href)
                  ? "rounded-[10px] border border-[--line] px-2.5 py-2 text-white [background:color-mix(in_srgb,var(--panel2)_90%,black_10%)]"
                  : "rounded-[10px] border border-transparent px-2.5 py-2 text-[--muted] transition-colors hover:text-[#d9e7f7] hover:no-underline [background:transparent] hover:[background:color-mix(in_srgb,var(--panel2)_86%,black_14%)]"
              }
            >
              <Icon icon={icon} className="mr-2.5 h-4 w-4" />
              {label}
            </a>
          ))}
        </nav>
        <label className="mt-auto flex flex-col items-stretch gap-1.5 rounded-[10px] border border-[--line] p-2.5 text-xs text-[--muted] [background:color-mix(in_srgb,var(--panel2)_88%,black_12%)]">
          analyst
          <input value={analyst} onChange={(e) => setAnalyst(e.target.value)} />
        </label>
      </aside>
      <main className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center border-b border-[--line] bg-[--bg] px-6 max-[900px]:static max-[900px]:px-4">
          <h1 className="m-0 text-base font-semibold">{title}</h1>
        </header>
        {screen}
      </main>
    </div>
  );
}
