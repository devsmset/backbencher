# Session Graph Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `SessionGraphModal` graph usable: guarantee node spacing, make node dragging
actually persist, show full request/response headers+body when a node is selected, and make the
right detail panel resizable.

**Architecture:** One small additive backend change (extend `SessionGraphNodeSchema` +
`sessions.graph` router with fields the server already has in-hand) followed by four
independent, sequential edits to the single `packages/portal-web/src/screens/SessionGraph.tsx`
file: request/response rendering, node-spacing nudge, drag persistence, resizable split panel.

**Tech Stack:** Zod (`packages/schemas`), Fastify + tRPC (`packages/portal-api`), React 18 + Vite +
Tailwind + ReactFlow v11 (`packages/portal-web`). Vitest for the two packages that have test
suites; `packages/portal-web` has none (see Global Constraints).

**Source spec:** [docs/superpowers/specs/2026-09-03-session-graph-usability-design.md](../specs/2026-09-03-session-graph-usability-design.md)
(committed, approved). This plan implements it end to end; nothing in the spec is deferred.

## Global Constraints

- `packages/portal-web` has **no unit test suite** (`vitest run --passWithNoTests`, zero test
  files). Existing, accepted convention — not something this plan changes. Its tasks verify with
  `pnpm --filter @backbencher/portal-web typecheck` (Vite's `build` does not type-check) plus
  `pnpm --filter @backbencher/portal-web build`; the final task is a manual browser checklist.
- Packages resolve each other via compiled `dist/`, not live source. Build order:
  schemas → shared → llm → derive → store → agent → testkit → recorder → portal-api → portal-web →
  cli. Task 1 changes `packages/schemas` and `packages/portal-api`; **both must be rebuilt** before
  Task 2's `portal-web` typecheck will see the new fields (`portal-web` imports `SessionGraphNode`
  types from `@backbencher/schemas` and the `AppRouter` type from `@backbencher/portal-api`).
- Do not touch `Sessions.tsx` or `sessions.timeline` — unrelated to this work.
- `dataDir()` (from `@backbencher/shared`) is not mockable — it always resolves to the real
  `<repoRoot>/data` by walking up from `process.cwd()`. Established convention: portal-api's test
  suite never exercises `sessionsRouter` procedures that read from disk (`timeline`, `graph`) —
  keep that convention. Task 1 does not add a portal-api test for the `graph` router's new field
  mapping; it adds a `packages/derive` regression test instead (in-memory fixtures, no disk I/O),
  and the router change itself is covered by build/typecheck only, the same way `apps/cli`'s
  leaf-consumer changes are.
- Keep the existing timestamp-proportional x-position calculation and `assignLanes` lane (row)
  assignment exactly as they are; the nudge pass in Task 3 is a step added *after* that
  calculation, not a replacement for it.
- Follow existing file conventions already in `SessionGraph.tsx`: inline `type X` specifiers
  inside a single `import { ... }` statement, Tailwind utility classes with the existing CSS
  custom properties (`--line`, `--panel`, `--panel2`, `--muted`, `--border`, `--accent`).

---

## Task 1: Add request/response fields to `SessionGraphNodeSchema` and the `graph` router

**Files:**
- Modify: `packages/schemas/src/apimodel.ts`
- Modify: `packages/portal-api/src/routers.ts`
- Test: `packages/schemas/test/schemas.test.ts`
- Test (new file): `packages/derive/test/pairCalls.test.ts`

**Interfaces:**
- Produces: `SessionGraphNodeSchema` (and its inferred `SessionGraphNode` type) gains five fields:
  `requestHeaders: Record<string, string>`, `requestBody: unknown`,
  `responseHeaders: Record<string, string>`, `responseBody: unknown`,
  `responseBodyKind: string | null`. Every later task in this plan (all in `portal-web`) consumes
  these exact field names.

### Steps

- [ ] **Step 1: Write the failing schema test**

Add to `packages/schemas/test/schemas.test.ts` (new top-level `describe`, anywhere after the
existing ones — it imports `SessionGraphNodeSchema`, which `export * from "./apimodel.js"` in
`packages/schemas/src/index.ts` already re-exports):

```typescript
import { SessionGraphNodeSchema } from "../src/index.js";

describe("session graph node schema", () => {
  it("parses a node with request/response headers and body", () => {
    const node = {
      correlationId: "01J000000000000000000REQ01",
      operationId: "op_abc",
      method: "GET",
      host: "example.net",
      pathname: "/bo/userProfile",
      status: 200,
      requestTimestamp: 1,
      responseTimestamp: 2,
      requestHeaders: { authorization: "Bearer t" },
      requestBody: null,
      responseHeaders: { "content-type": "application/json" },
      responseBody: { ok: true },
      responseBodyKind: "json",
    };
    expect(SessionGraphNodeSchema.parse(node)).toMatchObject({ responseBodyKind: "json" });
  });

  it("rejects a node missing the new required fields", () => {
    expect(() =>
      SessionGraphNodeSchema.parse({
        correlationId: "c1",
        operationId: null,
        method: "GET",
        host: "h",
        pathname: "/x",
        status: null,
        requestTimestamp: 1,
        responseTimestamp: null,
      }),
    ).toThrow();
  });
});
```

Add the `SessionGraphNodeSchema` name to the existing named import from `"../src/index.js"` at the
top of the file if you added a separate `import` line above — merge it into the existing import
statement instead of leaving two.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @backbencher/schemas test`
Expected: FAIL — `SessionGraphNodeSchema.parse(node)` throws because the schema doesn't yet accept
the five new keys under `.strict()`-free `z.object` (actually: it will fail because extra keys are
silently stripped by default `z.object`, so the *first* test passes trivially but the assertion
`toMatchObject({ responseBodyKind: "json" })` fails since `responseBodyKind` isn't a recognized
key yet and gets stripped to `undefined`). Confirm the failure message mentions `responseBodyKind`.

- [ ] **Step 3: Extend `SessionGraphNodeSchema`**

In `packages/schemas/src/apimodel.ts`, change:

```typescript
export const SessionGraphNodeSchema = z.object({
  correlationId: z.string(),
  operationId: z.string().nullable(), // null if templatization couldn't classify this call
  method: z.string(),
  host: z.string(),
  pathname: z.string(),
  status: z.number().int().nullable(),
  requestTimestamp: z.number().int(),
  responseTimestamp: z.number().int().nullable(),
});
```

to:

```typescript
export const SessionGraphNodeSchema = z.object({
  correlationId: z.string(),
  operationId: z.string().nullable(), // null if templatization couldn't classify this call
  method: z.string(),
  host: z.string(),
  pathname: z.string(),
  status: z.number().int().nullable(),
  requestTimestamp: z.number().int(),
  responseTimestamp: z.number().int().nullable(),
  requestHeaders: z.record(z.string()),
  requestBody: z.unknown(),
  responseHeaders: z.record(z.string()),
  responseBody: z.unknown(),
  responseBodyKind: z.string().nullable(),
});
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm --filter @backbencher/schemas test`
Expected: PASS (both new tests).

- [ ] **Step 5: Regenerate the JSON Schema artifact**

Run: `pnpm --filter @backbencher/schemas build && pnpm --filter @backbencher/schemas gen:jsonschema`
Expected: `packages/schemas/generated/jsonschema/SessionGraph.schema.json` is rewritten and its
`SessionGraphNode` definition now lists the five new properties. Confirm with:
`grep -c responseBodyKind packages/schemas/generated/jsonschema/SessionGraph.schema.json` → at
least `1`.

- [ ] **Step 6: Add a derive-layer regression test for the fields the router will depend on**

`pairCalls()` (`packages/derive/src/pairCalls.ts`) already populates `requestHeaders`,
`requestBody`, `responseHeaders`, `responseBody`, `responseBodyKind` on every `PairedCall` — this
plan does not change that file. Since the `graph` router (Step 8 below) is about to start relying
on those fields, and no test currently pins that behavior down, add one now as a regression guard.
This test passes immediately (there is no red phase — the behavior under test already exists and
is intentionally left unchanged); its purpose is to fail loudly in the future if `pairCalls`
regresses, since the router now depends on it.

Create `packages/derive/test/pairCalls.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { pairCalls } from "../src/pairCalls.js";

describe("pairCalls", () => {
  it("carries request/response headers, body, and bodyKind onto the paired call", () => {
    resetClock();
    const session = makeSession("sess-headers", [
      ...apiCall("c1", {
        url: "https://app.example.net/bo/userProfile",
        reqHeaders: { authorization: "Bearer t" },
        postData: '{"q":1}',
        resHeaders: { "content-type": "application/json" },
        body: { ok: true },
        bodyKind: "json",
      }),
    ]);
    const [call] = pairCalls(session);

    expect(call.requestHeaders).toEqual({ authorization: "Bearer t" });
    expect(call.requestBody).toEqual({ q: 1 });
    expect(call.responseHeaders).toEqual({ "content-type": "application/json" });
    expect(call.responseBody).toEqual({ ok: true });
    expect(call.responseBodyKind).toBe("json");
  });
});
```

- [ ] **Step 7: Run the derive test to confirm it passes**

Run: `pnpm --filter @backbencher/derive test`
Expected: PASS, including this new test (no code change in this package — confirms the fields the
router is about to consume already exist and are already populated).

- [ ] **Step 8: Map the new fields in the `graph` router**

In `packages/portal-api/src/routers.ts`, change:

```typescript
      const nodes = calls.map((c) => ({
        correlationId: c.correlationId,
        operationId: callOp.get(c) ?? null,
        method: c.method,
        host: c.host,
        pathname: c.pathname,
        status: c.status,
        requestTimestamp: c.requestTimestamp,
        responseTimestamp: c.responseTimestamp,
      }));
```

to:

```typescript
      const nodes = calls.map((c) => ({
        correlationId: c.correlationId,
        operationId: callOp.get(c) ?? null,
        method: c.method,
        host: c.host,
        pathname: c.pathname,
        status: c.status,
        requestTimestamp: c.requestTimestamp,
        responseTimestamp: c.responseTimestamp,
        requestHeaders: c.requestHeaders,
        requestBody: c.requestBody,
        responseHeaders: c.responseHeaders,
        responseBody: c.responseBody,
        responseBodyKind: c.responseBodyKind,
      }));
```

This is not covered by an automated test: `packages/portal-api`'s test suite deliberately never
exercises `sessionsRouter` procedures that read from disk (`dataDir()` is not mockable — see
Global Constraints), so this router change is verified by typecheck/build only, same as Step 9.

- [ ] **Step 9: Full-package verification**

Run: `pnpm --filter @backbencher/schemas build && pnpm --filter @backbencher/schemas typecheck &&
pnpm --filter @backbencher/derive build && pnpm --filter @backbencher/derive typecheck &&
pnpm --filter @backbencher/portal-api build && pnpm --filter @backbencher/portal-api typecheck`
Expected: all succeed with no errors. (This build is required for Task 2 to see the new fields.)

- [ ] **Step 10: Commit**

```bash
git add packages/schemas/src/apimodel.ts packages/schemas/test/schemas.test.ts \
  packages/schemas/generated/jsonschema/SessionGraph.schema.json \
  packages/derive/test/pairCalls.test.ts packages/portal-api/src/routers.ts
git commit -m "feat(schemas,portal-api): add request/response headers+body to session graph nodes"
```

---

## Task 2: Show Request/Response sections in the node detail panel

**Files:**
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`

**Interfaces:**
- Consumes: `SessionGraphNode`'s five new fields from Task 1 (`requestHeaders`, `requestBody`,
  `responseHeaders`, `responseBody`, `responseBodyKind`), available once `packages/schemas` and
  `packages/portal-api` are rebuilt (Task 1, Step 10).
- Produces: `GraphCallNode` interface gains the same five fields; `NodeDetails` renders two new
  sections instead of the previous raw dump.

### Steps

- [ ] **Step 1: Rebuild the two upstream packages so their new types are visible**

Run: `pnpm --filter @backbencher/schemas build && pnpm --filter @backbencher/portal-api build`
Expected: both succeed (this is required before the typecheck in Step 4 below will see the new
fields — `portal-web` resolves `@backbencher/schemas` and `@backbencher/portal-api` through their
compiled `dist/`, not live source).

- [ ] **Step 2: Extend `GraphCallNode` and replace the raw dump in `NodeDetails`**

In `packages/portal-web/src/screens/SessionGraph.tsx`, change:

```typescript
interface GraphCallNode {
  correlationId: string;
  operationId: string | null;
  method: string;
  host: string;
  pathname: string;
  status: number | null;
  requestTimestamp: number;
  responseTimestamp: number | null;
}
```

to:

```typescript
interface GraphCallNode {
  correlationId: string;
  operationId: string | null;
  method: string;
  host: string;
  pathname: string;
  status: number | null;
  requestTimestamp: number;
  responseTimestamp: number | null;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  responseBodyKind: string | null;
}
```

Then, in the `NodeDetails` component, change:

```typescript
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-xs text-[--muted]">
          {node.method} {node.pathname}
        </div>
        <JsonBlock value={node} />
      </div>
      <div>
```

to:

```typescript
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-xs text-[--muted]">
          {node.method} {node.pathname}
        </div>
      </div>
      <div>
        <h4 className="mb-1.5 text-xs font-bold uppercase tracking-[0.4px] text-[--muted]">Request</h4>
        <JsonBlock value={{ headers: node.requestHeaders, body: node.requestBody }} />
      </div>
      <div>
        <h4 className="mb-1.5 text-xs font-bold uppercase tracking-[0.4px] text-[--muted]">Response</h4>
        <JsonBlock
          value={{ bodyKind: node.responseBodyKind, headers: node.responseHeaders, body: node.responseBody }}
        />
      </div>
      <div>
```

(The status/timestamps that used to appear in the raw `JsonBlock value={node}` dump are dropped
from this panel — `status` is already visible on the node itself in the graph, via `CallNode`.)

- [ ] **Step 3: Map the new fields in the layout memo's node data**

The `useMemo` that builds `rfNodes` already spreads the full graph node into `data: { node: n }`
(`n` is one element of `graph.data?.nodes`, already typed as `SessionGraphNode` from
`@backbencher/schemas` — no per-field mapping needed here since `n` already carries every field
`GraphCallNode` now declares). Confirm there is no separate narrowing/pick step for `n` elsewhere
in the file that would need updating — there isn't; `graph.data.nodes` flows straight from the tRPC
response into `nodesById` and the `rfNodes` map.

- [ ] **Step 4: Typecheck and build**

Run: `pnpm --filter @backbencher/portal-web typecheck && pnpm --filter @backbencher/portal-web build`
Expected: both succeed with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/portal-web/src/screens/SessionGraph.tsx
git commit -m "feat(portal-web): show request/response headers and body in session graph node details"
```

---

## Task 3: Guarantee node spacing with a per-lane collision-avoidance nudge

**Files:**
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`

**Interfaces:**
- No new exports. Purely changes the x-positions the existing layout `useMemo` produces.

### Steps

- [ ] **Step 1: Correct the `MIN_NODE_SPACING` comment**

Change:

```typescript
// Fullscreen modal keeps at least this much horizontal room per node so labels never overlap,
// growing past the container's width once a session has enough calls to need it.
const MIN_NODE_SPACING = 260;
```

to:

```typescript
// Minimum x-gap enforced between consecutive same-lane nodes by the nudge pass in the layout
// memo below. Also the per-node width added to `timelineWidth` once a session has enough calls
// to need more room than the container provides.
const MIN_NODE_SPACING = 260;
```

- [ ] **Step 2: Add the nudge pass to the layout `useMemo`**

Change:

```typescript
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
```

to:

```typescript
    const rfNodes: Node[] = graphNodes.map((n) => ({
      id: n.correlationId,
      type: "call",
      position: {
        x: ((n.requestTimestamp - minTs) / span) * timelineWidth,
        y: (lanes.get(n.correlationId) ?? 0) * ROW_HEIGHT,
      },
      data: { node: n },
    }));

    // x above is proportional to elapsed time alone, so a burst of calls in a short window can
    // still land on top of each other within a lane. Push each node right of its same-lane
    // predecessor by at least MIN_NODE_SPACING; isolated nodes are left untouched.
    const byLane = new Map<number, Node[]>();
    for (const node of rfNodes) {
      const lane = node.position.y;
      const arr = byLane.get(lane);
      if (arr) arr.push(node);
      else byLane.set(lane, [node]);
    }
    for (const laneNodes of byLane.values()) {
      laneNodes.sort((a, b) => a.position.x - b.position.x);
      for (let i = 1; i < laneNodes.length; i++) {
        laneNodes[i].position.x = Math.max(
          laneNodes[i].position.x,
          laneNodes[i - 1].position.x + MIN_NODE_SPACING,
        );
      }
    }

    const rfEdges: Edge[] = graphEdges.map((e, i) => ({
```

- [ ] **Step 3: Typecheck and build**

Run: `pnpm --filter @backbencher/portal-web typecheck && pnpm --filter @backbencher/portal-web build`
Expected: both succeed with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/portal-web/src/screens/SessionGraph.tsx
git commit -m "fix(portal-web): guarantee minimum node spacing within each graph lane"
```

---

## Task 4: Make node dragging persist

**Files:**
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`

**Interfaces:**
- Consumes: the `{ nodes, edges }` produced by the layout `useMemo` (Task 3's output feeds this
  unchanged).
- Produces: `nodes` (the array passed to `<ReactFlow>`) becomes React state seeded from the layout
  memo, plus `onNodesChange`, both from ReactFlow's `useNodesState`.

### Steps

- [ ] **Step 1: Import `useNodesState`**

Change the `reactflow` import:

```typescript
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
```

to:

```typescript
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
```

- [ ] **Step 2: Rename the layout memo's node output and add draggable state**

Change:

```typescript
  const { nodes, edges } = useMemo(() => {
```

to:

```typescript
  const { nodes: layoutNodes, edges } = useMemo(() => {
```

Then, directly below the closing of that `useMemo` (right before the existing `const nodesById =
useMemo(...)` block), add:

```typescript
  const [nodes, setNodes, onNodesChange] = useNodesState<{ node: GraphCallNode }>([]);
  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);
```

- [ ] **Step 3: Wire `onNodesChange` into `<ReactFlow>`**

Change:

```typescript
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodeClick={(_, node) => setSelectedId(node.id)}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
```

to:

```typescript
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onNodeClick={(_, node) => setSelectedId(node.id)}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
```

- [ ] **Step 4: Typecheck and build**

Run: `pnpm --filter @backbencher/portal-web typecheck && pnpm --filter @backbencher/portal-web build`
Expected: both succeed with no errors.

- [ ] **Step 5: Manual drag check**

Run: `./scripts/serve.sh` (or the project's existing dev-serve script), open a session with more
than one call, open the dependency graph, drag a node to a new position, then click a different
node (an unrelated state update). Expected: the dragged node stays where you left it — it does not
snap back.

- [ ] **Step 6: Commit**

```bash
git add packages/portal-web/src/screens/SessionGraph.tsx
git commit -m "fix(portal-web): persist node drag position via ReactFlow's onNodesChange"
```

---

## Task 5: Resizable right panel with a live-dragged divider

**Files:**
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`

**Interfaces:**
- Produces: `rightPanelWidth` state (default `420`), a new `FitViewOnResize` component (calls
  ReactFlow's `fitView()` when its width props change — must be rendered as a child of
  `<ReactFlow>`, inside `<ReactFlowProvider>`).

### Steps

- [ ] **Step 1: Import `useReactFlow`**

Change the `reactflow` import (from Task 4's version):

```typescript
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
```

to:

```typescript
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
```

- [ ] **Step 2: Add the `FitViewOnResize` helper component**

Add directly below `const nodeTypes = { call: CallNode };`:

```typescript
// Re-fits the view whenever the graph pane's available width changes (divider drag or window
// resize) — fitView otherwise only ever runs once, on mount. Must render inside <ReactFlow>.
function FitViewOnResize({ containerWidth, rightPanelWidth }: { containerWidth: number; rightPanelWidth: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    fitView();
  }, [containerWidth, rightPanelWidth, fitView]);
  return null;
}
```

- [ ] **Step 3: Add divider drag state and pointer handlers**

In `SessionGraphModal`, directly below the existing `const closeButtonRef = useRef<HTMLButtonElement>(null);`
line, add:

```typescript
  const rowRef = useRef<HTMLDivElement>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const draggingDivider = useRef(false);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingDivider.current || !rowRef.current) return;
      const rect = rowRef.current.getBoundingClientRect();
      const next = rect.right - e.clientX;
      setRightPanelWidth(Math.min(rect.width * 0.6, Math.max(320, next)));
    }
    function onUp() {
      draggingDivider.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
```

- [ ] **Step 4: Wire the divider and resizable panel into the JSX**

Change:

```typescript
        <div className="flex min-h-0 flex-1">
          <div ref={containerRef} className="relative min-h-0 flex-1 border-r border-[--line]">
```

to:

```typescript
        <div ref={rowRef} className="flex min-h-0 flex-1">
          <div ref={containerRef} className="relative min-h-0 flex-1">
```

(the graph column's `border-r` moves to the new divider below, so remove it here). Then change:

```typescript
                  <Background />
                  <Controls />
                  <MiniMap />
                </ReactFlow>
              </ReactFlowProvider>
            )}
          </div>
          <div className="w-[380px] overflow-y-auto p-4">
```

to:

```typescript
                  <Background />
                  <Controls />
                  <MiniMap />
                  <FitViewOnResize containerWidth={containerWidth} rightPanelWidth={rightPanelWidth} />
                </ReactFlow>
              </ReactFlowProvider>
            )}
          </div>
          <div
            className="w-1 shrink-0 cursor-col-resize border-x border-[--line] bg-[--panel2] hover:bg-[--accent]"
            onPointerDown={() => {
              draggingDivider.current = true;
            }}
          />
          <div className="shrink-0 overflow-y-auto p-4" style={{ width: rightPanelWidth }}>
```

- [ ] **Step 5: Typecheck and build**

Run: `pnpm --filter @backbencher/portal-web typecheck && pnpm --filter @backbencher/portal-web build`
Expected: both succeed with no errors.

- [ ] **Step 6: Manual resize check**

Serve the portal, open the dependency graph, drag the new divider both directions. Expected: the
right panel grows/shrinks live, stops at a minimum width (doesn't crush to nothing) and a maximum
around 60% of the modal's width (doesn't crush the graph pane to nothing either), and the graph
visibly re-centers (`fitView`) as the split moves.

- [ ] **Step 7: Commit**

```bash
git add packages/portal-web/src/screens/SessionGraph.tsx
git commit -m "feat(portal-web): make the session graph detail panel resizable"
```

---

## Task 6: Final manual verification

**Files:** none (verification only).

- [ ] **Step 1: Full workspace build and typecheck**

Run: `pnpm -r build && pnpm -r typecheck`
Expected: both succeed for every package.

- [ ] **Step 2: Full test suite**

Run: `pnpm -r --filter '!@backbencher/recorder' test`
Expected: all tests pass, including the two new ones from Task 1.

- [ ] **Step 3: Manual browser verification**

Serve the portal (`./scripts/serve.sh` or the project's existing script) and open a session with
several concurrent/bursty calls (the sessions under `data/sessions/` in this repo qualify). Open
the dependency graph and confirm all four behaviors from the spec's Testing section:

1. No two same-lane nodes visually overlap.
2. Dragging a node holds its new position while the modal stays open; opening a different session
   or resizing the browser window resets it to the computed layout.
3. Clicking a node shows distinct "Request" and "Response" sections with headers and body (not the
   old raw metadata dump).
4. Dragging the new divider resizes both panes live, clamps at the min/max, and the graph visibly
   re-fits.

- [ ] **Step 4: Report**

Note any deviations from the checklist above; if everything matches, no further action needed —
this plan is complete.
