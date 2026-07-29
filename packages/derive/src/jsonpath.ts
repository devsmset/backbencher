// JSON scalar walker. Produces normalized leaf paths (array indices collapsed to [*]) used by
// dataflow indexing (§5.5) and volatile-field diffing (§5.4).

export type Scalar = string | number | boolean;

export interface Leaf {
  path: string;
  value: string; // stringified for exact-value joins/diffs
  raw: Scalar;
}

export function walkScalars(value: unknown, basePath = "$"): Leaf[] {
  const out: Leaf[] = [];
  const visit = (v: unknown, path: string): void => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item, `${path}[*]`);
      return;
    }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        visit(val, `${path}.${k}`);
      }
      return;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out.push({ path, value: String(v), raw: v });
    }
  };
  visit(value, basePath);
  return out;
}

/** Last key of a JSON path, used to name corroborated path params ("$.data.invoiceId" -> "invoiceId"). */
export function jsonPathTail(path: string): string {
  const cleaned = path.replace(/\[\*\]/g, "");
  const idx = cleaned.lastIndexOf(".");
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}
