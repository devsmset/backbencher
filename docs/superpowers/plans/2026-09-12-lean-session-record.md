# Lean Session Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a recorded Session self-curating and self-teaching — derivation runs automatically on stop, strips redundant Calls, lets the analyst prune the rest from the dependency graph, and feeds that lean Session to the composer in place of the Exemplar type, which is deleted.

**Architecture:** Derivation stays a single deterministic pass over *all* Sessions. Catalog-level facts (Operations, schemas, dataflow) are always derived from raw events; only the per-Session narrative artifacts (`ObservedFlow`, a new persisted `SessionCallEdge[]`, and a materialised `curated-events.ndjson`) are derived from the lean Call set. The lean set is raw minus auto-detected redundant Calls minus the analyst's deletions, which live in a new human-owned `session_curation` table that derivation never overwrites.

**Tech Stack:** TypeScript 5.7 strict, ESM, pnpm workspaces + Turborepo, vitest 2.1, Zod, Drizzle + better-sqlite3, Fastify + tRPC, React + ReactFlow 11 + Tailwind, Biome.

**Spec:** [docs/superpowers/specs/2026-09-12-lean-session-record-design.md](../specs/2026-09-12-lean-session-record-design.md)

## Global Constraints

- **Packages resolve each other through compiled `dist/`, not source.** After changing a package you MUST rebuild it before any dependent package will see the change: `pnpm --filter @backbencher/<pkg> build`. Build order: schemas → shared → llm → derive → store → agent → testkit → recorder → portal-api → portal-web → cli.
- **Relative imports must carry the `.js` extension** (ESM + `moduleResolution: NodeNext`). `import { x } from "./foo.js"` even though the file is `foo.ts`.
- **`typecheck` only covers `src/`.** Every package's `tsconfig.json` has `"include": ["src"]`, so `test/` and `fixtures/` are never type-checked — vitest strips types without checking them. Type errors in tests surface only as runtime failures. Do not assume a green `typecheck` says anything about test code.
- **`portal-web` is built by Vite**, which strips types without checking them. Its `typecheck` script is the only thing that checks it.
- **Full verification** (run before declaring any task done): `pnpm -r build && pnpm -r typecheck && pnpm -r --filter '!@backbencher/recorder' test`. The recorder suite is excluded because it drives a live browser.
- **Never modify `data/sessions/*/events.ndjson` or `meta.json`.** Capture is verbatim (ADR-0006); the raw recording is read-only after capture.
- **Derivation is deterministic.** Any new list must be sorted by a stable key, and any new map iteration must be over sorted keys. No `Date.now()`, `Math.random()`, or unordered `Set`/`Map` iteration in derivation output.
- **Vocabulary** (CONTEXT.md is the authority): Session, Call, Analyst, Catalog, Operation, Dependency, Role. This plan adds Redundant Call, Curated Session, Reference Session, Reference-ready. It removes Exemplar and Example-ready. Use these words in code comments, identifiers, and UI copy.
- **Commit after every task**, with the task's own `git add` paths. Never `git add -A`.

---

### Task 1: Redundant-Call filter

**Files:**
- Create: `packages/derive/src/redundant.ts`
- Create: `packages/derive/test/redundant.test.ts`
- Modify: `packages/derive/src/index.ts`

**Interfaces:**
- Consumes: `collectProducers(calls, callOp): Producer[]` and `entropy(value): { keep: boolean; ok: boolean }` from `./dataflow.js`; `PairedCall` from `./types.js`.
- Produces: `findRedundantCalls(calls: PairedCall[], callOp: Map<PairedCall, string>): Set<string>` — returns correlationIds to drop. Used by Task 4.

- [ ] **Step 1: Write the failing test**

Create `packages/derive/test/redundant.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { pairCalls } from "../src/pairCalls.js";
import { findRedundantCalls } from "../src/redundant.js";
import { templatizePaths } from "../src/templatize.js";

const H = "https://app.example.net";

function analyse(events: Parameters<typeof makeSession>[1]) {
  const calls = pairCalls(makeSession("sess-redundant", events));
  const { callOp } = templatizePaths(calls);
  return findRedundantCalls(calls, callOp);
}

describe("findRedundantCalls", () => {
  it("drops a later call to the same operation that produces nothing new", () => {
    resetClock();
    const tenant = "TENANT-9f3a2b7c1d4e";
    const dropped = analyse([
      ...apiCall("t1", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("t2", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("t3", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
    ]);
    expect([...dropped].sort()).toEqual(["t2", "t3"]);
  });

  it("keeps a later call that produces a value the earlier one did not", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("p1", { url: `${H}/api/tenant`, body: { tenantId: "TENANT-9f3a2b7c1d4e" } }),
      ...apiCall("p2", { url: `${H}/api/tenant`, body: { tenantId: "TENANT-0011223344ff" } }),
    ]);
    expect(dropped.size).toBe(0);
  });

  it("never drops a call that produces no entropy-worthy value", () => {
    resetClock();
    const dropped = analyse([
      ...apiCall("n1", { url: `${H}/api/ping`, body: { ok: true } }),
      ...apiCall("n2", { url: `${H}/api/ping`, body: { ok: true } }),
    ]);
    expect(dropped.size).toBe(0);
  });

  it("always keeps the first call of an operation", () => {
    resetClock();
    const tenant = "TENANT-9f3a2b7c1d4e";
    const dropped = analyse([
      ...apiCall("f1", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("f2", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
    ]);
    expect(dropped.has("f1")).toBe(false);
  });

  it("is stable under input reordering", () => {
    resetClock();
    const tenant = "TENANT-9f3a2b7c1d4e";
    const events = [
      ...apiCall("s1", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("s2", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
    ];
    const forward = pairCalls(makeSession("sess-a", events));
    const reversed = [...forward].reverse();
    const opsForward = templatizePaths(forward);
    const opsReversed = templatizePaths(reversed);
    expect([...findRedundantCalls(forward, opsForward.callOp)].sort()).toEqual(
      [...findRedundantCalls(reversed, opsReversed.callOp)].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/derive test -- redundant`
Expected: FAIL — `Failed to resolve import "../src/redundant.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/derive/src/redundant.ts`:

```ts
import { collectProducers, entropy } from "./dataflow.js";
import type { PairedCall } from "./types.js";

// A Call is redundant when every entropy-worthy value it produces was already produced by an
// earlier Call to the same Operation in the same Session: a re-fetch that told us nothing new.
// Two properties hold by construction and are relied on downstream — it never orphans a consumer
// (the covering producer is strictly earlier, so producer-before-consumer still holds), and it
// never removes an Operation from the flow (the first Call of each group is always kept).

export function findRedundantCalls(
  calls: PairedCall[],
  callOp: Map<PairedCall, string>,
): Set<string> {
  const producedBy = new Map<string, Set<string>>();
  for (const p of collectProducers(calls, callOp)) {
    if (!entropy(p.value).keep) continue;
    let set = producedBy.get(p.correlationId);
    if (!set) {
      set = new Set();
      producedBy.set(p.correlationId, set);
    }
    set.add(`${p.jsonPath}\u0000${p.value}`);
  }

  const byOp = new Map<string, PairedCall[]>();
  for (const c of calls) {
    const op = callOp.get(c);
    if (!op) continue; // unclassified calls are never candidates
    const arr = byOp.get(op);
    if (arr) arr.push(c);
    else byOp.set(op, [c]);
  }

  const redundant = new Set<string>();
  for (const group of byOp.values()) {
    const ordered = [...group].sort(
      (a, b) => a.requestTimestamp - b.requestTimestamp || a.correlationId.localeCompare(b.correlationId),
    );
    const seen = new Set<string>();
    for (const call of ordered) {
      const produced = producedBy.get(call.correlationId);
      if (!produced || produced.size === 0) continue;
      let allSeen = true;
      for (const pair of produced) {
        if (!seen.has(pair)) {
          allSeen = false;
          break;
        }
      }
      if (allSeen) {
        redundant.add(call.correlationId);
        continue;
      }
      for (const pair of produced) seen.add(pair);
    }
  }

  return redundant;
}
```

- [ ] **Step 4: Export it**

In `packages/derive/src/index.ts`, add alongside the existing exports:

```ts
export { findRedundantCalls } from "./redundant.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/derive test -- redundant`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/derive/src/redundant.ts packages/derive/test/redundant.test.ts packages/derive/src/index.ts
git commit -m "feat(derive): detect redundant calls that re-produce known values"
```

---

### Task 2: Orphaned-consumer guard

**Files:**
- Create: `packages/derive/src/orphans.ts`
- Create: `packages/derive/test/orphans.test.ts`
- Modify: `packages/derive/src/index.ts`

**Interfaces:**
- Consumes: `SessionCallEdge` from `@backbencher/schemas`.
- Produces: `findOrphanedConsumers(edges: SessionCallEdge[], deleting: ReadonlySet<string>): OrphanedConsumer[]` where `interface OrphanedConsumer { consumerCorrelationId: string; consumerJsonPath: string; value: string }`. Used by Tasks 7 and 9.

- [ ] **Step 1: Write the failing test**

Create `packages/derive/test/orphans.test.ts`:

```ts
import type { SessionCallEdge } from "@backbencher/schemas";
import { describe, expect, it } from "vitest";
import { findOrphanedConsumers } from "../src/orphans.js";

function edge(producer: string, consumer: string, value = "TOKEN-abcdef123456"): SessionCallEdge {
  return {
    producerCorrelationId: producer,
    producerLocation: "responseBody",
    producerJsonPath: "$.token",
    consumerCorrelationId: consumer,
    consumerLocation: "requestHeader",
    consumerJsonPath: "Authorization",
    value,
    confidence: "strong",
  };
}

describe("findOrphanedConsumers", () => {
  it("allows deleting a producer when another surviving producer feeds the same slot", () => {
    const edges = [edge("a", "c"), edge("b", "c")];
    expect(findOrphanedConsumers(edges, new Set(["a"]))).toEqual([]);
  });

  it("blocks deleting the only producer of a surviving consumer's slot", () => {
    const edges = [edge("a", "c")];
    const orphans = findOrphanedConsumers(edges, new Set(["a"]));
    expect(orphans).toEqual([
      { consumerCorrelationId: "c", consumerJsonPath: "Authorization", value: "TOKEN-abcdef123456" },
    ]);
  });

  it("blocks deleting two producers that only cover for each other", () => {
    const edges = [edge("a", "c"), edge("b", "c")];
    expect(findOrphanedConsumers(edges, new Set(["a", "b"]))).toHaveLength(1);
  });

  it("ignores slots whose consumer is itself being deleted", () => {
    const edges = [edge("a", "c")];
    expect(findOrphanedConsumers(edges, new Set(["a", "c"]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/derive test -- orphans`
Expected: FAIL — cannot resolve `../src/orphans.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/derive/src/orphans.ts`:

```ts
import type { SessionCallEdge } from "@backbencher/schemas";

export interface OrphanedConsumer {
  consumerCorrelationId: string;
  consumerJsonPath: string;
  value: string;
}

// Evaluated against the whole pending deletion set at once, not one Call at a time: two Calls that
// each cover for the other must be rejected when deleted together.
export function findOrphanedConsumers(
  edges: SessionCallEdge[],
  deleting: ReadonlySet<string>,
): OrphanedConsumer[] {
  const slots = new Map<string, { orphan: OrphanedConsumer; survivingProducer: boolean }>();

  for (const e of edges) {
    if (deleting.has(e.consumerCorrelationId)) continue;
    const key = `${e.consumerCorrelationId}\u0000${e.consumerJsonPath}`;
    let slot = slots.get(key);
    if (!slot) {
      slot = {
        orphan: {
          consumerCorrelationId: e.consumerCorrelationId,
          consumerJsonPath: e.consumerJsonPath,
          value: e.value,
        },
        survivingProducer: false,
      };
      slots.set(key, slot);
    }
    if (!deleting.has(e.producerCorrelationId)) slot.survivingProducer = true;
  }

  return [...slots.values()]
    .filter((s) => !s.survivingProducer)
    .map((s) => s.orphan)
    .sort((a, b) =>
      a.consumerCorrelationId.localeCompare(b.consumerCorrelationId) ||
      a.consumerJsonPath.localeCompare(b.consumerJsonPath),
    );
}
```

- [ ] **Step 4: Export it**

In `packages/derive/src/index.ts`:

```ts
export { findOrphanedConsumers } from "./orphans.js";
export type { OrphanedConsumer } from "./orphans.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/derive test -- orphans`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/derive/src/orphans.ts packages/derive/test/orphans.test.ts packages/derive/src/index.ts
git commit -m "feat(derive): guard against deletions that orphan a consumer slot"
```

---

### Task 3: Curated events file

**Files:**
- Create: `packages/derive/src/curatedEvents.ts`
- Create: `packages/derive/test/curatedEvents.test.ts`
- Modify: `packages/derive/src/index.ts`

**Interfaces:**
- Consumes: `SessionData` from `./types.js`, `loadSession` from `./loadSessions.js`, `RecordingEventSchema`/`RecordingMetaSchema` from `@backbencher/schemas`.
- Produces:
  - `CURATED_EVENTS_FILE = "curated-events.ndjson"`
  - `writeCuratedEvents(dir: string, session: SessionData, excluded: ReadonlySet<string>): number` — returns events written.
  - `loadCuratedOrRawSession(dir: string): SessionData`
  - Used by Tasks 6, 7, 13.

- [ ] **Step 1: Write the failing test**

Create `packages/derive/test/curatedEvents.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { loadCuratedOrRawSession, writeCuratedEvents } from "../src/curatedEvents.js";

const H = "https://app.example.net";
let dir: string;

function seed() {
  resetClock();
  const session = makeSession("sess-curated", [
    ...apiCall("k1", { url: `${H}/api/a`, body: { id: "AAAA1111BBBB2222" } }),
    ...apiCall("k2", { url: `${H}/api/b`, body: { id: "CCCC3333DDDD4444" } }),
  ]);
  // loadSession validates meta, which requires a name and a goal.
  const meta = { ...session.meta, name: "curated fixture", goal: "exercise curation" };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
  writeFileSync(
    join(dir, "events.ndjson"),
    `${session.events.map((e) => JSON.stringify(e)).join("\n")}\n`,
  );
  return { ...session, meta };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bb-curated-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeCuratedEvents", () => {
  it("drops both halves of an excluded call and keeps order", () => {
    const session = seed();
    const written = writeCuratedEvents(dir, session, new Set(["k1"]));
    expect(written).toBe(2);
    const curated = loadCuratedOrRawSession(dir);
    expect(curated.events.map((e) => e.correlationId)).toEqual(["k2", "k2"]);
  });

  it("writes every event when nothing is excluded", () => {
    const session = seed();
    expect(writeCuratedEvents(dir, session, new Set())).toBe(4);
  });
});

describe("loadCuratedOrRawSession", () => {
  it("falls back to raw events when no curated file exists", () => {
    seed();
    expect(loadCuratedOrRawSession(dir).events).toHaveLength(4);
  });

  it("prefers the curated file when it exists", () => {
    const session = seed();
    writeCuratedEvents(dir, session, new Set(["k2"]));
    expect(loadCuratedOrRawSession(dir).events.map((e) => e.correlationId)).toEqual(["k1", "k1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/derive test -- curatedEvents`
Expected: FAIL — cannot resolve `../src/curatedEvents.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/derive/src/curatedEvents.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RecordingEventSchema, RecordingMetaSchema } from "@backbencher/schemas";
import { loadSession } from "./loadSessions.js";
import type { SessionData } from "./types.js";

// The Curated Session on disk: raw events minus Redundant Calls minus what the Analyst deleted.
// A derived cache, rewritten on every derivation and on every save — never the durable record of
// the Analyst's intent, which lives in the store's session_curation table. events.ndjson is never
// written after capture (ADR-0006).

export const CURATED_EVENTS_FILE = "curated-events.ndjson";

/** Writes the curated NDJSON, dropping both halves of every excluded Call. Returns events written. */
export function writeCuratedEvents(
  dir: string,
  session: SessionData,
  excluded: ReadonlySet<string>,
): number {
  const kept = session.events.filter((e) => !excluded.has(e.correlationId));
  const body = kept.length > 0 ? `${kept.map((e) => JSON.stringify(e)).join("\n")}\n` : "";
  writeFileSync(join(dir, CURATED_EVENTS_FILE), body);
  return kept.length;
}

/** Reads the Curated Session, falling back to the raw recording when it has not been derived. */
export function loadCuratedOrRawSession(dir: string): SessionData {
  const curated = join(dir, CURATED_EVENTS_FILE);
  if (!existsSync(curated)) return loadSession(dir);
  const meta = RecordingMetaSchema.parse(JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")));
  const events = readFileSync(curated, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => RecordingEventSchema.parse(JSON.parse(l)));
  return { meta, events };
}
```

- [ ] **Step 4: Export it**

In `packages/derive/src/index.ts`:

```ts
export { CURATED_EVENTS_FILE, loadCuratedOrRawSession, writeCuratedEvents } from "./curatedEvents.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/derive test -- curatedEvents`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/derive/src/curatedEvents.ts packages/derive/test/curatedEvents.test.ts packages/derive/src/index.ts
git commit -m "feat(derive): materialise and read the curated session events file"
```

---

### Task 4: Derivation produces session graphs and honours deletions

**Files:**
- Modify: `packages/derive/src/types.ts`
- Modify: `packages/derive/src/pipeline.ts`
- Create: `packages/derive/test/curation.pipeline.test.ts`

**Interfaces:**
- Consumes: `findRedundantCalls` (Task 1), `buildSessionCallGraph` from `./sessionGraph.js`.
- Produces:
  - `interface RunDerivationOptions { deletedCorrelationIds?: ReadonlyMap<string, ReadonlySet<string>> }`
  - `runDerivation(sessions: SessionData[], opts?: RunDerivationOptions): DerivationResult`
  - `DerivationResult` gains `sessionGraphs: Record<string, SessionCallEdge[]>` and `autoFiltered: Record<string, string[]>`.
  - `excludedCorrelationIds(result, sessionId): Set<string>` is NOT added — callers union `autoFiltered[sessionId]` with their own deletion set.
  - Used by Tasks 5, 6, 13.

- [ ] **Step 1: Write the failing test**

Create `packages/derive/test/curation.pipeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { runDerivation } from "../src/pipeline.js";

const H = "https://app.example.net";

function sessions() {
  resetClock();
  const tenant = "TENANT-9f3a2b7c1d4e";
  return [
    makeSession("sess-curation", [
      ...apiCall("c1", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("c2", { url: `${H}/api/tenant`, body: { tenantId: tenant } }),
      ...apiCall("c3", { method: "POST", url: `${H}/api/tickets`, postData: JSON.stringify({ tenantId: tenant }), body: { ok: true } }),
    ]),
  ];
}

describe("runDerivation curation", () => {
  it("reports auto-filtered redundant calls per session", () => {
    const result = runDerivation(sessions());
    expect(result.autoFiltered["sess-curation"]).toEqual(["c2"]);
  });

  it("keeps the redundant call out of the flow but keeps its operation in the catalog", () => {
    const result = runDerivation(sessions());
    const flow = result.flows.find((f) => f.sessionId === "sess-curation");
    expect(flow?.steps.map((s) => s.correlationId)).toEqual(["c1", "c3"]);
    expect(result.operations).toHaveLength(2);
  });

  it("emits a session call graph built from the curated calls only", () => {
    const result = runDerivation(sessions());
    const edges = result.sessionGraphs["sess-curation"] ?? [];
    expect(edges.some((e) => e.producerCorrelationId === "c1" && e.consumerCorrelationId === "c3")).toBe(true);
    expect(edges.some((e) => e.producerCorrelationId === "c2")).toBe(false);
  });

  it("honours analyst deletions without shrinking the catalog", () => {
    const deleted = new Map([["sess-curation", new Set(["c3"])]]);
    const result = runDerivation(sessions(), { deletedCorrelationIds: deleted });
    const flow = result.flows.find((f) => f.sessionId === "sess-curation");
    expect(flow?.steps.map((s) => s.correlationId)).toEqual(["c1"]);
    expect(result.operations).toHaveLength(2);
  });

  it("is idempotent", () => {
    expect(JSON.stringify(runDerivation(sessions()))).toBe(JSON.stringify(runDerivation(sessions())));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/derive test -- curation.pipeline`
Expected: FAIL — `result.autoFiltered` is `undefined`.

- [ ] **Step 3: Extend the result type**

In `packages/derive/src/types.ts`, add `SessionCallEdge` to the type import from `@backbencher/schemas`, then replace the `DerivationResult` interface:

```ts
export interface DerivationResult {
  operations: Operation[];
  dataflow: DataflowEdge[];
  flows: ObservedFlow[];
  /** operationId -> input JSON paths whose values are client-generated (§5.5.6). */
  clientGeneratedFields: Record<string, string[]>;
  /** sessionId -> the Session's call-level dependency graph, over curated Calls only. */
  sessionGraphs: Record<string, SessionCallEdge[]>;
  /** sessionId -> correlationIds dropped as Redundant Calls. */
  autoFiltered: Record<string, string[]>;
}

export interface RunDerivationOptions {
  /** sessionId -> correlationIds the Analyst deleted by hand. Never overwritten by derivation. */
  deletedCorrelationIds?: ReadonlyMap<string, ReadonlySet<string>>;
}
```

- [ ] **Step 4: Implement in the pipeline**

In `packages/derive/src/pipeline.ts`, add the imports:

```ts
import type { SessionCallEdge } from "@backbencher/schemas";
import { findRedundantCalls } from "./redundant.js";
import { buildSessionCallGraph } from "./sessionGraph.js";
import type { DerivationResult, PairedCall, RunDerivationOptions, SessionData } from "./types.js";
```

Change the signature to `export function runDerivation(sessions: SessionData[], opts: RunDerivationOptions = {}): DerivationResult {` and replace everything from the `const bySession` block to the end of the function:

```ts
  // Catalog-level facts above are always derived from raw Calls, so curation can never shrink the
  // Catalog. Only the per-Session narrative artifacts below use the curated Call set.
  const bySession = new Map<string, PairedCall[]>();
  for (const c of allCalls) {
    const arr = bySession.get(c.sessionId);
    if (arr) arr.push(c);
    else bySession.set(c.sessionId, [c]);
  }

  const flows: DerivationResult["flows"] = [];
  const sessionGraphs: Record<string, SessionCallEdge[]> = {};
  const autoFiltered: Record<string, string[]> = {};

  for (const [sessionId, calls] of [...bySession.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const redundant = findRedundantCalls(calls, callOp);
    autoFiltered[sessionId] = [...redundant].sort();

    const deleted = opts.deletedCorrelationIds?.get(sessionId);
    const excluded = new Set(redundant);
    if (deleted) for (const id of deleted) excluded.add(id);

    const curated = calls.filter((c) => !excluded.has(c.correlationId));
    flows.push(extractObservedFlow(sessionId, curated, callOp));
    sessionGraphs[sessionId] = buildSessionCallGraph(curated, callOp, accums);
  }

  return { operations, dataflow: edges, flows, clientGeneratedFields, sessionGraphs, autoFiltered };
}
```

- [ ] **Step 5: Export the option type**

In `packages/derive/src/index.ts`, ensure `RunDerivationOptions` is exported alongside `DerivationResult` (add it to the existing `export type { ... } from "./types.js"` list).

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/derive test`
Expected: PASS, including the pre-existing `pipeline.test.ts`.

- [ ] **Step 7: Rebuild and typecheck the package**

Run: `pnpm --filter @backbencher/derive build && pnpm --filter @backbencher/derive typecheck`
Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add packages/derive/src/types.ts packages/derive/src/pipeline.ts packages/derive/src/index.ts packages/derive/test/curation.pipeline.test.ts
git commit -m "feat(derive): derive per-session graphs from curated calls"
```

---

### Task 5: Store — curation table and persisted session graphs

**Files:**
- Modify: `packages/store/src/schema.ts`
- Modify: `packages/store/src/migrate.ts`
- Create: `packages/store/src/repos/curation.ts`
- Modify: `packages/store/src/repos/index.ts`
- Modify: `packages/store/src/saveDerivation.ts`
- Modify: `packages/store/test/store.test.ts`

**Interfaces:**
- Consumes: `SessionCallEdge` from `@backbencher/schemas`.
- Produces:
  - `store.sessionCuration`: `get(sessionId): SessionCurationRow | null`, `list(): SessionCurationRow[]`, `deletionMap(): Map<string, Set<string>>`, `setDeleted(sessionId, correlationIds: string[], actor: string): void`, `setUseAsReference(sessionId, on: boolean, actor: string): void`.
  - `interface SessionCurationRow { sessionId: string; deletedCorrelationIds: string[]; useAsReference: boolean; updatedBy: string; updatedAt: number }`
  - `store.sessionGraphs`: `listBySession(sessionId): SessionCallEdge[]`, `replaceForSession(sessionId, edges): void`.
  - `DerivationInput` gains `sessionGraphs?: Record<string, SessionCallEdge[]>`.
  - Used by Tasks 6, 7, 11, 13.

- [ ] **Step 1: Write the failing test**

Append to `packages/store/test/store.test.ts`, inside the existing `describe("store", ...)` block:

```ts
  it("persists session call edges and replaces them on the next derivation", () => {
    const edge = {
      producerCorrelationId: "p1",
      producerLocation: "responseBody" as const,
      producerJsonPath: "$.token",
      consumerCorrelationId: "c1",
      consumerLocation: "requestHeader" as const,
      consumerJsonPath: "Authorization",
      value: "TOKEN-abcdef123456",
      confidence: "strong" as const,
    };
    store.saveDerivation({ operations: [op], dataflow: [], flows: [], sessionGraphs: { s1: [edge] } });
    expect(store.sessionGraphs.listBySession("s1")).toHaveLength(1);
    store.saveDerivation({ operations: [op], dataflow: [], flows: [], sessionGraphs: {} });
    expect(store.sessionGraphs.listBySession("s1")).toHaveLength(0);
  });

  it("keeps analyst curation across a full re-derivation", () => {
    store.sessionCuration.setDeleted("s1", ["c9"], "alice");
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    store.saveDerivation({ operations: [op], dataflow: [], flows: [] });
    const row = store.sessionCuration.get("s1");
    expect(row?.deletedCorrelationIds).toEqual(["c9"]);
    expect(row?.useAsReference).toBe(true);
  });

  it("unions repeated deletions and exposes them as a map", () => {
    store.sessionCuration.setDeleted("s1", ["c1"], "alice");
    store.sessionCuration.setDeleted("s1", ["c2", "c1"], "alice");
    expect(store.sessionCuration.get("s1")?.deletedCorrelationIds).toEqual(["c1", "c2"]);
    expect([...(store.sessionCuration.deletionMap().get("s1") ?? [])].sort()).toEqual(["c1", "c2"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/store test`
Expected: FAIL — `store.sessionGraphs` is undefined.

- [ ] **Step 3: Add the Drizzle tables**

In `packages/store/src/schema.ts`, append:

```ts
// The Analyst's curation of a Session: which Calls they deleted, and whether the Session teaches
// the composer. Human-owned — derivation full-replaces the derived tables and never touches this.
export const sessionCuration = sqliteTable("session_curation", {
  sessionId: text("session_id").primaryKey(),
  deletedCorrelationIds: text("deleted_correlation_ids").notNull(), // JSON string[]
  useAsReference: integer("use_as_reference").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessionCallEdges = sqliteTable(
  "session_call_edges",
  {
    sessionId: text("session_id").notNull(),
    seq: integer("seq").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.seq] }) }),
);
```

- [ ] **Step 4: Add the migration**

In `packages/store/src/migrate.ts`, append a new entry to the end of the `MIGRATIONS` array:

```ts
  {
    id: "0004_session_curation_and_graph",
    sql: `
CREATE TABLE IF NOT EXISTS session_curation (
  session_id TEXT PRIMARY KEY,
  deleted_correlation_ids TEXT NOT NULL,
  use_as_reference INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session_call_edges (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);
`,
  },
```

- [ ] **Step 5: Write the repositories**

Create `packages/store/src/repos/curation.ts`:

```ts
import { type SessionCallEdge, SessionCallEdgeSchema } from "@backbencher/schemas";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../dbtypes.js";
import { sessionCallEdges, sessionCuration } from "../schema.js";

export interface SessionCurationRow {
  sessionId: string;
  deletedCorrelationIds: string[];
  useAsReference: boolean;
  updatedBy: string;
  updatedAt: number;
}

export function sessionCurationRepo(db: Db) {
  const toRow = (r: typeof sessionCuration.$inferSelect): SessionCurationRow => ({
    sessionId: r.sessionId,
    deletedCorrelationIds: JSON.parse(r.deletedCorrelationIds) as string[],
    useAsReference: r.useAsReference === 1,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
  });

  function upsert(sessionId: string, patch: { deleted?: string[]; useAsReference?: boolean }, actor: string): void {
    const existing = db.select().from(sessionCuration).where(eq(sessionCuration.sessionId, sessionId)).get();
    const current = existing ? toRow(existing) : null;
    const deleted = patch.deleted ?? current?.deletedCorrelationIds ?? [];
    const useAsReference = patch.useAsReference ?? current?.useAsReference ?? false;
    const values = {
      sessionId,
      deletedCorrelationIds: JSON.stringify([...new Set(deleted)].sort()),
      useAsReference: useAsReference ? 1 : 0,
      updatedBy: actor,
      updatedAt: Date.now(),
    };
    db.insert(sessionCuration)
      .values(values)
      .onConflictDoUpdate({ target: sessionCuration.sessionId, set: values })
      .run();
  }

  return {
    get: (sessionId: string): SessionCurationRow | null => {
      const r = db.select().from(sessionCuration).where(eq(sessionCuration.sessionId, sessionId)).get();
      return r ? toRow(r) : null;
    },
    list: (): SessionCurationRow[] => db.select().from(sessionCuration).all().map(toRow),
    /** sessionId -> deleted correlationIds, the shape runDerivation expects. */
    deletionMap: (): Map<string, Set<string>> =>
      new Map(
        db
          .select()
          .from(sessionCuration)
          .all()
          .map(toRow)
          .map((r) => [r.sessionId, new Set(r.deletedCorrelationIds)] as const),
      ),
    /** Deletions accumulate; an already-deleted id is a no-op. */
    setDeleted: (sessionId: string, correlationIds: string[], actor: string): void => {
      const existing = db.select().from(sessionCuration).where(eq(sessionCuration.sessionId, sessionId)).get();
      const merged = [...(existing ? toRow(existing).deletedCorrelationIds : []), ...correlationIds];
      upsert(sessionId, { deleted: merged }, actor);
    },
    setUseAsReference: (sessionId: string, on: boolean, actor: string): void => {
      upsert(sessionId, { useAsReference: on }, actor);
    },
  };
}

export function sessionGraphsRepo(db: Db) {
  return {
    listBySession: (sessionId: string): SessionCallEdge[] =>
      db
        .select()
        .from(sessionCallEdges)
        .where(eq(sessionCallEdges.sessionId, sessionId))
        .orderBy(asc(sessionCallEdges.seq))
        .all()
        .map((r) => SessionCallEdgeSchema.parse(JSON.parse(r.payload))),
    replaceForSession: (sessionId: string, edges: SessionCallEdge[]): void => {
      db.delete(sessionCallEdges).where(eq(sessionCallEdges.sessionId, sessionId)).run();
      edges.forEach((e, seq) => {
        db.insert(sessionCallEdges).values({ sessionId, seq, payload: JSON.stringify(e) }).run();
      });
    },
  };
}
```

- [ ] **Step 6: Register the repositories**

In `packages/store/src/repos/index.ts`, add the import, the two `Repos` fields, and the two `createRepos` entries:

```ts
import { sessionCurationRepo, sessionGraphsRepo } from "./curation.js";
```

```ts
  sessionCuration: ReturnType<typeof sessionCurationRepo>;
  sessionGraphs: ReturnType<typeof sessionGraphsRepo>;
```

```ts
    sessionCuration: sessionCurationRepo(db),
    sessionGraphs: sessionGraphsRepo(db),
```

Also re-export the row type from `packages/store/src/index.ts`:

```ts
export type { SessionCurationRow } from "./repos/curation.js";
```

- [ ] **Step 7: Full-replace session graphs in saveDerivation**

In `packages/store/src/saveDerivation.ts`, add `SessionCallEdge` to the type import, add `sessionCallEdges` to the schema import, add the field to `DerivationInput`:

```ts
  /** sessionId -> the Session's call-level dependency graph. Full-replaced, like every derived table. */
  sessionGraphs?: Record<string, SessionCallEdge[]>;
```

Inside the transaction, add `tx.delete(sessionCallEdges).run();` alongside the other deletes, and after the `clientGeneratedFields` loop:

```ts
    for (const [sessionId, edges] of Object.entries(input.sessionGraphs ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
      edges.forEach((e, seq) => {
        tx.insert(sessionCallEdges).values({ sessionId, seq, payload: JSON.stringify(e) }).run();
      });
    }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/store test`
Expected: PASS, including the three new cases.

- [ ] **Step 9: Rebuild**

Run: `pnpm --filter @backbencher/store build && pnpm --filter @backbencher/store typecheck`
Expected: both succeed.

- [ ] **Step 10: Commit**

```bash
git add packages/store/src/schema.ts packages/store/src/migrate.ts packages/store/src/repos/curation.ts packages/store/src/repos/index.ts packages/store/src/index.ts packages/store/src/saveDerivation.ts packages/store/test/store.test.ts
git commit -m "feat(store): session curation table and persisted session call graphs"
```

---

### Task 6: Auto-derive on stop, delete the manual derive mutation

**Files:**
- Modify: `packages/portal-api/src/routers.ts`
- Create: `packages/portal-api/test/derivation.test.ts`

**Interfaces:**
- Consumes: `runDerivation`, `loadAllSessions`, `writeCuratedEvents` from `@backbencher/derive`; `store.sessionCuration.deletionMap()` (Task 5).
- Produces:
  - `derive.status` query returning `DerivationState`.
  - `runDerivationJob(store, actor): void` exported from a new module so tests and `stopRecording` share it.
  - `sessions.stopRecording` response gains `derivation: "running"`.
  - Used by Tasks 7, 8.

- [ ] **Step 1: Write the failing test**

Create `packages/portal-api/test/derivation.test.ts`:

```ts
import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { derivationState, runDerivationJob, waitForDerivationIdle } from "../src/derivationJob.js";

describe("derivation job", () => {
  it("runs to completion and reports idle", async () => {
    const store = openStore(":memory:");
    runDerivationJob(store, "alice");
    expect(derivationState().status).toBe("running");
    await waitForDerivationIdle();
    expect(derivationState().status).toBe("idle");
    store.close();
  });

  it("collapses concurrent requests into a single follow-up run", async () => {
    const store = openStore(":memory:");
    runDerivationJob(store, "alice");
    runDerivationJob(store, "alice");
    runDerivationJob(store, "alice");
    await waitForDerivationIdle();
    expect(derivationState().status).toBe("idle");
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/portal-api test -- derivation`
Expected: FAIL — cannot resolve `../src/derivationJob.js`.

- [ ] **Step 3: Write the derivation job**

Create `packages/portal-api/src/derivationJob.ts`:

```ts
import { join } from "node:path";
import { loadAllSessions, runDerivation, writeCuratedEvents } from "@backbencher/derive";
import { childLogger, dataDir } from "@backbencher/shared";
import type { Store } from "@backbencher/store";

// Derivation always runs over every Session: path-template inference needs the whole corpus, and
// saveDerivation full-replaces the derived tables. Triggered by stopping a recording, never by a
// page load. State is in-process; a server restart mid-run is recovered with `bb derive`.

const log = childLogger({ mod: "portal-api" });

export interface DerivationSummary {
  sessionsProcessed: number;
  operations: number;
  dataflowEdges: number;
  flows: number;
  callsFiltered: number;
}

export type DerivationState =
  | { status: "idle"; lastFinishedAt?: number; lastResult?: DerivationSummary }
  | { status: "running"; startedAt: number }
  | { status: "failed"; failedAt: number; error: string };

let state: DerivationState = { status: "idle" };
let inFlight: Promise<void> | null = null;
let rerunQueued = false;

export function derivationState(): DerivationState {
  return state;
}

/** Resolves once no derivation is running or queued. Test helper and shutdown hook. */
export async function waitForDerivationIdle(): Promise<void> {
  while (inFlight) await inFlight;
}

function deriveOnce(store: Store, actor: string): DerivationSummary {
  const sessions = loadAllSessions();
  const result = runDerivation(sessions, { deletedCorrelationIds: store.sessionCuration.deletionMap() });
  for (const s of sessions) store.sessions.upsertFromMeta(s.meta);
  store.saveDerivation(result);

  let callsFiltered = 0;
  for (const s of sessions) {
    const excluded = new Set(result.autoFiltered[s.meta.sessionId] ?? []);
    for (const id of store.sessionCuration.get(s.meta.sessionId)?.deletedCorrelationIds ?? []) excluded.add(id);
    callsFiltered += excluded.size;
    writeCuratedEvents(join(dataDir(), "sessions", s.meta.sessionId), s, excluded);
  }

  store.audit.append({
    entityType: "derivation",
    entityId: "all",
    action: "derive",
    actor,
    diff: { sessions: sessions.length, operations: result.operations.length, callsFiltered },
  });

  return {
    sessionsProcessed: sessions.length,
    operations: result.operations.length,
    dataflowEdges: result.dataflow.length,
    flows: result.flows.length,
    callsFiltered,
  };
}

/** Fire-and-forget. Never throws to the caller; failures land in the state. */
export function runDerivationJob(store: Store, actor: string): void {
  if (inFlight) {
    rerunQueued = true; // repeated requests collapse into one follow-up: the pass covers everything
    return;
  }
  state = { status: "running", startedAt: Date.now() };
  inFlight = (async () => {
    try {
      let summary = deriveOnce(store, actor);
      while (rerunQueued) {
        rerunQueued = false;
        summary = deriveOnce(store, actor);
      }
      state = { status: "idle", lastFinishedAt: Date.now(), lastResult: summary };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error({ err }, "derivation failed");
      state = { status: "failed", failedAt: Date.now(), error };
    } finally {
      inFlight = null;
      rerunQueued = false;
    }
  })();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/portal-api test -- derivation`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into the router**

In `packages/portal-api/src/routers.ts`:

Add the import:

```ts
import { derivationState, runDerivationJob } from "./derivationJob.js";
```

Remove `loadAllSessions`, `runDerivation`, `templatizePaths`, and `buildSessionCallGraph` from the `@backbencher/derive` import if they become unused (Task 7 revisits this import line).

In `stopRecording`, after the audit append and before the return:

```ts
      runDerivationJob(ctx.store, ctx.actor);
      return { sessionId: result.sessionId, sessionDir: result.sessionDir, summary: result.summary, derivation: "running" as const };
```

Replace the whole `deriveRouter` with:

```ts
const deriveRouter = router({
  status: publicProcedure.query(() => derivationState()),
});
```

- [ ] **Step 6: Verify the package builds and its tests pass**

Run: `pnpm --filter @backbencher/portal-api build && pnpm --filter @backbencher/portal-api test`
Expected: build succeeds, tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/portal-api/src/derivationJob.ts packages/portal-api/src/routers.ts packages/portal-api/test/derivation.test.ts
git commit -m "feat(portal-api): derive automatically in the background when a recording stops"
```

---

### Task 7: Session curation API

**Files:**
- Modify: `packages/portal-api/src/routers.ts`
- Create: `packages/portal-api/test/curation.test.ts`

**Interfaces:**
- Consumes: `findOrphanedConsumers` (Task 2), `loadCuratedOrRawSession`/`writeCuratedEvents` (Task 3), `store.sessionCuration`/`store.sessionGraphs` (Task 5), `derivationState` (Task 6).
- Produces:
  - `sessions.graph` → `{ nodes, edges, derived: boolean }`
  - `sessions.curation({ sessionId })` → `{ useAsReference, deletedCorrelationIds, rawCallCount, curatedCallCount }`
  - `sessions.deleteCalls({ sessionId, correlationIds })` → `{ deleted: number }`
  - `sessions.setUseAsReference({ sessionId, useAsReference })` → `{ ok: true }`
  - Used by Tasks 8, 9.

- [ ] **Step 1: Write the failing test**

Create `packages/portal-api/test/curation.test.ts`:

```ts
import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { assertDeletable } from "../src/curation.js";

const edge = (producer: string, consumer: string) => ({
  producerCorrelationId: producer,
  producerLocation: "responseBody" as const,
  producerJsonPath: "$.token",
  consumerCorrelationId: consumer,
  consumerLocation: "requestHeader" as const,
  consumerJsonPath: "Authorization",
  value: "TOKEN-abcdef123456",
  confidence: "strong" as const,
});

describe("assertDeletable", () => {
  it("passes when another producer survives", () => {
    expect(() => assertDeletable([edge("a", "c"), edge("b", "c")], ["a"])).not.toThrow();
  });

  it("throws listing the orphaned consumer when the sole producer is deleted", () => {
    expect(() => assertDeletable([edge("a", "c")], ["a"])).toThrow(/Authorization/);
  });
});

describe("sessionCuration repo through the store", () => {
  it("records a reference toggle", () => {
    const store = openStore(":memory:");
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    expect(store.sessionCuration.get("s1")?.useAsReference).toBe(true);
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/portal-api test -- curation`
Expected: FAIL — cannot resolve `../src/curation.js`.

- [ ] **Step 3: Write the guard helper**

Create `packages/portal-api/src/curation.ts`:

```ts
import { findOrphanedConsumers } from "@backbencher/derive";
import type { SessionCallEdge } from "@backbencher/schemas";
import { TRPCError } from "@trpc/server";

/** Enforced server-side, not only in the UI: the client's pending-set check is a convenience. */
export function assertDeletable(edges: SessionCallEdge[], correlationIds: string[]): void {
  const orphans = findOrphanedConsumers(edges, new Set(correlationIds));
  if (orphans.length === 0) return;
  const detail = orphans
    .map((o) => `${o.consumerCorrelationId} needs ${o.consumerJsonPath}`)
    .join("; ");
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `deleting these calls would leave no producer for: ${detail}`,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @backbencher/portal-api test -- curation`
Expected: PASS, 3 tests.

- [ ] **Step 5: Rewrite the session router procedures**

In `packages/portal-api/src/routers.ts`, set the derive import line to:

```ts
import { loadCuratedOrRawSession, loadSession, pairCalls, writeCuratedEvents } from "@backbencher/derive";
```

Add:

```ts
import { assertDeletable } from "./curation.js";
```

Replace the `graph` procedure. Note it does **not** re-templatize: operationIds come from the
persisted flow, so they always agree with the Catalog.

```ts
  graph: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => {
      const dir = join(dataDir(), "sessions", input.sessionId);
      const flows = ctx.store.flows.listBySession(input.sessionId);
      if (!existsSync(dir) || flows.length === 0) return { nodes: [], edges: [], derived: false };

      const opByCorrelation = new Map(
        flows.flatMap((f) => f.steps.map((s) => [s.correlationId, s.operationId] as const)),
      );
      const nodes = pairCalls(loadCuratedOrRawSession(dir))
        .filter((c) => !isAssetLikeCall(c))
        .map((c) => ({
          correlationId: c.correlationId,
          operationId: opByCorrelation.get(c.correlationId) ?? null,
          method: c.method,
          host: c.host,
          pathname: c.pathname,
          status: c.status,
          requestTimestamp: c.requestTimestamp,
          responseTimestamp: c.responseTimestamp,
          requestHeaders: c.requestHeaders,
          requestBody: c.requestBody,
          responseHeaders: c.responseHeaders,
          responseBody: c.responseBody,
          responseBodyKind: c.responseBodyKind,
        }));

      return { nodes, edges: ctx.store.sessionGraphs.listBySession(input.sessionId), derived: true };
    }),
```

Change `timeline` to use `loadCuratedOrRawSession(dir)` in place of `loadSession(dir)`.

Add the three new procedures to `sessionsRouter`:

```ts
  curation: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ ctx, input }) => {
      const dir = join(dataDir(), "sessions", input.sessionId);
      const row = ctx.store.sessionCuration.get(input.sessionId);
      const deletedCorrelationIds = row?.deletedCorrelationIds ?? [];
      if (!existsSync(dir)) {
        return { useAsReference: row?.useAsReference ?? false, deletedCorrelationIds, rawCallCount: 0, curatedCallCount: 0 };
      }
      return {
        useAsReference: row?.useAsReference ?? false,
        deletedCorrelationIds,
        rawCallCount: pairCalls(loadSession(dir)).length,
        curatedCallCount: pairCalls(loadCuratedOrRawSession(dir)).length,
      };
    }),
  deleteCalls: publicProcedure
    .input(z.object({ sessionId: z.string(), correlationIds: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      if (derivationState().status === "running") {
        throw new TRPCError({ code: "CONFLICT", message: "a derivation is running — try again in a moment" });
      }
      const dir = join(dataDir(), "sessions", input.sessionId);
      if (!existsSync(dir)) throw new TRPCError({ code: "NOT_FOUND", message: "no such session" });
      const raw = loadSession(dir);
      const known = new Set(raw.events.map((e) => e.correlationId));
      const unknown = input.correlationIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `unknown correlationIds: ${unknown.join(", ")}` });
      }

      assertDeletable(ctx.store.sessionGraphs.listBySession(input.sessionId), input.correlationIds);

      // Everything already absent from the curated file stays absent: that set is the auto-filtered
      // Redundant Calls, which only a full re-derivation may recompute.
      const excluded = new Set(raw.events.map((e) => e.correlationId));
      for (const c of pairCalls(loadCuratedOrRawSession(dir))) excluded.delete(c.correlationId);
      ctx.store.sessionCuration.setDeleted(input.sessionId, input.correlationIds, ctx.actor);
      for (const id of ctx.store.sessionCuration.get(input.sessionId)?.deletedCorrelationIds ?? []) excluded.add(id);
      writeCuratedEvents(dir, raw, excluded);

      // Reuse the persisted operationIds rather than re-templatizing one Session in isolation,
      // which would mint operationIds that disagree with the Catalog.
      const surviving = new Set(pairCalls(loadCuratedOrRawSession(dir)).map((c) => c.correlationId));
      const flow = ctx.store.flows.listBySession(input.sessionId)[0];
      if (flow) {
        ctx.store.flows.replaceForSession(input.sessionId, {
          ...flow,
          steps: flow.steps.filter((s) => surviving.has(s.correlationId)),
        });
      }
      ctx.store.sessionGraphs.replaceForSession(
        input.sessionId,
        ctx.store.sessionGraphs
          .listBySession(input.sessionId)
          .filter((e) => surviving.has(e.producerCorrelationId) && surviving.has(e.consumerCorrelationId)),
      );

      ctx.store.audit.append({
        entityType: "session",
        entityId: input.sessionId,
        action: "curate.delete",
        actor: ctx.actor,
        diff: { correlationIds: input.correlationIds },
      });
      return { deleted: input.correlationIds.length };
    }),
  setUseAsReference: publicProcedure
    .input(z.object({ sessionId: z.string(), useAsReference: z.boolean() }))
    .mutation(({ ctx, input }) => {
      ctx.store.sessionCuration.setUseAsReference(input.sessionId, input.useAsReference, ctx.actor);
      ctx.store.audit.append({
        entityType: "session",
        entityId: input.sessionId,
        action: "curate.reference",
        actor: ctx.actor,
        diff: { useAsReference: input.useAsReference },
      });
      return { ok: true as const };
    }),
```

- [ ] **Step 6: Add `replaceForSession` to the flows repo**

In `packages/store/src/repos/derived.ts`, add to `flowsRepo`'s returned object:

```ts
    replaceForSession: (sessionId: string, flow: ObservedFlow): void => {
      db.delete(observedFlows).where(eq(observedFlows.sessionId, sessionId)).run();
      db.insert(observedFlows)
        .values({ flowId: flow.flowId, sessionId, payload: JSON.stringify(flow) })
        .run();
    },
```

Add `ObservedFlow` to that file's type imports if it is not already there.

- [ ] **Step 7: Verify**

Run: `pnpm --filter @backbencher/store build && pnpm --filter @backbencher/portal-api build && pnpm --filter @backbencher/portal-api test`
Expected: all succeed.

- [ ] **Step 8: Commit**

```bash
git add packages/portal-api/src/curation.ts packages/portal-api/src/routers.ts packages/portal-api/test/curation.test.ts packages/store/src/repos/derived.ts
git commit -m "feat(portal-api): session curation queries and guarded call deletion"
```

---

### Task 8: Portal web — remove the derive button, show derivation status

**Files:**
- Modify: `packages/portal-web/src/screens/Sessions.tsx`

**Interfaces:**
- Consumes: `trpc.derive.status` (Task 6), `trpc.sessions.stopRecording` returning `derivation: "running"`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Remove the button and the mutation**

In `packages/portal-web/src/screens/Sessions.tsx`:

- Delete the `const derive = trpc.derive.run.useMutation({...})` block.
- Change the `<Panel title="Record & derive"` to `<Panel title="Record"` and delete its entire `actions={...}` prop.
- Change the `stop` mutation's success message to:

```ts
      setLastSummary(`Saved ${res.summary.totalEvents} events (${counts}) — deriving…`);
```

- Delete the `{derive.data && ...}` result block further down the file (the one reporting
  `derive.data.flows` and `derive.data.sessionsProcessed`).

- [ ] **Step 2: Add the status indicator**

Add near the other queries:

```ts
  const derivation = trpc.derive.status.useQuery(undefined, { refetchInterval: 1500 });
```

Add an effect that refreshes derived data when a run finishes:

```ts
  const derivationStatus = derivation.data?.status;
  useEffect(() => {
    if (derivationStatus !== "idle") return;
    void utils.sessions.list.invalidate();
    void utils.operations.list.invalidate();
  }, [derivationStatus, utils]);
```

Render it beneath `lastSummary`:

```tsx
      {derivation.data?.status === "running" && <Muted>Deriving…</Muted>}
      {derivation.data?.status === "failed" && (
        <Muted>Derivation failed: {derivation.data.error}</Muted>
      )}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @backbencher/portal-api build && pnpm --filter @backbencher/portal-web typecheck && pnpm --filter @backbencher/portal-web build`
Expected: all succeed with no reference to `derive.run` remaining.

- [ ] **Step 4: Commit**

```bash
git add packages/portal-web/src/screens/Sessions.tsx
git commit -m "feat(portal-web): replace the derive button with background derivation status"
```

---

### Task 9: Portal web — delete calls from the dependency graph

**Files:**
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`

**Interfaces:**
- Consumes: `findOrphanedConsumers` from `@backbencher/derive` (Task 2), `trpc.sessions.deleteCalls` (Task 7).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Add pending-deletion state**

In the `SessionGraphModal` component, next to the existing state:

```tsx
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
```

Reset it whenever the graph data identity changes, alongside the existing layout reset.

- [ ] **Step 2: Filter the graph by pending deletions**

Where `graphEdgesRaw` and the node list are derived, filter both:

```tsx
  const graphEdgesRaw = (graph.data?.edges ?? []).filter(
    (e) => !pendingDeletes.has(e.producerCorrelationId) && !pendingDeletes.has(e.consumerCorrelationId),
  );
  const visibleNodes = (graph.data?.nodes ?? []).filter((n) => !pendingDeletes.has(n.correlationId));
```

Use `visibleNodes` everywhere the raw node list was used, including `nodesById` and `layoutNodes`.

- [ ] **Step 3: Add the delete action and its confirmation**

Give `NodeDetails` a new prop `onRequestDelete: (correlationId: string) => void` and render, beneath
the "Connected values" list:

```tsx
      <button
        type="button"
        className="mt-3 rounded-lg border border-[--line] px-2.5 py-1.5 text-xs font-semibold"
        onClick={() => onRequestDelete(node.correlationId)}
      >
        Delete call
      </button>
```

In the modal, render the confirmation when `confirming !== null`:

```tsx
function DeleteConfirm({
  correlationId,
  edges,
  pending,
  nodesById,
  onCancel,
  onConfirm,
}: {
  correlationId: string;
  edges: SessionCallEdge[];
  pending: Set<string>;
  nodesById: Map<string, GraphCallNode>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const orphans = findOrphanedConsumers(edges, new Set([...pending, correlationId]));
  const related = edges.filter(
    (e) => e.producerCorrelationId === correlationId || e.consumerCorrelationId === correlationId,
  );
  const label = (id: string) => {
    const n = nodesById.get(id);
    return n ? `${n.method} ${n.pathname}` : id;
  };
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
      <div className="w-[520px] rounded-xl border border-[--line] bg-[--panel] p-4">
        <h4 className="mb-2 text-sm font-bold">Delete {label(correlationId)}?</h4>
        {related.length === 0 ? (
          <Muted>This call has no connected values.</Muted>
        ) : (
          <ul className="mb-3 flex flex-col gap-1 text-xs">
            {related.map((e, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: derived list, no stable id
              <li key={i}>
                {e.producerCorrelationId === correlationId
                  ? `produces ${e.producerJsonPath} → ${label(e.consumerCorrelationId)}`
                  : `consumes ${e.consumerJsonPath} ← ${label(e.producerCorrelationId)}`}
              </li>
            ))}
          </ul>
        )}
        {orphans.length > 0 && (
          <p className="mb-3 text-xs text-[--bad]">
            This call is the only remaining producer for:{" "}
            {orphans.map((o) => `${o.consumerJsonPath} on ${label(o.consumerCorrelationId)}`).join(", ")}.
            Delete those calls first, or keep this one.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-[--line] px-2.5 py-1.5 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={orphans.length > 0}
            onClick={onConfirm}
            className="rounded-lg border border-[--line] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
```

Wire it in the modal, passing the **unfiltered** `graph.data?.edges ?? []` so the guard sees the true
producer set, and confirming with:

```tsx
onConfirm={() => {
  setPendingDeletes((prev) => new Set([...prev, confirming]));
  setConfirming(null);
}}
```

- [ ] **Step 4: Add the Save button**

```tsx
  const deleteCalls = trpc.sessions.deleteCalls.useMutation({
    onSuccess: () => {
      setPendingDeletes(new Set());
      void utils.sessions.graph.invalidate({ sessionId });
    },
  });
```

Render it in the modal header, `disabled={pendingDeletes.size === 0 || deleteCalls.isPending}`, label
`Save (${pendingDeletes.size})`. On click: `deleteCalls.mutate({ sessionId, correlationIds: [...pendingDeletes] })`.
Surface `deleteCalls.error?.message` beneath it.

- [ ] **Step 5: Warn on close with unsaved deletions**

Wrap the modal's close handler:

```tsx
  function requestClose() {
    if (pendingDeletes.size > 0 && !window.confirm(`Discard ${pendingDeletes.size} unsaved deletion(s)?`)) return;
    setPendingDeletes(new Set());
    onClose();
  }
```

Use `requestClose` for the close button and any backdrop/Escape handler.

- [ ] **Step 6: Handle the underived case**

When `graph.data?.derived === false`, render, in place of the canvas:

```tsx
    <Muted>Not derived yet. Derivation runs automatically when a recording stops; otherwise run `bb derive`.</Muted>
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter @backbencher/portal-web typecheck && pnpm --filter @backbencher/portal-web build`
Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add packages/portal-web/src/screens/SessionGraph.tsx
git commit -m "feat(portal-web): delete calls from the session dependency graph"
```

---

### Task 10: Rename `fromExemplarIds` to `fromSessionIds`

**Files:**
- Modify: `packages/schemas/src/knowledge.ts`
- Modify: `packages/agent/src/compose.ts`
- Modify: `packages/agent/test/generate.test.ts`
- Modify: `packages/agent/test/pack.test.ts`
- Modify: `packages/portal-api/src/routers.ts`
- Modify: `packages/portal-api/test/acceptance.test.ts`
- Modify: `packages/portal-web/src/screens/Compose.tsx`

**Interfaces:**
- Produces: `CompositionStepSchema.fromSessionIds: string[]`. Used by Task 11.

- [ ] **Step 1: Rename in the schema**

In `packages/schemas/src/knowledge.ts`, change the `CompositionStepSchema` field:

```ts
  fromSessionIds: z.array(z.string()).default([]), // provenance: which Reference Sessions showed this
```

- [ ] **Step 2: Rename every usage**

Run to find them: `grep -rn "fromExemplarIds" packages apps`

Update each occurrence to `fromSessionIds`. In `packages/agent/src/compose.ts` the value assigned is
still `exemplarIdsUsed` at this point; leave the value alone, Task 11 replaces it.

In `packages/portal-web/src/screens/Compose.tsx` also update the interface field and the chip:

```tsx
                    {!s.autoAdded && s.fromSessionIds.length > 0 && <Chip>seen in: {s.fromSessionIds.join(", ")}</Chip>}
```

- [ ] **Step 3: Verify nothing is left**

Run: `grep -rn "fromExemplarIds" packages apps`
Expected: no output.

- [ ] **Step 4: Rebuild and test**

Run: `pnpm -r build && pnpm -r --filter '!@backbencher/recorder' test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/schemas/src/knowledge.ts packages/agent/src/compose.ts packages/agent/test packages/portal-api/src/routers.ts packages/portal-api/test/acceptance.test.ts packages/portal-web/src/screens/Compose.tsx
git commit -m "refactor: rename composition step provenance to fromSessionIds"
```

---

### Task 11: Reference Sessions become the composer's examples

**Files:**
- Modify: `packages/agent/src/embed.ts`
- Modify: `packages/agent/src/compose.ts`
- Modify: `packages/agent/test/embed.test.ts`
- Create: `packages/agent/test/referenceSessions.test.ts`

**Interfaces:**
- Consumes: `store.sessionCuration`, `store.sessionGraphs`, `store.flows` (Task 5).
- Produces:
  - `interface ReferenceSession { sessionId: string; name: string; goal: string; steps: Array<{ operationId: string; correlationId: string }>; edges: SessionCallEdge[] }`
  - `sessionRetrievalText(session: ReferenceSession, opNameById: ReadonlyMap<string, string>): string`
  - `isReferenceReady(session: ReferenceSession, readyOpIds: ReadonlySet<string>): boolean`
  - `RetrievalResult.referenceSessions`, `RetrieveOptions.topReferenceSessions`
  - Used by Task 12.

- [ ] **Step 1: Write the failing test**

Create `packages/agent/test/referenceSessions.test.ts`:

```ts
import type { Operation } from "@backbencher/schemas";
import { openStore } from "@backbencher/store";
import { describe, expect, it } from "vitest";
import { retrievalCorpus } from "../src/embed.js";

function op(operationId: string, template: string): Operation {
  return {
    operationId, method: "GET", host: "h", pathTemplate: { template, params: [] },
    observedCount: 1, statusCodesObserved: { "200": 1 }, requestSchema: null, responseSchemas: {},
    queryParams: [], authObserved: "cookie", contentTypes: ["application/json"],
    exampleCorrelationIds: ["c1"], firstSeenSessionId: "s1", lastSeenAt: 1, volatileResponseFields: [],
  };
}

function seed() {
  const store = openStore(":memory:");
  store.saveDerivation({
    operations: [op("op_a", "/api/a")],
    dataflow: [],
    flows: [{ flowId: "s1:flow", sessionId: "s1", steps: [{ operationId: "op_a", correlationId: "c1" }] }],
  });
  store.sessions.upsertFromMeta({
    version: 4, sessionId: "s1", startUrl: "https://app.example.net/", startedAt: 1,
    userAgent: "test", recorderVersion: "test", name: "Create a thing", goal: "create one thing",
  });
  store.annotations.upsert({ operationId: "op_a", name: "A", does: "does a", productArea: "X", updatedBy: "alice", updatedAt: 1 });
  return store;
}

describe("retrievalCorpus reference sessions", () => {
  it("excludes a session that is not marked as reference", () => {
    const store = seed();
    expect(retrievalCorpus(store).referenceSessions).toHaveLength(0);
    store.close();
  });

  it("includes a marked session whose operations are all Ready", () => {
    const store = seed();
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    expect(retrievalCorpus(store).referenceSessions.map((s) => s.sessionId)).toEqual(["s1"]);
    store.close();
  });

  it("excludes a marked session containing an un-Ready operation", () => {
    const store = seed();
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    store.annotations.upsert({ operationId: "op_a", name: "", does: "", productArea: "X", updatedBy: "alice", updatedAt: 2 });
    expect(retrievalCorpus(store).referenceSessions).toHaveLength(0);
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @backbencher/agent test -- referenceSessions`
Expected: FAIL — `referenceSessions` is undefined.

- [ ] **Step 3: Replace the exemplar arm of retrieval**

In `packages/agent/src/embed.ts`, remove `Exemplar` from the schema import and add `SessionCallEdge`. Replace `exemplarRetrievalText`, `isExampleReady`, the `RetrievalResult`/`RetrieveOptions` fields, and the corpus's exemplar arm:

```ts
export interface ReferenceSession {
  sessionId: string;
  name: string;
  goal: string;
  steps: Array<{ operationId: string; correlationId: string }>;
  edges: SessionCallEdge[];
}

/** "{name}. {goal}. steps: {endpoint names joined}" (guide §6.2). */
export function sessionRetrievalText(
  session: ReferenceSession,
  opNameById: ReadonlyMap<string, string>,
): string {
  const stepNames = session.steps.map((s) => opNameById.get(s.operationId) ?? s.operationId).join(", ");
  return `${session.name}. ${session.goal}. steps: ${stepNames}`;
}

/**
 * A Reference Session only teaches once every Operation it uses is Ready — otherwise the composer
 * sees a step it cannot name, let alone select (guide gotcha #6). Derived, never set by hand.
 */
export function isReferenceReady(session: ReferenceSession, readyOpIds: ReadonlySet<string>): boolean {
  return session.steps.length > 0 && session.steps.every((s) => readyOpIds.has(s.operationId));
}
```

In `retrievalCorpus`, replace the `exemplars` key with:

```ts
    referenceSessions: store.sessionCuration
      .list()
      .filter((c) => c.useAsReference)
      .map((c) => {
        const row = store.sessions.get(c.sessionId);
        const steps = store.flows
          .listBySession(c.sessionId)
          .flatMap((f) => f.steps)
          .map((s) => ({ operationId: s.operationId, correlationId: s.correlationId }));
        return {
          sessionId: c.sessionId,
          name: row?.meta.name ?? c.sessionId,
          goal: row?.meta.goal ?? "",
          steps,
          edges: store.sessionGraphs.listBySession(c.sessionId),
        };
      })
      .filter((s) => isReferenceReady(s, readyOpIds))
      .sort((a, b) => a.sessionId.localeCompare(b.sessionId))
      .map((s) => ({ ...s, kind: "session" as const, id: s.sessionId, text: sessionRetrievalText(s, opNameById) })),
```

Rename the `RetrieveOptions.topExemplars` field to `topReferenceSessions` and update `retrieveForGoal`'s destructuring and return accordingly. Change the embeddings `kind` union in `packages/store/src/repos/embeddings.ts` from `"exemplar"` to `"session"` and rebuild the store.

- [ ] **Step 4: Render them in the compose prompt**

In `packages/agent/src/compose.ts`, change `buildPrompt`'s fourth parameter to
`referenceSessions: ReferenceSession[]` and replace the `examples` computation. Edge endpoints are
correlationIds, so they are resolved to endpoint names through the Session's own steps:

```ts
  const examples = referenceSessions
    .map((s) => {
      const opLabel = (operationId: string) => opNameById.get(operationId) ?? operationId;
      const nameByCorrelation = new Map(
        s.steps.map((st) => [st.correlationId, opLabel(st.operationId)] as const),
      );
      const label = (correlationId: string) => nameByCorrelation.get(correlationId) ?? "(pruned call)";
      const flowLines = [
        ...new Set(
          s.edges.map(
            (e) =>
              `${label(e.producerCorrelationId)}.${e.producerJsonPath} -> ${label(e.consumerCorrelationId)}.${e.consumerJsonPath}`,
          ),
        ),
      ].sort();
      return [
        `"${s.name}" — goal: "${s.goal}"`,
        `  steps: ${s.steps.map((st) => opLabel(st.operationId)).join(", ")}`,
        ...(flowLines.length > 0 ? [`  dataflow: ${flowLines.join("; ")}`] : []),
      ].join("\n");
    })
    .join("\n");
```

Captured values are never rendered — they are live credentials (ADR-0006).

This requires `ReferenceSession.steps` to carry `correlationId` as well as `operationId`. Widen the
interface in `embed.ts` to `steps: Array<{ operationId: string; correlationId: string }>` and keep
the full step objects when building the corpus.

Change the prompt section header from
`"EXAMPLE SCENARIOS (how endpoints have been composed before):"` to
`"REFERENCE SESSIONS (real recorded flows, curated by an analyst):"`, and append this line to `SYSTEM`:

```
- REFERENCE SESSIONS show how values have actually flowed between endpoints in practice; the
  DEPENDENCY FACTS block remains the authoritative, machine-derived statement.
```

Update `proposeScenario` to pass `retrieval.referenceSessions`, and replace `exemplarIdsUsed` with:

```ts
  const sessionIdsUsed = retrieval.referenceSessions.map((s) => s.sessionId);
```

using it for `fromSessionIds`.

- [ ] **Step 5: Update the old embed test**

In `packages/agent/test/embed.test.ts`, replace the two `store.exemplars.upsert(...)` blocks with
`store.sessions.upsertFromMeta(...)` + `store.sessionCuration.setUseAsReference(..., true, "alice")`
plus matching `flows` entries in the `saveDerivation` call, change `topExemplars` to
`topReferenceSessions`, and assert `result.referenceSessions[0]?.sessionId === "s_ticket"`.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @backbencher/store build && pnpm --filter @backbencher/agent build && pnpm --filter @backbencher/agent test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/embed.ts packages/agent/src/compose.ts packages/agent/test packages/store/src/repos/embeddings.ts
git commit -m "feat(agent): compose from curated reference sessions instead of exemplars"
```

---

### Task 12: Delete the Exemplar type

**Files:**
- Delete: `packages/agent/src/exemplar.ts`, `packages/portal-web/src/screens/Exemplars.tsx`
- Modify: `packages/schemas/src/knowledge.ts`, `packages/schemas/src/index.ts`, `packages/schemas/src/pack.ts`, `packages/schemas/test/schemas.test.ts`
- Modify: `packages/store/src/schema.ts`, `packages/store/src/migrate.ts`, `packages/store/src/repos/knowledge.ts`, `packages/store/src/repos/index.ts`
- Modify: `packages/agent/src/index.ts`, `packages/agent/src/pack.ts`, `packages/agent/test/pack.test.ts`
- Modify: `packages/portal-api/src/routers.ts`
- Modify: `packages/portal-web/src/App.tsx`, `packages/portal-web/src/screens/Compose.tsx`

**Interfaces:**
- Produces: `KnowledgePackSchema.referenceSessions` replacing `exemplars`.

- [ ] **Step 1: Remove the schema**

In `packages/schemas/src/knowledge.ts`, delete `ExemplarStepSchema`, `ExemplarSchema`, and the
`Exemplar` type. In `packages/schemas/src/index.ts`, delete the `ExemplarSchema` export and its
registry entry. In `packages/schemas/src/pack.ts`, rename the field:

```ts
  referenceSessions: z.array(z.unknown()), // curated Sessions — how operations are ordered in practice
```

Update `packages/schemas/test/schemas.test.ts`'s pack fixture from `exemplars: []` to
`referenceSessions: []`.

- [ ] **Step 2: Remove the store table and repo**

Delete `exemplarsRepo` from `packages/store/src/repos/knowledge.ts` and its import, `Repos` field, and
`createRepos` entry in `packages/store/src/repos/index.ts`. Delete the `exemplars` table from
`packages/store/src/schema.ts`. Append the migration:

```ts
  {
    id: "0005_drop_exemplars",
    sql: `
DELETE FROM embeddings WHERE kind = 'exemplar';
DROP TABLE IF EXISTS exemplars;
`,
  },
```

- [ ] **Step 3: Remove the agent code**

Delete `packages/agent/src/exemplar.ts`. Remove `export { draftExemplarFromSession } from "./exemplar.js";`
and any `exemplarRetrievalText` export from `packages/agent/src/index.ts`.

In `packages/agent/src/pack.ts`, replace the exemplars line:

```ts
  const referenceSessions = store.sessionCuration
    .list()
    .filter((c) => c.useAsReference)
    .map((c) => ({
      sessionId: c.sessionId,
      name: store.sessions.get(c.sessionId)?.meta.name ?? c.sessionId,
      goal: store.sessions.get(c.sessionId)?.meta.goal ?? "",
      steps: store.flows.listBySession(c.sessionId).flatMap((f) => f.steps),
      edges: store.sessionGraphs.listBySession(c.sessionId),
    }))
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId));
```

Use `referenceSessions` in the `core` object in place of `exemplars`, and change `renderCatalogMd`'s
heading to `## Reference Sessions (${pack.referenceSessions.length})`. Update
`packages/agent/test/pack.test.ts` accordingly.

- [ ] **Step 4: Remove the API and UI surfaces**

In `packages/portal-api/src/routers.ts`: delete the entire `exemplarsRouter`, its entry in the root
router, the `ExemplarSchema` and `draftExemplarFromSession` imports.

Delete `packages/portal-web/src/screens/Exemplars.tsx`. In `packages/portal-web/src/App.tsx`, remove
its import, its `["#/exemplars", "Exemplars"]` nav entry, and its `case "exemplars":` branch. In
`packages/portal-web/src/screens/Compose.tsx`, change the `View exemplars →` link to
`<a href="#/sessions">View sessions →</a>`.

- [ ] **Step 5: Verify nothing is left**

Run: `grep -rni "exemplar" packages apps --include=*.ts --include=*.tsx`
Expected: no output.

- [ ] **Step 6: Full verification**

Run: `pnpm -r build && pnpm -r typecheck && pnpm -r --filter '!@backbencher/recorder' test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -u packages
git commit -m "refactor: delete the Exemplar type in favour of reference sessions"
```

---

### Task 13: CLI — all-sessions derivation and auto-derive on record stop

**Files:**
- Modify: `apps/cli/src/index.ts`

**Interfaces:**
- Consumes: `runDerivation` options and `writeCuratedEvents` (Tasks 3, 4), `store.sessionCuration` (Task 5).

- [ ] **Step 1: Make `cmdDerive` all-sessions and curation-aware**

In `apps/cli/src/index.ts`, replace the head of `cmdDerive`:

```ts
async function cmdDerive(argv: string[]): Promise<void> {
  const { loadAllSessions, runDerivation, writeCuratedEvents } = await import("@backbencher/derive");
  const { openStore } = await import("@backbencher/store");
  const sessions = loadAllSessions();
  if (sessions.length === 0) {
    process.stderr.write("no sessions found under data/sessions (run `bb record` first)\n");
    process.exitCode = 1;
    return;
  }
  const store = openStore();
  const result = runDerivation(sessions, { deletedCorrelationIds: store.sessionCuration.deletionMap() });
  for (const s of sessions) store.sessions.upsertFromMeta(s.meta);
```

and, immediately after the existing `store.saveDerivation({ ...result, operations });` line, add:

```ts
  for (const s of sessions) {
    const excluded = new Set(result.autoFiltered[s.meta.sessionId] ?? []);
    for (const id of store.sessionCuration.get(s.meta.sessionId)?.deletedCorrelationIds ?? []) excluded.add(id);
    writeCuratedEvents(join(dataDir(), "sessions", s.meta.sessionId), s, excluded);
  }
```

Delete the `getFlag(argv, "--session")` line and the `loadSession` import.

- [ ] **Step 2: Update the usage text**

Change the usage line to:

```
  derive [--probe --env <n>]                                Re-derive every session
```

- [ ] **Step 3: Auto-derive when a recording stops**

In `cmdRecord`, the recorder handle is stopped and the summary is written to stdout. Immediately
after that write, add:

```ts
  process.stdout.write("\u2699\ufe0f  Deriving\u2026\n");
  await cmdDerive([]);
```

`cmdDerive` opens its own store and closes it, so no handle is shared across the two calls.

- [ ] **Step 4: Verify**

Run: `pnpm -r build && pnpm -r typecheck`
Expected: both succeed.

Run: `node apps/cli/dist/index.js derive --help 2>&1 | head -20` — confirm no `--session` in the usage.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "feat(cli): derive every session, automatically after recording"
```

---

### Task 14: Documentation

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/adr/0007-session-is-the-reference.md`

- [ ] **Step 1: Update the vocabulary**

In `CONTEXT.md`, under `### Capture`, after the **Call** entry, add:

```markdown
**Redundant Call**:
A Call that produces no value an earlier Call to the same Operation in the same Session has not
already produced.
_Avoid_: Duplicate call, repeat, noise

**Curated Session**:
A Session reduced to the Calls that carry its meaning — the recording minus Redundant Calls and
minus what the Analyst deleted by hand.
_Avoid_: Cleaned session, filtered session, lean session
```

Under `### Composition`, delete the **Exemplar** and **Example-ready** entries and add in their place:

```markdown
**Reference Session**:
A Curated Session the Analyst has marked as teaching material for the composer. It is never approved
and never tested — it only teaches.
_Avoid_: Exemplar, scenario, example, template

**Reference-ready**:
The state of a Reference Session whose Operations are all Ready, making it eligible to be shown to
the composer. Derived, never set by hand.
_Avoid_: Published, enabled
```

- [ ] **Step 2: Update the architecture doc**

In `docs/ARCHITECTURE.md` §5, add the two new passes to the pipeline list:

```markdown
- `redundant.ts` — finds Calls that re-produce values an earlier Call of the same Operation already
  produced. Applied only to the per-Session artifacts, never to the Catalog.
- `curatedEvents.ts` — materialises `curated-events.ndjson` per Session and reads it back.
```

Note in §5 that Operations, schemas, and dataflow come from raw events while `ObservedFlow` and
`SessionCallEdge[]` come from curated Calls. In §6, add `session_curation` (human-owned, never
touched by derivation) and `session_call_edges` (full-replaced) to the table list. In §7, record that
derivation is triggered by `sessions.stopRecording` in the background and that `derive.run` no longer
exists.

- [ ] **Step 3: Write the ADR**

Create `docs/adr/0007-session-is-the-reference.md`:

```markdown
# The curated Session is the composer's reference; Exemplar is deleted

The `Exemplar` type — its schema, table, repository, tRPC router, portal screen, and
`draftExemplarFromSession` — is removed. A Session the Analyst marks **use as reference** is what
teaches the composer, carrying its own ordered Operations and its own call-level dependency edges.

## Why

An Exemplar held nothing its Session did not. Its `name` and `goal` were copied verbatim from
`session.meta`; its `steps[].operationId` came from the Session's `ObservedFlow`. Its only original
field, `steps[].intent`, was drafted by a model and read by no consumer: `buildPrompt` rendered each
example as `"{name}": [op names]` and `exemplarRetrievalText` as `"{name}. {goal}. steps: {names}"`.

Promotion also duplicated curation. The Analyst now prunes a Session directly against its dependency
graph, on real Calls rather than an operationId list, so the Session already carries the judgement
that promotion was supposed to add.

ADR-0002's split of Exemplar from Composition was about approval lifecycle, and it survives: the
teaching artifact is still never approved and never tested. This supersedes only ADR-0002's
consequence that Sessions are promoted into Exemplars.

## Consequences

- Recorded Exemplars are discarded rather than migrated, following ADR-0002's own precedent. Their
  only non-derivable field was the unused `intent`.
- Knowledge packs carry `referenceSessions` in place of `exemplars`, so every existing pack's
  `contentHash` changes on the next build.
- A Session teaches only when the Analyst marks it, which replaces the promote step.
- `CompositionStep.fromExemplarIds` becomes `fromSessionIds`.
```

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md docs/ARCHITECTURE.md docs/adr/0007-session-is-the-reference.md
git commit -m "docs: record reference sessions and the removal of Exemplar"
```

---

## Final verification

- [ ] Run the full suite: `pnpm -r build && pnpm -r typecheck && pnpm -r --filter '!@backbencher/recorder' test`
- [ ] Confirm no stale references: `grep -rni "exemplar" packages apps docs CONTEXT.md --include=*.ts --include=*.tsx --include=*.md | grep -v "docs/adr/0002" | grep -v "docs/adr/0007" | grep -v "docs/superpowers"`
- [ ] Delete a stale derived database if one exists locally so migrations 0004 and 0005 apply from a clean state, or confirm they apply to the existing `data/backbencher.db`.
- [ ] Hand the UI to the analyst for manual validation: record a session, confirm derivation starts automatically, open the dependency graph, delete a call, confirm the sole-producer block, save, toggle **use as reference**, and compose against a goal.
