// Minimal genson-style JSON Schema builder (architecture §5.3). Unions schemas across many
// observed bodies; `required` = present in >= threshold of observations; string fields with
// few distinct values get a soft `x-observed-enum` (advisory, not a hard enum constraint).

export type JsonSchema = Record<string, unknown>;

interface Node {
  count: number;
  types: Set<string>;
  props: Map<string, { node: Node; present: number }>;
  items: Node | null;
  stringValues: Map<string, number>;
  stringCount: number;
}

export function createNode(): Node {
  return {
    count: 0,
    types: new Set(),
    props: new Map(),
    items: null,
    stringValues: new Map(),
    stringCount: 0,
  };
}

function jsonType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v; // "string" | "boolean" | "object"
}

export function addSample(node: Node, value: unknown): void {
  node.count += 1;
  const t = jsonType(value);
  node.types.add(t);
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = new Set(Object.keys(obj));
    for (const key of keys) {
      let entry = node.props.get(key);
      if (!entry) {
        entry = { node: createNode(), present: 0 };
        node.props.set(key, entry);
      }
      entry.present += 1;
      addSample(entry.node, obj[key]);
    }
  } else if (t === "array") {
    if (!node.items) node.items = createNode();
    for (const item of value as unknown[]) addSample(node.items, item);
  } else if (t === "string") {
    node.stringCount += 1;
    const s = value as string;
    node.stringValues.set(s, (node.stringValues.get(s) ?? 0) + 1);
  }
}

export interface BuildOptions {
  requiredThreshold: number; // e.g. 0.95
  enumMinObservations: number; // e.g. 5
  enumMaxDistinct: number; // e.g. 8
}

function normalizeTypes(types: Set<string>): string[] {
  const t = new Set(types);
  if (t.has("number") && t.has("integer")) t.delete("integer"); // widen integer -> number
  return [...t].sort();
}

export function buildSchema(node: Node, opts: BuildOptions): JsonSchema {
  const types = normalizeTypes(node.types);
  const schema: JsonSchema = {};
  if (types.length === 1) schema.type = types[0];
  else if (types.length > 1) schema.type = types;

  if (node.types.has("object") && node.props.size > 0) {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    const objectCount = node.count; // approximation: object observed `count` times at this node
    for (const [key, entry] of [...node.props.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      properties[key] = buildSchema(entry.node, opts);
      if (objectCount > 0 && entry.present / objectCount >= opts.requiredThreshold) required.push(key);
    }
    schema.properties = properties;
    if (required.length > 0) schema.required = required;
  }

  if (node.types.has("array") && node.items) {
    schema.items = buildSchema(node.items, opts);
  }

  if (
    node.stringCount >= opts.enumMinObservations &&
    node.stringValues.size > 0 &&
    node.stringValues.size <= opts.enumMaxDistinct
  ) {
    schema["x-observed-enum"] = [...node.stringValues.keys()].sort();
  }

  return schema;
}

/** Convenience: union many samples into one schema. Returns null if no samples. */
export function inferUnion(values: unknown[], opts: BuildOptions): JsonSchema | null {
  if (values.length === 0) return null;
  const node = createNode();
  for (const v of values) addSample(node, v);
  return buildSchema(node, opts);
}
