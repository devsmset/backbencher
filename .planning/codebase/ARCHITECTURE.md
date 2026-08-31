<!-- refreshed: 2026-08-14 -->
# Architecture

**Analysis Date:** 2026-08-14

## System Overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                              CAPTURE                                        │
│  Human operator drives a headed Chromium browser via Playwright             │
│  `packages/recorder/src/recorder.ts` (startRecording/RecorderHandle)         │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                 │ NDJSON events (WriteQueue)
                                 ▼
                  `data/sessions/<sessionId>/{meta.json,events.ndjson,summary.json}`
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    DERIVATION (deterministic, no LLM)                       │
│  `packages/derive/src/pipeline.ts` — runDerivation()                        │
│  loadSessions → pairCalls → templatizePaths → inferSchemas → volatile      │
│    → dataflowGraph → observedFlows → (optional probe) → persist            │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                 │ operations / dataflow_edges / observed_flows
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              KNOWLEDGE STORE — `packages/store` (Drizzle + SQLite)         │
│  `data/backbencher.db` — derived facts + human annotations, merged on read │
│  `mergeOperation()` in `packages/store/src/merge.ts`: annotation wins       │
└───────┬───────────────────────────────────────────────────┬────────────────┘
        │ tRPC (16 routers)                                  │ knowledge pack
        ▼                                                    ▼
┌───────────────────────────────┐                 ┌───────────────────────────┐
│  PORTAL API                   │◄───tRPC client──►│  PORTAL WEB               │
│  `packages/portal-api`        │                  │  `packages/portal-web`    │
│  Fastify + tRPC, `/trpc`      │                  │  React + Vite, hash-router│
│  bearer/`x-portal-token` auth │                  │  9 nav screens            │
└───────────────────────────────┘                 └───────────────────────────┘
        │ buildKnowledgePack()
        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  QA AGENT — `packages/agent`                                                │
│  compose (free-text goal → draft Scenario) ⊕ generate (Scenario → TestSpec)│
│  LLM: Anthropic direct or Vertex AI (`createLlm`), injectable for tests    │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                 │ TestSpec YAML
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  TESTKIT — `packages/testkit`                                              │
│  compiler.ts (Spec → Playwright .spec.ts) · runtime.ts (executes steps)   │
│  runner.ts (quarantine/flaky) · security.ts (authz matrix, BOLA probes)   │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                 ▼
                     Playwright API-mode test run + report

CLI (`apps/cli`, binary `bb`) drives every stage above via lazy dynamic imports.
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Data contracts | Zod schemas + `z.infer` types for every serialized document; zero deps on other packages | `packages/schemas/src/index.ts` |
| Cross-cutting utilities | Logger (pino), config loader, redaction, id generation, `dataDir()`/`findRepoRoot()` | `packages/shared/src/index.ts` |
| Recorder | Launches Chromium, injects instrumentation, streams NDJSON events per session | `packages/recorder/src/recorder.ts` |
| Derivation pipeline | Turns raw session events into `Operation`/`DataflowEdge`/`ObservedFlow` facts | `packages/derive/src/pipeline.ts` |
| Store | Drizzle schema, repositories, derived/annotation merge rule, audit log | `packages/store/src/schema.ts`, `packages/store/src/merge.ts` |
| Portal API | Fastify server + 16 tRPC routers; also drives live in-process recording | `packages/portal-api/src/server.ts`, `packages/portal-api/src/routers.ts` |
| Portal Web | React analyst UI: sessions, catalog, scenarios, compose, guides, packs, specs | `packages/portal-web/src/App.tsx` |
| Agent | Knowledge pack builder, free-text scenario composer, TestSpec generator | `packages/agent/src/index.ts` |
| Testkit | TestSpec → Playwright compiler, runtime, quarantine runner, security generators | `packages/testkit/src/index.ts` |
| CLI | `bb` binary — dispatches every subcommand with lazy dynamic imports | `apps/cli/src/index.ts` |

## Pattern Overview

**Overall:** Layered pipeline / ETL-style monorepo. Each stage (capture → derive → store → author → compile → run) is an independent workspace package with a one-directional dependency graph; packages communicate through typed data contracts (Zod schemas) and a shared SQLite store, not direct imports of each other's internals.

**Key Characteristics:**
- Deterministic derivation is strictly separated from LLM-driven authoring — no LLM call anywhere in `packages/derive` or `packages/testkit`.
- Every package boundary validates with `.parse()`/`.safeParse()` against `@backbencher/schemas`.
- Human-authored knowledge (`operation_annotations`, `scenarios`, `analyst_guides`) is never overwritten by re-running derivation; a merge function combines the two views on read.
- tRPC gives end-to-end type safety between `portal-web` and `portal-api` with no client codegen step.
- The LLM never emits directly-executable code — it emits declarative TestSpec YAML that a separate deterministic compiler/runtime turns into Playwright tests.

## Layers

**Contracts layer (`packages/schemas`):**
- Purpose: single source of truth for every serialized document (recording events, derived operations, human annotations, knowledge packs, TestSpecs).
- Location: `packages/schemas/src/{recording,apimodel,knowledge,pack,testspec}.ts`
- Contains: Zod schemas, `z.infer<>` types, a `schemaRegistry` for JSON Schema generation, `SCHEMAS_VERSION`.
- Depends on: nothing else in the monorepo.
- Used by: every other package.

**Shared utilities (`packages/shared`):**
- Purpose: cross-cutting concerns common to every package.
- Location: `packages/shared/src/{config,ids,logger,redaction}.ts`
- Contains: `loadConfig()` (reads `bb.config.jsonc`), `childLogger()` (pino), `newId()` (ulid), `dataDir()`/`findRepoRoot()`, redaction helpers.
- Depends on: `schemas` (types only, where relevant).
- Used by: `recorder`, `derive`, `store`, `portal-api`, `agent`, `testkit`, `cli`.

**Capture layer (`packages/recorder`):**
- Purpose: turn a human-driven browser session into a validated NDJSON event stream.
- Location: `packages/recorder/src/{recorder,apiFilter,bodyCapture,writeQueue}.ts`
- Contains: `startRecording()`, `RecorderHandle`, host/path allowlist filtering, response body capture with redaction, a serialized async write queue.
- Depends on: `schemas`, `shared`.
- Used by: `cli` (`bb record`), `portal-api` (in-process recording via `sessionsRouter.startRecording`/`stopRecording`).

**Derivation layer (`packages/derive`):**
- Purpose: deterministic, replayable transformation of sessions into API facts — no LLM.
- Location: `packages/derive/src/{pipeline,loadSessions,pairCalls,templatize,operationId,inferSchemas,volatile,dataflow,flows,sessionGraph,probe,persist}.ts`
- Contains: the pass-ordered pipeline (`runDerivation`), per-pass pure functions, an optional live-environment probe for volatility confidence.
- Depends on: `schemas`, `shared`.
- Used by: `cli` (`bb derive`), `portal-api` (`derive.run`, `sessions.graph`), `agent` (`dependencies.ts` reuses derive's dataflow graph builder).

**Persistence layer (`packages/store`):**
- Purpose: Drizzle/SQLite schema, repositories, and the single merge-rule implementation between derived facts and human annotations.
- Location: `packages/store/src/{schema,db,merge,saveDerivation,migrate}.ts`, `packages/store/src/repos/`
- Contains: table definitions (`sessions`, `operations`, `operation_annotations`, `dataflow_edges`, `observed_flows`, `scenarios`, `analyst_guides`, `knowledge_packs`, `test_specs`, `test_runs`, `audit_log`), `mergeOperation()`, `saveDerivation()` (transactional full-replace of derived tables only), `openStore()`.
- Depends on: `schemas`, `shared`.
- Used by: `derive` (persist step), `portal-api`, `agent`, `testkit`, `cli`.

**API/authoring layer (`packages/portal-api`, `packages/agent`):**
- Purpose: expose the store over tRPC to the portal, and turn stored knowledge into LLM-authored TestSpecs.
- Location: `packages/portal-api/src/{server,routers,trpc,index}.ts`; `packages/agent/src/{pack,compose,embed,dependencies,generate,index}.ts`
- Contains: 16 tRPC routers (see Data Flow); `buildKnowledgePack()`/`packDiff()`; `proposeScenario()` (free-text goal → draft Scenario); `generateTestSpec()` (Scenario → TestSpec).
- Depends on: `schemas`, `shared`, `store`, `derive` (agent reuses dataflow/dependency helpers), `recorder` (portal-api only, for in-process recording), `testkit` (portal-api only, for run/security routers).
- Used by: `portal-web` (via tRPC client type import only), `cli`.

**Presentation layer (`packages/portal-web`):**
- Purpose: analyst-facing React UI for reviewing sessions, curating the catalog, composing scenarios, and approving specs.
- Location: `packages/portal-web/src/{App,main,trpc,ui}.tsx`, `packages/portal-web/src/screens/*.tsx`
- Contains: hash-based router in `App.tsx`, 11 screen components (`Dashboard`, `Sessions`, `SessionGraph`, `Catalog`, `OperationDetail`, `Scenarios`, `ScenarioBuilder`, `Compose`, `Guides`, `Pack`, `Specs`).
- Depends on: `schemas` types + the `AppRouter` type import from `portal-api` (tRPC end-to-end types, no runtime dependency).
- Used by: analysts directly (browser), served statically by `portal-api` in `bb serve`.

**Compilation/execution layer (`packages/testkit`):**
- Purpose: turn declarative TestSpec YAML into runnable, deterministic Playwright tests.
- Location: `packages/testkit/src/{compiler,runtime,templates,runner,security,assertions}.ts`
- Contains: `compileToPlaywright()`, `runTestSpec()` (template resolution, client-generated-value minting, polling, JSONPath extraction, schema/assertion checks), `runWithQuarantine()`, `generateAuthzMatrix()`/`generateBolaProbes()` (deterministic, no LLM).
- Depends on: `schemas`, `shared`, `store` (for reading specs/environments in `runSpecAgainstEnv`).
- Used by: `cli` (`bb test compile|run`, `bb security`), `portal-api` (`agent.generate`→`runs`/`security` routers).

**Entry point (`apps/cli`):**
- Purpose: single `bb` binary wiring every layer together as subcommands, lazily imported for fast startup.
- Location: `apps/cli/src/index.ts`
- Depends on: all packages above (top of the dependency chain).
- Used by: developers/analysts on the command line; `bb serve` also boots `portal-api`.

## Data Flow

### Primary path: capture → derive → store

1. Analyst runs `bb record --url <u>` → `apps/cli/src/index.ts` (`cmdRecord`) calls `startRecording()` in `packages/recorder/src/recorder.ts`.
2. Recorder launches headed Chromium, injects instrumentation, filters API traffic (`packages/recorder/src/apiFilter.ts`), captures/redacts response bodies (`packages/recorder/src/bodyCapture.ts`), and appends validated events via `packages/recorder/src/writeQueue.ts` to `data/sessions/<id>/events.ndjson`.
3. Analyst runs `bb derive [--session <id>|--all]` → `apps/cli/src/index.ts` (`cmdDerive`) calls `loadAllSessions()`/`loadSession()` then `runDerivation()` (`packages/derive/src/pipeline.ts`).
4. `runDerivation` executes the pass chain (`pairCalls` → `templatizePaths` → `inferSchemas` → `volatile` → `dataflowGraph` → `observedFlows`), producing `Operation[]`, `DataflowEdge[]`, `ObservedFlow[]`.
5. `packages/derive/src/persist.ts` writes these into `packages/store` via `saveDerivation()` — a transactional full-replace of `operations`/`dataflow_edges`/`observed_flows` only; annotation/scenario/guide tables are untouched.

### Authoring path: store → knowledge pack → TestSpec

1. `buildKnowledgePack(store, opts)` (`packages/agent/src/pack.ts`) merges `operations ⊕ operation_annotations` via `mergeOperation()`, excludes `reviewState: "ignored"`, includes only approved `scenarios`, filters dataflow edges by `evidenceCount ≥ 2`, hashes canonical JSON to a content hash, and writes `data/knowledge-packs/<hash>/{pack.json,catalog.md}`.
2. Free-text flow: `proposeScenario()` (`packages/agent/src/compose.ts`) takes a goal string, retrieves candidate endpoints via local embeddings (`packages/agent/src/embed.ts`), expands the dependency closure (`packages/agent/src/dependencies.ts`), prompts the LLM to select/order steps, then validates/auto-completes dependencies deterministically before persisting an unreviewed draft `Scenario`.
3. Guided flow: an analyst can instead hand-author a `Scenario` in the portal (`ScenarioBuilder.tsx`) or derive one from an `ObservedFlow` (`scenarios.fromFlow` router).
4. `generateTestSpec(store, scenarioId, opts)` (`packages/agent/src/generate.ts`) assembles a prompt from the compact catalog, in-scope `must_read` guides, the scenario, and merged detail docs for the scenario's operations + 1-hop dataflow neighbors; the LLM emits TestSpec YAML only, which is validated (`validateSpec()`) with one automatic repair round-trip on failure.

### Execution path: TestSpec → Playwright run

1. `compileToPlaywright(spec, ctx)` (`packages/testkit/src/compiler.ts`) emits a `.spec.ts` file that delegates all logic to `runtime.ts` (LLM output never becomes runnable code directly).
2. `runTestSpec(spec, ctx)` (`packages/testkit/src/runtime.ts`) resolves `{{steps.x.extract.y}}`/`{{env.KEY}}`/`{{faker.*}}`/`{{now.iso}}` templates (unknown templates throw), mints fresh values for client-generated fields regardless of LLM output, builds/sends the HTTP request, polls with bounded backoff, extracts via JSONPath, and asserts status/schema/`jsonAssertions`.
3. `runWithQuarantine()` (`packages/testkit/src/runner.ts`) retries once on failure, recording a pass-on-retry as `"flaky"`; `guardEnvironment` refuses write-capable specs against non-destructive environments.

**State Management:**
- Durable state lives in `data/backbencher.db` (SQLite via Drizzle) and the flat-file trees `data/sessions/` and `data/knowledge-packs/`.
- `portal-api` holds one piece of in-memory state: `activeRecordings: Map<sessionId, RecorderHandle>` (`packages/portal-api/src/routers.ts`) for live in-process recordings; this is not persisted and is lost on server restart.
- `portal-web` keeps only UI state (current hash route, analyst name in `localStorage`) — no client-side cache beyond tRPC/TanStack Query defaults.

## Key Abstractions

**Zod schema + `z.infer` contract:**
- Purpose: single definition for a document's shape, validation, and TypeScript type.
- Examples: `packages/schemas/src/recording.ts` (`ApiRequestEventSchema`, `RecordingEventSchema` discriminated union), `packages/schemas/src/pack.ts` (`KnowledgePackSchema`).
- Pattern: define with Zod, export `z.infer<>` type, `.parse()`/`.safeParse()` at every package boundary.

**Derived-fact vs. human-annotation split:**
- Purpose: keep re-runnable derivation from ever clobbering analyst judgment.
- Examples: `Operation` (derived, `packages/store/src/schema.ts`) vs. `OperationAnnotation` (human, same file); merged via `mergeOperation()` in `packages/store/src/merge.ts`.
- Pattern: derived tables are fully replaced on each `bb derive`; annotation tables are only ever mutated by explicit portal actions and are read-joined at query time.

**Correlation-id-based event pairing:**
- Purpose: deterministically pair `api_request`/`api_response` events without URL/timestamp heuristics.
- Examples: `correlationId` field on both schemas (`packages/schemas/src/recording.ts`), joined in `packages/derive/src/pairCalls.ts`.
- Pattern: mint a ulid per request at capture time; never re-derive pairing from mutable request state.

**Template-resolved TestSpec:**
- Purpose: let an LLM author declarative intent without ever producing executable code.
- Examples: `TestSpecSchema` (`packages/schemas/src/testspec.ts`), resolved in `packages/testkit/src/runtime.ts` / `packages/testkit/src/templates.ts`.
- Pattern: string templates (`{{steps.x.extract.y}}`, `{{faker.*}}`) are the only LLM-to-runtime interface; unknown templates are a hard error.

**Content-hashed knowledge pack:**
- Purpose: make agent runs reproducible and diffable.
- Examples: `buildKnowledgePack()` / `packDiff()` in `packages/agent/src/pack.ts`.
- Pattern: canonical JSON (sorted keys/arrays) hashed to a 16-char id; packs are written to `data/knowledge-packs/<hash>/`.

## Entry Points

**CLI (`bb`):**
- Location: `apps/cli/src/index.ts`
- Triggers: developer/analyst shell invocation (`bb record|derive|serve|agent|test|security|export`).
- Responsibilities: parse flags, lazily import the relevant package, dispatch, print human-readable output. `bb test run` executes specs in-process (`runSpecAgainstEnv`) rather than shelling out to `npx playwright test`.

**Portal API server (`bb serve`):**
- Location: `packages/portal-api/src/server.ts` (`buildServer()`), started via `packages/portal-api/src/index.ts`
- Triggers: `bb serve [--port]`
- Responsibilities: Fastify app serving `portal-web`'s static build plus tRPC at `/trpc`; single shared-token auth (`x-portal-token`/Bearer) enforced in an `onRequest` hook, `/health` exempt.

**Portal Web app:**
- Location: `packages/portal-web/src/main.tsx` → `App.tsx`
- Triggers: browser navigation to the server root; hash-based routing (`#/dashboard`, `#/sessions`, `#/catalog`, `#/scenarios`, `#/compose`, `#/guides`, `#/pack`, `#/specs`).
- Responsibilities: render the active screen, hold minimal client-side UI state, call `portal-api` via the typed tRPC client (`packages/portal-web/src/trpc.ts`).

## Architectural Constraints

- **Threading:** Single-threaded Node processes throughout; the recorder's browser automation and the portal server's live recording both run headed Chromium instances synchronously in the same process as the caller (`packages/portal-api/src/routers.ts` `activeRecordings` map) — not offloaded to workers.
- **Global state:** `activeRecordings` (module-level `Map`) in `packages/portal-api/src/routers.ts` is the only in-process mutable singleton found; everything else is either pure functions or reads/writes through `openStore()`.
- **Dependency direction (enforced by convention, not tooling):** `schemas ← shared ← {recorder, derive, store} ← {portal-api, agent, testkit} ← cli`. `portal-web` depends only on `schemas` types and the `AppRouter` type export from `portal-api`; there is no CI-enforced boundary check (`scripts/depcheck.mjs` exists but checks dependency *usage*, not directional layering).
- **Data directory is gitignored:** `data/backbencher.db`, `data/sessions/`, `data/knowledge-packs/` are runtime state, not committed source — never assume they are populated in a fresh checkout.
- **Legacy code has been removed:** the v1 prototype that lived at `src/recorders/recorder.js` and `src/filters/filter-api.js`, along with the root `package.json` `record`/`filter` scripts, has been deleted. `packages/recorder` and `packages/derive` fully supersede it.

## Anti-Patterns

### Server-side live recording as in-process mutable state

**What happens:** `packages/portal-api/src/routers.ts`'s `sessionsRouter.startRecording`/`stopRecording` launches a headed Playwright browser directly inside the Fastify server process and tracks it in a plain `Map`.
**Why it's wrong:** state is lost on server restart, and a second concurrent portal-api instance (e.g. behind a load balancer) would not share `activeRecordings`, breaking multi-analyst or hosted deployments.
**Do this instead:** treat `bb record` (CLI, out-of-process) as the primary capture path for anything beyond a single local analyst; if server-driven recording must stay, move the browser process out-of-process (child process or job queue) so state survives restarts.

### Shallow, string-equality pack diffing

**What happens:** `packDiff()` (`packages/agent/src/pack.ts`) reports `added`/`removed`/`changed` operationIds by comparing serialized JSON strings, not field-level differences.
**Why it's wrong:** the portal's Pack screen (`packages/portal-web/src/screens/Pack.tsx`) can only say "changed: yes/no" per operation, not what changed — reviewers can't tell if a schema addition or a breaking removal occurred.
**Do this instead:** diff `operations[operationId]` structurally (e.g. JSON-patch style) so the UI can render field-level adds/removes.

## Error Handling

**Strategy:** Validate at every package boundary with Zod (`.parse()`/`.safeParse()`); fail fast with typed errors (`TRPCError` in the API layer) rather than propagating malformed data downstream.

**Patterns:**
- `packages/portal-api/src/routers.ts` throws `TRPCError({ code, message })` for domain errors (`NOT_FOUND`, `BAD_REQUEST`, `PRECONDITION_FAILED`) — no generic try/catch swallowing.
- `packages/testkit/src/runner.ts`'s `runWithQuarantine` treats a single retry-then-pass as `"flaky"` (not silently `"passed"`), surfacing instability instead of hiding it.
- `packages/derive` passes are pure functions over validated input; malformed session data fails at `loadSessions.ts` (schema validation), before any derivation pass runs.

## Cross-Cutting Concerns

**Logging:** `childLogger({ mod: "<name>" })` from `packages/shared/src/logger.ts` (pino-based), used consistently across `recorder`, `portal-api`, and the CLI for structured, module-tagged logs.

**Validation:** Zod schemas from `packages/schemas` at every boundary (event capture, derivation output, store reads/writes, tRPC inputs, TestSpec compilation).

**Authentication:** Single shared-secret token (`PORTAL_TOKEN` env / `x-portal-token` header or `Bearer` token) checked once in `packages/portal-api/src/server.ts`'s Fastify `onRequest` hook; no per-user auth or RBAC — this is a single-analyst-trust-boundary design, not multi-tenant.

---

*Architecture analysis: 2026-08-14*
