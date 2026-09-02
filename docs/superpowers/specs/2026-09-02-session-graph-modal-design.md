# Session dependency graph: fullscreen popup

Date: 2026-09-02
Status: approved, not yet implemented

## Problem

The session detail page renders the dependency graph inline in a fixed 420px-tall panel
([SessionGraph.tsx](../../../packages/portal-web/src/screens/SessionGraph.tsx)), with node
positions laid out across a hardcoded `TIMELINE_WIDTH = 1600`. For sessions with many calls, nodes
overlap and the graph is hard to read. Clicking a node currently reveals only the raw call JSON
below the graph, in the same cramped space.

## Decision

Remove the inline graph entirely. The session page shows a button that opens the graph in a
fullscreen overlay modal. Inside the modal, the graph fills the left side of a two-column layout;
clicking a node populates a right-side details panel. Node layout width is computed from the
modal's actual size instead of a hardcoded constant, with a minimum per-node spacing, so nodes
never crowd together — ReactFlow's existing pan/zoom/`fitView` handles the rest.

Rejected alternative: keep the inline graph and add an "expand" affordance next to it. Rejected
per direct instruction — the graph should only ever render inside the popup, not duplicated inline.

Rejected alternative: use the browser's native Fullscreen API (`element.requestFullscreen()`).
Rejected — hides browser chrome and requires a user gesture with different semantics than a normal
in-page modal; a full-viewport overlay (`fixed inset-0`) is simpler and matches how the rest of the
app already works (no modal precedent exists yet, so this sets the pattern).

No new backend endpoints are needed. The right panel reuses:
- `trpc.sessions.graph` (already fetched for the graph itself) — filtered client-side for edges
  touching the selected node.
- `trpc.operations.get` — same query `OperationDetail` uses for merged annotation + dataflow.
- `trpc.dependencies.forOperation` — same query `OperationDetail` uses for requires/produces/
  clientGenerated/authRequired.

## Changes

### 1. `packages/portal-web/src/screens/SessionGraph.tsx`

Replace the exported `SessionGraphView` with `SessionGraphModal({ sessionId, onClose }: { sessionId:
string; onClose: () => void })`.

- **Overlay shell:** `fixed inset-0 z-50` backdrop (click closes), containing a header (title
  `Session <id> — dependency graph`, close `✕` button) and the two-column body. An `Escape`
  keydown listener (via `useEffect`) calls `onClose`. Clicks inside the panel call
  `stopPropagation` so they don't bubble to the backdrop.
- **Left column (`flex-1 min-h-0`):** the existing `ReactFlow` graph, now sized to fill the modal
  instead of a capped `h-[420px]` box.
- **Right column (fixed width, e.g. `w-[380px]`, `overflow-y-auto`):** renders a "select a call to
  see its details" placeholder when nothing is selected; otherwise the three subsections in
  §2 below.
- **Responsive layout:** replace the `TIMELINE_WIDTH` constant with a measured container width
  (`ResizeObserver` on the graph container ref, stored in state). Add `MIN_NODE_SPACING = 260`
  (node width 220 + 40 gutter). Compute `effectiveWidth = Math.max(containerWidth, graphNodes.length
  * MIN_NODE_SPACING)` and use it in place of `TIMELINE_WIDTH` in the existing x-position
  calculation. `ROW_HEIGHT`/lane assignment (vertical spacing) is unchanged.

### 2. Right panel content (in order)

1. **Call details** — the same `JsonBlock` of the selected `SessionGraphNode` shown today.
2. **Connected edges** — filter the modal's already-fetched `graph.edges` for
   `producerCorrelationId === selected.correlationId || consumerCorrelationId ===
   selected.correlationId`; render each as `{jsonPath} → {other call's method + pathname}` with a
   direction indicator (produced vs. consumed), reusing the existing `Chip` for `confidence ===
   "weak"`.
3. **Matched operation** — only when `selected.operationId` is not null: fire
   `trpc.operations.get({ operationId })` and `trpc.dependencies.forOperation({ operationId })`,
   condensed to name/does/productArea/sideEffect and requires/produces/authRequired (same fields
   `OperationDetail` shows, not the full tab UI). Render nothing extra when `operationId` is null
   (unclassified call).

### 3. `packages/portal-web/src/screens/Sessions.tsx`

In `SessionDetail`:
- Remove `<Panel title="Dependency graph"><SessionGraphView sessionId={sessionId} /></Panel>`.
- Add local state `const [graphOpen, setGraphOpen] = useState(false)`.
- Add a "View dependency graph" button into the top `Panel`'s existing `actions` slot, alongside
  the current `← all sessions` link, that sets `graphOpen = true`.
- Conditionally render `{graphOpen && <SessionGraphModal sessionId={sessionId} onClose={() =>
  setGraphOpen(false)} />}`.
- Remove the now-unused `SessionGraphView` import; import `SessionGraphModal` instead.

## Testing / verification

`portal-web` has no unit test suite (Vite-built, type-checked separately via `pnpm -r typecheck`).
Verification is manual:
1. `pnpm --filter @backbencher/portal-web build` (and `pnpm -r typecheck`) succeed.
2. Serve the portal, open a session with existing dataflow edges (e.g. the cookie-auth session
   fixed in the recent `Set-Cookie`/`Cookie` dataflow change), click "View dependency graph".
3. Confirm: modal opens fullscreen; graph nodes have visible spacing at various window sizes;
   clicking a node populates all three right-panel sections; `Escape`, the `✕` button, and a
   backdrop click all close the modal; clicking inside the panel does not close it.
