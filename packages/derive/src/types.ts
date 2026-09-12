import type {
  DataflowEdge,
  ObservedFlow,
  Operation,
  RecordingEvent,
  RecordingMeta,
  SessionCallEdge,
} from "@backbencher/schemas";

// Internal derivation types (architecture §5). A `PairedCall` is one api_request joined to its
// api_response by correlationId, with the URL pre-parsed and the nearest UI intent attached.

export interface SessionData {
  meta: RecordingMeta;
  events: RecordingEvent[];
}

export interface PairedCall {
  sessionId: string;
  correlationId: string;
  method: string;
  host: string;
  pathname: string;
  segments: string[];
  query: Array<[string, string]>;
  requestHeaders: Record<string, string>;
  requestContentType: string | undefined;
  requestBody: unknown;
  status: number | null;
  responseHeaders: Record<string, string>;
  responseContentType: string | undefined;
  responseBody: unknown;
  responseBodyKind: string | null;
  requestTimestamp: number;
  responseTimestamp: number | null;
}

export interface DerivationResult {
  operations: Operation[];
  dataflow: DataflowEdge[];
  flows: ObservedFlow[];
  /** operationId -> input JSON paths whose values are client-generated (§5.5.6). */
  clientGeneratedFields: Record<string, string[]>;
  /** sessionId -> the Session's call-level dependency graph, over curated Calls only. */
  sessionGraphs: Record<string, SessionCallEdge[]>;
  /** sessionId -> correlationIds dropped as Redundant Calls. */
  autoFiltered: Record<string, string[]>;
}

export interface RunDerivationOptions {
  /** sessionId -> correlationIds the Analyst deleted by hand. Never overwritten by derivation. */
  deletedCorrelationIds?: ReadonlyMap<string, ReadonlySet<string>>;
}
