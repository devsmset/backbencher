import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { findOrphanedConsumers } from "@backbencher/derive/orphans";
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
import "reactflow/dist/style.css";
import type { SessionCallEdge } from "@backbencher/schemas";
import { trpc } from "../trpc.js";
import { Chip, JsonBlock, Muted, QueryState } from "../ui.js";

// Session dependency graph (§ realignment guide — sessions page graph view). Lays out this
// session's actual calls on a timeline (x = requestTimestamp) with a greedy lane-packing
// scheme for the y axis, then draws an edge per SessionCallEdge (a real value observed
// flowing from one call's response into a later call's request).

// sessions.graph omits `value` (the literal captured value) — it's never rendered here and can be
// large; full detail (including value, via callDetail-style lookups) is fetched only when needed.
type GraphEdge = Omit<SessionCallEdge, "value">;

const NODE_WIDTH = 220;

// Horizontal gap between sibling nodes within the same dependency-depth level.
const MIN_NODE_SPACING = 260;

// Vertical gap between dependency-depth levels, sized for card height plus edge label room.
const LEVEL_HEIGHT = 160;

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

// Deliberately excludes request/response bodies and headers — those are fetched lazily per node
// via sessions.callDetail, since captured bodies are uncapped and can run to megabytes per session.
interface GraphCallNode {
  correlationId: string;
  operationId: string | null;
  method: string;
  host: string;
  pathname: string;
  status: number | null;
  requestTimestamp: number;
  responseTimestamp: number | null;
  responseBodyKind: string | null;
}

function statusVariant(status: number | null): "ok" | "warn" {
  return status === null || status >= 400 ? "warn" : "ok";
}

type GraphMode = "trace" | "producers" | "consumers" | "both" | null;

// Transitive walk over SessionCallEdge: "up" follows consumer -> producer (ancestors that fed a
// value into `startId`), "down" follows producer -> consumer (descendants that consumed one).
function transitiveClosure(startId: string, edges: GraphEdge[], direction: "up" | "down"): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const from = direction === "up" ? e.consumerCorrelationId : e.producerCorrelationId;
    const to = direction === "up" ? e.producerCorrelationId : e.consumerCorrelationId;
    const arr = adjacency.get(from);
    if (arr) arr.push(to);
    else adjacency.set(from, [to]);
  }
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const next of adjacency.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

// Returns the node ids a graphMode narrows the view to, or null when no narrowing applies
// (no mode, no selection, or the selection was deleted out from under it).
function computeFilteredIds(
  mode: GraphMode,
  selectedId: string | null,
  presentIds: Set<string>,
  edges: GraphEdge[],
): Set<string> | null {
  if (!mode || !selectedId || !presentIds.has(selectedId)) return null;
  if (mode === "trace" || mode === "producers") return transitiveClosure(selectedId, edges, "up");
  if (mode === "consumers") return transitiveClosure(selectedId, edges, "down");
  const up = transitiveClosure(selectedId, edges, "up");
  const down = transitiveClosure(selectedId, edges, "down");
  return new Set([...up, ...down]);
}

// Kahn's algorithm over the producer -> consumer edges restricted to `nodeIds`, breaking ties
// (and any unexpected cycle) by requestTimestamp so the line always has a deterministic order.
function topoOrder(nodeIds: Set<string>, edges: GraphEdge[], timestampOf: Map<string, number>): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) inDegree.set(id, 0);
  for (const e of edges) {
    if (!nodeIds.has(e.producerCorrelationId) || !nodeIds.has(e.consumerCorrelationId)) continue;
    const arr = adjacency.get(e.producerCorrelationId);
    if (arr) arr.push(e.consumerCorrelationId);
    else adjacency.set(e.producerCorrelationId, [e.consumerCorrelationId]);
    inDegree.set(e.consumerCorrelationId, (inDegree.get(e.consumerCorrelationId) ?? 0) + 1);
  }
  const byTimestamp = (a: string, b: string) => (timestampOf.get(a) ?? 0) - (timestampOf.get(b) ?? 0);
  const remaining = new Set(nodeIds);
  const order: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => (inDegree.get(id) ?? 0) === 0).sort(byTimestamp);
    if (ready.length === 0) {
      order.push(...[...remaining].sort(byTimestamp));
      break;
    }
    for (const id of ready) {
      order.push(id);
      remaining.delete(id);
      for (const next of adjacency.get(id) ?? []) {
        inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
      }
    }
  }
  return order;
}

// Layers nodes by longest-path depth from their producers, via the same Kahn's-algorithm batching
// as topoOrder above: each pass of currently-zero-in-degree nodes becomes one depth level, so a
// node lands one level below the deepest of its producers. Nodes with no producer (including
// fully isolated calls) land in level 0. Any leftover cycle nodes are appended as one final level.
function assignLevels(nodeIds: Set<string>, edges: GraphEdge[]): Map<string, number> {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) inDegree.set(id, 0);
  for (const e of edges) {
    if (!nodeIds.has(e.producerCorrelationId) || !nodeIds.has(e.consumerCorrelationId)) continue;
    const arr = adjacency.get(e.producerCorrelationId);
    if (arr) arr.push(e.consumerCorrelationId);
    else adjacency.set(e.producerCorrelationId, [e.consumerCorrelationId]);
    inDegree.set(e.consumerCorrelationId, (inDegree.get(e.consumerCorrelationId) ?? 0) + 1);
  }
  const remaining = new Set(nodeIds);
  const levels = new Map<string, number>();
  let level = 0;
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => (inDegree.get(id) ?? 0) === 0);
    if (ready.length === 0) {
      for (const id of remaining) levels.set(id, level);
      break;
    }
    for (const id of ready) {
      levels.set(id, level);
      remaining.delete(id);
      for (const next of adjacency.get(id) ?? []) {
        inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
      }
    }
    level++;
  }
  return levels;
}

function CallNode({ data }: NodeProps<{ node: GraphCallNode; onDeleteClick: (correlationId: string) => void }>) {
  const { node, onDeleteClick } = data;
  return (
    <div className="group relative rounded-md border border-[--line] bg-[--panel2] px-2 py-1.5 text-xs" style={{ width: NODE_WIDTH }}>
      <Handle type="target" position={Position.Top} />
      <button
        type="button"
        aria-label={`Delete ${node.method} ${node.pathname}`}
        title="Delete call"
        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-[--line] bg-[--panel] text-[10px] font-bold leading-none text-[--muted] hover:border-[--bad] hover:text-[--bad] group-hover:flex"
        // Stop the click from also bubbling into ReactFlow's onNodeClick (node selection).
        onClick={(e) => {
          e.stopPropagation();
          onDeleteClick(node.correlationId);
        }}
      >
        ✕
      </button>
      <div className="flex items-center gap-1.5">
        <span className="font-bold">{node.method}</span>
        <Chip variant={statusVariant(node.status)}>{node.status !== null ? String(node.status) : "?"}</Chip>
      </div>
      <div className="mt-0.5 truncate text-[--muted]" title={node.pathname}>
        {node.pathname}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { call: CallNode };

// Re-fits the view whenever the graph pane's available width changes (divider drag or window
// resize) — fitView otherwise only ever runs once, on mount. Must render inside <ReactFlow>.
function FitViewOnResize({ containerWidth, rightPanelWidth }: { containerWidth: number; rightPanelWidth: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    fitView();
  }, [containerWidth, rightPanelWidth, fitView]);
  return null;
}

function ConnectedEdges({
  edges,
  correlationId,
  nodesById,
}: {
  edges: GraphEdge[];
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

// Same rationale as CallRow's lazy body rendering in Sessions.tsx: <details> only hides content
// visually, so an un-gated JsonBlock would still mount a captured (uncapped) body regardless of
// collapsed state. Give the caller a fresh `key` per node so re-selecting a different node starts
// collapsed again instead of preserving whatever was left open.
export function CollapsibleJson({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="mb-1.5 cursor-pointer text-xs font-bold uppercase tracking-[0.4px] text-[--muted]">
        {label}
      </summary>
      {open && <JsonBlock value={value} />}
    </details>
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
  sessionId,
  node,
  edges,
  nodesById,
  onRequestDelete,
}: {
  sessionId: string;
  node: GraphCallNode;
  edges: GraphEdge[];
  nodesById: Map<string, GraphCallNode>;
  onRequestDelete: (correlationId: string) => void;
}) {
  const detail = trpc.sessions.callDetail.useQuery({ sessionId, correlationId: node.correlationId });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-xs text-[--muted]">
          {node.method} {node.pathname}
        </div>
      </div>
      <div>
        {detail.isLoading && <Muted>loading…</Muted>}
        {detail.data && (
          <CollapsibleJson
            key={`${node.correlationId}-request`}
            label="Request"
            value={{ headers: detail.data.requestHeaders, body: detail.data.requestBody }}
          />
        )}
      </div>
      <div>
        {detail.isLoading && <Muted>loading…</Muted>}
        {detail.data && (
          <CollapsibleJson
            key={`${node.correlationId}-response`}
            label="Response"
            value={{ bodyKind: detail.data.responseBodyKind, headers: detail.data.responseHeaders, body: detail.data.responseBody }}
          />
        )}
      </div>
      <div>
        <h4 className="mb-1.5 text-xs font-bold uppercase tracking-[0.4px] text-[--muted]">Connected values</h4>
        <ConnectedEdges edges={edges} correlationId={node.correlationId} nodesById={nodesById} />
        <button
          type="button"
          className="mt-3 rounded-lg border border-[--line] px-2.5 py-1.5 text-xs font-semibold"
          onClick={() => onRequestDelete(node.correlationId)}
        >
          Delete call
        </button>
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

function DeleteConfirm({
  correlationId,
  edges,
  pending,
  nodesById,
  onCancel,
  onConfirm,
}: {
  correlationId: string;
  edges: GraphEdge[];
  pending: Set<string>;
  nodesById: Map<string, GraphCallNode>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const orphans = findOrphanedConsumers(edges, new Set([...pending, correlationId]));
  const related = edges.filter(
    (e) => e.producerCorrelationId === correlationId || e.consumerCorrelationId === correlationId,
  );
  const label = (id: string) => {
    const n = nodesById.get(id);
    return n ? `${n.method} ${n.pathname}` : id;
  };
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
      <div className="w-[520px] rounded-xl border border-[--line] bg-[--panel] p-4">
        <h4 className="mb-2 text-sm font-bold">Delete {label(correlationId)}?</h4>
        {related.length === 0 ? (
          <Muted>This call has no connected values.</Muted>
        ) : (
          <ul className="mb-3 flex flex-col gap-1 text-xs">
            {related.map((e, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: derived list, no stable id
              <li key={i}>
                {e.producerCorrelationId === correlationId
                  ? `produces ${e.producerJsonPath} → ${label(e.consumerCorrelationId)}`
                  : `consumes ${e.consumerJsonPath} ← ${label(e.producerCorrelationId)}`}
              </li>
            ))}
          </ul>
        )}
        {orphans.length > 0 && (
          <p className="mb-3 text-xs text-[--bad]">
            This call is the only remaining producer for:{" "}
            {orphans.map((o) => `${o.consumerJsonPath} on ${label(o.consumerCorrelationId)}`).join(", ")}.
            Delete those calls first, or keep this one.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-[--line] px-2.5 py-1.5 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={orphans.length > 0}
            onClick={onConfirm}
            className="rounded-lg border border-[--line] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function SessionGraphModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const graph = trpc.sessions.graph.useQuery({ sessionId });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphMode, setGraphMode] = useState<GraphMode>(null);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const pointerDownOnBackdrop = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const rowRef = useRef<HTMLDivElement>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const draggingDivider = useRef(false);
  const previousLayoutInputs = useRef<{ graphData: typeof graph.data; windowWidth: number; graphMode: GraphMode } | null>(
    null,
  );

  const deleteCalls = trpc.sessions.deleteCalls.useMutation({
    onSuccess: async () => {
      await utils.sessions.graph.invalidate({ sessionId });
    },
  });

  function requestClose() {
    if (pendingDeletes.size > 0 && !window.confirm(`Discard ${pendingDeletes.size} unsaved deletion(s)?`)) return;
    setPendingDeletes(new Set());
    onClose();
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingDivider.current || !rowRef.current) return;
      const rect = rowRef.current.getBoundingClientRect();
      const next = rect.right - e.clientX;
      setRightPanelWidth(Math.min(rect.width * 0.6, Math.max(320, next)));
    }
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDeletes, onClose]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Computed separately from the layout memo below: when no mode is active this is always the
  // same `null` reference, so selecting a node (the common case) never forces the full relayout
  // — only an actual mode switch or a selection change *while a mode is active* should.
  const filteredIds = useMemo(() => {
    if (!graphMode || !selectedId) return null;
    const presentIds = new Set(
      (graph.data?.nodes ?? []).filter((n) => !pendingDeletes.has(n.correlationId)).map((n) => n.correlationId),
    );
    const graphEdgesRaw = (graph.data?.edges ?? []).filter(
      (e) => !pendingDeletes.has(e.producerCorrelationId) && !pendingDeletes.has(e.consumerCorrelationId),
    );
    return computeFilteredIds(graphMode, selectedId, presentIds, graphEdgesRaw);
  }, [graph.data, pendingDeletes, graphMode, selectedId]);

  const { nodes: layoutNodes, edges } = useMemo(() => {
    const visibleNodes = (graph.data?.nodes ?? []).filter((n) => !pendingDeletes.has(n.correlationId));
    const graphEdgesRaw = (graph.data?.edges ?? []).filter(
      (e) => !pendingDeletes.has(e.producerCorrelationId) && !pendingDeletes.has(e.consumerCorrelationId),
    );
    if (visibleNodes.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const scopedNodes = filteredIds ? visibleNodes.filter((n) => filteredIds.has(n.correlationId)) : visibleNodes;
    const scopedEdges = filteredIds
      ? graphEdgesRaw.filter((e) => filteredIds.has(e.producerCorrelationId) && filteredIds.has(e.consumerCorrelationId))
      : graphEdgesRaw;
    const nodesById = new Map(scopedNodes.map((n) => [n.correlationId, n]));

    let rfNodes: Node[];
    if (graphMode === "trace") {
      const timestampOf = new Map(scopedNodes.map((n) => [n.correlationId, n.requestTimestamp]));
      const order = topoOrder(new Set(nodesById.keys()), scopedEdges, timestampOf);
      rfNodes = order.map((id, i) => ({
        id,
        type: "call",
        position: { x: 0, y: i * MIN_NODE_SPACING },
        data: { node: nodesById.get(id) as GraphCallNode },
      }));
    } else {
      const levels = assignLevels(new Set(nodesById.keys()), scopedEdges);
      const byLevel = new Map<number, GraphCallNode[]>();
      for (const n of scopedNodes) {
        const level = levels.get(n.correlationId) ?? 0;
        const arr = byLevel.get(level);
        if (arr) arr.push(n);
        else byLevel.set(level, [n]);
      }

      rfNodes = [];
      for (const [level, levelNodes] of byLevel) {
        levelNodes.sort((a, b) => a.requestTimestamp - b.requestTimestamp);
        levelNodes.forEach((n, i) => {
          rfNodes.push({
            id: n.correlationId,
            type: "call",
            position: { x: i * MIN_NODE_SPACING, y: level * LEVEL_HEIGHT },
            data: { node: n },
          });
        });
      }
    }

    const rfEdges: Edge[] = scopedEdges.map((e, i) => ({
      id: `${e.producerCorrelationId}-${e.consumerCorrelationId}-${i}`,
      source: e.producerCorrelationId,
      target: e.consumerCorrelationId,
      label: `${e.producerJsonPath} → ${e.consumerJsonPath}`,
      labelStyle: { fill: "#dbe5ef", fontSize: 10 },
      labelBgStyle: { fill: "#0a1016" },
      ...(e.confidence === "weak" ? { style: { strokeDasharray: "4 4" } } : {}),
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [graph.data, containerWidth, pendingDeletes, graphMode, filteredIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState<{ node: GraphCallNode }>([]);
  useEffect(() => {
    const windowWidth = window.innerWidth;
    const previous = previousLayoutInputs.current;
    const shouldReset =
      !previous ||
      previous.graphData !== graph.data ||
      previous.windowWidth !== windowWidth ||
      previous.graphMode !== graphMode;

    // layoutNodes is recomputed whenever containerWidth changes, including divider drags and real
    // window resizes. Only a new graph payload, a real window width change, or a graphMode switch
    // (which uses a different layout algorithm entirely) should reset node positions; all other
    // recomputes preserve any node positions the user has already adjusted.
    if (shouldReset) {
      setNodes(layoutNodes);
    } else {
      setNodes((current) => {
        const existingById = new Map(current.map((n) => [n.id, n]));
        return layoutNodes.map((n) => {
          const existing = existingById.get(n.id);
          return existing ? { ...n, position: existing.position } : n;
        });
      });
    }

    previousLayoutInputs.current = { graphData: graph.data, windowWidth, graphMode };
  }, [graph.data, layoutNodes, setNodes, graphMode]);

  useEffect(() => {
    setPendingDeletes(new Set());
    setConfirming(null);
    setGraphMode(null);
  }, [graph.data]);

  // Injects the node card's hover-X delete trigger here, kept out of the layoutNodes memo above
  // (which already has enough dependencies) — it opens the same confirm dialog the side panel's
  // "Delete call" button uses, so a node-card delete gets the same orphan-producer check and
  // staged-save behavior, just from a second entry point.
  const nodesWithHandlers = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, onDeleteClick: setConfirming } })),
    [nodes],
  );

  const visibleNodesById = useMemo(() => {
    const map = new Map<string, GraphCallNode>();
    for (const n of (graph.data?.nodes ?? []).filter((node) => !pendingDeletes.has(node.correlationId))) {
      map.set(n.correlationId, n);
    }
    return map;
  }, [graph.data, pendingDeletes]);

  const allNodesById = useMemo(() => {
    const map = new Map<string, GraphCallNode>();
    for (const n of graph.data?.nodes ?? []) {
      map.set(n.correlationId, n);
    }
    return map;
  }, [graph.data]);

  const selectedNode = selectedId ? visibleNodesById.get(selectedId) ?? null : null;
  const graphEdgesRaw = (graph.data?.edges ?? []).filter(
    (e) => !pendingDeletes.has(e.producerCorrelationId) && !pendingDeletes.has(e.consumerCorrelationId),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Session ${sessionId} dependency graph`}
      onMouseDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pointerDownOnBackdrop.current && e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-[--line] bg-[--panel]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[--line] bg-[--panel2] px-4 py-2.5">
          <h3 className="m-0 text-sm">Session {sessionId} — dependency graph</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {(
                [
                  ["trace", "Trace to here"],
                  ["producers", "Producers"],
                  ["consumers", "Consumers"],
                  ["both", "Both"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-40 ${
                    graphMode === mode
                      ? "border-[--accent] bg-[--accent] text-[--panel]"
                      : "border-[--line]"
                  }`}
                  disabled={!selectedId}
                  title={selectedId ? undefined : "Select a call first"}
                  onClick={() => setGraphMode(mode)}
                >
                  {label}
                </button>
              ))}
              {graphMode && (
                <button
                  type="button"
                  className="rounded-md border border-[--line] px-2 py-1 text-xs"
                  onClick={() => setGraphMode(null)}
                >
                  Show all
                </button>
              )}
              {graphMode === "trace" && filteredIds && (
                <button
                  type="button"
                  className="rounded-md border border-[--line] px-2 py-1 text-xs"
                  onClick={() => {
                    const others = (graph.data?.nodes ?? [])
                      .map((n) => n.correlationId)
                      .filter((id) => !pendingDeletes.has(id) && !filteredIds.has(id));
                    if (others.length === 0) return;
                    if (
                      window.confirm(
                        `Mark ${others.length} call(s) outside this trace for deletion? Nothing is removed until you click Save.`,
                      )
                    ) {
                      setPendingDeletes((prev) => new Set([...prev, ...others]));
                    }
                  }}
                >
                  Keep only these
                </button>
              )}
            </div>
            <div className="flex flex-col items-end">
              <button
                type="button"
                className="rounded-md border border-[--line] px-2 py-1 text-xs font-semibold disabled:opacity-40"
                disabled={pendingDeletes.size === 0 || deleteCalls.isPending}
                onClick={() => deleteCalls.mutate({ sessionId, correlationIds: [...pendingDeletes] })}
              >
                Save ({pendingDeletes.size})
              </button>
              {deleteCalls.error?.message && <div className="mt-1 text-xs text-[--bad]">{deleteCalls.error.message}</div>}
            </div>
            <button
              type="button"
              ref={closeButtonRef}
              className="rounded-md border border-[--border] px-2 py-1 text-xs"
              onClick={requestClose}
            >
              ✕ close
            </button>
          </div>
        </header>
        <div ref={rowRef} className={`flex min-h-0 flex-1${isDraggingDivider ? " select-none" : ""}`}>
          <div ref={containerRef} className="relative min-h-0 flex-1">
            <QueryState isLoading={graph.isLoading} error={graph.error} />
            {graph.data?.derived === false && (
              <Muted>Not derived yet. Derivation runs automatically when a recording stops; otherwise run `bb derive`.</Muted>
            )}
            {graph.data && graph.data.derived !== false && graph.data.nodes.length === 0 && (
              <Muted>No API calls to graph in this session.</Muted>
            )}
            {graph.data && graph.data.derived !== false && graph.data.nodes.length > 0 && (
              <ReactFlowProvider>
                <ReactFlow
                  nodes={nodesWithHandlers}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onNodeClick={(_, node) => setSelectedId(node.id)}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
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
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              draggingDivider.current = true;
              setIsDraggingDivider(true);
            }}
            onPointerUp={() => {
              draggingDivider.current = false;
              setIsDraggingDivider(false);
            }}
            onPointerCancel={() => {
              draggingDivider.current = false;
              setIsDraggingDivider(false);
            }}
            onLostPointerCapture={() => {
              draggingDivider.current = false;
              setIsDraggingDivider(false);
            }}
          />
          <div className="shrink-0 overflow-y-auto p-4" style={{ width: rightPanelWidth }}>
            {selectedNode ? (
              <NodeDetails
                sessionId={sessionId}
                node={selectedNode}
                edges={graphEdgesRaw}
                nodesById={visibleNodesById}
                onRequestDelete={(correlationId) => setConfirming(correlationId)}
              />
            ) : (
              <Muted>Select a call to see its details.</Muted>
            )}
          </div>
        </div>
        {confirming !== null && (
          <DeleteConfirm
            correlationId={confirming}
            edges={graph.data?.edges ?? []}
            pending={pendingDeletes}
            nodesById={allNodesById}
            onCancel={() => setConfirming(null)}
            onConfirm={() => {
              setPendingDeletes((prev) => new Set([...prev, confirming]));
              setConfirming(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
