import { walkScalars } from "./jsonpath.js";
import type { PairedCall } from "./types.js";

// detectVolatileFields pass (architecture §5.4). Groups observations with identical request
// shape and diffs their response bodies; JSON paths whose values differ (or appear/disappear)
// are volatile (timestamps, generated ids, cursors, ordering).

function requestShapeKey(c: PairedCall): string {
  const query = [...c.query].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const body = c.requestBody === null || c.requestBody === undefined ? "" : JSON.stringify(c.requestBody);
  return `${c.pathname}\u0000${JSON.stringify(query)}\u0000${body}`;
}

function leafMap(body: unknown): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const leaf of walkScalars(body)) {
    const arr = grouped.get(leaf.path);
    if (arr) arr.push(leaf.value);
    else grouped.set(leaf.path, [leaf.value]);
  }
  const out = new Map<string, string>();
  for (const [path, values] of grouped) out.set(path, values.sort().join("\u0001"));
  return out;
}

export function detectVolatileFields(calls: PairedCall[]): string[] {
  const shapes = new Map<string, PairedCall[]>();
  for (const c of calls) {
    if (c.status === null) continue;
    if (c.responseBody === null || typeof c.responseBody !== "object") continue;
    const key = requestShapeKey(c);
    const arr = shapes.get(key);
    if (arr) arr.push(c);
    else shapes.set(key, [c]);
  }

  const volatile = new Set<string>();
  for (const group of shapes.values()) {
    if (group.length < 2) continue;
    const maps = group.map((c) => leafMap(c.responseBody));
    const allPaths = new Set<string>();
    for (const m of maps) for (const p of m.keys()) allPaths.add(p);
    for (const path of allPaths) {
      const distinct = new Set(maps.map((m) => m.get(path)));
      if (distinct.size > 1) volatile.add(path);
    }
  }
  return [...volatile].sort();
}
