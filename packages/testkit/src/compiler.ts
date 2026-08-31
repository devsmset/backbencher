import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestSpec } from "@backbencher/schemas";
import type { OperationRef } from "./runtime.js";

// TestSpec compiler (architecture §7.3): emit a Playwright Test file that drives the shared
// runtime with a Playwright-request-backed HttpClient. Deterministic — the LLM never writes
// runnable code. Auth is injected at run time from env, never from the pack.

export interface CompileContext {
  operations: Record<string, OperationRef>;
  responseSchemas?: Record<string, Record<string, unknown>>;
  volatileFields?: Record<string, string[]>;
  clientGeneratedFields?: Record<string, string[]>;
  baseUrl?: string;
  runtimeImport?: string;
}

export function compileToPlaywright(spec: TestSpec, ctx: CompileContext): string {
  const runtimeImport = ctx.runtimeImport ?? "@backbencher/testkit";
  const j = (v: unknown): string => JSON.stringify(v, null, 2);
  return `// AUTO-GENERATED from TestSpec ${spec.specId} (composition ${spec.compositionId}). Do not edit.
import { expect, test } from "@playwright/test";
import { runTestSpec } from ${JSON.stringify(runtimeImport)};

const spec = ${j(spec)};
const operations = ${j(ctx.operations)};
const responseSchemas = ${j(ctx.responseSchemas ?? {})};
const volatileFields = ${j(ctx.volatileFields ?? {})};
const clientGeneratedFields = ${j(ctx.clientGeneratedFields ?? {})};

test(${JSON.stringify(spec.title)}, async ({ request }) => {
  const profile = spec.authProfile.toUpperCase();
  const http = async (req) => {
    const res = await request.fetch(req.url, { method: req.method, headers: req.headers, data: req.body });
    let body;
    try { body = await res.json(); } catch { body = await res.text(); }
    return { status: res.status(), headers: res.headers(), body };
  };
  const result = await runTestSpec(spec, {
    baseUrl: process.env.BB_BASE_URL ?? ${JSON.stringify(ctx.baseUrl ?? "")},
    http,
    operations,
    responseSchemas,
    volatileFields,
    clientGeneratedFields,
    auth: {
      bearer: process.env["BB_AUTH_" + profile + "_BEARER"],
      cookie: process.env["BB_AUTH_" + profile + "_COOKIE"],
    },
    env: process.env,
  });
  for (const s of result.steps) {
    expect(s.errors, s.id + ": " + s.errors.join("; ")).toEqual([]);
  }
  expect(result.cleanupOk).toBe(true);
});
`;
}

export function compileSpecFile(spec: TestSpec, ctx: CompileContext, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${spec.specId}.spec.ts`);
  writeFileSync(path, compileToPlaywright(spec, ctx));
  return path;
}
