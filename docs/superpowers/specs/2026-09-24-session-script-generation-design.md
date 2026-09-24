# Generate a deterministic automation script from a curated session

Date: 2026-09-24
Status: approved, not yet implemented

## Problem

Today the only path from "recorded usage" to a runnable `TestSpec` is Compose: an analyst writes a
free-text goal, the LLM retrieves candidate Operations and proposes a `Composition`, the analyst
approves it with a `TestDecision`, and `agent.generate` prompts the model again to write `TestSpec`
YAML.

But a curated Session — one the analyst has already reduced to just the Calls that matter, via the
delete/save flow in the session dependency graph — already *is* a complete, real execution of some
flow: every Call, its real request/response data, and the exact producer→consumer edges between
Calls (`sessionGraph.ts`'s `SessionCallEdge[]`) are already derived, deterministically, with no
model involved. Going through the LLM a second time to redescribe something that was already
observed in full fidelity is unnecessary work and an unnecessary source of drift from what actually
happened.

This spec adds a second, deterministic way to arrive at the same `Composition` → `TestSpec`
pipeline, sourced from a curated Session instead of a goal.

## Decision

### 1. Schema additions — `packages/schemas/src/knowledge.ts`

Both additive and optional; no migration, no change to any existing goal-based flow.

- `CompositionSchema`: add `sourceSessionId: z.string().optional()`. Set only when a Composition was
  built by this new path. `agent.generate`'s handler branches on its presence: set → deterministic
  generator (§3); unset → today's unchanged LLM path.
- `CompositionStepSchema`: add `sourceCorrelationId: z.string().optional()`. The exact Call this
  step came from. Necessary because a Session can call the same Operation more than once with
  different real data (e.g. two `GET /tickets/{id}` for different tickets) — `operationId` alone
  can't tell those apart at generate-time, so the precise correlationId has to survive from
  propose-time through approval to generation.

`fromSessionIds` (already on `CompositionStepSchema`) is reused as-is, set to `[sessionId]` — its
existing meaning ("provenance: which session showed this") already fits.

### 2. Propose — `packages/agent/src/composeFromSession.ts` (new)

`proposeCompositionFromSession(store, sessionId, actor): Composition`

1. Load the curated Session the same way `sessions.graph` does: `loadCuratedOrRawSession(dir)` →
   `pairCalls()` → filter `isAssetLikeCall`, sorted by `requestTimestamp`.
2. Resolve each surviving Call's `operationId` via the session's persisted `Flow` (same
   `opByCorrelation` lookup `sessions.graph` already builds). **Any Call with no resolved
   `operationId` blocks generation outright** — return/throw listing the offending correlationIds
   and paths, rather than silently dropping them. An incomplete flow (e.g. missing an auth step)
   is worse than an explicit stop; this mirrors CONTEXT.md's `Gap` philosophy — recorded, not
   invented. The analyst's recourse is the existing delete-in-graph flow (exclude the call) or
   `bb derive` (if it's a classification miss).
3. Build one `CompositionStep` per surviving Call, in order: `operationId`, `sourceCorrelationId`,
   `fromSessionIds: [sessionId]`, `intent` deterministically as `${method} ${pathname}` (or the
   Operation's `does` annotation when present), `satisfies: []`, `autoAdded: false`.
4. Build the `Composition`: `goal` ← the Session's own `meta.goal` (already exactly this — "the
   analyst's plain-language statement of what a Session ... is for"), `sourceSessionId: sessionId`,
   `status: "draft"`, `modelInfo` left unset (nothing to record — no model ran), `rationale` ←
   `"Replayed from session ${sessionId}: ${meta.name}"`, `createdBy: actor`.
5. Persist via `store.compositions.upsert()`, append an audit entry (`action: "compose.fromSession"`),
   return it.

### 3. Generate — `packages/agent/src/generateFromSession.ts` (new)

`generateTestSpecFromSession(store, compositionId): { specId, valid, errors }`, called by
`agent.generate`'s existing handler instead of the LLM path when `composition.sourceSessionId` is
set. Mirrors `generateTestSpec`'s existing return shape and `status: "invalid"` terminal state, so
`agent.generate`'s router procedure and the portal-web Specs screen need no changes.

For each approved step, re-fetch its exact Call by `sourceCorrelationId` (not just "some instance of
this operationId") and the Session's `SessionCallEdge[]` (this time **with** `value`, unlike the
graph screen's trimmed payload — needed to match edges against real request field values):

- **`request.pathParams`/`query`**: read straight off the real captured URL, matched against the
  Operation's `pathTemplate.params` positions.
- **`request.headers`**: **not copied verbatim.** Only a header resolved via an edge (e.g. an
  `Authorization` token sourced from an earlier login step's `extract`) is included. ADR-0006
  captures headers verbatim including live credentials; baking an unresolved captured cookie or
  static bearer token into a shareable `TestSpec` file would leak a real credential. A static
  credential the graph can't explain is dropped, not hardcoded — the analyst adds it by hand (via
  the existing `specs.updateYaml`) if a run then fails on missing auth.
- **`request.body`**: walk every JSON leaf (reusing `derive`'s existing `walkScalars`). Where a
  `SessionCallEdge` says this exact value came from an earlier step in this Composition, replace it
  with `{{steps.<id>.extract.<var>}}` and add a matching `extract` entry on the producing step.
  Where the field is flagged `clientGenerated` for this Operation (already computed by
  `computeDependencyGraph`), replace it with `{{faker.uuid}}` instead of a hardcoded literal, so
  replay doesn't reuse a stale id. Otherwise, leave the real captured literal as-is (static/
  structural request data that doesn't vary).
- **`extract`**: for each edge where this Call is the producer and the consuming step is also in
  this Composition, emit one `extract` entry (`varName` derived from the JSONPath's last segment,
  de-duplicated on collision).
- **`expect.status`**: the Call's real observed status. **`expect.schemaConformance`: `true`**.
  **No `jsonAssertions`** — avoids baking in fragile exact-value assertions against data that will
  differ on replay. **No `poll`** — no signal for polling behavior from a single observed session;
  v1 gap.
- **`cleanup`**: left empty. **No auto-inference from the session** (a same-session
  create→delete-pattern heuristic was considered and rejected for v1 — real new logic, and silent
  no-op for the common case where the analyst didn't happen to undo the write during recording).
  A write-containing session therefore lands as today's existing `"invalid"` terminal state via the
  unchanged `write-implies-cleanup` rule in `validateSpec()` — same manual-repair path a failed LLM
  spec already has: the analyst adds a `cleanup[]` block by hand via `specs.updateYaml`.
- `id`: `step${index}` — stable, unique, ordering-preserving; no attempt at a cleverer name.
- `description`: `${call.method} ${call.pathname}`, or the Operation's `does` annotation when
  present.

Assemble the full `TestSpec` (`version: 1`, fresh `specId`, `title` ← `composition.goal`,
`environment` ← `testDecision.environments[0] ?? "staging"` — same fallback `generateTestSpec`'s
LLM path already uses — `authProfile` ← the Session's own recorded `meta.authProfile` when present,
else `"default"` — a strictly better source than the LLM path has today, since it's an actual
observed value rather than always the literal fallback string — `tags: ["from-session"]`), then run
it through the **existing, unchanged `validateSpec()`** — a free correctness check on this new
generator, and it's what produces the `"invalid"` terminal state for the cleanup gap above. No
repair round-trip (that mechanism is specifically for LLM output); a failure here means the
generator has an actual bug or the write-cleanup gap applies, either way the same human-repair path
already exists.

### 4. Portal wiring

- `portal-api`: new `compose.proposeFromSession` mutation (`{ sessionId }` → `Composition`),
  mirroring `compose.propose`'s shape. `agent.generate`'s existing procedure gets the one-line branch
  described in §3 — no new router entry needed there.
- `portal-web`: a "Generate automation script" button in `SessionGraphModal`'s header, next to the
  existing delete/save controls, calling `compose.proposeFromSession`. On success, route to the
  existing Compose screen — the new draft appears in `compose.drafts` exactly like an LLM-proposed
  one, and review/approve/generate all reuse existing UI unchanged from there.

## Rejected alternatives

- **A standalone artifact, decoupled from `Composition`/`TestSpec` entirely** (considered first):
  cleaner vocabulary (no testing-flavored fields like `schemaConformance`/`riskLevel` in what's
  conceptually "automation," not "testing") but throws away the compiler, runtime, runner, polling/
  retry, `guardEnvironment` safety checks, and the Specs UI — all of it would need rebuilding in
  parallel. Rejected because it also contradicts the explicit requirement below.
- **Skip `compose.approve`/`TestDecision` entirely**, since a session-derived flow is "replaying
  something that already really happened": rejected — it's still the one place the system records
  an explicit human safety decision (risk level, target environments) before something can write
  against a real environment, and there's no reason a real-session origin should bypass that.
- **Auto-infer cleanup from the same session** (§3): more complete when it applies, but real new
  heuristic logic for a case (analyst cleaned up during recording) that's the exception, not the
  rule. Deferred; the manual-repair path already exists and this can be added later without
  changing anything else in this design.

## Testing / verification

- `packages/agent`: unit tests for `proposeCompositionFromSession` and
  `generateTestSpecFromSession` against fixture sessions (`derive/fixtures/sessions.js`, already
  used throughout the suite) — no live LLM or browser needed anywhere in this path. Cover: a
  single-step session, an edge-linked two-step session (extract → template substitution),
  client-generated field substitution, unresolved-header dropping (a captured cookie with no
  producer edge must not appear in the generated spec), the missing-`operationId` refusal, and the
  write-with-no-cleanup → `"invalid"` path.
- `packages/schemas`: round-trip test for the two new optional fields (unset stays backward
  compatible with every existing fixture/persisted Composition).
- `packages/portal-api`: a test for `compose.proposeFromSession` and the `agent.generate` branch,
  following `curation.test.ts`'s existing pattern of writing a fixture session under `dataDir()`
  and cleaning it up in `afterEach` — **not** the pattern `derivation.test.ts` had before its recent
  fix; this new test must scope itself to a fixture sessionId and never touch real data.
- `pnpm -r typecheck` and `pnpm -r build` succeed; `pnpm -r --filter '!@backbencher/recorder' test`
  passes with the new coverage included.
- Manual verification: curate a real session with at least one auth-dependent, multi-step flow
  (e.g. login → create), generate, approve, confirm the resulting spec's `{{steps.*.extract.*}}`
  references resolve correctly and any unresolved static header/cookie is absent from the YAML.
