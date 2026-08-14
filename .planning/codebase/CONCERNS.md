# Codebase Concerns

**Analysis Date:** 2026-08-14

## Tech Debt

**Legacy v1 prototype still in the tree (`src/`):**
- Issue: `src/recorders/recorder.js` (724 lines, plain JS) and `src/filters/filter-api.js` are the pre-rewrite prototype, fully superseded by `packages/recorder` + `packages/derive`. They are dead code but still wired up: the workspace-root `package.json` still declares `"main": "index.js"` (no such file exists) and `record`/`filter` npm scripts that invoke these legacy files directly.
- Files: `src/recorders/recorder.js`, `src/filters/filter-api.js`, `package.json` (`scripts.record`, `scripts.filter`, `main`)
- Impact: Anyone running `npm run record` at the repo root launches the old prototype (TLS-permissive, hardcoded internal `DEFAULT_URL`, no redaction) instead of `bb record`. Confusing for new contributors; risk of accidental use of the insecure path. `docs/TECHNICAL_REPORT.md` documents this old implementation in full detail and can be mistaken for current-state docs if read without also reading `docs/ARCHITECTURE.md`.
- Fix approach: Delete `src/`, remove the `record`/`filter` scripts and stale `main` field from the root `package.json`, and either delete or clearly re-header `docs/TECHNICAL_REPORT.md` as historical-only (it currently has no banner distinguishing it from current docs). `docs/ARCHITECTURE.md` §9/§11 already flags this as "safe to delete, not yet removed."

**Portal API router surface is a single 530-line file:**
- Issue: `packages/portal-api/src/routers.ts` (530 lines) implements all 13 tRPC routers (`sessions`, `derive`, `operations`, `flows`, `scenarios`, `guides`, `dataflow`, `pack`, `specs`, `agent`, `runs`, `security`, `drift`) in one module.
- Files: `packages/portal-api/src/routers.ts`
- Impact: High blast radius for merge conflicts and review; hard to reason about per-domain authorization/validation rules when they're interleaved across unrelated routers in one file.
- Fix approach: Split into one file per router domain (`routers/sessions.ts`, `routers/operations.ts`, etc.) composed into `appRouter`; keep `trpc.ts` context/middleware shared.

**Uncommitted, in-progress changes span multiple packages:**
- Issue: Working tree has modifications to `packages/derive/src/{dataflow.ts,index.ts}`, `packages/portal-api/src/routers.ts`, `packages/portal-web/src/{screens/Sessions.tsx,ui.tsx,package.json}`, `packages/recorder/src/{apiFilter.ts,recorder.ts}`, `packages/schemas/src/{apimodel.ts,index.ts}`, plus untracked new files `packages/derive/src/sessionGraph.ts`, `packages/derive/test/sessionGraph.test.ts`, `packages/portal-web/src/screens/SessionGraph.tsx`, `.github/`, and `AGENTS.md`.
- Files: see `git status` output above
- Impact: A "session graph" feature is mid-flight across derive + portal-web with no corresponding entry in `docs/ARCHITECTURE.md` yet — the architecture doc will drift out of sync with the codebase until this lands and docs are updated.
- Fix approach: Land the session-graph feature behind a completed PR/commit, then update `docs/ARCHITECTURE.md` §2/§5/§6.3 to describe it.

**Root `package.json` identity mismatch:**
- Issue: The workspace-root `package.json` name is still `"project_2"` (v1.0.0) — a leftover from the original prototype — even though the repo is a full pnpm/turbo monorepo named `backbencher`.
- Files: `package.json`
- Impact: Cosmetic/confusing but visible in `pnpm list`, npm registry metadata if ever published, and any tooling that reads root package name.
- Fix approach: Rename to something like `backbencher` or `@backbencher/monorepo`, `private: true`.

**No dedicated unit tests for `packages/schemas`:**
- Issue: `docs/ARCHITECTURE.md` §3 and §10 note "No dedicated schema unit tests; correctness is exercised indirectly via `agent`/`testkit` tests." The package has 6 source files (`recording.ts`, `apimodel.ts`, `knowledge.ts`, `pack.ts`, `testspec.ts`, `index.ts`) but only 1 test file.
- Files: `packages/schemas/src/*.ts`, `packages/schemas/test/`
- Impact: Zod schema edge cases (e.g. discriminated unions in `ApiResponseEventSchema`, `bodyKind`/`bodyTruncated` combinations) are only caught transitively when a consumer happens to exercise that path.
- Fix approach: Add `.safeParse()` round-trip tests per schema, especially for the discriminated event unions and the `-1`/`unavailable` sentinel status codes.

## Known Bugs

**`drift.report` is a hardcoded stub:**
- Symptoms: The portal-api `drift` router and portal-web dashboard plan reference OpenAPI reconciliation and coverage-gap detection, but `driftRouter.report()` returns a hardcoded empty report.
- Files: `packages/portal-api/src/routers.ts` (drift router)
- Trigger: Calling `drift.report` from the portal UI or via tRPC client always returns an empty result regardless of actual drift.
- Workaround: None — feature is not implemented (documented in `docs/ARCHITECTURE.md` §10, item 2).

**`packDiff` is a shallow string-equality diff:**
- Symptoms: `packDiff(a, b)` in the agent package reports "changed: yes/no" per `operationId` by string-comparing serialized payloads rather than a field-level diff.
- Files: `packages/agent/src/pack.ts`
- Trigger: Any knowledge-pack comparison where an operation's schema changed in a small way surfaces as a blunt "changed" flag with no indication of what changed.
- Workaround: Manually inspect both pack JSON files to find the actual delta.

**Client-generated value minting is not JSONPath-aware:**
- Symptoms: `runtime.ts`'s defense-in-depth minting for `clientGeneratedFields` does a flat top-level `randomUUID()` rather than walking nested paths or array indices.
- Files: `packages/testkit/src/runtime.ts`
- Trigger: A client-generated field nested inside a sub-object or array element in the request body will not be correctly re-minted, risking replay of a stale/hallucinated value instead of a fresh one.
- Workaround: None currently; relies on most client-generated fields being top-level.

**Legacy filter pairing bug (dead code, historical only):**
- Symptoms: `src/filters/filter-api.js` pairs `api_request`/`api_response` by exact URL match + `timestamp >=`, which can mis-pair concurrent identical-URL requests (no persisted correlation id in that code path).
- Files: `src/filters/filter-api.js`
- Trigger: Two near-simultaneous requests to the same URL in a legacy recording.
- Workaround: Not applicable to current runtime — `packages/derive/src/pairCalls.ts` uses a persisted `correlationId` and does not have this bug. Only relevant if the legacy script is still invoked (see Tech Debt above).

**Recorder response-body truncation bug (dead code, historical only):**
- Symptoms: `text.startsWith("{") || text.startsWith("[")` operator-precedence bug in the legacy recorder throws on `null`/empty `text`, silently swallowed by a surrounding try/catch, leaving `responseBody` as `null` when the intent was to attempt JSON parsing.
- Files: `src/recorders/recorder.js`
- Trigger: Any API response with an empty body captured by the legacy recorder.
- Workaround: Not applicable to current runtime — `packages/recorder/src/bodyCapture.ts` classifies bodies explicitly (`json|text|binary|empty|unavailable`) and does not share this bug.

## Security Considerations

**Portal API auth is fail-open when `PORTAL_TOKEN` is unset:**
- Risk: `buildServer()`'s `onRequest` hook is `if (!portalToken || req.url === "/health") return;` — if the `PORTAL_TOKEN` env var is not set, **all** tRPC routes (including recording start/stop, spec runs against configured environments, and knowledge-pack export) are served with zero authentication.
- Files: `packages/portal-api/src/server.ts`
- Current mitigation: None — this is a silent default, not a documented opt-out. There's no startup warning/log when the server boots without a token configured.
- Recommendations: Fail fast (refuse to start, or at minimum log a loud warning) when `PORTAL_TOKEN` is unset in non-development contexts; consider requiring the token unconditionally and providing a documented `--dev-no-auth` opt-in instead of implicit fail-open.

**Portal API token comparison is not constant-time:**
- Risk: `provided !== portalToken` is a plain string comparison, theoretically subject to timing side-channels for guessing the shared token.
- Files: `packages/portal-api/src/server.ts`
- Current mitigation: None.
- Recommendations: Use a constant-time comparison (e.g. `crypto.timingSafeEqual` on fixed-length buffers) for the token check.

**Portal API listens on `0.0.0.0` by default:**
- Risk: `startServer()` calls `app.listen({ port, host: "0.0.0.0" })`, binding to all network interfaces rather than localhost by default.
- Files: `packages/portal-api/src/server.ts`
- Current mitigation: The shared-token auth hook (when a token *is* configured) is the only gate; combined with the fail-open issue above, an unconfigured deployment is reachable from the network with no auth.
- Recommendations: Default to `127.0.0.1` and require an explicit flag/env var to bind wider; document the token requirement prominently in the CLI/portal startup output.

**Audit-log actor identity is a self-reported, unauthenticated header:**
- Risk: `createContext` sets `actor: req.headers["x-analyst"] ?? "anonymous"` — any client can claim to be any analyst identity, and this value is what's written to `audit_log` for every portal mutation.
- Files: `packages/portal-api/src/server.ts`, `packages/store` (`audit_log` table)
- Current mitigation: None — there is no per-analyst authentication, only the single shared portal token.
- Recommendations: If per-analyst attribution in the audit log matters for accountability, this needs real per-user auth (e.g. signed session cookies or per-analyst API keys) rather than a client-supplied header.

**Default config still ships internal lab hostnames:**
- Risk: The committed `bb.config.jsonc` bakes in `hostAllowlist: ["*.otxlab.net"]` and `environments` pointing at `te-smax-stg-m.otxlab.net` / `te-smax-preprod-m.otxlab.net` — internal-looking hostnames from the original lab environment this tool was built against.
- Files: `bb.config.jsonc`
- Current mitigation: These are just config defaults, easily overridden per-deployment, and `data/` (recordings/DB) is gitignored so captured traffic itself isn't committed.
- Recommendations: Ship a genuinely generic example config (e.g. `bb.config.example.jsonc`) and keep any lab-specific config as a local, gitignored override, to avoid leaking internal infrastructure naming in a repo that may be shared more broadly.

**Legacy recorder still has TLS/CORS bypassed by design:**
- Risk: `src/recorders/recorder.js` launches Chromium with `--ignore-certificate-errors`, `--disable-web-security`, and `ignoreHTTPSErrors: true`, and its `sanitizeValue()` password-redaction stub is a no-op that's never called — so any invocation of the legacy `npm run record` script captures passwords and other sensitive form values in cleartext.
- Files: `src/recorders/recorder.js`
- Current mitigation: `packages/shared/src/redaction.ts` implements real redaction for the current recorder (`packages/recorder`); the legacy script is unaffected by it.
- Recommendations: Same as Tech Debt above — delete the legacy script and its npm scripts so this code path cannot be invoked at all.

## Performance Bottlenecks

**`probe.ts` replays live requests against real environments:**
- Problem: The optional derive pass in `packages/derive/src/probe.ts` replays idempotent GETs twice against a live environment to improve volatility-mask confidence.
- Files: `packages/derive/src/probe.ts`
- Cause: Necessary to empirically distinguish volatile vs. stable response fields, but every probe run is real network load against whatever environment is targeted.
- Improvement path: Already gated to operations analysts have explicitly marked safe — worth double-checking that gating is enforced at the portal-api boundary too, not just documented convention, and that probe concurrency/rate is bounded for environments with rate limits.

**Quarantine retry is a single blind retry, not idempotency-aware:**
- Problem: `runWithQuarantine` in `packages/testkit/src/runner.ts` retries a failed test exactly once and reclassifies pass-on-retry as `"flaky"`. For non-idempotent write operations, a blind retry can double-write or misclassify a genuinely broken endpoint as merely flaky.
- Files: `packages/testkit/src/runner.ts`
- Cause: Simplicity of the current quarantine model (documented as a known gap in `docs/ARCHITECTURE.md` §10, item 5).
- Improvement path: Make retry idempotency-aware (e.g. skip retry for non-idempotent write steps, or require cleanup to run before retry).

## Fragile Areas

**`packages/agent/src/generate.ts` + `compose.ts` (LLM prompt assembly):**
- Files: `packages/agent/src/generate.ts` (316 lines), `packages/agent/src/compose.ts` (312 lines)
- Why fragile: These assemble the full prompt context (catalog, guides, scenario, dataflow neighbors, strategy-specific guidance) sent to the LLM and parse/validate its YAML output. Prompt-shape changes here directly affect TestSpec generation quality in ways that are hard to regression-test deterministically.
- Safe modification: Run `generate.test.ts` (uses an injectable mocked `LlmComplete`) after any change; be conservative about altering the "never invent operationIds / forward-only step references / write-implies-cleanup" validation rules in `validateSpec()`, since those are the main hallucination guardrails.
- Test coverage: Context assembly, validation, and the one-shot repair loop are covered via mocked LLM in `packages/agent/test/generate.test.ts`; no coverage against a real provider (by design, to keep tests deterministic and offline).

**Portal recording runs inside the API server process:**
- Files: `packages/portal-api/src/routers.ts` (`sessions.startRecording`/`stopRecording`), `packages/recorder`
- Why fragile: `sessions.startRecording` launches a headed Playwright browser from inside the long-running `portal-api` Fastify process rather than out-of-process via the CLI. Documented in `docs/ARCHITECTURE.md` §6.2/§10 as "fine for a single local analyst," but a crash in the browser automation could take down the whole portal server, and it structurally doesn't scale to multi-analyst/hosted deployments.
- Safe modification: Treat any change here as touching both "portal uptime" and "recording correctness" simultaneously; consider isolating recording into a separate worker process before adding more portal features that depend on server uptime.
- Test coverage: Recorder itself has one e2e test (`packages/recorder/test/recorder.e2e.test.ts`); the in-process portal integration path is not separately tested for crash isolation.

**`packages/portal-web` has zero automated test coverage:**
- Files: `packages/portal-web/src/screens/*.tsx` (8 screens, 15 src files total)
- Why fragile: Validated only manually and via `tsc` typecheck (per `docs/ARCHITECTURE.md` §6.3). Screens like `Sessions.tsx` (310 lines) and the in-flight `SessionGraph.tsx` have no regression safety net for UI logic (e.g. recording start/stop state machine, scenario-from-flow prefill).
- Safe modification: Manually exercise the affected screen end-to-end against a running `portal-api` before merging; typecheck alone won't catch runtime/rendering regressions.
- Test coverage: None. Recommend at minimum smoke tests (component renders, basic interaction) before this package grows further.

**`apps/cli` has no dedicated tests:**
- Files: `apps/cli/src/index.ts` (362 lines, all `bb` subcommands)
- Why fragile: Coverage is only indirect, via `packages/portal-api`'s acceptance tests exercising the underlying library functions the CLI calls — the CLI's own argument parsing, lazy-import wiring, and error/exit-code handling are untested.
- Safe modification: Manually smoke-test affected subcommands (`bb record`, `bb derive`, `bb test run`, etc.) after changes to `apps/cli/src/index.ts`.
- Test coverage: None dedicated.

## Scaling Limits

**Single-analyst assumption throughout the portal:**
- Current capacity: Designed and documented as "currently fine for a single local analyst" (`docs/ARCHITECTURE.md` §6.2, §10 item 7).
- Limit: In-process headed-browser recording, a single shared portal token (no per-user identity), and no visible concurrency control on `sessions.startRecording` mean multiple simultaneous analysts/recordings would likely conflict or crash the server.
- Scaling path: Move recording to an out-of-process worker with a queue; add per-analyst auth; add a lock/queue around concurrent recording sessions.

## Dependencies at Risk

**Single LLM provider abstraction (Anthropic direct / Vertex):**
- Risk: `createLlm` in `packages/agent` supports exactly two provider paths (Anthropic direct, Anthropic-on-Vertex). Any provider-side API/schema change affects TestSpec generation across the whole pipeline.
- Impact: A breaking change in either provider's API would block `bb agent generate` / `agent.generate` entirely until the adapter is updated.
- Migration plan: The `LlmComplete` injection point already exists for tests; the same seam could support adding further providers (OpenAI, local models) if needed, but none are wired up today.

## Missing Critical Features

**No free-text "figure out the flow" capability:**
- Problem: `generateTestSpec` requires a pre-existing, human-authored `Scenario` with an explicit `operationId` sequence and per-step `intent`. There is no `proposeScenario(freeTextGoal)`-style function letting the LLM search the catalog/dataflow/past observed flows to synthesize a candidate scenario.
- Blocks: End-to-end "describe what you want tested in English" workflows; all flow discovery today is manual via the `ScenarioBuilder` portal screen or `scenarios.fromFlow`.

**No OpenAPI reconciliation / drift detection:**
- Problem: The original design called for `bb derive --openapi` and a drift report comparing derived operations against a canonical OpenAPI spec; this is not implemented anywhere in `packages/derive`, and the corresponding `drift.report` portal-api router is a hardcoded stub (see Known Bugs above).
- Blocks: Any workflow that wants to reconcile observed/derived API behavior against a spec-of-record, or surface coverage gaps between what's been captured and what the real API surface is.

## Test Coverage Gaps

**`packages/portal-web` (React UI):**
- What's not tested: All 8 screens and shared `ui.tsx` component library — no component or interaction tests.
- Files: `packages/portal-web/src/screens/*.tsx`, `packages/portal-web/src/ui.tsx`
- Risk: UI regressions (broken forms, state machines, data fetching) only surface via manual QA or user reports.
- Priority: Medium — no automated safety net, but the underlying tRPC contracts are type-checked and portal-api itself has acceptance tests.

**`packages/schemas` (Zod contracts):**
- What's not tested: Discriminated-union event schemas (`recording.ts`), operation/dataflow schemas (`apimodel.ts`), and pack/testspec schemas have no direct unit tests — only 1 test file for 6 source files.
- Files: `packages/schemas/src/*.ts`
- Risk: A schema change that subtly breaks parsing of a valid payload (or accepts an invalid one) may only be caught deep in `derive`/`agent`/`testkit` test failures, making root-causing slower.
- Priority: Medium.

**`apps/cli` (bb binary):**
- What's not tested: Subcommand argument parsing, lazy-import wiring, exit codes/error surfaces.
- Files: `apps/cli/src/index.ts`
- Risk: A broken CLI flag or exit-code regression would only be caught by manual testing or a user filing a bug.
- Priority: Low-medium — underlying library logic is covered by other packages' tests, but the CLI wiring itself is not.

**Recorder edge cases:**
- What's not tested: Pending/never-responded request flush behavior (`status: -1` at `stop()`) is implemented but, per `docs/ARCHITECTURE.md` §4, "not exhaustively exercised"; no cross-origin-iframe UI event capture.
- Files: `packages/recorder/src/recorder.ts`
- Risk: Long-running or slow-network sessions with in-flight requests at stop time may produce inconsistent event data untested against real-world timing variance.
- Priority: Low-medium.

---

*Concerns audit: 2026-08-14*
