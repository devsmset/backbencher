# Testing Patterns

**Analysis Date:** 2026-08-14

## Test Framework

**Runner:**
- Vitest (root devDependency `vitest@^2.1.8`, pinned once at the repo root and hoisted to all workspace packages via pnpm).
- No `vitest.config.ts` exists anywhere in the repo — every package runs on Vitest defaults (Node environment, no custom aliasing/setup files).
- Every package's `test` script is identical: `"test": "vitest run --passWithNoTests"` (`packages/*/package.json`, `apps/cli/package.json`). `--passWithNoTests` lets packages without tests yet (e.g. early-stage ones) still pass CI.

**Assertion Library:**
- Vitest's built-in `expect` (Chai-compatible) — no `jest`, `chai`, or `sinon` imports anywhere.

**Run Commands:**
```bash
pnpm turbo run test           # run tests for every package (respects turbo.json's dependsOn: ["^build"])
pnpm --filter @backbencher/derive test   # run a single package's tests
pnpm --filter @backbencher/agent test -- --watch   # ad-hoc watch mode (vitest supports it; no dedicated script)
```
Turbo's `test` task depends on `^build` (`turbo.json`), so workspace packages are built (producing `dist/`) before dependents' tests run against them.

## Test File Organization

**Location:**
- Not co-located with source. Every package has a sibling `test/` directory at the package root (`packages/<name>/test/`), separate from `packages/<name>/src/`.

**Naming:**
- `<sourceFileBaseName>.test.ts`, one test file per source module: `compose.ts` → `test/compose.test.ts`, `pipeline.ts` → `test/pipeline.test.ts`, `security.ts` → `test/security.test.ts`.
- Real-browser/integration tests use `.e2e.test.ts` (only current example: `packages/recorder/test/recorder.e2e.test.ts`), and are written to auto-skip when the environment can't support them (see below).

**Structure (observed across packages):**
```
packages/<name>/
├── src/
│   └── <module>.ts
├── test/
│   └── <module>.test.ts
└── fixtures/            # optional — shared test fixtures/builders (derive, recorder)
    └── sessions.ts
```
`packages/derive/fixtures/sessions.ts` and `packages/recorder/fixtures/app.ts` hold reusable fixture builders imported by multiple test files in that package; fixtures live outside `test/`, at the package root, not inside it.

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from "vitest";
import { runDerivation } from "../src/pipeline.js";

describe("runDerivation (SSO integration)", () => {
  it("produces operations and a flow with collapsed polling", () => {
    const result = runDerivation([ssoFixture()]);
    expect(result.operations.find((o) => o.pathTemplate.template === "/api/jobs/status")?.observedCount).toBe(3);
  });
});
```
- One top-level `describe` per exported function/behavior under test, named after the function (`describe("proposeScenario", ...)`, `describe("store", ...)`), or a short behavior label for integration-style suites (`describe("runDerivation (SSO integration)", ...)`).
- `it(...)` descriptions are full sentences describing the expected behavior, often citing the acceptance criterion they satisfy: `it("auto-adds login via dependency closure when the LLM proposes only the create-ticket step (guide §6 acceptance check)", ...)`.
- `beforeEach` is used when a suite needs a fresh in-memory store per test (`packages/store/test/store.test.ts` uses `beforeEach(() => { store = openStore(":memory:"); })`); simpler suites just call `openStore(":memory:")` inline per `it`.
- `afterAll` is used for real-resource cleanup only (deleting a session directory on disk in the recorder e2e test).

**Patterns:**
- Setup: local top-of-file helper functions build minimal valid domain objects (`op(...)`, `seed()`, `annotate(...)`), always by constructing every required field on the schema type (no partial/`Partial<T>` builders) — this keeps fixtures type-checked against schema drift.
- Assertion style favors precise, behavior-level checks over snapshot testing — no snapshot tests (`toMatchSnapshot`) were found anywhere in the repo.
- Determinism is explicitly tested where output ordering/hashing matters: `it("is deterministic across runs", () => { const a = JSON.stringify(runDerivation(...)); const b = JSON.stringify(runDerivation(...)); expect(a).toBe(b); })` (`packages/derive/test/pipeline.test.ts`).

## Mocking

**Framework:** None (no `vi.mock`, `jest.mock`, or `sinon` usage found). The codebase avoids module-level mocking entirely.

**Patterns — dependency injection instead of mocking:**
```typescript
// packages/agent/test/compose.test.ts
const fakeLlm: LlmComplete = async () =>
  JSON.stringify({ steps: [{ operationId: "op_create_ticket", intent: "..." }], rationale: "...", candidateGaps: [] });

const result = await proposeScenario(store, "create a ticket from scratch", { llm: fakeLlm, actor: "alice" });
```
```typescript
// packages/testkit/test/runner.test.ts
const http: HttpClient = async () => {
  calls += 1;
  return { status: calls <= 1 ? 500 : 200, headers: {}, body: { ok: true } };
};
const q = await runWithQuarantine(oneStep("flaky"), { baseUrl: "http://x", http, operations });
```
- Every external dependency that would otherwise require mocking (LLM completion calls, outbound HTTP for test execution, the SQLite store) is a typed function/handle injected as a parameter (`LlmComplete`, `HttpClient`) or an in-memory implementation (`openStore(":memory:")` via `better-sqlite3`'s in-memory mode).
- Fastify's `app.inject(...)` is used to test the portal-api HTTP layer without opening a real socket (`packages/portal-api/test/portal.test.ts`).

**What to Mock:**
- Nothing is mocked at the module level. Prefer swapping in a fake implementation of an injected interface (`LlmComplete`, `HttpClient`) or using a real in-memory backend (`:memory:` SQLite store).

**What NOT to Mock:**
- The store: tests always use a real `openStore(":memory:")` instance, never a mocked store — this exercises real SQL/Drizzle behavior including idempotent-replace semantics.
- Schema validation: tests always run real data through `TestSpecSchema.parse(...)` / `BbConfigSchema.parse(...)` rather than stubbing validation.

## Fixtures and Factories

**Test Data:**
```typescript
// packages/derive/fixtures/sessions.ts — shared session fixture used by multiple *.test.ts files
export function ssoFixture(): Session { /* builds a realistic multi-request recorded session */ }
```
```typescript
// Inline per-file factory pattern (repeated in agent/, store/, portal-api/, testkit/ tests)
function op(operationId: string, method: string, template: string, authObserved: Operation["authObserved"]): Operation {
  return { operationId, method, host: "h", pathTemplate: { template, params: [] }, /* ...every Operation field... */ };
}
```

**Location:**
- Cross-test fixtures: `packages/<name>/fixtures/*.ts` (only in `derive` and `recorder`, the two packages whose inputs are complex recorded-session data).
- Single-test-file factories: declared inline at the top of the `.test.ts` file itself, not extracted, when only that file needs them.

## Coverage

**Requirements:** None enforced — no coverage thresholds, no `vitest.config.ts` `coverage` block, and no `coverage` script in any `package.json`. `coverage/` is present only in Biome's ignore list (`biome.json`), implying it's a possible local artifact directory, not a CI gate.

**View Coverage:**
```bash
pnpm --filter <pkg> exec vitest run --coverage   # ad hoc; not wired into any package script
```

## Test Types

**Unit Tests:**
- The overwhelming majority of tests. Pure-function and small-module tests against in-memory/injected dependencies (schema inference, dataflow graph building, redaction, assertion evaluation, CLI arg parsing helpers).

**Integration Tests:**
- Cross-module tests within a single package that exercise a full pipeline against realistic fixture data without any test doubles: `packages/derive/test/pipeline.test.ts` (`runDerivation` over a full fixture session), `packages/portal-api/test/portal.test.ts` (full tRPC router + Fastify server via `caller`/`app.inject`), `packages/store/test/store.test.ts` (real SQLite round-trips).

**E2E Tests:**
- Playwright, used only in `packages/recorder/test/recorder.e2e.test.ts`, driving a real Chromium browser against a local fixture app (`packages/recorder/fixtures/app.ts`) to verify recorded events are schema-valid and secrets never leak to disk.
- E2E tests self-skip when no browser is installed, rather than failing CI:
  ```typescript
  const hasBrowser = (() => {
    try { return existsSync(chromium.executablePath()); } catch { return false; }
  })();
  const suite = hasBrowser ? describe : describe.skip;
  suite("recorder e2e", () => { /* ... */ });
  ```
- E2E tests use an explicit longer timeout (`}, 60000);` on the `it` call) instead of a global test timeout config.

## Common Patterns

**Async Testing:**
```typescript
it("enforces the shared-token auth hook", async () => {
  const { app } = buildServer({ store, portalToken: "secret", config: BbConfigSchema.parse({}) });
  const unauthorized = await app.inject({ method: "POST", url: "/trpc/pack.build" });
  expect(unauthorized.statusCode).toBe(401);
  await app.close();
  store.close();
});
```
- Resources opened in a test (`openStore`, `buildServer`/`app`) are explicitly closed at the end of the same test (`store.close()`, `await app.close()`) rather than relying on a shared `afterEach`.

**Error/negative-path Testing:**
```typescript
it("marks a consistent failure as failed", async () => {
  const http: HttpClient = async () => ({ status: 500, headers: {}, body: {} });
  const q = await runWithQuarantine(oneStep("fail"), { baseUrl: "http://x", http, operations });
  expect(q.status).toBe("failed");
});
```
- Negative/failure paths are tested by constructing an injected fake that deterministically returns the failure condition (HTTP 500, missing auth token, unmet dependency), not by monkey-patching internals.

---

*Testing analysis: 2026-08-14*
