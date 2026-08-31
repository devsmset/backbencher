import { useMemo, useState } from "react";
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
import { trpc } from "../trpc.js";
import { Chip, JsonBlock, Muted, QueryState } from "../ui.js";

// Session dependency graph (§ realignment guide — sessions page graph view). Lays out this
// session's actual calls on a timeline (x = requestTimestamp) with a greedy lane-packing
// scheme for the y axis, then draws an edge per SessionCallEdge (a real value observed
// flowing from one call's response into a later call's request).

const ROW_HEIGHT = 70;
const NODE_WIDTH = 220;
const TIMELINE_WIDTH = 1600;

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

export function SessionGraphView({ sessionId }: { sessionId: string }) {
  const graph = trpc.sessions.graph.useQuery({ sessionId });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const graphNodes = graph.data?.nodes ?? [];
    const graphEdges = graph.data?.edges ?? [];
    if (graphNodes.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const minTs = Math.min(...graphNodes.map((n) => n.requestTimestamp));
    const maxTs = Math.max(...graphNodes.map((n) => n.responseTimestamp ?? n.requestTimestamp));
    const span = Math.max(1, maxTs - minTs);
    const lanes = assignLanes(graphNodes);

    const rfNodes: Node[] = graphNodes.map((n) => ({
      id: n.correlationId,
      type: "call",
      position: { x: ((n.requestTimestamp - minTs) / span) * TIMELINE_WIDTH, y: (lanes.get(n.correlationId) ?? 0) * ROW_HEIGHT },
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
  }, [graph.data]);

  const selectedNode = graph.data?.nodes.find((n) => n.correlationId === selectedId) ?? null;

  return (
    <>
      <QueryState isLoading={graph.isLoading} error={graph.error} />
      {graph.data && graph.data.nodes.length === 0 && <Muted>No API calls to graph in this session.</Muted>}
      {graph.data && graph.data.nodes.length > 0 && (
        <div className="h-[420px] overflow-hidden rounded-md border border-[--line]">
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
        </div>
      )}
      {selectedNode && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-[--muted]">
            {selectedNode.method} {selectedNode.pathname}
          </div>
          <JsonBlock value={selectedNode} />
        </div>
      )}
    </>
  );
}
