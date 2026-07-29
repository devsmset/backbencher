import type { Operation } from "@backbencher/schemas";
import { walkScalars } from "./jsonpath.js";

// --probe volatility mode (architecture §5.4). Gated, opt-in: replays idempotent GETs twice
// against a live environment and diffs the responses for higher-confidence volatile masks.
// Only runs for operations the analyst has marked safe.

export type ProbeHttp = (req: { method: string; url: string }) => Promise<{ status: number; body: unknown }>;

export interface ProbeContext {
  baseUrl: string;
  http: ProbeHttp;
  safeOperationIds?: Set<string>;
}

function concretePath(op: Operation): string | null {
  let path = op.pathTemplate.template;
  for (const p of op.pathTemplate.params) {
    const v = p.observedValues[0];
    if (!v) return null;
    path = path.replace(`{${p.name}}`, encodeURIComponent(v));
  }
  return path.includes("{") ? null : path;
}

function leafMap(body: unknown): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const leaf of walkScalars(body)) {
    const arr = grouped.get(leaf.path) ?? [];
    arr.push(leaf.value);
    grouped.set(leaf.path, arr);
  }
  const out = new Map<string, string>();
  for (const [k, v] of grouped) out.set(k, v.sort().join("\u0001"));
  return out;
}

function diffVolatile(a: unknown, b: unknown): string[] {
  const ma = leafMap(a);
  const mb = leafMap(b);
  const paths = new Set([...ma.keys(), ...mb.keys()]);
  const volatile: string[] = [];
  for (const p of paths) if (ma.get(p) !== mb.get(p)) volatile.push(p);
  return volatile.sort();
}

export async function probeVolatileFields(
  operations: Operation[],
  ctx: ProbeContext,
): Promise<Operation[]> {
  const base = ctx.baseUrl.replace(/\/$/, "");
  const out: Operation[] = [];
  for (const op of operations) {
    const isGet = op.method.toUpperCase() === "GET";
    const safe = !ctx.safeOperationIds || ctx.safeOperationIds.has(op.operationId);
    const path = isGet && safe ? concretePath(op) : null;
    if (!path) {
      out.push(op);
      continue;
    }
    try {
      const a = await ctx.http({ method: "GET", url: `${base}${path}` });
      const b = await ctx.http({ method: "GET", url: `${base}${path}` });
      const extra = diffVolatile(a.body, b.body);
      out.push({
        ...op,
        volatileResponseFields: [...new Set([...op.volatileResponseFields, ...extra])].sort(),
      });
    } catch {
      out.push(op);
    }
  }
  return out;
}
