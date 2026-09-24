# Session Script Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an analyst generate a runnable `TestSpec` directly from a curated Session — no LLM
involved — by reusing the existing `Composition` → approve → `TestSpec` pipeline with a
deterministic generator instead of the model call.

**Architecture:** Two new pure functions in `packages/agent` (`proposeCompositionFromSession`,
`generateTestSpecFromSession`) that build the same `Composition`/`TestSpec` shapes the LLM path
builds, sourced from a curated Session's real captured calls and its already-derived
`SessionCallEdge[]`. Two small additive optional fields on `Composition`/`CompositionStep` carry
provenance and route `agent.generate` to the right generator. One new portal-api mutation and one
new portal-web button wire it to the existing Compose screen, unchanged from there.

**Tech Stack:** TypeScript, Zod, Drizzle/SQLite (via `@backbencher/store`), tRPC, React, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-24-session-script-generation-design.md](../specs/2026-09-24-session-script-generation-design.md)

## Global Constraints

- No LLM call anywhere in this feature — everything is deterministic, derived from already-computed
  data (`SessionCallEdge[]`, `computeDependencyGraph`, `pairCalls`).
- `Composition`/`CompositionStep` schema changes must be additive and optional — no migration, no
  change to any existing goal-based LLM flow.
- Any curated Call with no resolved `operationId` blocks generation outright, with a specific list —
  never silently dropped.
- Request headers are never copied verbatim into a generated `TestSpec` — only a header resolved via
  a `SessionCallEdge` (e.g. an `x-csrf-token` whose value came from an earlier response body) is
  included, as a template. An unresolved static credential/cookie is dropped, not hardcoded.
- `cleanup` is never auto-inferred from the session — a write-containing session's generated spec is
  expected to validate as `"invalid"` via the existing `write-implies-cleanup` rule; that's correct,
  not a bug, per the spec's explicit v1 decision.
- Only edges whose producer is a **response body** value are templated: a `TestSpec` `extract` is a
  JSONPath into the response body (`runtime.ts`). A response-header producer (e.g. `Set-Cookie`)
  can't be expressed, so its consumer keeps the real literal (path/query/body) or is dropped (header).
- Auth is supplied at run time by the runtime (`authHeaders(ctx.auth)`, driven by the spec's
  `authProfile`), which is why dropping captured `Authorization`/cookie headers is correct rather
  than a gap. Note `Authorization` headers never form dataflow edges at all (`dataflow.ts` skips
  "standard" request headers), so they are always dropped; only custom headers whose value came from
  an earlier response body (e.g. `x-csrf-token`) are templated in.
- Client-generated substitution (`{{faker.uuid}}`) applies to the request **body** only, per the spec.
- Body templating is scoped to **non-array-nested** fields in v1: `SessionCallEdge` JSON paths
  collapse array indices to `[*]`, which is safe for reading but ambiguous for writing a
  substitution back into one specific captured document when several array elements share a path. A
  value inside an array stays its real captured literal — never guessed at. (Producer-side array
  paths are fine: `extract` uses first-match.)
- New tests that write fixture Session files to disk must scope themselves to a fixture sessionId
  under `dataDir()` and clean up in `afterEach` (`curation.test.ts`'s pattern) — never the pattern
  `derivation.test.ts` had before its recent fix (operating on every real session unmocked).

---

### Task 1: Schema additions — provenance fields on `Composition`

**Files:**
- Modify: `packages/schemas/src/knowledge.ts`
- Test: `packages/schemas/test/schemas.test.ts`

**Interfaces:**
- Produces: `CompositionSchema` now accepts (and round-trips) an optional `sourceSessionId: string`.
  `CompositionStepSchema` now accepts (and round-trips) an optional `sourceCorrelationId: string`.
  Both are `.optional()` — every existing fixture/persisted `Composition` without these fields must
  still parse.

- [ ] **Step 1: Write the failing round-trip test**

In `packages/schemas/test/schemas.test.ts` (which imports everything from `../src/index.js`, and
has no Composition tests yet), add `CompositionSchema` to that existing import list, then append a
new block at the end of the file:

```ts
describe("composition provenance", () => {
  const base = {
    goal: "replay session s1",
    status: "draft" as const,
    unmetDependencies: [],
    candidateGaps: [],
    createdBy: "alice",
    createdAt: 1,
    updatedBy: "alice",
    updatedAt: 1,
  };

  it("round-trips the optional session-provenance fields", () => {
    const parsed = CompositionSchema.parse({
      ...base,
      compositionId: "c1",
      sourceSessionId: "s1",
      steps: [{ operationId: "op_a", intent: "GET /a", sourceCorrelationId: "corr-1" }],
    });
    expect(parsed.sourceSessionId).toBe("s1");
    expect(parsed.steps[0]?.sourceCorrelationId).toBe("corr-1");
  });

  it("still parses a Composition that has neither field, as every LLM-authored one does", () => {
    const parsed = CompositionSchema.parse({
      ...base,
      compositionId: "c2",
      steps: [{ operationId: "op_a", intent: "why" }],
    });
    expect(parsed.sourceSessionId).toBeUndefined();
    expect(parsed.steps[0]?.sourceCorrelationId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/schemas test`
Expected: the first test FAILS — Zod strips keys the schema doesn't know, so `parsed.sourceSessionId`
is `undefined` instead of `"s1"`. (The second test already passes; it pins backward compatibility.)

- [ ] **Step 3: Add the two fields**

In `packages/schemas/src/knowledge.ts`, find `CompositionStepSchema` and `CompositionSchema`
(around the block shown below) and add one field to each:

```ts
export const CompositionStepSchema = z.object({
  operationId: z.string(),
  intent: z.string(), // the model's one-line why-this-step, in the goal's terms
  satisfies: z.array(z.string()).default([]), // downstream requires-slots this step feeds
  autoAdded: z.boolean().default(false), // inserted by dependency auto-completion, not the model
  fromSessionIds: z.array(z.string()).default([]), // provenance: which Reference Sessions showed this
  sourceCorrelationId: z.string().optional(), // set only when this step was deterministically
  // generated from a curated Session (not proposed by the model) — the exact Call it came from.
});
```

```ts
export const CompositionSchema = z.object({
  compositionId: z.string(),
  goal: z.string().min(1), // the analyst's free text
  status: CompositionStatus.default("draft"),
  steps: z.array(CompositionStepSchema),
  unmetDependencies: z
    .array(z.object({ operationId: z.string(), slot: z.string(), note: z.string() }))
    .default([]),
  candidateGaps: z
    .array(z.object({ description: z.string(), suggestedName: z.string().optional() }))
    .default([]),
  rationale: z.string().optional(), // the model's short narrative of the composed flow
  modelInfo: z
    .object({ model: z.string(), packHash: z.string().optional(), promptHash: z.string().optional() })
    .optional(),
  testDecision: TestDecisionSchema.optional(), // set at approval, not at proposal
  sourceSessionId: z.string().optional(), // set only when this Composition was deterministically
  // generated from a curated Session, not proposed by the model. agent.generate branches on its
  // presence to pick the deterministic generator instead of the LLM path.
  createdBy: z.string(),
  createdAt: z.number().int(),
  updatedBy: z.string(),
  updatedAt: z.number().int(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @backbencher/schemas test`
Expected: PASS

- [ ] **Step 5: Rebuild schemas so downstream packages see the change, then typecheck**

Run: `pnpm --filter @backbencher/schemas build && pnpm -r typecheck`
Expected: both succeed (packages resolve each other through compiled `dist/`, so this rebuild is
required before Task 2's package can use the new fields — see `AGENTS.md`).

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/knowledge.ts packages/schemas/test/schemas.test.ts
git commit -m "feat(schemas): add optional session-provenance fields to Composition"
```

---

### Task 2: Propose — `proposeCompositionFromSession`

**Files:**
- Create: `packages/agent/src/composeFromSession.ts`
- Test: `packages/agent/test/composeFromSession.test.ts`

**Interfaces:**
- Consumes: `Store` (from `@backbencher/store`), `loadCuratedOrRawSession`/`pairCalls` (from
  `@backbencher/derive`), `dataDir`/`newId` (from `@backbencher/shared`), `CompositionSchema` (from
  `@backbencher/schemas`).
- Produces: `proposeCompositionFromSession(store: Store, sessionId: string, actor: string):
  Composition` and `export class UnclassifiedCallsError extends Error` (thrown when any curated
  Call has no resolved `operationId`; carries `.calls: Array<{ correlationId: string; method:
  string; pathname: string }>`). Task 4 imports both.

- [ ] **Step 1: Write the failing test for the happy path**

Create `packages/agent/test/composeFromSession.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type SessionData, runDerivation } from "@backbencher/derive";
import { dataDir } from "@backbencher/shared";
import { openStore } from "@backbencher/store";
import { afterEach, describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../../derive/fixtures/sessions.js";
import { proposeCompositionFromSession, UnclassifiedCallsError } from "../src/composeFromSession.js";

// Mirrors packages/portal-api/test/curation.test.ts's fixture pattern: real files under the real
// dataDir(), tracked and removed in afterEach. Never the unscoped pattern derivation.test.ts had
// before its fix — this suite must not touch any session it didn't create itself.
const createdDirs: string[] = [];
afterEach(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
  createdDirs.length = 0;
});

function writeSession(session: SessionData): string {
  const dir = join(dataDir(), "sessions", session.meta.sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(session.meta));
  writeFileSync(
    join(dir, "events.ndjson"),
    `${session.events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
  createdDirs.push(dir);
  return dir;
}

function completeSession(sessionId: string, events: SessionData["events"], goal: string): SessionData {
  const session = makeSession(sessionId, events);
  return { ...session, meta: { ...session.meta, name: `${sessionId} fixture`, goal } };
}

describe("proposeCompositionFromSession", () => {
  it("builds a draft Composition from a curated session's real calls, in order", () => {
    resetClock();
    const session = completeSession(
      "sess-propose-1",
      [
        ...apiCall("c1", { method: "POST", url: "https://app.example.net/auth/login", body: { token: "abc123def456" } }),
        ...apiCall("c2", {
          method: "POST",
          url: "https://app.example.net/api/tickets",
          reqHeaders: { authorization: "Bearer abc123def456" },
          body: { id: "t1" },
        }),
      ],
      "log in and create a ticket",
    );
    writeSession(session);

    const store = openStore(":memory:");
    const derived = runDerivation([session]);
    store.saveDerivation(derived);
    store.sessions.upsertFromMeta(session.meta);

    const composition = proposeCompositionFromSession(store, "sess-propose-1", "alice");

    expect(composition.goal).toBe("log in and create a ticket");
    expect(composition.sourceSessionId).toBe("sess-propose-1");
    expect(composition.status).toBe("draft");
    expect(composition.steps).toHaveLength(2);
    expect(composition.steps[0]?.sourceCorrelationId).toBe("c1");
    expect(composition.steps[1]?.sourceCorrelationId).toBe("c2");
    expect(composition.steps.every((s) => s.fromSessionIds.includes("sess-propose-1"))).toBe(true);
    expect(store.compositions.get(composition.compositionId)).toEqual(composition);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/agent test`
Expected: FAIL — `../src/composeFromSession.js` does not exist.

- [ ] **Step 3: Implement `composeFromSession.ts`**

Create `packages/agent/src/composeFromSession.ts`:

```ts
import { join } from "node:path";
import { type PairedCall, loadCuratedOrRawSession, pairCalls } from "@backbencher/derive";
import { type Composition, CompositionSchema } from "@backbencher/schemas";
import { dataDir, newId } from "@backbencher/shared";
import type { Store } from "@backbencher/store";

// Deterministic composer (spec: docs/superpowers/specs/2026-09-24-session-script-generation-design.md
// §2). A second, model-free way to arrive at a draft Composition, sourced from a curated Session's
// real observed calls instead of a free-text goal. Every downstream step (approve, TestDecision,
// generation) is shared with the LLM path — only proposal differs.

// Duplicated from packages/portal-api/src/routers.ts's `isAssetLikeCall` (PairedCall-shaped
// version) rather than shared — matches that file's own precedent of keeping this per-consumer
// rather than factored out (see its comment: "kept separate since the two shapes differ").
const ASSET_PATH_RE = /\.(?:svg|woff2?|ttf|otf|eot|ico|png|jpe?g|gif|webp|avif)(?:$|[?#])/i;
const DROPPED_CONTENT_PREFIXES = ["image/", "font/", "text/css", "text/javascript"];

function isAssetLikeCall(c: Pick<PairedCall, "pathname" | "requestContentType" | "responseContentType">): boolean {
  const contentType = (c.responseContentType ?? c.requestContentType ?? "").toLowerCase();
  if (DROPPED_CONTENT_PREFIXES.some((prefix) => contentType.startsWith(prefix))) return true;
  return ASSET_PATH_RE.test(c.pathname);
}

export class UnclassifiedCallsError extends Error {
  constructor(public readonly calls: Array<{ correlationId: string; method: string; pathname: string }>) {
    super(
      `session has ${calls.length} call(s) with no derived operationId — re-derive or exclude them first: ` +
        calls.map((c) => `${c.method} ${c.pathname} (${c.correlationId})`).join(", "),
    );
    this.name = "UnclassifiedCallsError";
  }
}

export function proposeCompositionFromSession(store: Store, sessionId: string, actor: string): Composition {
  const session = store.sessions.get(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);

  const dir = join(dataDir(), "sessions", sessionId);
  const calls = pairCalls(loadCuratedOrRawSession(dir)).filter((c) => !isAssetLikeCall(c));

  const flow = store.flows.listBySession(sessionId)[0];
  const opByCorrelation = new Map((flow?.steps ?? []).map((s) => [s.correlationId, s.operationId] as const));

  const unclassified = calls.filter((c) => !opByCorrelation.has(c.correlationId));
  if (unclassified.length > 0) {
    throw new UnclassifiedCallsError(
      unclassified.map((c) => ({ correlationId: c.correlationId, method: c.method, pathname: c.pathname })),
    );
  }

  const annotationsById = new Map(store.annotations.list().map((a) => [a.operationId, a]));

  const steps = calls.map((c) => {
    const operationId = opByCorrelation.get(c.correlationId) as string;
    const does = annotationsById.get(operationId)?.does;
    return {
      operationId,
      sourceCorrelationId: c.correlationId,
      intent: does ?? `${c.method} ${c.pathname}`,
      satisfies: [],
      autoAdded: false,
      fromSessionIds: [sessionId],
    };
  });

  const now = Date.now();
  const composition = CompositionSchema.parse({
    compositionId: newId(),
    goal: session.meta.goal,
    status: "draft",
    sourceSessionId: sessionId,
    steps,
    unmetDependencies: [],
    candidateGaps: [],
    rationale: `Replayed from session ${sessionId}: ${session.meta.name}`,
    createdBy: actor,
    createdAt: now,
    updatedBy: actor,
    updatedAt: now,
  });

  return store.compositions.upsert(composition);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @backbencher/agent test`
Expected: PASS

- [ ] **Step 5: Write the failing test for the unclassified-call refusal**

Add to `packages/agent/test/composeFromSession.test.ts`, inside the same `describe` block:

```ts
it("refuses when a curated call has no derived operationId", () => {
  resetClock();
  const session = completeSession(
    "sess-propose-2",
    [...apiCall("c1", { url: "https://app.example.net/api/things", body: { ok: true } })],
    "do a thing",
  );
  writeSession(session);

  const store = openStore(":memory:");
  // No saveDerivation call at all — the store has no Flow for this session, so every call is
  // unclassified. This also covers the "session not derived" case, since flow?.steps ?? [] is [].
  store.sessions.upsertFromMeta(session.meta);

  expect(() => proposeCompositionFromSession(store, "sess-propose-2", "alice")).toThrow(UnclassifiedCallsError);
  try {
    proposeCompositionFromSession(store, "sess-propose-2", "alice");
    expect.unreachable();
  } catch (e) {
    expect(e).toBeInstanceOf(UnclassifiedCallsError);
    expect((e as UnclassifiedCallsError).calls).toHaveLength(1);
    expect((e as UnclassifiedCallsError).calls[0]?.correlationId).toBe("c1");
  }
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @backbencher/agent test`
Expected: PASS (the implementation from Step 3 already handles this case — this step is
confirming it, not adding new code).

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/composeFromSession.ts packages/agent/test/composeFromSession.test.ts
git commit -m "feat(agent): deterministic Composition proposal from a curated session"
```

---

### Task 3: Generate — `generateTestSpecFromSession`

**Files:**
- Create: `packages/agent/src/generateFromSession.ts`
- Test: `packages/agent/test/generateFromSession.test.ts`

**Interfaces:**
- Consumes: `validateSpec` (from `./generate.js`, unchanged), `computeDependencyGraph` (from
  `./dependencies.js`, unchanged), `jsonPathTail`/`walkScalars`/`loadCuratedOrRawSession`/
  `pairCalls` (from `@backbencher/derive`), `Store` (from `@backbencher/store`), `dump` (from
  `js-yaml`, already a dependency of `packages/agent`), `proposeCompositionFromSession` (Task 2,
  used by the tests to build their input).
- Produces: `generateTestSpecFromSession(store: Store, compositionId: string):
  { specId: string; spec: TestSpec | null; valid: boolean; errors: string[] }` and
  `export interface GenerateFromSessionResult`. Task 4's `agent.generate` branch calls this.

This task builds one function incrementally: each step adds one independently-tested behavior.
The fixtures below were verified by running `runDerivation` on them (no auto-filtered calls, and
exactly the edges asserted) — if a test ever fails on the fixture rather than the implementation,
print `store.sessionGraphs.listBySession(<id>)` and compare before touching the implementation.

- [ ] **Step 1: Write the failing test — a single GET step, no edges**

Create `packages/agent/test/generateFromSession.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type SessionData, runDerivation } from "@backbencher/derive";
import { TestSpecSchema } from "@backbencher/schemas";
import { dataDir } from "@backbencher/shared";
import { openStore } from "@backbencher/store";
import { load as loadYaml } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../../derive/fixtures/sessions.js";
import { proposeCompositionFromSession } from "../src/composeFromSession.js";
import { generateTestSpecFromSession } from "../src/generateFromSession.js";

const H = "https://app.example.net";
const NO_CLEANUP = "spec writes data but has no cleanup entries";

// Same scoped-fixture pattern as composeFromSession.test.ts: real files under dataDir(), removed
// in afterEach, never touching any session this suite didn't create.
const createdDirs: string[] = [];
afterEach(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
  createdDirs.length = 0;
});

function completeSession(
  sessionId: string,
  events: SessionData["events"],
  extraMeta: Partial<SessionData["meta"]> = {},
): SessionData {
  const session = makeSession(sessionId, events);
  return { ...session, meta: { ...session.meta, name: `${sessionId} fixture`, goal: `exercise ${sessionId}`, ...extraMeta } };
}

/** Writes the session to disk, derives it into a fresh in-memory store, returns the store. */
function setup(session: SessionData, mutateDerivation?: (d: ReturnType<typeof runDerivation>) => ReturnType<typeof runDerivation>) {
  const dir = join(dataDir(), "sessions", session.meta.sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(session.meta));
  writeFileSync(join(dir, "events.ndjson"), `${session.events.map((e) => JSON.stringify(e)).join("\n")}\n`);
  createdDirs.push(dir);

  const store = openStore(":memory:");
  const derived = runDerivation([session]);
  store.saveDerivation(mutateDerivation ? mutateDerivation(derived) : derived);
  store.sessions.upsertFromMeta(session.meta);
  return store;
}

/** Proposes from the session, approves with a fixed TestDecision, generates. */
function generate(store: ReturnType<typeof openStore>, sessionId: string) {
  const draft = proposeCompositionFromSession(store, sessionId, "alice");
  store.compositions.upsert({
    ...draft,
    status: "approved",
    testDecision: { inScope: true, strategy: "api_functional", rationale: "r", riskLevel: "low", environments: ["staging"] },
    updatedBy: "alice",
    updatedAt: Date.now(),
  });
  return generateTestSpecFromSession(store, draft.compositionId);
}

describe("generateTestSpecFromSession", () => {
  it("generates a valid, persisted, YAML-round-trippable spec for a single GET", () => {
    resetClock();
    const session = completeSession("sess-gen-1", [...apiCall("g1", { url: `${H}/api/health`, body: { ok: true } })], {
      authProfile: "admin",
    });
    const store = setup(session);

    const result = generate(store, "sess-gen-1");

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.spec?.steps).toHaveLength(1);
    expect(result.spec?.steps[0]?.id).toBe("step0");
    expect(result.spec?.steps[0]?.expect.status).toBe(200);
    expect(result.spec?.environment).toBe("staging");
    expect(result.spec?.authProfile).toBe("admin"); // the session's own recorded profile
    expect(result.spec?.tags).toEqual(["from-session"]);

    const row = store.specs.get(result.specId);
    expect(row?.status).toBe("generated");
    // runs.start / bb test compile read the stored YAML, so it must be a real, parseable spec.
    expect(TestSpecSchema.parse(loadYaml(row?.yaml ?? "")).specId).toBe(result.specId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/agent test`
Expected: FAIL — `../src/generateFromSession.js` does not exist.

- [ ] **Step 3: Implement the minimal version — literal request bodies, no templating yet**

Create `packages/agent/src/generateFromSession.ts`:

```ts
import { join } from "node:path";
import { loadCuratedOrRawSession, pairCalls } from "@backbencher/derive";
import { type TestSpec, type TestSpecStep, TestSpecSchema } from "@backbencher/schemas";
import { dataDir, newId } from "@backbencher/shared";
import type { Store } from "@backbencher/store";
import { dump as dumpYaml } from "js-yaml";
import { validateSpec } from "./generate.js";

// Deterministic generator (spec §3), the session-sourced counterpart to generateTestSpec in
// generate.ts. agent.generate calls it instead of the LLM path when a Composition carries
// sourceSessionId. Same result shape and same "invalid" terminal state as the LLM path, so the
// router and the portal-web Specs screen need no branching of their own.

export interface GenerateFromSessionResult {
  specId: string;
  spec: TestSpec | null;
  valid: boolean;
  errors: string[];
}

export function generateTestSpecFromSession(store: Store, compositionId: string): GenerateFromSessionResult {
  const composition = store.compositions.get(compositionId);
  if (!composition) throw new Error(`composition ${compositionId} not found`);
  if (composition.status !== "approved") {
    throw new Error(`composition ${compositionId} is ${composition.status}; only approved compositions become tests`);
  }
  const sessionId = composition.sourceSessionId;
  if (!sessionId) {
    throw new Error(`composition ${compositionId} has no sourceSessionId; use generateTestSpec instead`);
  }
  const session = store.sessions.get(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);

  const dir = join(dataDir(), "sessions", sessionId);
  const callsByCorrelation = new Map(
    pairCalls(loadCuratedOrRawSession(dir)).map((c) => [c.correlationId, c] as const),
  );
  const annotationsById = new Map(store.annotations.list().map((a) => [a.operationId, a]));

  const steps: TestSpecStep[] = composition.steps.map((compStep, i) => {
    const correlationId = compStep.sourceCorrelationId;
    if (!correlationId) throw new Error(`step ${i} of composition ${compositionId} has no sourceCorrelationId`);
    const call = callsByCorrelation.get(correlationId);
    if (!call) {
      throw new Error(`call ${correlationId} not found in session ${sessionId} (deleted after this composition was proposed?)`);
    }
    return {
      id: `step${i}`,
      operationId: compStep.operationId,
      description: annotationsById.get(compStep.operationId)?.does ?? `${call.method} ${call.pathname}`,
      request: call.requestBody !== null && call.requestBody !== undefined ? { body: call.requestBody } : {},
      expect: { status: call.status ?? 0, schemaConformance: true, jsonAssertions: [] },
      continueOnFailure: false,
    };
  });

  const specId = newId();
  const spec = TestSpecSchema.parse({
    version: 1,
    specId,
    compositionId,
    title: composition.goal,
    environment: composition.testDecision?.environments[0] ?? "staging",
    authProfile: session.meta.authProfile ?? "default",
    tags: ["from-session"],
    steps,
    cleanup: [],
  });

  const operations = store.operations.list();
  const errors = validateSpec(spec, {
    validOperationIds: new Set(operations.map((o) => o.operationId)),
    operationMethods: Object.fromEntries(operations.map((o) => [o.operationId, o.method])),
  });
  const valid = errors.length === 0;

  store.specs.upsert({
    specId,
    compositionId,
    yaml: dumpYaml(spec),
    generatedBy: "session-replay",
    model: null,
    packId: null,
    createdAt: Date.now(),
    status: valid ? "generated" : "invalid",
  });

  return { specId, spec, valid, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @backbencher/agent test`
Expected: PASS

- [ ] **Step 5: Write the failing tests — templating from earlier steps' responses**

Add inside the same `describe` block:

```ts
it("templates a body field and a custom header from an earlier response; drops the unexplained Authorization header", () => {
  resetClock();
  const token = "eyJhbGciOiJIUzI1NiJ9.XYZ789ABC123DEF";
  const csrf = "csrf-9f8e7d6c5b4a3210";
  const session = completeSession("sess-gen-2", [
    ...apiCall("g1", { method: "POST", url: `${H}/auth/login`, body: { token, csrf } }),
    ...apiCall("g2", {
      method: "POST",
      url: `${H}/api/tickets`,
      // "authorization" never forms a dataflow edge (dataflow.ts skips standard headers), so it has
      // no producer here — it must be dropped, not hardcoded. Auth is supplied at run time from
      // the spec's authProfile (runtime.ts authHeaders).
      reqHeaders: { "x-csrf-token": csrf, authorization: "Bearer static-key-123456" },
      postData: JSON.stringify({ authToken: token, title: "New ticket" }),
      body: { id: "t1" },
    }),
  ]);
  const store = setup(session);

  const result = generate(store, "sess-gen-2");

  // Both calls are POSTs, so the one expected complaint is the (deliberately never auto-inferred)
  // cleanup. That validateSpec reports nothing else also proves every {{steps.*.extract.*}} we
  // emitted points at an earlier step that really declares that extract.
  expect(result.errors).toEqual([NO_CLEANUP]);
  const [login, ticket] = result.spec?.steps ?? [];
  expect(login?.extract).toEqual({ token: "$.token", csrf: "$.csrf" });
  expect(ticket?.request?.body).toEqual({ authToken: "{{steps.step0.extract.token}}", title: "New ticket" });
  expect(ticket?.request?.headers).toEqual({ "x-csrf-token": "{{steps.step0.extract.csrf}}" });
});

it("templates path params and query params from an earlier response", () => {
  resetClock();
  const u1 = "11111111-1111-1111-1111-111111111111";
  const u2 = "22222222-2222-2222-2222-222222222222";
  const session = completeSession("sess-gen-3", [
    ...apiCall("p1", { method: "POST", url: `${H}/api/invoices`, body: { id: u1, ref: "REF-ALPHA-12345" } }),
    ...apiCall("p2", { url: `${H}/api/invoices/${u1}?ref=REF-ALPHA-12345`, body: { id: u1, total: 100 } }),
    ...apiCall("p3", { method: "POST", url: `${H}/api/invoices`, body: { id: u2, ref: "REF-BETA-67890" } }),
    ...apiCall("p4", { url: `${H}/api/invoices/${u2}?ref=REF-BETA-67890`, body: { id: u2, total: 200 } }),
  ]);
  const store = setup(session);

  const result = generate(store, "sess-gen-3");

  expect(result.errors).toEqual([NO_CLEANUP]);
  const steps = result.spec?.steps ?? [];
  expect(steps.map((s) => s.id)).toEqual(["step0", "step1", "step2", "step3"]);
  expect(steps[0]?.extract).toEqual({ id: "$.id", ref: "$.ref" });
  expect(steps[1]?.request?.pathParams).toEqual({ id: "{{steps.step0.extract.id}}" });
  expect(steps[1]?.request?.query).toEqual({ ref: "{{steps.step0.extract.ref}}" });
  // Each GET is fed by its OWN preceding create, not the first one — edges are per-call.
  expect(steps[3]?.request?.pathParams).toEqual({ id: "{{steps.step2.extract.id}}" });
  expect(steps[3]?.request?.query).toEqual({ ref: "{{steps.step2.extract.ref}}" });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @backbencher/agent test`
Expected: FAIL — the Step 3 implementation copies bodies verbatim and never sets `extract`,
`headers`, `pathParams`, or `query`.

- [ ] **Step 7: Implement edge-aware templating**

Replace the entire contents of `packages/agent/src/generateFromSession.ts` with:

```ts
import { join } from "node:path";
import { jsonPathTail, loadCuratedOrRawSession, pairCalls, walkScalars } from "@backbencher/derive";
import { type SessionCallEdge, type TestSpec, type TestSpecStep, TestSpecSchema } from "@backbencher/schemas";
import { dataDir, newId } from "@backbencher/shared";
import type { Store } from "@backbencher/store";
import { dump as dumpYaml } from "js-yaml";
import { validateSpec } from "./generate.js";

// Deterministic generator (spec §3), the session-sourced counterpart to generateTestSpec in
// generate.ts. agent.generate calls it instead of the LLM path when a Composition carries
// sourceSessionId. Same result shape and same "invalid" terminal state as the LLM path, so the
// router and the portal-web Specs screen need no branching of their own.

export interface GenerateFromSessionResult {
  specId: string;
  spec: TestSpec | null;
  valid: boolean;
  errors: string[];
}

/** Per producer step: which response JSONPaths get declared as `extract` vars, and under what
 * name. Lazy and shared, so several consumers of one value reuse a single extract entry. */
class ExtractRegistry {
  private byStep = new Map<string, Map<string, string>>();

  varFor(producerStepId: string, jsonPath: string): string {
    let vars = this.byStep.get(producerStepId);
    if (!vars) {
      vars = new Map();
      this.byStep.set(producerStepId, vars);
    }
    const existing = vars.get(jsonPath);
    if (existing) return existing;
    const base = jsonPathTail(jsonPath);
    let candidate = base;
    let n = 1;
    while ([...vars.values()].includes(candidate)) candidate = `${base}${++n}`;
    vars.set(jsonPath, candidate);
    return candidate;
  }

  extractFor(stepId: string): Record<string, string> | undefined {
    const vars = this.byStep.get(stepId);
    if (!vars || vars.size === 0) return undefined;
    return Object.fromEntries([...vars].map(([path, varName]) => [varName, path]));
  }
}

// SessionCallEdge JSON paths collapse array indices to "[*]" (jsonpath.ts's walkScalars). That is
// fine for matching, but ambiguous for writing a substitution back into one specific captured
// document when more than one array element shares a path — so v1 only templates body fields that
// are not array-nested; such a value stays its real captured literal instead of being guessed at.
function isArrayNestedPath(path: string): boolean {
  return path.includes("[*]");
}

/** Returns a copy of `obj` with the value at a non-array "$.a.b" path replaced. */
function setAtPath(obj: unknown, path: string, value: unknown): unknown {
  const keys = path
    .replace(/^\$\.?/, "")
    .split(".")
    .filter((k) => k.length > 0);
  if (keys.length === 0) return value;
  const root: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  let cursor = root;
  for (const key of keys.slice(0, -1)) {
    cursor[key] = { ...(cursor[key] as Record<string, unknown>) };
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1] as string] = value;
  return root;
}

export function generateTestSpecFromSession(store: Store, compositionId: string): GenerateFromSessionResult {
  const composition = store.compositions.get(compositionId);
  if (!composition) throw new Error(`composition ${compositionId} not found`);
  if (composition.status !== "approved") {
    throw new Error(`composition ${compositionId} is ${composition.status}; only approved compositions become tests`);
  }
  const sessionId = composition.sourceSessionId;
  if (!sessionId) {
    throw new Error(`composition ${compositionId} has no sourceSessionId; use generateTestSpec instead`);
  }
  const session = store.sessions.get(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);

  const dir = join(dataDir(), "sessions", sessionId);
  const callsByCorrelation = new Map(
    pairCalls(loadCuratedOrRawSession(dir)).map((c) => [c.correlationId, c] as const),
  );
  const operationsById = new Map(store.operations.list().map((o) => [o.operationId, o]));
  const annotationsById = new Map(store.annotations.list().map((a) => [a.operationId, a]));

  const stepIdByCorrelation = new Map(
    composition.steps.map((s, i) => [s.sourceCorrelationId as string, `step${i}`] as const),
  );

  // Only edges we can actually express are usable:
  //  - both ends must be steps of THIS Composition (an edge to/from a call the analyst deleted, or
  //    left out, can't be templated — its consumer keeps the real literal); and
  //  - the producer must be a response BODY value, because a TestSpec `extract` is a JSONPath into
  //    the response body (runtime.ts). A response-header producer (e.g. Set-Cookie) can't be
  //    extracted, so its consumer is left as-is / dropped.
  const edges = store
    .sessionGraphs.listBySession(sessionId)
    .filter(
      (e) =>
        e.producerLocation === "responseBody" &&
        stepIdByCorrelation.has(e.producerCorrelationId) &&
        stepIdByCorrelation.has(e.consumerCorrelationId),
    );
  // consumerCorrelationId -> "<location>\0<jsonPath>" -> edge. Path/query jsonPaths are the bare
  // param/query name; requestBody paths are "$.a.b"; header paths are the header name as recorded
  // (or "Cookie.<name>" for a decomposed cookie — see dataflow.ts collectConsumers).
  const edgeByConsumer = new Map<string, Map<string, SessionCallEdge>>();
  for (const e of edges) {
    const forCall = edgeByConsumer.get(e.consumerCorrelationId) ?? new Map<string, SessionCallEdge>();
    forCall.set(`${e.consumerLocation}\u0000${e.consumerJsonPath}`, e);
    edgeByConsumer.set(e.consumerCorrelationId, forCall);
  }

  const registry = new ExtractRegistry();
  function templateRef(edge: SessionCallEdge): string {
    const producerStepId = stepIdByCorrelation.get(edge.producerCorrelationId) as string;
    return `{{steps.${producerStepId}.extract.${registry.varFor(producerStepId, edge.producerJsonPath)}}}`;
  }

  const steps: TestSpecStep[] = composition.steps.map((compStep, i) => {
    const correlationId = compStep.sourceCorrelationId;
    if (!correlationId) throw new Error(`step ${i} of composition ${compositionId} has no sourceCorrelationId`);
    const call = callsByCorrelation.get(correlationId);
    if (!call) {
      throw new Error(`call ${correlationId} not found in session ${sessionId} (deleted after this composition was proposed?)`);
    }
    const stepId = `step${i}`;
    const edgesForCall = edgeByConsumer.get(correlationId);
    const edgeAt = (location: SessionCallEdge["consumerLocation"], jsonPath: string) =>
      edgesForCall?.get(`${location}\u0000${jsonPath}`);

    const pathParams: Record<string, string> = {};
    for (const param of operationsById.get(compStep.operationId)?.pathTemplate.params ?? []) {
      const literal = call.segments[param.position];
      if (literal === undefined) continue;
      const edge = edgeAt("path", param.name);
      pathParams[param.name] = edge ? templateRef(edge) : literal;
    }

    const query: Record<string, string> = {};
    for (const [name, literal] of call.query) {
      const edge = edgeAt("query", name);
      query[name] = edge ? templateRef(edge) : literal;
    }

    // Headers are NEVER copied verbatim: ADR-0006 captures them with live credentials, and auth is
    // supplied at run time from the spec's authProfile anyway. Only a header whose value provably
    // came from an earlier response body is kept, as a template. Cookie edges are skipped for the
    // same auth reason.
    const headers: Record<string, string> = {};
    for (const [key, edge] of edgesForCall ?? []) {
      if (!key.startsWith("requestHeader\u0000")) continue;
      const name = key.slice("requestHeader\u0000".length);
      if (name.startsWith("Cookie.")) continue;
      headers[name] = templateRef(edge);
    }

    let body: unknown = call.requestBody ?? undefined;
    if (body !== undefined) {
      for (const leaf of walkScalars(body)) {
        if (isArrayNestedPath(leaf.path)) continue;
        const edge = edgeAt("requestBody", leaf.path);
        if (edge) body = setAtPath(body, leaf.path, templateRef(edge));
      }
    }

    // Declare `extract` for every edge where THIS call is the producer, whether or not a consumer's
    // templateRef has asked for it yet — this step is built before its consumers are.
    for (const e of edges) {
      if (e.producerCorrelationId === correlationId) registry.varFor(stepId, e.producerJsonPath);
    }

    const extract = registry.extractFor(stepId);
    const request = {
      ...(Object.keys(pathParams).length > 0 ? { pathParams } : {}),
      ...(Object.keys(query).length > 0 ? { query } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(body !== undefined ? { body } : {}),
    };
    return {
      id: stepId,
      operationId: compStep.operationId,
      description: annotationsById.get(compStep.operationId)?.does ?? `${call.method} ${call.pathname}`,
      request,
      ...(extract ? { extract } : {}),
      expect: { status: call.status ?? 0, schemaConformance: true, jsonAssertions: [] },
      continueOnFailure: false,
    };
  });

  const specId = newId();
  const spec = TestSpecSchema.parse({
    version: 1,
    specId,
    compositionId,
    title: composition.goal,
    environment: composition.testDecision?.environments[0] ?? "staging",
    authProfile: session.meta.authProfile ?? "default",
    tags: ["from-session"],
    steps,
    cleanup: [],
  });

  const operations = store.operations.list();
  const errors = validateSpec(spec, {
    validOperationIds: new Set(operations.map((o) => o.operationId)),
    operationMethods: Object.fromEntries(operations.map((o) => [o.operationId, o.method])),
  });
  const valid = errors.length === 0;

  store.specs.upsert({
    specId,
    compositionId,
    yaml: dumpYaml(spec),
    generatedBy: "session-replay",
    model: null,
    packId: null,
    createdAt: Date.now(),
    status: valid ? "generated" : "invalid",
  });

  return { specId, spec, valid, errors };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/agent test`
Expected: PASS — all three tests in this file.

- [ ] **Step 9: Write the failing test — client-generated body fields get a fresh value**

Add inside the same `describe` block:

```ts
it("mints a fresh value for a client-generated body field instead of replaying the recorded one", () => {
  resetClock();
  const session = completeSession("sess-gen-4", [
    ...apiCall("g1", {
      method: "POST",
      url: `${H}/api/tickets`,
      postData: JSON.stringify({ idempotencyKey: "req-9f8e7d6c-random-each-time", title: "New ticket" }),
      body: { id: "t1" },
    }),
  ]);
  // Derivation only flags a field client-generated when it varies across >=2 sessions, which a
  // one-session fixture can't show — so declare it the same way derivation would have persisted it.
  const store = setup(session, (d) => ({
    ...d,
    clientGeneratedFields: { [d.operations[0]?.operationId as string]: ["$.idempotencyKey"] },
  }));

  const result = generate(store, "sess-gen-4");

  expect(result.spec?.steps[0]?.request?.body).toEqual({ idempotencyKey: "{{faker.uuid}}", title: "New ticket" });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm --filter @backbencher/agent test`
Expected: FAIL — `idempotencyKey` is still the recorded literal `"req-9f8e7d6c-random-each-time"`.

- [ ] **Step 11: Add client-generated substitution**

In `packages/agent/src/generateFromSession.ts`:

1. Add the import (next to the existing `./generate.js` import):

```ts
import { computeDependencyGraph } from "./dependencies.js";
```

2. Just after the `annotationsById` line, add:

```ts
  const dependencyGraph = computeDependencyGraph(store);
```

3. Replace the body-templating block (the `let body: unknown = ...` block) with:

```ts
    // Body only, per the spec: a client-generated value (no producer anywhere in the corpus, minted
    // fresh by the client each time) must not be replayed as the recorded literal.
    const clientGenerated = dependencyGraph.byOperation.get(compStep.operationId)?.clientGenerated ?? [];
    let body: unknown = call.requestBody ?? undefined;
    if (body !== undefined) {
      for (const leaf of walkScalars(body)) {
        if (isArrayNestedPath(leaf.path)) continue;
        const edge = edgeAt("requestBody", leaf.path);
        if (edge) body = setAtPath(body, leaf.path, templateRef(edge));
        else if (clientGenerated.includes(leaf.path)) body = setAtPath(body, leaf.path, "{{faker.uuid}}");
      }
    }
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/agent test`
Expected: PASS — all four tests in this file.

- [ ] **Step 13: Write the test pinning the write-with-no-cleanup → `"invalid"` behavior**

Add inside the same `describe` block:

```ts
it("lands as invalid when the session writes data, and still stores the spec for hand repair", () => {
  resetClock();
  const session = completeSession("sess-gen-5", [
    ...apiCall("g1", { method: "POST", url: `${H}/api/tickets`, body: { id: "t1" } }),
  ]);
  const store = setup(session);

  const result = generate(store, "sess-gen-5");

  // Cleanup is never auto-inferred from a session (spec §3) — the existing write-implies-cleanup
  // rule in validateSpec() makes this land invalid, the same terminal state a failed LLM spec has.
  expect(result.valid).toBe(false);
  expect(result.errors).toEqual([NO_CLEANUP]);
  const row = store.specs.get(result.specId);
  expect(row?.status).toBe("invalid");
  // The analyst repairs it via specs.updateYaml, which needs a real YAML document to edit.
  expect(TestSpecSchema.parse(loadYaml(row?.yaml ?? "")).steps).toHaveLength(1);
});
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/agent test`
Expected: PASS — this test pins behavior that already exists (reused `validateSpec`, `dumpYaml`),
so it is green on first run; it exists to keep the "invalid, but still editable" contract from
regressing.

- [ ] **Step 15: Typecheck and commit**

Run: `pnpm --filter @backbencher/agent typecheck`
Expected: succeeds.

```bash
git add packages/agent/src/generateFromSession.ts packages/agent/test/generateFromSession.test.ts
git commit -m "feat(agent): deterministic TestSpec generation from a session's real calls and edges"
```

---

### Task 4: Portal wiring — `compose.proposeFromSession` and the `agent.generate` branch

**Files:**
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/portal-api/src/routers.ts`
- Test: `packages/portal-api/test/curation.test.ts` — add the new tests **inside the existing
  `describe("sessions router", ...)` block**, because that block owns the `store`, `seed()` and
  `caller()` helpers (and the `afterEach` that removes `createdDirs`); a separate `describe` would
  not have them in scope. `H`, `apiCall`, and `completeSession(sessionId, events)` are file-level.

**Interfaces:**
- Consumes: `proposeCompositionFromSession`, `UnclassifiedCallsError` (Task 2),
  `generateTestSpecFromSession` (Task 3).
- Produces: tRPC mutation `compose.proposeFromSession` (`{ sessionId: string }` → `Composition`).
  `agent.generate` keeps its existing input and output shape.

- [ ] **Step 1: Export the new functions from `@backbencher/agent`**

Append to `packages/agent/src/index.ts`:

```ts
export { proposeCompositionFromSession, UnclassifiedCallsError } from "./composeFromSession.js";
export { generateTestSpecFromSession } from "./generateFromSession.js";
export type { GenerateFromSessionResult } from "./generateFromSession.js";
```

Run: `pnpm --filter @backbencher/agent build`
(packages resolve each other through compiled `dist/`, so portal-api can't see these until this runs.)

- [ ] **Step 2: Write the failing tests**

Add inside `describe("sessions router", ...)` in `packages/portal-api/test/curation.test.ts`:

```ts
it("compose.proposeFromSession drafts a Composition from a curated session", async () => {
  const session = completeSession("sess-cfs-1", [...apiCall("c1", { url: `${H}/api/health`, body: { ok: true } })]);
  seed(session, { derive: true });
  store.sessions.upsertFromMeta(session.meta);

  const draft = await caller().compose.proposeFromSession({ sessionId: "sess-cfs-1" });

  expect(draft.sourceSessionId).toBe("sess-cfs-1");
  expect(draft.status).toBe("draft");
  expect(draft.goal).toBe("exercise sess-cfs-1"); // the session's own recorded goal
  expect((await caller().compose.drafts()).some((d) => d.compositionId === draft.compositionId)).toBe(true);
});

it("compose.proposeFromSession reports unclassified calls as a precondition failure, not a 500", async () => {
  const session = completeSession("sess-cfs-2", [...apiCall("c1", { url: `${H}/api/health`, body: { ok: true } })]);
  seed(session); // not derived: no Flow exists, so every call is unclassified
  store.sessions.upsertFromMeta(session.meta);

  await expect(caller().compose.proposeFromSession({ sessionId: "sess-cfs-2" })).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
});

it("agent.generate uses the deterministic generator for a session-sourced Composition, with no LLM configured", async () => {
  const session = completeSession("sess-cfs-3", [...apiCall("c1", { url: `${H}/api/health`, body: { ok: true } })]);
  seed(session, { derive: true });
  store.sessions.upsertFromMeta(session.meta);
  const draft = await caller().compose.proposeFromSession({ sessionId: "sess-cfs-3" });
  await caller().compose.approve({
    compositionId: draft.compositionId,
    testDecision: { inScope: true, strategy: "api_functional", rationale: "r", riskLevel: "low", environments: ["staging"] },
  });

  // BbConfigSchema.parse({}) configures no model or API key: this only succeeds if agent.generate
  // branches to the deterministic path BEFORE it tries createLlm().
  const res = await caller().agent.generate({ compositionId: draft.compositionId });

  expect(res.valid).toBe(true);
  expect(store.specs.get(res.specId)?.generatedBy).toBe("session-replay");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @backbencher/portal-api test`
Expected: FAIL — `compose.proposeFromSession` does not exist on the router.

- [ ] **Step 4: Add the mutation and the `agent.generate` branch**

In `packages/portal-api/src/routers.ts`:

1. Extend the existing `@backbencher/agent` import (it already lists `buildKnowledgePack`,
   `computeDependencyGraph`, `createEmbedder`, `createLlm`, `generateTestSpec`, …) with:

```ts
  UnclassifiedCallsError,
  generateTestSpecFromSession,
  proposeCompositionFromSession,
```

2. In `composeRouter`, add this procedure right after `propose`:

```ts
  proposeFromSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(({ ctx, input }) => {
      try {
        const composition = proposeCompositionFromSession(ctx.store, input.sessionId, ctx.actor);
        ctx.store.audit.append({
          entityType: "composition",
          entityId: composition.compositionId,
          action: "compose.proposeFromSession",
          actor: ctx.actor,
          diff: { sessionId: input.sessionId },
        });
        return composition;
      } catch (e) {
        if (e instanceof UnclassifiedCallsError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
        }
        throw e;
      }
    }),
```

3. In `agentRouter.generate`, insert the branch as the first statement of the handler, before the
   `let llm` line:

```ts
      if (ctx.store.compositions.get(input.compositionId)?.sourceSessionId) {
        const res = generateTestSpecFromSession(ctx.store, input.compositionId);
        ctx.store.audit.append({ entityType: "composition", entityId: input.compositionId, action: "agent.generate", actor: ctx.actor });
        return { specId: res.specId, valid: res.valid, errors: res.errors, attempts: 1 };
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/portal-api test`
Expected: PASS

- [ ] **Step 6: Rebuild and typecheck the workspace**

Run: `pnpm --filter @backbencher/portal-api build && pnpm -r typecheck`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/index.ts packages/portal-api/src/routers.ts packages/portal-api/test/curation.test.ts
git commit -m "feat(portal-api): wire deterministic session-to-script generation into compose/agent routers"
```

---

### Task 5: Portal-web — "Generate automation script" button

**Files:**
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`

**Interfaces:**
- Consumes: `trpc.compose.proposeFromSession.useMutation()` (Task 4 — its types reach portal-web
  through the compiled `portal-api` `AppRouter`, so Task 4 Step 6's build must have run).

`portal-web` has no component-level test for `SessionGraphModal` (it needs a full tRPC/React Query
provider; the existing portal-web tests only cover extracted presentational pieces), so this task is
verified by typecheck, build, and the manual check in Task 6 — not a new unit test.

- [ ] **Step 1: Add the mutation**

In `SessionGraphModal`, directly after the existing `deleteCalls` mutation definition, add:

```tsx
  const proposeFromSession = trpc.compose.proposeFromSession.useMutation({
    onSuccess: async () => {
      // Refresh Compose's draft list first, so the new draft is there when the screen mounts.
      await utils.compose.drafts.invalidate();
      window.location.hash = "#/compose";
    },
  });
```

(`utils` is already defined at the top of this component: `const utils = trpc.useUtils();`.)

- [ ] **Step 2: Add the button**

In the header's right-hand controls, insert this block between the existing Save block
(`<div className="flex flex-col items-end"> ... Save ({pendingDeletes.size}) ...`) and the
`✕ close` button:

```tsx
            <div className="flex flex-col items-end">
              <button
                type="button"
                className="rounded-md border border-[--line] px-2 py-1 text-xs font-semibold disabled:opacity-40"
                // Unsaved deletions aren't persisted yet, so generating now would include calls the
                // analyst is about to remove. Mirrors Save's own disabled rule, inverted.
                disabled={pendingDeletes.size > 0 || proposeFromSession.isPending}
                title={pendingDeletes.size > 0 ? "Save your pending deletions first" : undefined}
                onClick={() => proposeFromSession.mutate({ sessionId })}
              >
                {proposeFromSession.isPending ? "Generating…" : "Generate automation script"}
              </button>
              {proposeFromSession.error?.message && (
                <div className="mt-1 max-w-[320px] text-right text-xs text-[--bad]">{proposeFromSession.error.message}</div>
              )}
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @backbencher/portal-web typecheck`
Expected: succeeds — confirms `trpc.compose.proposeFromSession` resolves against the rebuilt
`AppRouter` type.

- [ ] **Step 4: Build**

Run: `pnpm --filter @backbencher/portal-web build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/portal-web/src/screens/SessionGraph.tsx
git commit -m "feat(portal-web): add 'Generate automation script' button to the session graph"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full workspace build**

Run: `pnpm -r build`
Expected: succeeds for every package.

- [ ] **Step 2: Full workspace typecheck**

Run: `pnpm -r typecheck`
Expected: succeeds, including `portal-web` (its `vite build` in Step 1 does not typecheck — this
step is required, per `AGENTS.md`).

- [ ] **Step 3: Full test suite**

Run: `pnpm -r --filter '!@backbencher/recorder' test`
Expected: every package passes, including the new tests from Tasks 1, 2, 3, and 4.

- [ ] **Step 4: Manual verification against a real recorded session**

1. Record (or pick an existing) session with at least one auth-dependent, multi-step flow — e.g. a
   login call followed by a call that uses the login response's token.
2. In the Sessions screen, curate it if needed (delete anything irrelevant, click Save).
3. Open the session's dependency graph, click "Generate automation script."
4. Confirm it navigates you to the Compose screen, and the new draft appears there with
   the session's own goal as its goal text.
5. Approve it with a `TestDecision` (any strategy/risk/environment).
6. Click Generate. Confirm the resulting spec (via the Specs screen) has
   `{{steps.*.extract.*}}` references that resolve (no step references an extract that doesn't
   exist), that any custom header whose value came from an earlier response is templated, and that
   captured `Authorization`/cookie headers and any other unexplained header are absent from the spec
   rather than hardcoded — the spec's `authProfile` (the session's recorded profile) is what supplies
   auth when it runs. A request field that was fed by a response *header* (e.g. a `Set-Cookie` value)
   keeps its recorded literal; that's the documented v1 limit, not a defect.
7. If the session included a write call, confirm the spec is `status: "invalid"` with a "no cleanup
   entries" error, and that adding a `cleanup[]` block by hand via the Specs screen's YAML editor
   (existing `specs.updateYaml`) makes it valid.

- [ ] **Step 5: Commit if Step 4 surfaced any fixes**

If manual verification required any code changes, commit them individually with a clear message
per fix, following the same TDD discipline (write/extend a test that would have caught the issue,
then fix) rather than a single "fix manual verification issues" catch-all commit.
