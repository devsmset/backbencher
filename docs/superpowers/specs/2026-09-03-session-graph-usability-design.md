# Session dependency graph: spacing, drag, and request/response detail

Date: 2026-09-03
Status: approved, not yet implemented

## Problem

The fullscreen `SessionGraphModal` (shipped 2026-09-02) is still hard to use in practice:

1. **Nodes crowd together.** X-position is `((requestTimestamp - minTs) / span) * timelineWidth`
   — purely proportional to elapsed time. A burst of calls firing within milliseconds of each
   other lands at nearly identical x regardless of `MIN_NODE_SPACING`/`timelineWidth`, so same-lane
   nodes visually overlap. The `MIN_NODE_SPACING` comment claims spacing is guaranteed; it isn't.
2. **Dragging doesn't stick.** ReactFlow nodes have no `onNodesChange` wired up, so a dragged
   node's new position is discarded on the next render driven by any state change — dragging
   *looks* interactive but the result doesn't persist.
3. **The right panel only shows thin call metadata** (`correlationId`, `method`, `pathname`,
   `status`, timestamps) via a raw `JsonBlock` dump — never the actual request/response headers
   and body, even though that data already exists one layer down (`PairedCall`, used internally by
   `sessions.graph` but not returned to the client).
4. **The right panel is a fixed 380px** — too narrow for headers/body once shown at all, and not
   adjustable.

## Decision

Four independent, additive changes to `packages/portal-web/src/screens/SessionGraph.tsx` plus a
small schema/router extension. No new endpoints; no changes to `sessions.timeline` or
`Sessions.tsx`'s `buildApiCalls()` — those are unrelated to this graph view.

### 1. Request/response signature — extend `sessions.graph`'s existing payload

`packages/portal-api/src/routers.ts`'s `graph` procedure already builds each node from a
`PairedCall` (via `pairCalls()`), which already carries `requestHeaders`, `requestBody`,
`responseHeaders`, `responseBody`, `responseBodyKind` — the procedure just doesn't map them onto
the node objects it returns. Fix is additive on both ends:

- `packages/schemas/src/apimodel.ts`: add to `SessionGraphNodeSchema` —
  `requestHeaders: z.record(z.string())`, `requestBody: z.unknown()`,
  `responseHeaders: z.record(z.string())`, `responseBody: z.unknown()`,
  `responseBodyKind: z.string().nullable()`. Naming matches this schema's existing
  `requestTimestamp`/`responseTimestamp` convention (not `Sessions.tsx`'s local `reqHeaders`/
  `resHeaders` abbreviation).
- `packages/portal-api/src/routers.ts`: add the same five fields to the `nodes.map((c) => ({ ... }))`
  in the `graph` procedure, read straight off `c`.
- Regenerate `packages/schemas/generated/jsonschema/SessionGraph.schema.json` via
  `pnpm --filter @backbencher/schemas gen:jsonschema`.
- `packages/portal-web/src/screens/SessionGraph.tsx`: extend the local `GraphCallNode` interface
  with the same five fields. Rework `NodeDetails` to replace the current
  `<JsonBlock value={node} />` (raw metadata dump) with two explicit sections — "Request"
  (`JsonBlock value={{ headers: node.requestHeaders, body: node.requestBody }}`) and "Response"
  (`JsonBlock value={{ bodyKind: node.responseBodyKind, headers: node.responseHeaders, body:
  node.responseBody }}`) — mirroring the shape already used by `Sessions.tsx`'s per-call
  accordion. The method/pathname/status summary line above them stays.

### 2. Node spacing — per-lane collision-avoidance nudge

Keep timestamp-proportional x as the base position (preserves "real elapsed time" reading), then
add a nudge pass: within each lane (already computed by `assignLanes`), sorted by x ascending,
push each node right of its predecessor by at least `MIN_NODE_SPACING` if it isn't already:

```ts
for (let i = 1; i < laneNodes.length; i++) {
  laneNodes[i].x = Math.max(laneNodes[i].x, laneNodes[i - 1].x + MIN_NODE_SPACING);
}
```

Isolated/well-spaced nodes are untouched; only genuinely overlapping same-lane nodes move. Correct
the `MIN_NODE_SPACING` comment, which currently overclaims this guarantee already holds.

### 3. Drag-and-drop persistence

Switch from a plain `nodes={nodes}` prop to ReactFlow's `useNodesState(initialNodes)` +
`onNodesChange={onNodesChange}`, seeded from the memoized layout (§2's output). When
`graph.data`/`containerWidth` change (new session opened, or the window resizes), the node state
resets to the freshly computed layout — dragged positions persist only for the lifetime of one
layout generation, not across a resize or modal reopen. No persisted/saved layout; this is a
deliberate scope cut.

### 4. Resizable right panel

Replace the fixed `w-[380px]` column with a draggable split:

- A new thin (`w-1`, `cursor-col-resize`) drag-handle `div` between the graph column and the
  detail column, inside the existing `flex min-h-0 flex-1` row.
- New state `rightPanelWidth` (default `420px`). Pointer handlers on the handle: `onPointerDown`
  starts tracking; while dragging, `pointermove`/`pointerup` listeners on `window` (added/removed
  via `useEffect`) update `rightPanelWidth` from the cursor's distance to the container's right
  edge, clamped to **min 320px** and **max 60% of total modal width**.
- Left graph column stays `flex-1`; right column switches from `w-[380px]` to
  `style={{ width: rightPanelWidth }}`.
- The graph re-fits when the split moves: a small child component rendered inside
  `ReactFlowProvider` calls `useReactFlow()` and re-runs `fitView()` in a `useEffect` keyed on
  `rightPanelWidth` (and `containerWidth`, closing the existing gap where `fitView` was mount-only).

## Rejected alternatives

- **Index-based node spacing** (position = call order × fixed spacing, discussed and rejected):
  would guarantee no overlap outright but discards the "x reflects real elapsed time" property the
  graph currently has. Collision-avoidance nudging (§2) keeps that property for the common case
  and only intervenes where nodes would otherwise overlap.
- **Reuse `sessions.timeline` + shared `buildApiCalls`-style matching on the frontend** for
  request/response data (discussed and rejected in favor of §1): would avoid a schema/router
  change but means fetching and re-parsing the full raw timeline a second time inside the modal,
  duplicating matching logic `Sessions.tsx` already has. Extending `sessions.graph`, which already
  has the paired data on the server, is less code overall.
- **Fixed wider right panel** (e.g. bump 380px → 560px, no resize) — rejected in favor of a
  resizable split (§4); a fixed width can't fit both a compact status bar and a wide JSON body well
  in every session.

## Testing / verification

`portal-web` has no unit test suite (Vite-built, type-checked separately via `pnpm -r typecheck`) —
unchanged convention, no new test files there.

- `packages/schemas` and `packages/portal-api` do have test suites, but neither currently has any
  test touching `SessionGraphNodeSchema` or the `graph` procedure. Add one small test in each
  confirming the five new fields round-trip through the schema and through the router (new
  coverage, not an extension of an existing case).
- `pnpm -r typecheck` and `pnpm -r build` succeed.
- Manual verification in the browser against a real recorded session with concurrent/bursty calls:
  1. No two same-lane nodes visually overlap.
  2. Dragging a node holds its new position while the modal stays open; opening a different
     session or resizing the window resets to the computed layout.
  3. Clicking a node shows distinct Request and Response sections with headers and body.
  4. Dragging the new divider resizes both panes live, clamps at the min/max, and the graph
     re-fits.
