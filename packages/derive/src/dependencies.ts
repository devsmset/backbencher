import type {
  CatalogDependencyEdge,
  DataflowEdge,
  DependencySlot,
  Operation,
  OperationDependency,
} from "@backbencher/schemas";

// deriveDependencyGraph (realignment guide §5) — rolls up the already-aggregated, catalog-level
// DataflowEdge[] (see dataflow.ts) into a per-operation requires/produces/clientGenerated model,
// with a lightweight inferred `role` for the two semantics the composer cares about most:
// "auth-token" (this slot is satisfied by *any* login-shaped call) and "resource-id:<area>" (this
// slot is a foreign key into some product area, satisfied by whichever op produces that area's id).
//
// `opts.productAreaByOperation` / `opts.authOperationIds` are optional so this stays usable purely
// off derived facts (no store dependency); pass them (from OperationAnnotation.productArea /
// .sideEffect === "auth") for richer role labels.
//
// Note (guide §5.2, §10 gotcha #1): dataflow.ts deliberately treats `authorization` as a
// "standard" request header and excludes it from consumer-edge detection (it would otherwise
// flag on every single authenticated call). That means the auth-token dependency can rarely be
// discovered as a catalogEdge. The `authObserved`+`authOperationIds` fallback below is the
// primary detection path for auth-token requirements, not a backstop.

const AUTH_HEADER_NAMES = new Set(["authorization", "x-auth-token", "x-access-token"]);
const AUTH_PATH_HINTS = ["token", "accesstoken", "access_token", "jwt", "sessionid", "session_id", "authtoken"];

function toSlotLocation(location: DataflowEdge["consumer"]["location"]): DependencySlot["location"] {
  if (location === "requestBody") return "body";
  if (location === "requestHeader") return "header";
  return location;
}

function inferRole(edge: DataflowEdge, producerArea: string | undefined): string | undefined {
  const consumerPath = edge.consumer.jsonPath.toLowerCase();
  const producerPath = edge.producer.jsonPath.toLowerCase();
  if (edge.consumer.location === "requestHeader" && AUTH_HEADER_NAMES.has(consumerPath)) return "auth-token";
  if (AUTH_PATH_HINTS.some((h) => producerPath.includes(h) || consumerPath.includes(h))) return "auth-token";
  if (producerArea) return `resource-id:${producerArea}`;
  return undefined;
}

export interface DependencyGraph {
  catalogEdges: CatalogDependencyEdge[];
  byOperation: Map<string, OperationDependency>;
}

export interface DeriveDependencyGraphOptions {
  /** operationId -> OperationAnnotation.productArea, for "resource-id:<area>" role labels. */
  productAreaByOperation?: Map<string, string>;
  /** operationIds annotated sideEffect === "auth" (e.g. a login endpoint). */
  authOperationIds?: Set<string>;
}

export function deriveDependencyGraph(
  operations: Operation[],
  edges: DataflowEdge[],
  clientGeneratedFields: Record<string, string[]>,
  opts: DeriveDependencyGraphOptions = {},
): DependencyGraph {
  const productAreaByOperation = opts.productAreaByOperation ?? new Map<string, string>();
  const authOperationIds = opts.authOperationIds ?? new Set<string>();

  const catalogEdges: CatalogDependencyEdge[] = edges.map((e) => ({
    producerOp: e.producer.operationId,
    producerPath: e.producer.jsonPath,
    consumerOp: e.consumer.operationId,
    consumerSlot: { location: toSlotLocation(e.consumer.location), path: e.consumer.jsonPath },
    role: inferRole(e, productAreaByOperation.get(e.producer.operationId)),
    evidenceSessions: e.evidenceCount,
    confidence: e.valueEntropyOk ? "strong" : "weak",
  }));

  const byOperation = new Map<string, OperationDependency>();
  const get = (id: string): OperationDependency => {
    let d = byOperation.get(id);
    if (!d) {
      d = { operationId: id, requires: [], produces: [], clientGenerated: [], authRequired: false };
      byOperation.set(id, d);
    }
    return d;
  };
  for (const op of operations) get(op.operationId);

  for (const ce of catalogEdges) {
    const consumerDep = get(ce.consumerOp);
    let slot = consumerDep.requires.find(
      (r) => r.consumerSlot.location === ce.consumerSlot.location && r.consumerSlot.path === ce.consumerSlot.path,
    );
    if (!slot) {
      slot = { consumerSlot: ce.consumerSlot, role: ce.role, satisfiableBy: [] };
      consumerDep.requires.push(slot);
    } else if (!slot.role && ce.role) {
      slot.role = ce.role;
    }
    if (!slot.satisfiableBy.includes(ce.producerOp)) slot.satisfiableBy.push(ce.producerOp);
    if (ce.role === "auth-token") consumerDep.authRequired = true;

    const producerDep = get(ce.producerOp);
    if (!producerDep.produces.some((p) => p.path === ce.producerPath)) {
      producerDep.produces.push({ path: ce.producerPath, role: ce.role });
    }
  }

  // Primary auth-token detection (guide §5.2): any op observed using bearer/cookie auth requires
  // an auth-token, satisfiable by any operation annotated sideEffect:"auth" — independent of
  // whether dataflow.ts happened to surface an exact Authorization-header edge (usually it can't,
  // see the note above).
  for (const op of operations) {
    if (op.authObserved !== "bearer" && op.authObserved !== "cookie") continue;
    const dep = get(op.operationId);
    dep.authRequired = true;
    const satisfiers = [...authOperationIds].filter((id) => id !== op.operationId);
    let slot = dep.requires.find((r) => r.role === "auth-token");
    if (!slot) {
      slot = { consumerSlot: { location: "header", path: "Authorization" }, role: "auth-token", satisfiableBy: [] };
      dep.requires.push(slot);
    }
    for (const id of satisfiers) if (!slot.satisfiableBy.includes(id)) slot.satisfiableBy.push(id);
  }

  for (const [opId, fields] of Object.entries(clientGeneratedFields)) {
    get(opId).clientGenerated = [...fields].sort();
  }

  return { catalogEdges, byOperation };
}
