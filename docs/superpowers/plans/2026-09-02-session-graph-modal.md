# Session Graph Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline, cramped session dependency graph on the session detail page with a
full-viewport modal opened by an explicit button, showing the graph on the left and per-node
details (raw data, connected values, matched operation) on the right.

**Architecture:** No new packages, no new backend endpoints. Pure `portal-web` UI change:
`packages/portal-web/src/screens/SessionGraph.tsx` grows a new `SessionGraphModal` component (and
private helper components for the right-hand detail panel) alongside the existing graph-layout
logic it already has (timeline positioning, lane packing, ReactFlow node/edge construction).
`packages/portal-web/src/screens/Sessions.tsx` swaps its always-visible inline graph `Panel` for a
button that toggles the modal open.

**Tech Stack:** React 18 + Vite, Tailwind utility classes, ReactFlow (`reactflow` package), tRPC
React Query client (`trpc.*.useQuery`), existing `packages/portal-web/src/ui.tsx` primitives
(`Chip`, `Muted`, `JsonBlock`, `QueryState`). Types come from `@backbencher/schemas`
(`SessionCallEdge`, `OperationDependency`) which `portal-web` already depends on.

**Source spec:** [docs/superpowers/specs/2026-09-02-session-graph-modal-design.md](../specs/2026-09-02-session-graph-modal-design.md)
(committed, approved). This plan implements it end to end; nothing in the spec is deferred.

## Global Constraints

- `packages/portal-web` has **no unit test suite** for React components today (`vitest run
  --passWithNoTests`, zero test files under `packages/portal-web/test/` or co-located). This is an
  existing, accepted state for this package, not something this plan changes. Per-task verification
  therefore uses `pnpm --filter @backbencher/portal-web typecheck` (Vite's `build` does not
  type-check — see [AGENTS.md](../../../AGENTS.md)) plus `pnpm --filter @backbencher/portal-web
  build`, and the final task ends with a manual browser verification checklist instead of an
  automated one. There is no red/green test cycle to run per step in this plan — "verify" below
  means "typecheck + build succeed" unless a step says otherwise.
- Do not touch `packages/derive`, `packages/portal-api`, or any backend router — this feature is
  presentation-only and every field it reads (`sessions.graph`, `operations.get`,
  `dependencies.forOperation`) already exists and is unchanged.
- Keep the existing timeline layout algorithm (`assignLanes`, timestamp-to-x mapping) exactly as
  is — only the width it lays out against becomes responsive (`MIN_NODE_SPACING` from the spec)
  instead of the old fixed `TIMELINE_WIDTH = 1600`.
- Follow existing file conventions: inline `type X` specifiers inside a single `import { ... }`
  statement (already used for the `reactflow` import), `// biome-ignore lint/suspicious/noArrayIndexKey:
  ...` comments for index-keyed derived lists (already used in `OperationDetail.tsx`), Tailwind
  utility classes with the existing CSS custom properties (`--line`, `--panel`, `--panel2`,
  `--muted`, `--border`, `--accent`).

---

## Task 1: Build `SessionGraphModal` and its detail-panel helpers in `SessionGraph.tsx`

**Files:**
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`

**Interfaces (new, this task):**
```typescript
function useContainerWidth(ref: RefObject<HTMLDivElement>): number;

function ConnectedEdges(props: {
  edges: SessionCallEdge[];
  correlationId: string;
  nodesById: Map<string, GraphCallNode>;
}): JSX.Element;

function OperationSummary(props: { operationId: string }): JSX.Element;

function NodeDetails(props: {
  node: GraphCallNode;
  edges: SessionCallEdge[];
  nodesById: Map<string, GraphCallNode>;
}): JSX.Element;

export function SessionGraphModal(props: { sessionId: string; onClose: () => void }): JSX.Element;
```

The existing `export function SessionGraphView(...)`, `GraphCallNode`, `assignLanes`,
`statusVariant`, `CallNode`, `nodeTypes`, `ROW_HEIGHT`, `NODE_WIDTH` stay untouched in this task —
`Sessions.tsx` still imports and renders `SessionGraphView` unmodified, so the app keeps building
and running exactly as before while this task only *adds* new, currently-unused exports. Task 2
wires the new component in and deletes `SessionGraphView`.

### Steps

1. Add the `SessionCallEdge` type import and the width-measuring hook.

   Add to the top of the file, alongside the existing imports:
   ```typescript
   import type { SessionCallEdge } from "@backbencher/schemas";
   ```
   Change the react import line from:
   ```typescript
   import { useMemo, useState } from "react";
   ```
   to:
   ```typescript
   import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
   ```
   Then add this new constant and hook directly below the existing `const TIMELINE_WIDTH = 1600;`
   line (leave `TIMELINE_WIDTH` in place for now — `SessionGraphView` still uses it; it will be
   deleted in Task 2 along with `SessionGraphView`):
   ```typescript
   // Fullscreen modal keeps at least this much horizontal room per node so labels never overlap,
   // growing past the container's width once a session has enough calls to need it.
   const MIN_NODE_SPACING = 260;

   function useContainerWidth(ref: RefObject<HTMLDivElement>): number {
     const [width, setWidth] = useState(1200);
     useEffect(() => {
       const el = ref.current;
       if (!el) return;
       const observer = new ResizeObserver((entries) => {
         const entry = entries[0];
         if (entry) setWidth(entry.contentRect.width);
       });
       observer.observe(el);
       return () => observer.disconnect();
     }, [ref]);
     return width;
   }
   ```
   Verify: no build/typecheck check yet — `useEffect` and `useRef` are unused until steps 2–3 add
   their call sites in this same task; run the typecheck/build verification at the end of step 3
   instead.

2. Add the three right-panel helper components, directly below the existing `CallNode` component
   and `const nodeTypes = { call: CallNode };` line (keep `nodeTypes` where it is):
   ```typescript
   function ConnectedEdges({
     edges,
     correlationId,
     nodesById,
   }: {
     edges: SessionCallEdge[];
     correlationId: string;
     nodesById: Map<string, GraphCallNode>;
   }) {
     const related = edges.filter(
       (e) => e.producerCorrelationId === correlationId || e.consumerCorrelationId === correlationId,
     );
     if (related.length === 0) return <Muted>No connected values.</Muted>;
     return (
       <div className="flex flex-col gap-2">
         {related.map((e, i) => {
           const produced = e.producerCorrelationId === correlationId;
           const other = nodesById.get(produced ? e.consumerCorrelationId : e.producerCorrelationId);
           const otherLabel = other ? `${other.method} ${other.pathname}` : "(unknown call)";
           return (
             // biome-ignore lint/suspicious/noArrayIndexKey: derived list, no stable id
             <div key={i} className="flex items-center gap-1.5 border-b border-[--line] pb-2 text-xs">
               <Chip variant={produced ? "ok" : "human"}>{produced ? "produces" : "consumes"}</Chip>
               <code>{produced ? e.producerJsonPath : e.consumerJsonPath}</code>
               <span className="text-[--muted]">{produced ? "→" : "←"}</span>
               <span className="truncate">{otherLabel}</span>
               {e.confidence === "weak" && <Chip variant="warn">weak</Chip>}
             </div>
           );
         })}
       </div>
     );
   }

   function OperationSummary({ operationId }: { operationId: string }) {
     const op = trpc.operations.get.useQuery({ operationId });
     const dep = trpc.dependencies.forOperation.useQuery({ operationId });

     if (op.isLoading) return <Muted>loading operation…</Muted>;
     if (!op.data) return <Muted>not yet classified into the catalog</Muted>;

     const { operation } = op.data;
     return (
       <div className="flex flex-col gap-2 text-xs">
         <div className="flex items-center gap-1.5">
           <span className="font-bold">{operation.name || "(unnamed)"}</span>
           {operation.productArea && <Chip>{operation.productArea}</Chip>}
         </div>
         {operation.does && <div className="text-[--muted]">{operation.does}</div>}
         {dep.data && (
           <>
             <div>
               Auth required:{" "}
               <Chip variant={dep.data.authRequired ? "warn" : "derived"}>
                 {dep.data.authRequired ? "yes" : "no"}
               </Chip>
             </div>
             {dep.data.requires.length > 0 && (
               <div>
                 <div className="mb-1 font-bold">Requires</div>
                 {dep.data.requires.map((r, i) => (
                   // biome-ignore lint/suspicious/noArrayIndexKey: derived list, no stable id
                   <div key={i} className="mb-1">
                     <code>
                       {r.consumerSlot.location}.{r.consumerSlot.path}
                     </code>{" "}
                     {r.role && <Chip>{r.role}</Chip>}
                   </div>
                 ))}
               </div>
             )}
             {dep.data.produces.length > 0 && (
               <div>
                 <div className="mb-1 font-bold">Produces</div>
                 {dep.data.produces.map((p, i) => (
                   // biome-ignore lint/suspicious/noArrayIndexKey: derived list, no stable id
                   <div key={i} className="mb-1">
                     <code>{p.path}</code> {p.role && <Chip>{p.role}</Chip>}
                   </div>
                 ))}
               </div>
             )}
           </>
         )}
       </div>
     );
   }

   function NodeDetails({
     node,
     edges,
     nodesById,
   }: {
     node: GraphCallNode;
     edges: SessionCallEdge[];
     nodesById: Map<string, GraphCallNode>;
   }) {
     return (
       <div className="flex flex-col gap-4">
         <div>
           <div className="mb-1 text-xs text-[--muted]">
             {node.method} {node.pathname}
           </div>
           <JsonBlock value={node} />
         </div>
         <div>
           <h4 className="mb-1.5 text-xs font-bold uppercase tracking-[0.4px] text-[--muted]">Connected values</h4>
           <ConnectedEdges edges={edges} correlationId={node.correlationId} nodesById={nodesById} />
         </div>
         {node.operationId && (
           <div>
             <h4 className="mb-1.5 text-xs font-bold uppercase tracking-[0.4px] text-[--muted]">Matched operation</h4>
             <OperationSummary operationId={node.operationId} />
           </div>
         )}
       </div>
     );
   }
   ```
   Verify: no build/typecheck check yet — these helpers aren't referenced until step 3 wires them
   into `SessionGraphModal`; run the typecheck/build verification at the end of step 3 instead.

3. Add the `SessionGraphModal` component itself, directly below the code added in step 2 (still
   above the existing `export function SessionGraphView(...)`):
   ```typescript
   export function SessionGraphModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
     const graph = trpc.sessions.graph.useQuery({ sessionId });
     const [selectedId, setSelectedId] = useState<string | null>(null);
     const containerRef = useRef<HTMLDivElement>(null);
     const containerWidth = useContainerWidth(containerRef);

     useEffect(() => {
       const onKey = (e: KeyboardEvent) => {
         if (e.key === "Escape") onClose();
       };
       window.addEventListener("keydown", onKey);
       return () => window.removeEventListener("keydown", onKey);
     }, [onClose]);

     const { nodes, edges } = useMemo(() => {
       const graphNodes = graph.data?.nodes ?? [];
       const graphEdges = graph.data?.edges ?? [];
       if (graphNodes.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

       const minTs = Math.min(...graphNodes.map((n) => n.requestTimestamp));
       const maxTs = Math.max(...graphNodes.map((n) => n.responseTimestamp ?? n.requestTimestamp));
       const span = Math.max(1, maxTs - minTs);
       const lanes = assignLanes(graphNodes);
       const timelineWidth = Math.max(containerWidth, graphNodes.length * MIN_NODE_SPACING);

       const rfNodes: Node[] = graphNodes.map((n) => ({
         id: n.correlationId,
         type: "call",
         position: {
           x: ((n.requestTimestamp - minTs) / span) * timelineWidth,
           y: (lanes.get(n.correlationId) ?? 0) * ROW_HEIGHT,
         },
         data: { node: n },
       }));

       const rfEdges: Edge[] = graphEdges.map((e, i) => ({
         id: `${e.producerCorrelationId}-${e.consumerCorrelationId}-${i}`,
         source: e.producerCorrelationId,
         target: e.consumerCorrelationId,
         label: `${e.producerJsonPath} → ${e.consumerJsonPath}`,
         labelStyle: { fill: "#dbe5ef", fontSize: 10 },
         labelBgStyle: { fill: "#0a1016" },
         ...(e.confidence === "weak" ? { style: { strokeDasharray: "4 4" } } : {}),
       }));

       return { nodes: rfNodes, edges: rfEdges };
     }, [graph.data, containerWidth]);

     const nodesById = useMemo(() => {
       const map = new Map<string, GraphCallNode>();
       for (const n of graph.data?.nodes ?? []) map.set(n.correlationId, n);
       return map;
     }, [graph.data]);

     const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null;
     const graphEdgesRaw = graph.data?.edges ?? [];

     return (
       <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
         <div
           className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-[--line] bg-[--panel]"
           onClick={(e) => e.stopPropagation()}
         >
           <header className="flex items-center justify-between border-b border-[--line] bg-[--panel2] px-4 py-2.5">
             <h3 className="m-0 text-sm">Session {sessionId} — dependency graph</h3>
             <button type="button" className="rounded-md border border-[--border] px-2 py-1 text-xs" onClick={onClose}>
               ✕ close
             </button>
           </header>
           <div className="flex min-h-0 flex-1">
             <div ref={containerRef} className="relative min-h-0 flex-1 border-r border-[--line]">
               <QueryState isLoading={graph.isLoading} error={graph.error} />
               {graph.data && graph.data.nodes.length === 0 && <Muted>No API calls to graph in this session.</Muted>}
               {graph.data && graph.data.nodes.length > 0 && (
                 <ReactFlowProvider>
                   <ReactFlow
                     nodes={nodes}
                     edges={edges}
                     nodeTypes={nodeTypes}
                     onNodeClick={(_, node) => setSelectedId(node.id)}
                     fitView
                     proOptions={{ hideAttribution: true }}
                   >
                     <Background />
                     <Controls />
                     <MiniMap />
                   </ReactFlow>
                 </ReactFlowProvider>
               )}
             </div>
             <div className="w-[380px] overflow-y-auto p-4">
               {selectedNode ? (
                 <NodeDetails node={selectedNode} edges={graphEdgesRaw} nodesById={nodesById} />
               ) : (
                 <Muted>Select a call to see its details.</Muted>
               )}
             </div>
           </div>
         </div>
       </div>
     );
   }
   ```
   Verify: `pnpm --filter @backbencher/portal-web typecheck` succeeds and `pnpm --filter
   @backbencher/portal-web build` succeeds. `SessionGraphView` and its call site in `Sessions.tsx`
   are untouched, so the app behaves exactly as before this task — only new, not-yet-referenced
   exports were added.

4. Commit: `git add packages/portal-web/src/screens/SessionGraph.tsx && git commit -m "Add
   SessionGraphModal with responsive layout and detail panel"`.

---

## Task 2: Wire the modal into the session detail page and remove the old inline view

**Files:**
- Modify: `packages/portal-web/src/screens/Sessions.tsx`
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`

### Steps

1. In `packages/portal-web/src/screens/Sessions.tsx`, change the import and add the open/close
   state. Replace:
   ```typescript
   import { SessionGraphView } from "./SessionGraph.js";
   ```
   with:
   ```typescript
   import { SessionGraphModal } from "./SessionGraph.js";
   ```
   Then in `export function SessionDetail({ sessionId }: { sessionId: string }) {`, replace:
   ```typescript
   export function SessionDetail({ sessionId }: { sessionId: string }) {
     const timeline = trpc.sessions.timeline.useQuery({ sessionId });
     const calls = buildApiCalls(timeline.data?.events ?? []);
     return (
       <>
         <Panel
           title={`Session ${sessionId}`}
           actions={<a href="#/sessions">← all sessions</a>}
         >
           <Muted>{timeline.data?.meta?.startUrl ?? ""}</Muted>
         </Panel>

         <Panel title="Dependency graph">
           <SessionGraphView sessionId={sessionId} />
         </Panel>
   ```
   with:
   ```typescript
   export function SessionDetail({ sessionId }: { sessionId: string }) {
     const timeline = trpc.sessions.timeline.useQuery({ sessionId });
     const calls = buildApiCalls(timeline.data?.events ?? []);
     const [graphOpen, setGraphOpen] = useState(false);
     return (
       <>
         <Panel
           title={`Session ${sessionId}`}
           actions={
             <div className="flex items-center gap-3">
               <button
                 type="button"
                 className="rounded-lg border border-[--border] px-2.5 py-1.5"
                 onClick={() => setGraphOpen(true)}
               >
                 View dependency graph
               </button>
               <a href="#/sessions">← all sessions</a>
             </div>
           }
         >
           <Muted>{timeline.data?.meta?.startUrl ?? ""}</Muted>
         </Panel>

         {graphOpen && <SessionGraphModal sessionId={sessionId} onClose={() => setGraphOpen(false)} />}
   ```
   `useState` is already imported at the top of `Sessions.tsx` (`import { useEffect, useState }
   from "react";`), so no import change is needed for it.

   Verify: `pnpm --filter @backbencher/portal-web typecheck` succeeds. `SessionGraphView` still
   exists in `SessionGraph.tsx` but is no longer imported anywhere — that's not a type error, just
   dead code that step 2 removes next. If typecheck fails here, the likely cause is a stray
   leftover `<Panel title="Dependency graph">` closing tag; diff against the replacement above.

2. In `packages/portal-web/src/screens/SessionGraph.tsx`, delete the now-unused
   `export function SessionGraphView({ sessionId }: { sessionId: string }) { ... }` function in its
   entirety (the whole block, from `export function SessionGraphView` through its closing `}`) —
   nothing else references it after step 1. Also delete the now-unused `const TIMELINE_WIDTH =
   1600;` line, since only `SessionGraphView` used it (`SessionGraphModal` uses the computed
   `timelineWidth` local instead).

   Verify: `pnpm --filter @backbencher/portal-web typecheck` succeeds (confirms nothing else
   referenced `SessionGraphView` or `TIMELINE_WIDTH`) and `pnpm --filter @backbencher/portal-web
   build` succeeds.

3. Manual verification (no automated UI test suite exists for this package — see Global
   Constraints):
   - Run `pnpm --filter @backbencher/portal-api dev` (or the repo's usual `bash scripts/serve.sh
     <port>`) and `pnpm --filter @backbencher/portal-web dev`, or the combined serve script.
   - Open a session that has dataflow edges (e.g. one derived from the cookie-auth fixture/fix, or
     any recorded session with a login followed by an authenticated call).
   - Confirm the "Dependency graph" panel is gone from the session page and a "View dependency
     graph" button appears next to "← all sessions".
   - Click the button: the modal opens full-viewport with the graph on the left and a "Select a
     call to see its details" placeholder on the right.
   - Click a node: right panel populates with raw JSON, a "Connected values" section (showing
     produces/consumes rows when edges touch that node, or "No connected values." otherwise), and a
     "Matched operation" section when the node has a classified `operationId`.
   - Close the modal via: clicking "✕ close", clicking the dark backdrop outside the panel, and
     pressing Escape. All three must close it.
   - Resize the browser window narrower and wider: the graph's node spacing should never collapse
     below readable width (`MIN_NODE_SPACING`), and should use the full available width when there
     are few nodes.

4. Commit: `git add packages/portal-web/src/screens/Sessions.tsx
   packages/portal-web/src/screens/SessionGraph.tsx && git commit -m "Open session dependency
   graph in a fullscreen modal instead of an inline panel"`.

---

## Self-Review Checklist (completed before handoff)

- [x] Every "Changes" section in the approved spec is covered: modal shell (overlay, Escape,
      backdrop click, header/close button) — Task 1 step 3; two-column responsive layout with
      `MIN_NODE_SPACING` — Task 1 step 3; right panel's three sections (raw JSON, connected edges,
      matched operation) — Task 1 steps 2–3; `Sessions.tsx` button/state wiring and removal of the
      inline panel — Task 2 step 1; deletion of the old `SessionGraphView`/`TIMELINE_WIDTH` — Task
      2 step 2.
- [x] No placeholder code, `// TODO`, or "implement X here" markers — every step contains complete,
      compilable code.
- [x] Type consistency checked against real source: `SessionCallEdge`, `SessionGraphNode`,
      `OperationDependency`, `DependencySlot` fields verified against
      [packages/schemas/src/apimodel.ts](../../../packages/schemas/src/apimodel.ts); `MergedOperation`
      fields (`name`, `does`, `productArea`) verified against
      [packages/store/src/merge.ts](../../../packages/store/src/merge.ts); router return shapes
      verified against [packages/portal-api/src/routers.ts](../../../packages/portal-api/src/routers.ts).
- [x] Global Constraints correctly reflect that `portal-web` has no unit test suite — verification
      steps use typecheck/build/manual checklist, not fabricated automated tests.
