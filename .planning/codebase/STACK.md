# Technology Stack

**Analysis Date:** 2026-08-14

## Languages

**Primary:**
- TypeScript 5.7.2 - all `packages/*` and `apps/cli` (strict mode, ES2022 target)

**Secondary:**
- Plain Node.js (CommonJS-free, no build step) - legacy root-level scripts at `src/recorders/recorder.js` and `src/filters/filter-api.js`, run via the root `package.json` (`npm run record`, `npm run filter`). These predate the monorepo migration and are not part of the pnpm workspace.
- JSX/TSX (React) - `packages/portal-web/src/`

## Runtime

**Environment:**
- Node.js — no version pinned via `.nvmrc`/`.node-version`/`engines` field. All packages target ES2022/NodeNext module resolution (`tsconfig.base.json`), which requires a reasonably current Node LTS.

**Package Manager:**
- pnpm workspaces (`pnpm-workspace.yaml`: `packages/*`, `apps/*`)
- No `packageManager` field pinned in root `package.json`
- Lockfile: `pnpm-lock.yaml` present at repo root
- `.npmrc`: `auto-install-peers=true`, `strict-peer-dependencies=false`

## Frameworks

**Core:**
- Fastify 5.2.1 - HTTP server host in `packages/portal-api/src/server.ts`
- tRPC 11.0.0 (`@trpc/server`, `@trpc/client`, `@trpc/react-query`) - typed RPC layer between `portal-api` and `portal-web`, mounted at `/trpc` (`packages/portal-api/src/routers.ts`)
- React 18.3.1 + ReactDOM 18.3.1 - `packages/portal-web` SPA
- Vite 6.0.7 (`@vitejs/plugin-react`) - portal-web dev server and bundler (`packages/portal-web/vite.config.ts`)
- Playwright 1.57.0 - browser automation for both session recording (`packages/recorder`) and compiled-test execution (root `src/recorders/recorder.js`, `apps/cli` `test compile`/`test run` commands)
- Drizzle ORM 0.38.3 + better-sqlite3 11.7.0 - persistence layer (`packages/store/src/db.ts`)

**Testing:**
- Vitest 2.1.8 (root) / vitest (per-package, unversioned in package.json but resolved via workspace) - unit tests across every package's `test/` directory, run via `vitest run --passWithNoTests`
- ajv 8.17.1 - JSON Schema validation used by `packages/testkit` for compiled-test assertions

**Build/Dev:**
- TypeScript compiler (`tsc -p tsconfig.json`) - build/typecheck for every package and `apps/cli`
- tsx 4.19.2 - direct TS execution for CLI dev mode (`apps/cli` `dev` script) and one-off scripts (`packages/schemas/scripts/gen-jsonschema.ts`)
- Turborepo (`turbo.json`) - task orchestration for `build`, `typecheck`, `test`, `clean` across the workspace, with `build`/`typecheck`/`test` depending on upstream package builds (`^build`)
- Biome 1.9.4 (`biome.json`) - linting + formatting (2-space indent, 100-char line width, double quotes, trailing commas, import organization) in place of ESLint/Prettier

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk` ^0.32.1 / `@anthropic-ai/vertex-sdk` ^0.7.0 - LLM client for QA test generation (`packages/agent/src/generate.ts`)
- `google-auth-library` ^9.15.1 - GCP credential resolution for the Vertex AI provider path
- `zod` ^3.24.1 - schema validation used pervasively (config, `bb.config.jsonc`, TestSpec, API schemas) across `packages/schemas`, `packages/shared`, `packages/agent`, `packages/portal-api`
- `zod-to-json-schema` ^3.24.1 - generates JSON Schema artifacts from Zod schemas (`packages/schemas`)
- `drizzle-orm` ^0.38.3 + `better-sqlite3` ^11.7.0 - embedded SQLite persistence (`packages/store`)
- `playwright` ^1.57.0 - session recording and compiled Playwright test execution

**Infrastructure:**
- `pino` ^9.5.0 - structured logging (`packages/shared/src/logger.ts`, level via `BB_LOG_LEVEL`)
- `jsonc-parser` ^3.3.1 - parses `bb.config.jsonc` (JSON with comments) in `packages/shared/src/config.ts`
- `ulid` ^2.3.0 - sortable unique ID generation (`packages/shared/src/ids.ts`)
- `js-yaml` ^4.1.0 - YAML parsing for LLM-generated TestSpecs (`packages/agent`) and compiled spec I/O (`packages/testkit`)
- `jsonpath-plus` ^10.2.0 - JSONPath evaluation for test assertions (`packages/testkit`)
- `@fastify/static` ^8.0.4 - serves the built `portal-web` SPA from `portal-api`
- `@tanstack/react-query` ^5.62.7 + `@trpc/react-query` - client-side data fetching in `portal-web`
- `reactflow` ^11.11.4 - graph visualization (session/dataflow graphs) in `portal-web`
- `tailwindcss` ^3.4.17 + `autoprefixer` + `postcss` - portal-web styling pipeline

## Configuration

**Environment:**
- `.env.example` present at repo root (contents not read — see forbidden-files policy); real secrets are expected to live in a git-ignored `.env`
- Config precedence in code is generally: explicit function argument → `bb.config.jsonc` value → environment variable → hardcoded default (e.g. `packages/agent/src/generate.ts` `createLlm()`)
- Key env vars consumed directly in code: `ANTHROPIC_API_KEY`, `BB_LLM_MODEL`, `ANTHROPIC_VERTEX_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT`, `CLOUD_ML_REGION`, `ANTHROPIC_VERTEX_REGION`, `GOOGLE_APPLICATION_CREDENTIALS`, `PORTAL_TOKEN`, `BB_LOG_LEVEL`, `BB_BASE_URL`

**Build:**
- `tsconfig.base.json` - shared strict TS compiler options (target `ES2022`, `module`/`moduleResolution` `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, declarations + source maps enabled); each package's `tsconfig.json` extends this
- `turbo.json` - defines `build` (outputs `dist/**`, depends on upstream `^build`), `typecheck`, `test` (both depend on `^build`), and `clean` (uncached) pipeline tasks
- `bb.config.jsonc` - application-level runtime configuration (not a build tool config): recorder behavior, redaction rules, agent LLM provider selection, and named test environments (`staging`, `preprod`). Loaded by `@backbencher/shared` and validated with Zod schemas in `packages/shared/src/config.ts`
- `biome.json` - lint/format rules, ignores `dist`, `node_modules`, `data`, `recordings`, `.turbo`, `coverage`

## Platform Requirements

**Development:**
- pnpm-based monorepo; `pnpm install` at root resolves all workspace packages
- Playwright requires its browser binaries to be installed separately (not automated in any script found)
- SQLite (via `better-sqlite3` native bindings) requires a compatible Node ABI/platform build

**Production:**
- `packages/portal-api` is the deployable server: builds `portal-web` as a static bundle and serves it via `@fastify/static`, exposing tRPC at `/trpc` and a `/health` endpoint
- Data persists to a local SQLite file (`data/backbencher.db` by default, path resolved via `dataDir()` in `@backbencher/shared`) and to on-disk session recordings under `data/sessions/`
- No containerization (Dockerfile), CI workflow, or cloud deployment manifest found in the repo

---

*Stack analysis: 2026-08-14*
