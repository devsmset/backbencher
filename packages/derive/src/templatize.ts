import { jsonPathTail, walkScalars } from "./jsonpath.js";
import { operationId } from "./operationId.js";
import type { PairedCall } from "./types.js";

// templatizePaths pass (architecture §5.2). Conservative parameterization: a segment position
// becomes a param only via (a) regex classification across >=2 distinct values, or (b) id-ish
// corroboration (varies alone AND appears as a response-body scalar). Bias to static when unsure.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;
const HEXLONG = /^[0-9a-f]{16,}$/i;
const TOKENISH = /^[A-Za-z0-9_-]{20,}$/;

type ParamKind = "uuid" | "numeric" | "slug" | "opaque";

export interface OpParam {
  name: string;
  position: number;
  kind: ParamKind;
  observedValues: string[];
}

export interface OpAccum {
  operationId: string;
  method: string;
  host: string;
  template: string;
  params: OpParam[];
  calls: PairedCall[];
}

export interface TemplatizeResult {
  operations: Map<string, OpAccum>;
  callOp: Map<PairedCall, string>;
}

/** Index of response-body scalar values across the whole corpus -> candidate param name tails. */
function buildResponseScalarIndex(calls: PairedCall[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const c of calls) {
    if (c.responseBody === null || c.responseBody === undefined) continue;
    for (const leaf of walkScalars(c.responseBody)) {
      let set = index.get(leaf.value);
      if (!set) {
        set = new Set();
        index.set(leaf.value, set);
      }
      set.add(jsonPathTail(leaf.path));
    }
  }
  return index;
}

function classifyAll(values: string[]): ParamKind | null {
  if (values.length < 2) return null; // need >=2 distinct values for (a)
  if (values.every((v) => UUID.test(v))) return "uuid";
  if (values.every((v) => NUMERIC.test(v))) return "numeric";
  if (values.every((v) => HEXLONG.test(v) || TOKENISH.test(v))) return "opaque";
  return null;
}

// Conservative id-ish test for (b): non-trivial, not a plain dictionary word.
function looksIdish(v: string): boolean {
  return v.length >= 6 && /[0-9-]/.test(v) && !/^[a-z]+$/.test(v);
}

export function templatizePaths(calls: PairedCall[]): TemplatizeResult {
  const responseScalars = buildResponseScalarIndex(calls);
  const operations = new Map<string, OpAccum>();
  const callOp = new Map<PairedCall, string>();

  function classifyChildren(values: string[]): ParamKind | null {
    if (values.length < 2) return null; // a single value at this position is static
    const cls = classifyAll(values);
    if (cls) return cls;
    // (b) id-ish corroboration: all values id-ish AND >=1 appears as a response-body scalar
    if (values.every(looksIdish) && values.some((v) => responseScalars.has(v))) return "slug";
    return null;
  }

  function paramName(values: string[], position: number): string {
    for (const v of [...values].sort()) {
      const tail = [...(responseScalars.get(v) ?? [])].sort()[0];
      if (tail) return tail;
    }
    return `p${position}`;
  }

  interface Entry {
    segs: string[];
    call: PairedCall;
  }

  function emit(
    method: string,
    host: string,
    prefixParts: string[],
    params: OpParam[],
    members: PairedCall[],
  ): void {
    if (members.length === 0) return;
    const template = `/${prefixParts.join("/")}`;
    const opId = operationId(method, host, template);
    let accum = operations.get(opId);
    if (!accum) {
      accum = { operationId: opId, method, host, template, params, calls: [] };
      operations.set(opId, accum);
    }
    for (const c of members) {
      accum.calls.push(c);
      callOp.set(c, opId);
    }
  }

  // Prefix-trie walk: at each segment position, collapse children into a param only when they
  // classify as dynamic; otherwise keep distinct static branches (separates /a/{id} from /b/{id}).
  function walk(
    method: string,
    host: string,
    entries: Entry[],
    depth: number,
    prefixParts: string[],
    params: OpParam[],
  ): void {
    const terminal = entries.filter((e) => e.segs.length === depth);
    const continuing = entries.filter((e) => e.segs.length > depth);
    if (terminal.length > 0) {
      emit(method, host, prefixParts, params, terminal.map((e) => e.call));
    }
    if (continuing.length === 0) return;

    const bySeg = new Map<string, Entry[]>();
    for (const e of continuing) {
      const seg = e.segs[depth];
      if (seg === undefined) continue;
      const arr = bySeg.get(seg);
      if (arr) arr.push(e);
      else bySeg.set(seg, [e]);
    }
    const childValues = [...bySeg.keys()];
    const kind = classifyChildren(childValues);
    if (kind) {
      const name = paramName(childValues, depth);
      const param: OpParam = { name, position: depth, kind, observedValues: childValues.slice(0, 20) };
      walk(method, host, continuing, depth + 1, [...prefixParts, `{${name}}`], [...params, param]);
    } else {
      for (const [seg, sub] of bySeg) {
        walk(method, host, sub, depth + 1, [...prefixParts, seg], params);
      }
    }
  }

  const byMethodHost = new Map<string, PairedCall[]>();
  for (const c of calls) {
    if (c.pathname === "" && c.segments.length === 0) continue; // unparseable
    const key = `${c.method}\u0000${c.host}`;
    const arr = byMethodHost.get(key);
    if (arr) arr.push(c);
    else byMethodHost.set(key, [c]);
  }

  for (const [key, group] of byMethodHost) {
    const [method, host] = key.split("\u0000");
    if (method === undefined || host === undefined) continue;
    walk(
      method,
      host,
      group.map((c) => ({ segs: c.segments, call: c })),
      0,
      [],
      [],
    );
  }

  return { operations, callOp };
}
