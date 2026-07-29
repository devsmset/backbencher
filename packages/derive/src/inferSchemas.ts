import { type BuildOptions, type JsonSchema, inferUnion } from "./schemaBuilder.js";
import type { PairedCall } from "./types.js";

// inferSchemas pass (architecture §5.3) plus per-operation query-param, auth, and content-type
// derivation used to assemble the final Operation record.

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  requiredThreshold: 0.95,
  enumMinObservations: 5,
  enumMaxDistinct: 8,
};

function isObjectBody(v: unknown): boolean {
  return v !== null && typeof v === "object";
}

export function inferRequestSchema(
  calls: PairedCall[],
  opts: BuildOptions = DEFAULT_BUILD_OPTIONS,
): JsonSchema | null {
  const bodies = calls
    .filter((c) => !c.requestBodyTruncated && isObjectBody(c.requestBody))
    .map((c) => c.requestBody);
  return inferUnion(bodies, opts);
}

export function inferResponseSchemas(
  calls: PairedCall[],
  opts: BuildOptions = DEFAULT_BUILD_OPTIONS,
): Record<string, JsonSchema> {
  const byStatus = new Map<number, unknown[]>();
  for (const c of calls) {
    if (c.status === null || c.responseBodyTruncated) continue;
    if (!isObjectBody(c.responseBody)) continue;
    const arr = byStatus.get(c.status);
    if (arr) arr.push(c.responseBody);
    else byStatus.set(c.status, [c.responseBody]);
  }
  const out: Record<string, JsonSchema> = {};
  for (const [status, bodies] of byStatus) {
    const schema = inferUnion(bodies, opts);
    if (schema) out[String(status)] = schema;
  }
  return out;
}

export function deriveQueryParams(
  calls: PairedCall[],
): Array<{ name: string; required: boolean; observedValues: string[] }> {
  const total = calls.length;
  const present = new Map<string, number>();
  const values = new Map<string, Set<string>>();
  for (const c of calls) {
    const seen = new Set<string>();
    for (const [name, value] of c.query) {
      if (!seen.has(name)) {
        present.set(name, (present.get(name) ?? 0) + 1);
        seen.add(name);
      }
      let vs = values.get(name);
      if (!vs) {
        vs = new Set();
        values.set(name, vs);
      }
      vs.add(value);
    }
  }
  return [...present.keys()].sort().map((name) => ({
    name,
    required: total > 0 && (present.get(name) ?? 0) / total >= 0.95,
    observedValues: [...(values.get(name) ?? [])].slice(0, 10),
  }));
}

export function deriveAuthObserved(calls: PairedCall[]): "cookie" | "bearer" | "none" | "mixed" {
  let bearer = false;
  let cookie = false;
  for (const c of calls) {
    const headers = Object.keys(c.requestHeaders).map((h) => h.toLowerCase());
    if (headers.includes("authorization")) bearer = true;
    if (headers.includes("cookie")) cookie = true;
  }
  if (bearer && cookie) return "mixed";
  if (bearer) return "bearer";
  if (cookie) return "cookie";
  return "none";
}

export function deriveContentTypes(calls: PairedCall[]): string[] {
  const set = new Set<string>();
  for (const c of calls) {
    for (const ct of [c.requestContentType, c.responseContentType]) {
      if (ct) set.add(ct.split(";")[0]?.trim() ?? ct);
    }
  }
  return [...set].sort();
}
