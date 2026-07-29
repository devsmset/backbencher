import { randomUUID } from "node:crypto";
import type { TestSpec, TestSpecStep } from "@backbencher/schemas";
import { applyJsonAssertions, checkSchemaConformance, jsonPathFirst } from "./assertions.js";
import { type TemplateScope, resolveValue } from "./templates.js";

// TestSpec runtime (architecture §7.3). Executes steps sequentially with template resolution,
// JSONPath extraction chaining, schema conformance, polling (backoff, never sleep-forever),
// and failure-tolerant cleanup. The SAME engine backs both in-process runs and compiled
// Playwright tests (the codegen just supplies a Playwright-request-backed HttpClient).

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export type HttpClient = (req: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}) => Promise<HttpResponse>;

export interface OperationRef {
  method: string;
  template: string;
}

export interface AuthResolved {
  bearer?: string | undefined;
  cookie?: string | undefined;
  headers?: Record<string, string>;
}

export interface RunContext {
  baseUrl: string;
  http: HttpClient;
  operations: Record<string, OperationRef>;
  responseSchemas?: Record<string, Record<string, unknown>>;
  volatileFields?: Record<string, string[]>;
  clientGeneratedFields?: Record<string, string[]>;
  auth?: AuthResolved;
  env?: Record<string, string | undefined>;
  log?: (msg: string) => void;
}

export interface StepResult {
  id: string;
  operationId: string;
  status: number | null;
  ok: boolean;
  errors: string[];
  extracted: Record<string, unknown>;
}

export interface RunResult {
  specId: string;
  ok: boolean;
  cleanupOk: boolean;
  steps: StepResult[];
  durationMs: number;
}

export const fetchHttp: HttpClient = async ({ method, url, headers, body }) => {
  const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  const h: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    h[k] = v;
  });
  return { status: res.status, headers: h, body: parsed };
};

function authHeaders(auth?: AuthResolved): Record<string, string> {
  const h: Record<string, string> = { ...(auth?.headers ?? {}) };
  if (auth?.bearer) h.authorization = `Bearer ${auth.bearer}`;
  if (auth?.cookie) h.cookie = auth.cookie;
  return h;
}

interface RequestSpec {
  pathParams?: Record<string, string> | undefined;
  query?: Record<string, string> | undefined;
  headers?: Record<string, string> | undefined;
  body?: unknown;
}

function mintClientGenerated(body: unknown, fields: string[] | undefined): unknown {
  if (!fields || fields.length === 0 || body === null || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  const tails = new Set(fields.map((f) => f.replace(/\[\*\]/g, "").split(".").pop() ?? ""));
  const out = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(out)) if (tails.has(key)) out[key] = randomUUID();
  return out;
}

function buildHttpRequest(
  op: OperationRef,
  operationId: string,
  request: RequestSpec | undefined,
  ctx: RunContext,
  scope: TemplateScope,
): { method: string; url: string; headers: Record<string, string>; body?: unknown } {
  const rq = request ?? {};
  const pathParams = resolveValue(rq.pathParams ?? {}, scope) as Record<string, string>;
  const query = resolveValue(rq.query ?? {}, scope) as Record<string, string>;
  const headers0 = resolveValue(rq.headers ?? {}, scope) as Record<string, string>;
  let body = rq.body === undefined ? undefined : resolveValue(rq.body, scope);
  body = mintClientGenerated(body, ctx.clientGeneratedFields?.[operationId]);

  const path = op.template.replace(/\{([^}]+)\}/g, (_m, name: string) =>
    encodeURIComponent(pathParams[name] ?? `{${name}}`),
  );
  const qs = new URLSearchParams(query).toString();
  const url = `${ctx.baseUrl.replace(/\/$/, "")}${path}${qs ? `?${qs}` : ""}`;
  const headers = { ...authHeaders(ctx.auth), ...headers0 };
  if (body !== undefined && headers["content-type"] === undefined) headers["content-type"] = "application/json";
  return { method: op.method, url, headers, ...(body === undefined ? {} : { body }) };
}

async function pollUntil(
  step: TestSpecStep,
  op: OperationRef,
  ctx: RunContext,
  scope: TemplateScope,
  initial: HttpResponse,
): Promise<HttpResponse> {
  const poll = step.poll;
  if (!poll) return initial;
  const deadline = Date.now() + poll.timeoutMs;
  let res = initial;
  const meets = (): boolean => {
    if (poll.untilStatus !== undefined && res.status !== poll.untilStatus) return false;
    if (poll.untilPath !== undefined && jsonPathFirst(res.body, poll.untilPath) !== poll.untilValue) return false;
    return true;
  };
  while (!meets() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, poll.intervalMs));
    res = await ctx.http(buildHttpRequest(op, step.operationId, step.request, ctx, scope));
  }
  return res;
}

async function runStep(
  step: TestSpecStep,
  ctx: RunContext,
  scope: TemplateScope,
): Promise<StepResult> {
  const op = ctx.operations[step.operationId];
  if (!op) {
    return { id: step.id, operationId: step.operationId, status: null, ok: false, errors: [`unknown operationId ${step.operationId}`], extracted: {} };
  }

  const errors: string[] = [];
  let res: HttpResponse;
  try {
    res = await ctx.http(buildHttpRequest(op, step.operationId, step.request, ctx, scope));
    res = await pollUntil(step, op, ctx, scope, res);
  } catch (e) {
    return { id: step.id, operationId: step.operationId, status: null, ok: false, errors: [`request failed: ${String(e)}`], extracted: {} };
  }

  const want = step.expect.status;
  const statusOk = Array.isArray(want) ? want.includes(res.status) : res.status === want;
  if (!statusOk) errors.push(`expected status ${JSON.stringify(want)}, got ${res.status}`);

  if (step.expect.schemaConformance) {
    const schema = ctx.responseSchemas?.[step.operationId]?.[String(res.status)];
    errors.push(...checkSchemaConformance(schema, res.body, ctx.volatileFields?.[step.operationId] ?? []));
  }
  errors.push(...applyJsonAssertions(res.body, step.expect.jsonAssertions));

  const extracted: Record<string, unknown> = {};
  if (step.extract) {
    for (const [varName, path] of Object.entries(step.extract)) extracted[varName] = jsonPathFirst(res.body, path);
  }

  return { id: step.id, operationId: step.operationId, status: res.status, ok: errors.length === 0, errors, extracted };
}

export async function runTestSpec(spec: TestSpec, ctx: RunContext): Promise<RunResult> {
  const start = Date.now();
  const scope: TemplateScope = { steps: {}, env: ctx.env ?? {} };
  const steps: StepResult[] = [];
  let ok = true;

  for (const step of spec.steps) {
    const r = await runStep(step, ctx, scope);
    steps.push(r);
    scope.steps[step.id] = { extract: r.extracted };
    if (!r.ok) {
      ok = false;
      if (!step.continueOnFailure) break;
    }
  }

  let cleanupOk = true;
  for (const c of spec.cleanup) {
    const op = ctx.operations[c.operationId];
    if (!op) continue;
    try {
      await ctx.http(buildHttpRequest(op, c.operationId, c.request as RequestSpec | undefined, ctx, scope));
    } catch (e) {
      cleanupOk = false;
      ctx.log?.(`cleanup ${c.operationId} failed: ${String(e)}`);
      if (!c.ignoreFailure) throw e;
    }
  }

  return { specId: spec.specId, ok, cleanupOk, steps, durationMs: Date.now() - start };
}
