import { type TestSpec, TestSpecSchema } from "@backbencher/schemas";
import { type MergedOperation, type Store, mergeOperation } from "@backbencher/store";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import type { CompileContext } from "./compiler.js";
import { type RunContext, type RunResult, fetchHttp, runTestSpec } from "./runtime.js";

// Runner + trust (architecture §7.4): quarantine (retry once → flaky, not failed) and an
// environment guard that refuses data-writing specs against non-destructive environments.

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type RunStatus = "passed" | "flaky" | "failed";

export interface QuarantinedResult {
  status: RunStatus;
  result: RunResult;
}

export async function runWithQuarantine(spec: TestSpec, ctx: RunContext): Promise<QuarantinedResult> {
  const first = await runTestSpec(spec, ctx);
  if (first.ok && first.cleanupOk) return { status: "passed", result: first };
  const second = await runTestSpec(spec, ctx);
  if (second.ok && second.cleanupOk) return { status: "flaky", result: second };
  return { status: "failed", result: second };
}

export interface EnvInfo {
  name: string;
  baseUrl: string;
  destructive: boolean;
}

function resolveAuthFromEnv(profile: string): { bearer?: string | undefined; cookie?: string | undefined } {
  const p = profile.toUpperCase();
  return { bearer: process.env[`BB_AUTH_${p}_BEARER`], cookie: process.env[`BB_AUTH_${p}_COOKIE`] };
}

export function buildRunContext(
  store: Store,
  spec: TestSpec,
  env: EnvInfo,
  http = fetchHttp,
): RunContext {
  const operations: RunContext["operations"] = {};
  const responseSchemas: Record<string, Record<string, unknown>> = {};
  const volatileFields: Record<string, string[]> = {};
  const ids = new Set([
    ...spec.steps.map((s) => s.operationId),
    ...spec.cleanup.map((c) => c.operationId),
  ]);
  for (const id of ids) {
    const derived = store.operations.get(id);
    if (!derived) continue;
    const merged: MergedOperation = mergeOperation(derived, store.annotations.get(id));
    operations[id] = { method: merged.method, template: merged.pathTemplate.template };
    responseSchemas[id] = merged.responseSchemas as Record<string, Record<string, unknown>>;
    volatileFields[id] = merged.volatileResponseFields;
  }
  return {
    baseUrl: env.baseUrl,
    http,
    operations,
    responseSchemas,
    volatileFields,
    auth: resolveAuthFromEnv(spec.authProfile),
  };
}

export function guardEnvironment(
  spec: TestSpec,
  operations: Record<string, { method: string }>,
  env: EnvInfo,
): void {
  const writes = spec.steps.some((s) => WRITE_METHODS.has(operations[s.operationId]?.method ?? ""));
  if (writes && !env.destructive) {
    throw new Error(`refusing to run data-writing spec against non-destructive environment "${env.name}"`);
  }
}

export async function runSpecAgainstEnv(
  store: Store,
  spec: TestSpec,
  env: EnvInfo,
  http = fetchHttp,
): Promise<QuarantinedResult> {
  const ctx = buildRunContext(store, spec, env, http);
  guardEnvironment(spec, ctx.operations, env);
  return runWithQuarantine(spec, ctx);
}

/** Parse a stored TestSpec YAML into a validated TestSpec. */
export function loadSpecYaml(yaml: string): TestSpec {
  return TestSpecSchema.parse(loadYaml(yaml));
}

/** Serialize a TestSpec to YAML for storage/display. */
export function specToYaml(spec: TestSpec): string {
  return dumpYaml(spec);
}

/** Build a CompileContext (operations + schemas + volatile fields) for codegen. */
export function buildCompileContext(store: Store, spec: TestSpec, baseUrl?: string): CompileContext {
  const rc = buildRunContext(store, spec, { name: "", baseUrl: baseUrl ?? "", destructive: true });
  return {
    operations: rc.operations,
    responseSchemas: rc.responseSchemas ?? {},
    volatileFields: rc.volatileFields ?? {},
    ...(baseUrl ? { baseUrl } : {}),
  };
}
