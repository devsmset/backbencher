# External Integrations

**Analysis Date:** 2026-08-14

## APIs & External Services

**LLM Providers (test generation):**
- Anthropic Claude API - default provider for QA test-spec generation
  - SDK/Client: `@anthropic-ai/sdk` (`createAnthropicLlm` in `packages/agent/src/generate.ts`)
  - Auth: `ANTHROPIC_API_KEY` env var (throws if unset and `agent.provider` is `"anthropic"`)
  - Model override: `agent.model` in `bb.config.jsonc` or `BB_LLM_MODEL` env var
- Anthropic on GCP Vertex AI - alternate provider, selected via `agent.provider: "vertex"` in `bb.config.jsonc`
  - SDK/Client: `@anthropic-ai/vertex-sdk` + `google-auth-library` (`createVertexLlm` in `packages/agent/src/generate.ts`)
  - Auth: GCP service-account credentials via `GOOGLE_APPLICATION_CREDENTIALS` or `agent.vertex.credentialsFile`; project via `agent.vertex.projectId`, `ANTHROPIC_VERTEX_PROJECT_ID`, or `GOOGLE_CLOUD_PROJECT`; region via `agent.vertex.region`, `CLOUD_ML_REGION`, or `ANTHROPIC_VERTEX_REGION` (default `us-east5`)
  - Default model: `claude-3-5-sonnet-v2@20241022`

**Application Under Test (AUT) — not a backbencher dependency, but the system it targets:**
- `bb.config.jsonc` defines named target environments the recorder/tests point at: `staging` (`https://te-smax-stg-m.otxlab.net`, marked `destructive: true`) and `preprod` (`https://te-smax-preprod-m.otxlab.net`, `destructive: false`)
- `recorder.apiFilter.hostAllowlist` scopes recorded traffic to `*.otxlab.net` by default

## Data Storage

**Databases:**
- SQLite (embedded, file-based) via `better-sqlite3`
  - Connection: local file path, default `<dataDir>/backbencher.db` (`defaultDbPath()` in `packages/store/src/db.ts`); no remote DB or connection string
  - Client/ORM: `drizzle-orm/better-sqlite3` (`packages/store/src/db.ts`, schema in `packages/store/src/schema.ts`)
  - Migrations: embedded SQL strings applied idempotently at startup, tracked in a `_migrations` table (`packages/store/src/migrate.ts`)
  - Tables: `sessions`, `operations`, `operation_annotations`, `dataflow_edges`, `observed_flows`, `scenarios`, `analyst_guides` (see `packages/store/src/migrate.ts`)

**File Storage:**
- Local filesystem only — no S3/blob storage integration found
  - Session recordings: `data/sessions/<sessionId>/{events.ndjson,meta.json,summary.json}`
  - Knowledge packs: `data/knowledge-packs/<hash>/{catalog.md,pack.json}`
  - Location resolved via `dataDir()` in `packages/shared/src/index.ts` / `config.ts`

**Caching:**
- None detected

## Authentication & Identity

**Portal API Auth:**
- Custom shared-token scheme, not a third-party identity provider
  - Implementation: `packages/portal-api/src/server.ts` `onRequest` hook checks `x-portal-token` header or `Authorization: Bearer <token>` against the `PORTAL_TOKEN` env var; if `PORTAL_TOKEN` is unset, auth is skipped entirely (open access) except that `/health` is always unauthenticated
  - Actor identity for audit logging: `x-analyst` request header, defaulting to `"anonymous"` (`packages/portal-api/src/routers.ts` context)

**Target-application auth profiles:**
- `bb.config.jsonc` / recorder config supports named `authProfile`s passed to recording/test sessions (e.g. `--profile` CLI flag), used to test authorization boundaries (`security authz` CLI command generates cross-role authz matrices)
- Recorded credentials are redacted, not stored: `redaction.headerDenylist` strips `authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `proxy-authorization`; `redaction.queryParamDenylist` strips `code`, `token`, `access_token`, `id_token`, `session`, `apikey`, `api_key`; `redaction.bodyFieldDenylist` strips `password`, `secret`, `token`, `apiKey`, `clientSecret` (all replaced with `***REDACTED***`, with `keepAuthShape` preserving the auth scheme prefix, e.g. `Bearer ***`)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry/Bugsnag/etc.)

**Logs:**
- `pino` structured logger (`packages/shared/src/logger.ts`), level configurable via `BB_LOG_LEVEL` (default `"info"`); Fastify's own request logging is explicitly disabled (`Fastify({ logger: false })` in `packages/portal-api/src/server.ts`)

## CI/CD & Deployment

**Hosting:**
- Not detected — no Dockerfile, deployment manifest, or hosting config found in the repo

**CI Pipeline:**
- None detected under `.github/` for the application itself (the repo's `.github/` contains only GSD tooling — agents, skills, hooks — not application CI workflows)

## Environment Configuration

**Required env vars (observed in code):**
- `ANTHROPIC_API_KEY` - required when `agent.provider` is `"anthropic"` (default)
- `BB_LLM_MODEL` - optional override of the LLM model name
- `ANTHROPIC_VERTEX_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` - GCP project for Vertex provider
- `CLOUD_ML_REGION` / `ANTHROPIC_VERTEX_REGION` - GCP region for Vertex provider
- `GOOGLE_APPLICATION_CREDENTIALS` - path to a GCP service-account JSON for Vertex provider
- `PORTAL_TOKEN` - shared bearer token for portal-api access control
- `BB_LOG_LEVEL` - pino log level
- `BB_BASE_URL` - base URL injected into compiled Playwright tests (`packages/testkit/src/compiler.ts`)

**Secrets location:**
- `.env.example` exists at repo root as a template (contents intentionally not read/quoted here); no committed `.env` observed
- Vertex credentials may reference an external GCP service-account JSON file path (`agent.vertex.credentialsFile` in `bb.config.jsonc`), which itself must not be committed

## Webhooks & Callbacks

**Incoming:**
- None — `portal-api` exposes only `/health` and `/trpc/*` (tRPC procedures), no public webhook receiver endpoints

**Outgoing:**
- None detected

---

*Integration audit: 2026-08-14*
