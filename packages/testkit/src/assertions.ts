import type { JsonAssertion } from "@backbencher/schemas";
import AjvImport from "ajv";
import { JSONPath } from "jsonpath-plus";

// Assertions (architecture §7.3): declarative JSON assertions + schema conformance via ajv,
// with volatile/ignored fields removed from `required` and stripped before strict checks.

type ValidateFn = ((data: unknown) => boolean) & {
  errors?: { instancePath?: string; message?: string }[] | null;
};
const AjvCtor = AjvImport as unknown as new (opts?: Record<string, unknown>) => {
  compile: (schema: object) => ValidateFn;
};
const ajv = new AjvCtor({ allErrors: true, strict: false });

export function jsonPathFirst(body: unknown, path: string): unknown {
  try {
    return JSONPath({ path, json: (body ?? {}) as object, wrap: false });
  } catch {
    return undefined;
  }
}

export function applyJsonAssertions(body: unknown, assertions: JsonAssertion[]): string[] {
  const errors: string[] = [];
  for (const a of assertions) {
    let matches: unknown[] = [];
    try {
      matches = JSONPath({ path: a.path, json: (body ?? {}) as object, wrap: true }) as unknown[];
    } catch {
      matches = [];
    }
    const exists = matches.length > 0;
    const first = matches[0];
    const fail = (m: string) => errors.push(`${a.path} ${m}`);
    switch (a.op) {
      case "exists":
        if (!exists) fail("should exist");
        break;
      case "absent":
        if (exists) fail("should be absent");
        break;
      case "equals":
        if (first !== a.value) fail(`expected ${JSON.stringify(a.value)}, got ${JSON.stringify(first)}`);
        break;
      case "notEquals":
        if (first === a.value) fail(`should not equal ${JSON.stringify(a.value)}`);
        break;
      case "contains":
        if (
          typeof first === "string"
            ? !first.includes(String(a.value))
            : !(Array.isArray(first) && first.includes(a.value))
        )
          fail(`should contain ${JSON.stringify(a.value)}`);
        break;
      case "matches":
        if (typeof first !== "string" || !new RegExp(String(a.value)).test(first)) fail(`should match ${a.value}`);
        break;
      case "gt":
        if (!(typeof first === "number" && first > Number(a.value))) fail(`should be > ${a.value}`);
        break;
      case "lt":
        if (!(typeof first === "number" && first < Number(a.value))) fail(`should be < ${a.value}`);
        break;
      case "lengthGte": {
        const len = typeof first === "string" || Array.isArray(first) ? first.length : -1;
        if (!(len >= Number(a.value))) fail(`length should be >= ${a.value}`);
        break;
      }
    }
  }
  return errors;
}

function excludedTails(paths: string[]): Set<string> {
  return new Set(
    paths
      .map((p) => p.replace(/\[\*\]/g, "").split(".").pop() ?? "")
      .filter((s) => s.length > 0),
  );
}

function relaxRequired(schema: unknown, exclude: Set<string>): unknown {
  if (schema === null || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map((s) => relaxRequired(s, exclude));
  const s = { ...(schema as Record<string, unknown>) };
  if (Array.isArray(s.required)) s.required = (s.required as string[]).filter((r) => !exclude.has(r));
  if (s.properties && typeof s.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      props[k] = relaxRequired(v, exclude);
    }
    s.properties = props;
  }
  if (s.items) s.items = relaxRequired(s.items, exclude);
  return s;
}

function stripKeys(body: unknown, exclude: Set<string>): unknown {
  if (Array.isArray(body)) return body.map((b) => stripKeys(b, exclude));
  if (body !== null && typeof body === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) if (!exclude.has(k)) out[k] = stripKeys(v, exclude);
    return out;
  }
  return body;
}

export function checkSchemaConformance(
  schema: unknown,
  body: unknown,
  excludePaths: string[],
): string[] {
  if (!schema) return [];
  const exclude = excludedTails(excludePaths);
  try {
    const validate = ajv.compile(relaxRequired(schema, exclude) as object);
    const ok = validate(stripKeys(body, exclude));
    if (ok) return [];
    return (validate.errors ?? []).map((e) => `schema ${e.instancePath || "/"} ${e.message ?? "invalid"}`);
  } catch (e) {
    return [`schema compile error: ${String(e)}`];
  }
}
