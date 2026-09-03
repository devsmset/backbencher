import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
import "reactflow/dist/style.css";
import type { SessionCallEdge } from "@backbencher/schemas";
import { trpc } from "../trpc.js";
import { Chip, JsonBlock, Muted, QueryState } from "../ui.js";

// Session dependency graph (§ realignment guide — sessions page graph view). Lays out this
// session's actual calls on a timeline (x = requestTimestamp) with a greedy lane-packing
// scheme for the y axis, then draws an edge per SessionCallEdge (a real value observed
// flowing from one call's response into a later call's request).

const ROW_HEIGHT = 70;
const NODE_WIDTH = 220;

// Minimum x-gap enforced between consecutive same-lane nodes by the nudge pass in the layout
// memo below. Also the per-node width added to `timelineWidth` once a session has enough calls
// to need more room than the container provides.
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
  requestBody?: unknown;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
  responseBodyKind: string | null;
}

// Greedy interval scheduling: each call occupies [requestTimestamp, responseTimestamp] and
// gets the first lane whose previous occupant has already finished.
function assignLanes(nodes: GraphCallNode[]): Map<string, number> {
  const sorted = [...nodes].sort((a, b) => a.requestTimestamp - b.requestTimestamp);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const n of sorted) {
    const end = n.responseTimestamp ?? n.requestTimestamp;
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= n.requestTimestamp);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    lanes.set(n.correlationId, lane);
  }
  return lanes;
}

function statusVariant(status: number | null): "ok" | "warn" {
  return status === null || status >= 400 ? "warn" : "ok";
}

function CallNode({ data }: NodeProps<{ node: GraphCallNode }>) {
  const { node } = data;
  return (
    <div className="rounded-md border border-[--line] bg-[--panel2] px-2 py-1.5 text-xs" style={{ width: NODE_WIDTH }}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1.5">
        <span className="font-bold">{node.method}</span>
        <Chip variant={statusVariant(node.status)}>{node.status !== null ? String(node.status) : "?"}</Chip>
      </div>
      <div className="mt-0.5 truncate text-[--muted]" title={node.pathname}>
        {node.pathname}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { call: CallNode };

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

export function SessionGraphModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const graph = trpc.sessions.graph.useQuery({ sessionId });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const pointerDownOnBackdrop = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

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
        const cur = laneNodes[i]!;
        const prev = laneNodes[i - 1]!;
        if (!cur.position || !prev.position) continue;
        cur.position.x = Math.max(cur.position.x, prev.position.x + MIN_NODE_SPACING);
      }
    }

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Session ${sessionId} dependency graph`}
      onMouseDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pointerDownOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-[--line] bg-[--panel]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[--line] bg-[--panel2] px-4 py-2.5">
          <h3 className="m-0 text-sm">Session {sessionId} — dependency graph</h3>
          <button
            type="button"
            ref={closeButtonRef}
            className="rounded-md border border-[--border] px-2 py-1 text-xs"
            onClick={onClose}
          >
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
