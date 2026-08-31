import type { DataflowEdge } from "@backbencher/schemas";
import { walkScalars } from "./jsonpath.js";
import type { OpAccum } from "./templatize.js";
import type { PairedCall } from "./types.js";

// buildDataflowGraph pass (architecture §5.5). Joins response-side producers to later
// request-side consumers by exact scalar value within a session, behind an entropy gate.

const STD_REQ_HEADERS = new Set([
  "host", "connection", "accept", "accept-encoding", "accept-language", "user-agent",
  "referer", "referrer", "origin", "content-type", "content-length", "sec-fetch-dest",
  "sec-fetch-mode", "sec-fetch-site", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
  "cache-control", "pragma", "cookie", "authorization", "x-request-source",
]);
const STD_RES_HEADERS = new Set([
  "date", "content-type", "content-length", "content-encoding", "connection", "cache-control",
  "pragma", "vary", "transfer-encoding", "strict-transport-security", "content-security-policy",
  "x-content-type-options", "x-frame-options", "x-xss-protection", "referrer-policy",
  "last-modified", "etag", "server", "set-cookie",
]);

const COMMON_WORDS = new Set([
  "true", "false", "null", "admin", "user", "login", "logout", "home", "index", "main",
  "default", "none", "test", "ui", "en", "json",
]);

function isRedacted(v: string): boolean {
  return v.includes("REDACTED");
}

// Entropy gate (§5.5 step 4). Returns null to drop; otherwise whether the value is high-entropy.
export function entropy(value: string): { keep: boolean; ok: boolean } {
  if (value.length < 6) return { keep: false, ok: false };
  if (value === "true" || value === "false") return { keep: false, ok: false };
  if (/^\d+$/.test(value) && Number(value) < 10000) return { keep: false, ok: false };
  if (COMMON_WORDS.has(value.toLowerCase())) return { keep: false, ok: false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { keep: false, ok: false }; // date truncated to day
  return { keep: true, ok: value.length > 8 };
}

interface Endpoint {
  op: string;
  location: string;
  jsonPath: string;
}
export interface Producer extends Endpoint {
  correlationId: string;
  value: string;
  ts: number;
  sessionId: string;
}
export interface Consumer extends Producer {}

// Shared producer/consumer extraction (§5.5 steps 1-3), reused by the cross-session
// `buildDataflowGraph` and the single-session `buildSessionCallGraph`.
export function collectProducers(calls: PairedCall[], callOp: Map<PairedCall, string>): Producer[] {
  const producers: Producer[] = [];
  for (const c of calls) {
    const op = callOp.get(c);
    if (!op) continue;
    if (c.responseBody !== null && c.responseTimestamp !== null) {
      for (const leaf of walkScalars(c.responseBody)) {
        if (isRedacted(leaf.value)) continue;
        producers.push({ op, location: "responseBody", jsonPath: leaf.path, value: leaf.value, ts: c.responseTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
      }
    }
    if (c.responseTimestamp !== null) {
      for (const [name, value] of Object.entries(c.responseHeaders)) {
        if (STD_RES_HEADERS.has(name.toLowerCase()) || isRedacted(value)) continue;
        producers.push({ op, location: "responseHeader", jsonPath: name, value, ts: c.responseTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
      }
    }
  }
  return producers;
}

export function collectConsumers(
  calls: PairedCall[],
  callOp: Map<PairedCall, string>,
  operations: Map<string, OpAccum>,
): Consumer[] {
  const consumers: Consumer[] = [];
  for (const c of calls) {
    const op = callOp.get(c);
    if (!op) continue;
    const params = operations.get(op)?.params ?? [];
    for (const p of params) {
      const value = c.segments[p.position];
      if (value && !isRedacted(value)) {
        consumers.push({ op, location: "path", jsonPath: p.name, value, ts: c.requestTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
      }
    }
    for (const [name, value] of c.query) {
      if (!isRedacted(value)) {
        consumers.push({ op, location: "query", jsonPath: name, value, ts: c.requestTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
      }
    }
    if (c.requestBody !== null && c.requestBody !== undefined) {
      for (const leaf of walkScalars(c.requestBody)) {
        if (isRedacted(leaf.value)) continue;
        consumers.push({ op, location: "requestBody", jsonPath: leaf.path, value: leaf.value, ts: c.requestTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
      }
    }
    for (const [name, value] of Object.entries(c.requestHeaders)) {
      if (STD_REQ_HEADERS.has(name.toLowerCase()) || isRedacted(value)) continue;
      consumers.push({ op, location: "requestHeader", jsonPath: name, value, ts: c.requestTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
    }
  }
  return consumers;
}

export interface DataflowResult {
  edges: DataflowEdge[];
  clientGeneratedFields: Record<string, string[]>;
}

export function buildDataflowGraph(
  calls: PairedCall[],
  callOp: Map<PairedCall, string>,
  operations: Map<string, OpAccum>,
): DataflowResult {
  const producers = collectProducers(calls, callOp);
  const consumers = collectConsumers(calls, callOp, operations);

  // index producers by session+value
  const prodIndex = new Map<string, Producer[]>();
  const producerValues = new Set<string>();
  for (const p of producers) {
    producerValues.add(p.value);
    const key = `${p.sessionId}\u0000${p.value}`;
    const arr = prodIndex.get(key);
    if (arr) arr.push(p);
    else prodIndex.set(key, [p]);
  }

  // join + aggregate
  const agg = new Map<string, { producer: Endpoint; consumer: Endpoint; sessions: Set<string>; ok: boolean }>();
  for (const cons of consumers) {
    const gate = entropy(cons.value);
    if (!gate.keep) continue;
    const matches = prodIndex.get(`${cons.sessionId}\u0000${cons.value}`) ?? [];
    for (const prod of matches) {
      if (prod.ts >= cons.ts) continue; // producer must precede consumer
      if (prod.op === cons.op && prod.jsonPath === cons.jsonPath) continue;
      const producer: Endpoint = { op: prod.op, location: prod.location, jsonPath: prod.jsonPath };
      const consumer: Endpoint = { op: cons.op, location: cons.location, jsonPath: cons.jsonPath };
      const key = JSON.stringify({ producer, consumer });
      let e = agg.get(key);
      if (!e) {
        e = { producer, consumer, sessions: new Set(), ok: false };
        agg.set(key, e);
      }
      e.sessions.add(cons.sessionId);
      e.ok = e.ok || gate.ok;
    }
  }

  const edges: DataflowEdge[] = [...agg.values()]
    .map((e) => ({
      producer: {
        operationId: e.producer.op,
        location: e.producer.location as "responseBody" | "responseHeader",
        jsonPath: e.producer.jsonPath,
      },
      consumer: {
        operationId: e.consumer.op,
        location: e.consumer.location as "path" | "query" | "requestBody" | "requestHeader",
        jsonPath: e.consumer.jsonPath,
      },
      evidenceCount: e.sessions.size,
      valueEntropyOk: e.ok,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  // client-generated fields (§5.5 step 6): consumer fields never produced anywhere and
  // non-constant across sessions.
  const consumerFields = new Map<string, { values: Set<string>; sessions: Set<string> }>();
  for (const cons of consumers) {
    const key = `${cons.op}\u0000${cons.location}\u0000${cons.jsonPath}`;
    let f = consumerFields.get(key);
    if (!f) {
      f = { values: new Set(), sessions: new Set() };
      consumerFields.set(key, f);
    }
    f.values.add(cons.value);
    f.sessions.add(cons.sessionId);
  }
  const clientGeneratedFields: Record<string, string[]> = {};
  for (const [key, f] of consumerFields) {
    const parts = key.split("\u0000");
    const op = parts[0];
    const jsonPath = parts[2];
    if (!op || jsonPath === undefined) continue;
    const noProducer = [...f.values].every((v) => !producerValues.has(v));
    if (noProducer && f.sessions.size >= 2 && f.values.size > 1) {
      (clientGeneratedFields[op] ??= []).push(jsonPath);
    }
  }
  for (const op of Object.keys(clientGeneratedFields)) {
    clientGeneratedFields[op] = [...new Set(clientGeneratedFields[op])].sort();
  }

  return { edges, clientGeneratedFields };
}
