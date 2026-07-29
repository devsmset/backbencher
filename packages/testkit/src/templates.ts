import { randomUUID } from "node:crypto";

// Template resolution (architecture §2.5, §7.3). Whole-string tokens preserve the resolved
// value's type; inline tokens are stringified. Unknown template kinds throw (hallucination guard).

export interface TemplateScope {
  steps: Record<string, { extract: Record<string, unknown> }>;
  env: Record<string, string | undefined>;
}

const WHOLE = /^\{\{(.+)\}\}$/;
const INLINE = /\{\{([^}]+)\}\}/g;

function resolveExpr(expr: string, scope: TemplateScope): unknown {
  const e = expr.trim();
  const step = /^steps\.([^.]+)\.extract\.(.+)$/.exec(e);
  if (step) {
    const id = step[1] as string;
    const varName = step[2] as string;
    const s = scope.steps[id];
    if (!s || !(varName in s.extract)) throw new Error(`unresolved template {{${e}}}`);
    return s.extract[varName];
  }
  const env = /^env\.(.+)$/.exec(e);
  if (env) {
    const v = scope.env[env[1] as string];
    if (v === undefined) throw new Error(`unresolved template {{${e}}}`);
    return v;
  }
  if (e === "faker.uuid") return randomUUID();
  if (e === "faker.email") return `qa+${randomUUID().slice(0, 8)}@example.test`;
  if (e === "now.iso") return new Date().toISOString();
  throw new Error(`unknown template {{${e}}}`);
}

export function resolveValue(value: unknown, scope: TemplateScope): unknown {
  if (typeof value === "string") {
    const whole = WHOLE.exec(value.trim());
    if (whole) return resolveExpr(whole[1] as string, scope);
    return value.replace(INLINE, (_m, ex: string) => String(resolveExpr(ex, scope)));
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, scope));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveValue(v, scope);
    return out;
  }
  return value;
}

/** Static scan for {{steps.<id>.extract.<var>}} references (used by the agent validator). */
export function findStepExtractRefs(value: unknown): { stepId: string; varName: string }[] {
  const refs: { stepId: string; varName: string }[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\{\{steps\.([^.]+)\.extract\.([^}]+)\}\}/g)) {
        refs.push({ stepId: m[1] as string, varName: m[2] as string });
      }
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x);
    } else if (v !== null && typeof v === "object") {
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(value);
  return refs;
}
