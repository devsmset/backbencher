# Codebase Structure

**Analysis Date:** 2026-08-14

## Directory Layout

```
backbencher/
├── AGENTS.md                  # GSD agent instructions (not project source docs)
├── bb.config.jsonc             # runtime config: recorder filters, redaction, agent/LLM, environments
├── biome.json                  # lint/format config (Biome, single tool for the monorepo)
├── package.json                 # workspace root; private, holds shared devDeps and the `serve` script
├── pnpm-workspace.yaml           # workspace globs: packages/*, apps/*
├── pnpm-lock.yaml
├── tsconfig.base.json            # shared strict TS config, extended by every package
├── turbo.json                    # turborepo task graph: build/typecheck/test/clean
├── README.md
├── apps/
│   └── cli/                      # @backbencher/cli — the `bb` binary
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts          # single-file CLI dispatcher (lazy dynamic imports per subcommand)
├── data/                         # gitignored runtime state — never assume populated in fresh checkout
│   ├── knowledge-packs/<hash>/   # pack.json + catalog.md, one dir per content hash
│   └── sessions/<sessionId>/     # meta.json, events.ndjson, summary.json per recorded session
├── docs/                         # architecture/decision docs (human-maintained, not auto-generated)
│   ├── ARCHITECTURE.md           # current-state architecture (source of truth)
│   ├── adr/                      # architecture decision records, numbered
│   └── agents/                   # agent-skill config: issue tracker, triage labels, domain docs
├── packages/
│   ├── schemas/                  # @backbencher/schemas — Zod contracts, zero internal deps
│   ├── shared/                   # @backbencher/shared — logger, config, redaction, ids
│   ├── recorder/                 # @backbencher/recorder — Playwright capture
│   ├── derive/                   # @backbencher/derive — deterministic derivation pipeline
│   ├── store/                    # @backbencher/store — Drizzle schema + repos (SQLite)
│   ├── portal-api/               # @backbencher/portal-api — Fastify + tRPC server
│   ├── portal-web/                # @backbencher/portal-web — React/Vite analyst UI
│   ├── agent/                     # @backbencher/agent — knowledge pack + LLM TestSpec generation
│   ├── testkit/                   # @backbencher/testkit — TestSpec compiler/runtime/runner/security
│   └── recorder/scripts/, schemas/scripts/  # per-package build/codegen scripts (see below)
├── scripts/                      # repo-wide scripts (not per-package)
│   ├── depcheck.mjs              # dependency-usage check across workspaces
│   ├── e2e-portal.mjs            # end-to-end portal smoke script
│   ├── kill-port.sh
│   └── serve.sh                  # builds all packages and starts the portal (root `pnpm serve`)
```

## Directory Purposes

**`apps/cli/`:**
- Purpose: the single `bb` command-line entry point.
- Contains: one `src/index.ts` file with a flag parser and one `cmd*` async function per subcommand, each lazily importing the package it needs.
- Key files: `apps/cli/src/index.ts`

**`packages/schemas/`:**
- Purpose: Zod data contracts shared by every other package; the only package with zero internal workspace dependencies.
- Contains: `src/{recording,apimodel,knowledge,pack,testspec}.ts`, a `generated/` directory (JSON Schema output), `scripts/` (schema generation), `test/`.
- Key files: `packages/schemas/src/index.ts` (barrel export)

**`packages/shared/`:**
- Purpose: cross-cutting utilities every package depends on.
- Contains: `src/{config,ids,logger,redaction}.ts`, `test/`.
- Key files: `packages/shared/src/config.ts` (`loadConfig()`, `dataDir()`, `findRepoRoot()`)

**`packages/recorder/`:**
- Purpose: Playwright-based session capture.
- Contains: `src/{recorder,apiFilter,bodyCapture,writeQueue}.ts`, `src/injected/` (browser-injected instrumentation, bundled to a single script at build time), `fixtures/app.ts` (mock app for e2e tests), `scripts/`, `test/`.
- Key files: `packages/recorder/src/recorder.ts` (`startRecording`, `RecorderHandle`)

**`packages/derive/`:**
- Purpose: deterministic derivation pipeline — sessions in, API facts out, no LLM.
- Contains: `src/{pipeline,loadSessions,pairCalls,templatize,operationId,inferSchemas,volatile,dataflow,flows,sessionGraph,probe,persist,schemaBuilder,jsonpath,dependencies,types}.ts`, `fixtures/sessions.ts` (test fixtures), `test/` (one `*.test.ts` per pass).
- Key files: `packages/derive/src/pipeline.ts` (`runDerivation`, the pass-ordered orchestrator)

**`packages/store/`:**
- Purpose: persistence layer — Drizzle/SQLite schema, repositories, and the derived-vs-annotation merge rule.
- Contains: `src/{schema,db,dbtypes,merge,migrate,saveDerivation}.ts`, `src/repos/` (one repository module per table/entity), `test/`.
- Key files: `packages/store/src/schema.ts` (table definitions), `packages/store/src/merge.ts` (`mergeOperation`)

**`packages/portal-api/`:**
- Purpose: Fastify + tRPC server exposing the store to the portal and CLI.
- Contains: `src/{index,server,routers,trpc}.ts`, `test/{acceptance,portal}.test.ts`.
- Key files: `packages/portal-api/src/routers.ts` (16 routers + `appRouter`), `packages/portal-api/src/server.ts` (`buildServer`)

**`packages/portal-web/`:**
- Purpose: React analyst UI, hash-routed, served statically by `portal-api`.
- Contains: `src/{App,main,trpc,ui,index.css}.tsx`, `src/screens/*.tsx` (one component per screen), Vite/Tailwind/PostCSS config at package root.
- Key files: `packages/portal-web/src/App.tsx` (router + nav), `packages/portal-web/src/trpc.ts` (typed tRPC client)

**`packages/agent/`:**
- Purpose: knowledge pack construction and LLM-driven authoring (free-text composition + scenario-to-TestSpec generation).
- Contains: `src/{pack,compose,embed,dependencies,generate,index}.ts`, `test/{compose,embed,generate,pack}.test.ts`.
- Key files: `packages/agent/src/generate.ts` (`generateTestSpec`), `packages/agent/src/compose.ts` (`proposeScenario`)

**`packages/testkit/`:**
- Purpose: compiles and runs TestSpecs as Playwright tests, plus deterministic security-spec generators.
- Contains: `src/{compiler,runtime,templates,runner,security,assertions}.ts`, `src/fixtures/`, `test/{compiler,runner,runtime,security}.test.ts`.
- Key files: `packages/testkit/src/compiler.ts` (`compileToPlaywright`), `packages/testkit/src/runtime.ts` (`runTestSpec`)

**`data/`:**
- Purpose: all runtime-generated state. Gitignored.
- Contains: `backbencher.db` (SQLite), `sessions/<id>/` (raw capture), `knowledge-packs/<hash>/` (agent output).
- Generated: Yes. Committed: No.

**`docs/`:**
- Purpose: human-maintained architecture/design documents; the primary ground-truth reference for the system's intent and current state.
- Contains: `ARCHITECTURE.md` (current implementation), `adr/` (numbered decision records), `agents/` (agent-skill config).

## Key File Locations

**Entry Points:**
- `apps/cli/src/index.ts`: `bb` CLI dispatcher
- `packages/portal-api/src/server.ts`: `buildServer()` — Fastify app factory
- `packages/portal-api/src/index.ts`: server bootstrap (invoked by `bb serve`)
- `packages/portal-web/src/main.tsx`: React app mount point

**Configuration:**
- `bb.config.jsonc`: recorder filters, redaction rules, agent/LLM provider, environments — loaded by `packages/shared/src/config.ts`
- `tsconfig.base.json`: shared strict TypeScript compiler options extended by every package's `tsconfig.json`
- `turbo.json`: task pipeline (`build`, `typecheck`, `test`, `clean`) and their `dependsOn`/`outputs`
- `pnpm-workspace.yaml`: workspace package globs (`packages/*`, `apps/*`)
- `biome.json`: lint/format rules (single tool for the whole repo)

**Core Logic:**
- `packages/derive/src/pipeline.ts`: derivation pass ordering
- `packages/store/src/merge.ts`: derived-vs-annotation merge rule
- `packages/agent/src/generate.ts`: TestSpec generation (context assembly, validation, repair loop)
- `packages/testkit/src/runtime.ts`: TestSpec execution semantics
- `packages/portal-api/src/routers.ts`: all tRPC procedure definitions

**Testing:**
- Each package's `test/` directory holds Vitest specs, one file per source module (e.g. `packages/derive/test/pipeline.test.ts` for `packages/derive/src/pipeline.ts`).
- `packages/recorder/test/recorder.e2e.test.ts`: the one live-browser e2e test in the repo.
- `packages/portal-api/test/acceptance.test.ts`: cross-router acceptance test.

## Naming Conventions

**Files:**
- Source modules: `camelCase.ts` (e.g. `pairCalls.ts`, `inferSchemas.ts`, `saveDerivation.ts`)
- React components: `PascalCase.tsx` matching the exported component name (e.g. `ScenarioBuilder.tsx`, `OperationDetail.tsx`)
- Test files: `<module>.test.ts` co-located under a sibling `test/` directory (not co-located next to source)
- Package barrel exports: `src/index.ts` in every package, re-exporting the public surface

**Directories:**
- Each workspace package follows the same skeleton: `src/`, `test/`, `package.json`, `tsconfig.json`; some additionally have `fixtures/` (test data/mock apps) and `scripts/` (codegen or build helpers).
- `packages/recorder/src/injected/`: browser-injected TypeScript, compiled to a bundled IIFE string at build time — kept separate from the Node-side recorder code.
- `packages/store/src/repos/`: one file per table/entity repository.

## Where to Add New Code

**New data contract / document shape:**
- Define the Zod schema in `packages/schemas/src/` (new or existing file matching the domain, e.g. `testspec.ts` for TestSpec-related types).
- Export the schema and its `z.infer<>` type from `packages/schemas/src/index.ts`.

**New derivation pass:**
- Add a new module in `packages/derive/src/` (pure function over `SessionData`/`PairedCall`), wire it into `runDerivation()` in `packages/derive/src/pipeline.ts`.
- Add a corresponding test in `packages/derive/test/<name>.test.ts`.

**New store table/repository:**
- Add the table definition to `packages/store/src/schema.ts`, add a repository module under `packages/store/src/repos/`, wire it into `openStore()`.

**New tRPC router/procedure:**
- Add a `router({...})` block in `packages/portal-api/src/routers.ts`, register it on `appRouter`.
- Consume it from `portal-web` via the existing typed `packages/portal-web/src/trpc.ts` client — no manual typing needed.

**New portal screen:**
- Add a component under `packages/portal-web/src/screens/`, import and route to it in `packages/portal-web/src/App.tsx` (both the `NAV` array and the `switch` statement), matching the existing hash-route pattern.

**New CLI subcommand:**
- Add a `cmd<Name>` async function in `apps/cli/src/index.ts` following the existing lazy-import pattern, register it in the top-level dispatch and the `HELP` string.

**New agent capability (LLM-driven):**
- Add a module in `packages/agent/src/` following the `compose.ts`/`generate.ts` pattern: build a prompt, call `LlmComplete` (injectable for tests), validate the parsed output against a Zod schema, add one repair round-trip on failure.

**Utilities/helpers used across packages:**
- Add to `packages/shared/src/`, not duplicated locally — this package is the designated home for cross-cutting helpers.

## Special Directories

**`data/`:**
- Purpose: all runtime-generated artifacts (SQLite DB, recorded sessions, knowledge packs).
- Generated: Yes. Committed: No (gitignored).

**`packages/*/dist/`, `packages/*/.turbo/`, `**/node_modules/`:**
- Purpose: build output and turborepo/package-manager caches.
- Generated: Yes. Committed: No.

**`packages/schemas/generated/`:**
- Purpose: JSON Schema output generated from the Zod contracts for non-TS consumers (e.g. LLM prompts).
- Generated: Yes (via `packages/schemas/scripts/`). Committed: check per-file; treat as derived, not hand-edited.

---

*Structure analysis: 2026-08-14*
