# Coding Conventions

**Analysis Date:** 2026-08-14

## Naming Patterns

**Files:**
- `camelCase.ts` for modules (`loadSessions.ts`, `inferSchemas.ts`, `pairCalls.ts`, `sessionGraph.ts`, `operationId.ts`, `bodyCapture.ts`, `writeQueue.ts`).
- One PascalCase-ish exception for schema/data files that map 1:1 to a domain noun (`apimodel.ts`, `testspec.ts`, `knowledge.ts`, `recording.ts`) in `packages/schemas/src/`.
- Test files mirror the source file name with `.test.ts` suffix, placed in a sibling `test/` directory (not co-located): `packages/derive/src/pipeline.ts` → `packages/derive/test/pipeline.test.ts`.
- End-to-end/real-integration tests are suffixed `.e2e.test.ts`, e.g. `packages/recorder/test/recorder.e2e.test.ts`.
- Barrel/entry files are always `index.ts` and re-export the package's public API.

**Functions:**
- `camelCase`, verb-first: `openStore`, `runDerivation`, `proposeScenario`, `retrieveForGoal`, `buildDataflowGraph`, `redactHeaders`, `findRepoRoot`.
- Factory/constructor-style functions read as nouns-with-verb: `newId()`, `childLogger()`.
- Test helper functions built inline at the top of test files are short and lowercase, often just `op(...)`, `seed()`, `annotate(...)` — throwaway builders scoped to that test file, not exported.

**Variables:**
- `camelCase` throughout; no Hungarian notation.
- Constants that are fixed configuration/policy values use `SCREAMING_SNAKE_CASE` at module scope: `CONFIG_FILENAME`, `ROOT_MARKERS`, `MAX_DEPTH`, `URL_HEADERS`, `SYSTEM` (agent/src/generate.ts).
- Short-lived locals favor terse names in tight scopes (`u`, `k`, `v`, `m`) when the surrounding code makes the meaning obvious (e.g. `packages/shared/src/redaction.ts`), but domain values keep full names (`operationId`, `sessionId`, `authObserved`).

**Types:**
- PascalCase for types/interfaces: `Operation`, `DataflowEdge`, `ObservedFlow`, `TestSpec`, `Scenario`, `BbConfig`.
- Zod schema constants use a `*Schema` suffix and are paired with an inferred type of the same base name: `export const BbConfigSchema = z.object({...}); export type BbConfig = z.infer<typeof BbConfigSchema>;` (`packages/shared/src/config.ts`). This pattern is repeated in every schema-owning package (`schemas`, `shared`).
- Discriminated/union string literals (e.g. `reviewState`, `sideEffect`, `authObserved`) are modeled as zod enums/literal unions, not hand-rolled string types.

## Code Style

**Formatting:**
- Formatter: Biome (`biome.json`), not Prettier/ESLint.
- 2-space indent, 100-char line width, double quotes, trailing commas everywhere (`"trailingCommas": "all"`).
- `organizeImports` is enabled — import order is enforced by the formatter, not manually curated.

**Linting:**
- Biome recommended rule set (`"recommended": true"`) with no custom rule overrides in `biome.json`.
- No ESLint config anywhere in the repo — Biome is the sole linter/formatter.
- Ignored paths for both lint and format: `dist`, `node_modules`, `data`, `recordings`, `.turbo`, `coverage`.

**TypeScript strictness (`tsconfig.base.json`, extended by every package's `tsconfig.json`):**
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`.
- `module`/`moduleResolution: NodeNext` — all imports use explicit `.js` extensions even though source is `.ts` (Node ESM resolution), e.g. `import { openStore } from "@backbencher/store"` and `import { loadSession } from "./loadSessions.js"`.
- `isolatedModules: true` — always use `export type` / `import type` for type-only exports/imports (seen throughout: `import type { Operation } from "@backbencher/schemas"`).
- Every package is `"type": "module"` in `package.json`.

## Import Organization

**Order (enforced by Biome `organizeImports`, observed pattern):**
1. External/npm packages (`node:fs`, `node:path`, `zod`, `pino`, `js-yaml`, `playwright`).
2. Workspace packages (`@backbencher/schemas`, `@backbencher/shared`, `@backbencher/store`).
3. Relative imports from the same package, always with explicit `.js` extension (`../src/compose.js`, `./loadSessions.js`).

**Path Aliases:**
- None — no `paths` mapping in `tsconfig.base.json`. Cross-package imports go through the workspace package name (`@backbencher/*`, resolved via `workspace:*` in each `package.json` and pnpm workspace linking), never relative paths that cross a package boundary.

**Type vs value imports:**
- Mixed imports split cleanly: `import { type Scenario, type TestSpec, TestSpecSchema } from "@backbencher/schemas";` — inline `type` modifiers are preferred over a separate `import type` line when only some symbols are types.

## Error Handling

**Patterns:**
- Config/data validation is done exclusively through Zod schemas (`z.object(...).parse(...)`); invalid input throws a `ZodError` rather than being hand-validated. See `BbConfigSchema.parse({})` used pervasively in tests and `apps/cli/src/index.ts`.
- Recoverable parse failures use `try { ... } catch { return fallback; }` with an empty catch binding when the caught error isn't needed, e.g. `redactUrl` in `packages/shared/src/redaction.ts`:
  ```ts
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  ```
- CLI-level user errors are reported via `process.stderr.write(...)` + `process.exitCode = 1;` (not `throw`/`process.exit(1)` mid-function), so cleanup code still runs — see `cmdRecord` in `apps/cli/src/index.ts`.
- HTTP/server-layer errors (portal-api) are surfaced as response status codes (401 on missing auth, etc.) rather than thrown exceptions crossing the tRPC boundary — see `packages/portal-api/test/portal.test.ts`.
- No custom `Error` subclasses were found; the codebase relies on Zod's error type and plain `Error`/rejected promises.

## Logging

**Framework:** `pino`, wrapped once in `packages/shared/src/logger.ts`.

**Patterns:**
- Never import `pino` directly outside `shared`; always get a scoped logger via `childLogger({ mod: "<name>" })`, e.g. `const log = childLogger({ mod: "cli" });` in `apps/cli/src/index.ts`.
- Log level is controlled by `process.env.BB_LOG_LEVEL` (default `"info"`), not hardcoded.
- User-facing CLI output uses `process.stdout.write` directly (with emoji markers like `✅`/`🎥`) — this is distinct from structured `pino` logging, which is reserved for diagnostic/operational logs.

## Comments

**When to Comment:**
- Comments explain *why*, not *what*: architecture references are cited inline, e.g. `// Redaction (architecture §3.5). Pure functions; runs at CAPTURE time...` (`packages/shared/src/redaction.ts`), `// QA agent generation (architecture §7.2)...` (`packages/agent/src/generate.ts`).
- Non-obvious security/correctness invariants get a one-line comment directly above the code, e.g. `// keepAuthShape: record "Bearer ***REDACTED***" so the auth KIND survives.`
- Test files include a short block comment above the `describe` explaining test intent/risk when it isn't obvious from the test name, e.g. the redaction rationale in `packages/recorder/test/recorder.e2e.test.ts`.

**JSDoc/TSDoc:**
- Exported utility functions get a one-line (occasionally two-line) `/** ... */` doc comment describing behavior and edge cases, not parameter-by-parameter documentation:
  ```ts
  /** Walk up from `startDir` to locate the repository root (workspace file or .git). */
  export function findRepoRoot(startDir: string = process.cwd()): string { ... }
  ```
- Internal/non-exported helpers generally have no doc comment.

## Function Design

**Size:** Small, single-purpose functions; pipeline stages are composed rather than inlined (see `packages/derive/src/pipeline.ts` calling out to `loadSessions`, `pairCalls`, `templatizePaths`, `inferSchemas`, etc.).

**Parameters:** Options objects are used once a function needs more than 2–3 parameters, typed as an inline object type or a named `*Options`/`*Context` type (e.g. `proposeScenario(store, goal, { llm, actor })`, `runWithQuarantine(spec, { baseUrl, http, operations })`). Dependencies like the LLM client or HTTP client are passed in as typed function values (`LlmComplete`, `HttpClient`) rather than imported directly — this is the project's primary seam for testability.

**Return Values:** Functions return plain data objects/arrays, not classes. Result shapes commonly separate "the thing" from "problems found", e.g. `{ scenario, unmetDependencies }` and assertion functions that return an array of violations (empty array = pass): `applyJsonAssertions(...)`.

## Module Design

**Exports:** Every package's `src/index.ts` is a curated barrel that re-exports only the public surface with explicit named exports (not `export *` except for pure type modules), e.g. `packages/derive/src/index.ts` selectively re-exports functions and types from each internal module, keeping internal-only helpers unexported.

**Barrel Files:** Package `package.json` `exports`/`main`/`types` all point at `./dist/index.js` / `./dist/index.d.ts` — consumers never import a package's internal file paths directly, only `@backbencher/<pkg>`.

---

*Convention analysis: 2026-08-14*
