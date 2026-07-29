# Backbencher — Realignment Guide (vision-aligned architecture)

**Read this alongside the current-implementation doc (2026-07-28).** This document redefines the
product around the owner's actual vision and tells a coding agent exactly what to **keep**, **strip**,
and **build**. Where it contradicts the current build, this document wins.

## 0. The vision in one paragraph

An analyst records **sessions** — pure timestamped API request/response sequences, no UI events. From
sessions, the system extracts a **catalog** of unique endpoints. A human gives each catalog endpoint
light meta (a name and a one-line "what it does"); that annotation is stored **once** and referenced
everywhere the endpoint appears. Analysts record more and more scenarios; the catalog fills in over
time. Once the corpus is rich enough, an analyst types a **free-text goal** ("create a ticket from
scratch") and an **LLM composes a new scenario** by selecting and ordering individual endpoints from
the catalog — learning from existing scenarios as worked examples. The output is a **draft scenario a
human approves** before anything is tested. The human never hand-picks the endpoint list; that is the
LLM's job.

## 1. The critical reframe: this is retrieval + composition, not "training"

The owner's phrase "training then using the trained data" describes **retrieval-augmented composition
(RAG + few-shot)**, not model fine-tuning. Concretely:

- The "trained data" = the growing corpus of annotated catalog endpoints + approved scenarios, sitting
  in the database.
- "Using it" = at composition time, retrieve the relevant slice of that corpus and place it in the
  LLM's context window as (a) a candidate endpoint pool and (b) example scenarios, then ask the LLM to
  select + order.
- "Enough scenarios" = enough **retrieval coverage** (every endpoint appears in ≥1 annotated,
  approved scenario) and enough **compositional examples** near any new goal — NOT a training-set size
  threshold. There is no offline training step, no ML infrastructure. Quality rises monotonically as
  the corpus grows and is fully inspectable at every step.

This is load-bearing. It means the "compose a new scenario" feature is a **prompt-assembly + retrieval
+ validation** problem, and it can ship the day you have a handful of good scenarios.

## 2. Reconciliation — keep / strip / build

The current build is a contract-testing pipeline. The vision is a scenario-composition system. Large
parts are directly reusable; the heavy UI-and-testing machinery is out of scope for the core loop.

| Current component | Verdict | Why |
|---|---|---|
| `packages/recorder` (Playwright capture) | **KEEP, simplify** | Drop all UI-event capture, popups, locators, in-browser instrumentation, redaction-of-UI-values. Keep network capture, correlationId pairing, NDJSON streaming, body capture, network redaction. See §3. |
| `ui_event`/`navigation`/`popup`/`marker` events, injected script, `exposeBinding` | **STRIP** | Vision says API-only sessions. This deletes the single largest chunk of recorder complexity and the vestigial locator code the current doc already flags. |
| `derive` → `pairCalls`, `templatize`, `operationId`, `inferSchemas` | **KEEP** | This is exactly how raw request/response pairs become a deduplicated catalog of unique endpoints. |
| `derive` → `dataflow` | **KEEP + PROMOTE** | Reframed from "testing detail" to the **dependency engine** that validates and auto-completes LLM compositions (§5). This is the keystone reuse. |
| `derive` → `volatile`, `probe` | **KEEP but defer** | Only needed once you generate/run tests. Not part of the compose loop. |
| `operations` table + `operation_annotations` | **KEEP, relabel** | This *is* the catalog + its meta. Reference model already correct (annotation stored once, merged at read). Trim annotation fields to the minimal set (§4). |
| `store` merge rule (`mergeOperation`) | **KEEP** | Already implements "annotate once, reflects everywhere" via read-time join. Exactly the vision's "reflect in the sessions as well." |
| `ScenarioSchema` + `scenarios.fromFlow` + ScenarioBuilder UI | **REPLACE** | Human no longer assembles scenarios by picking flows. Scenarios are now (a) recorded-and-named, or (b) LLM-composed drafts. See §6. |
| `agent.generateTestSpec` (needs pre-made scenario) | **KEEP downstream** | Still valid *after* composition + approval. It's the "turn approved scenario into a test" step, which your Q4 answer explicitly wants to reuse. |
| **NEW: composition engine** (`proposeScenario(freeTextGoal)`) | **BUILD** | The heart of the vision and gap #1 in the current doc. Retrieval + LLM select/order + dependency validation + human approval. §6. |
| **NEW: embedding index** over catalog + scenarios | **BUILD** | Powers retrieval for composition. §6.2. |
| `testkit` (compiler, runner, security, quarantine) | **KEEP, unchanged** | Downstream of approval; out of scope for realignment but not removed. |
| Portal screens: Sessions, Catalog, OperationDetail | **KEEP, adjust** | Sessions viewer becomes API-only. Catalog/detail become the annotation surface. |
| Portal screens: ScenarioBuilder | **REPLACE with Compose** | New screen: type goal → review draft → approve. §7. |
| `drift`, `packDiff`, authz/bola | **LEAVE as-is** | Orthogonal to the compose loop. |

**Net:** you are deleting recorder UI-instrumentation, replacing the manual scenario builder, and
building two new things (embedding retrieval + composition engine). Everything in the derive/catalog/
dependency spine is reused.

## 3. Sessions — API-only capture (`packages/recorder`)

A **session** = `{ meta, calls: ApiCall[] }` where each `ApiCall` is a paired request/response with a
timestamp. No events, no UI, no popups, no markers.

### 3.1 Recorder changes

- Remove: `injected/instrument.ts` and its bundling, `context.exposeBinding("__bbLogUiEvent")`,
  `UiEventSchema`/`NavigationEventSchema`/`PopupEventSchema`/`MarkerEventSchema`, all locator code,
  in-browser UI redaction, `addMarker`, the 3s auto-intent join.
- Keep: headed Chromium (analyst drives the real app), `context.on("request"|"response"|"requestfailed")`,
  `correlationId` pairing, `bodyCapture` (eager read, cap, classify), **network** redaction
  (headers/url/body denylists), NDJSON streaming via `WriteQueue`, `apiFilter`.
- The recorder now emits, per captured call, a single paired record once the response (or failure)
  arrives — no separate request/response event lines needed on disk, though you may keep them
  internally and pair at write time.

### 3.2 Session on-disk + schema (`schemas/session.ts`, replaces `recording.ts`)

```ts
export const ApiCallSchema = z.object({
  callId: z.string(),               // ulid, unique within session, preserves order
  ts: z.number().int(),             // epoch ms at request start — the "timestamped" requirement
  method: z.string(),
  url: z.string(),                  // redacted
  host: z.string(),
  path: z.string(),
  query: z.record(z.string()).default({}),   // redacted
  reqHeaders: z.record(z.string()),          // redacted
  reqBody: z.unknown().nullable(),           // parsed JSON | capped text | null, redacted
  status: z.number().int(),                  // 0/-1 sentinels retained for failed/pending
  resHeaders: z.record(z.string()),
  resBody: z.unknown().nullable(),
  bodyKind: z.enum(["json","text","binary","empty","unavailable"]),
  durationMs: z.number().int().optional(),
});

export const SessionMetaSchema = z.object({
  version: z.literal(3),
  sessionId: z.string(),
  name: z.string(),                 // analyst names the session = the scenario it represents
  goal: z.string().optional(),      // free-text: "login and land on homepage"
  startUrl: z.string().url(),
  authProfile: z.string().optional(),
  recordedAt: z.number().int(),
  callCount: z.number().int(),
});

export const SessionSchema = z.object({ meta: SessionMetaSchema, calls: z.array(ApiCallSchema) });
```

A recorded session is *itself* a scenario (a "known-good" one). Give the analyst a name+goal prompt at
`stop()`. These named recorded sessions become the **few-shot examples** the composition engine learns
from, so capturing the human's intent name here is high-value and nearly free.

## 4. Catalog & annotation — minimal meta, reference model

The catalog is the set of **unique endpoints** across all sessions. One catalog row per
`operationId` (= `sha1(method + host + template)`), produced by the existing
`templatize`/`operationId`/`inferSchemas` passes. Sessions reference endpoints by `operationId`; they
never copy annotations. "Reflects everywhere" = a read-time join, already implemented by
`mergeOperation`.

### 4.1 Annotation schema (trimmed — `knowledge.ts`)

Per the owner: keep it minimal, derive dependencies. So the **human** provides only:

```ts
export const CatalogAnnotationSchema = z.object({
  operationId: z.string(),
  name: z.string(),                 // "Create Ticket"   — REQUIRED for a "ready" endpoint
  does: z.string(),                 // "Creates a support ticket in the current org" — REQUIRED
  // everything below is optional, still light, genuinely useful for composition quality:
  productArea: z.string().optional(),   // "Ticketing" — cheap, sharply improves retrieval grouping
  sideEffect: z.enum(["read","create","update","delete","auth","unknown"]).optional(),
                                        // 1-click for the analyst; lets the composer reason about
                                        // ordering & destructiveness without extra prose
  reviewState: z.enum(["unannotated","ready","ignored"]).default("unannotated"),
  updatedBy: z.string(), updatedAt: z.number().int(),
});
```

That's the whole human surface: **name, does, (optional) area, (optional) read/write kind.** No
prerequisites, no produces/consumes — those are derived (§5). `sideEffect` is the one addition worth
pushing because it's a single click and it's the difference between the composer knowing "login is a
prerequisite-ish auth step" vs "delete is dangerous and should be last / cleaned up." If the owner
wants it truly minimal, `productArea` and `sideEffect` can both be optional and even auto-suggested by
a cheap LLM pass for the analyst to accept.

### 4.2 Catalog readiness

An endpoint is `ready` when it has `name` + `does`. The composition engine may only select `ready`
endpoints (or explicitly flag when it wants an `unannotated` one, prompting the analyst to annotate).
This creates the natural "catalog fills in over time" loop: compose surfaces gaps, analyst annotates,
next compose is smarter.

## 5. Dependency derivation — the reused dataflow, promoted to keystone

The owner said dependencies (auth tokens, ids) must be **derived, not annotated**. The current
`dataflow` pass already does the hard part: it finds, per session, that a value produced by response A
is later consumed by request B. We upgrade it from **per-session, value-exact edges** to a
**catalog-level dependency graph** that the composer can reason over.

### 5.1 From value-edges to typed dependency edges

The existing `dataflow` emits edges like:
`producer(callId=a, jsonPath=$.token) → consumer(callId=b, header=Authorization)` for one session.

Aggregate these across all sessions into **catalog dependency edges** keyed by `operationId`, not
`callId`:

```ts
export const CatalogDependencyEdgeSchema = z.object({
  producerOp: z.string(),           // operationId that yields the value
  producerPath: z.string(),         // "$.token", "$.data.id"
  consumerOp: z.string(),           // operationId that needs it
  consumerSlot: z.object({          // where it's needed
    location: z.enum(["path","query","header","body"]),
    path: z.string(),               // "Authorization", "$.orgId", path param name
  }),
  role: z.string().optional(),      // inferred semantic role: "auth-token" | "resource-id:ticket" | ...
  evidenceSessions: z.number().int(),   // in how many sessions this producer→consumer was observed
  confidence: z.enum(["strong","weak"]),// strong = high-entropy value + evidence≥2
});
```

Plus, per operation:
```ts
export const OperationDependencySchema = z.object({
  operationId: z.string(),
  requires: z.array(CatalogDependencyEdgeSchema.pick({ consumerSlot: true, role: true })
              .extend({ satisfiableBy: z.array(z.string()) })),  // producerOps that can satisfy each slot
  produces: z.array(z.object({ path: z.string(), role: z.string().optional() })),
  clientGenerated: z.array(z.string()),   // slots needing fresh-minted values, no producer (idempotency keys)
  authRequired: z.boolean(),               // derived: consumes an auth-token role in ≥1 session
});
```

### 5.2 Role inference (light, deterministic + one cheap LLM pass)

Assign semantic `role`s so the composer reasons about *kinds* of dependencies, not raw JSON paths:

- **auth-token**: value flows into an `Authorization` header or a cookie, OR the producer op's
  `sideEffect === "auth"`. This alone gives you "every write endpoint requires the login endpoint" for
  free — exactly the owner's login→create-ticket example.
- **resource-id:<area>**: value is a path/id param consumed by same-area ops; name the role from the
  producing op's `productArea` or `name` ("resource-id:ticket").
- Everything else: `role = undefined`, still usable as an exact producer→consumer edge.

Determinism first (header/cookie/path-param heuristics); optionally one cheap LLM call to label
ambiguous roles from `name`+`does`, cached per operationId. Never block composition on it.

### 5.3 What this buys the composer

The dependency graph turns composition from "hope the LLM orders things right" into a **checkable
constraint problem**: any proposed endpoint list is valid only if every endpoint's `requires` slots are
satisfied by an earlier endpoint's `produces` (or by `clientGenerated` minting, or by env/auth
config). This is the mechanism that lets the LLM pick + order freely while the machine guarantees the
result is runnable. See §6.4.

## 6. The composition engine (`packages/agent`, new `compose.ts`) — the heart

Input: a free-text goal + optional auth profile/environment. Output: a **draft scenario** (ordered
endpoint list with per-step intent) for human approval. The human never picks endpoints.

### 6.1 Data model for a composed scenario

```ts
export const ComposedScenarioSchema = z.object({
  scenarioId: z.string(),
  goal: z.string(),                 // the analyst's free text
  status: z.enum(["draft","approved","rejected"]).default("draft"),
  origin: z.literal("composed"),    // vs "recorded"
  steps: z.array(z.object({
    order: z.number().int(),
    operationId: z.string(),
    intent: z.string(),             // LLM's one-line why-this-step, in the goal's terms
    satisfies: z.array(z.string()).default([]),  // which downstream requires-slots this step feeds
    fromExampleScenarioIds: z.array(z.string()).default([]), // provenance: where the LLM saw this used
  })),
  unmetDependencies: z.array(z.object({          // surfaced to the human, not hidden
    operationId: z.string(), slot: z.string(), note: z.string(),
  })).default([]),
  candidateGaps: z.array(z.object({              // goal seems to need an endpoint not in catalog / unannotated
    description: z.string(), suggestedName: z.string().optional(),
  })).default([]),
  rationale: z.string(),            // LLM's short narrative of the composed flow
  modelInfo: z.object({ model: z.string(), packHash: z.string(), promptHash: z.string() }),
  createdBy: z.string(), createdAt: z.number().int(),
});
```

### 6.2 Retrieval (build the candidate pool + few-shot examples)

Do not put the whole catalog in the prompt once it's large. Retrieve:

1. **Embedding index** (`packages/agent/embed.ts`): embed each `ready` catalog endpoint as
   `"{name}. {does}. [{productArea}] {method} {template}"` and each recorded/approved scenario as
   `"{name}. {goal}. steps: {endpoint names joined}"`. Store vectors in the DB (SQLite + a vector
   extension like `sqlite-vec`, or a flat cosine scan — the corpus is small; a brute-force top-K over a
   few thousand rows is fine and dependency-free). Re-embed on annotation change.
2. For a goal, retrieve **top-K scenarios** (few-shot compositional examples) and **top-M endpoints**
   (candidate pool). Then **expand the pool by dependency closure**: for every candidate endpoint, pull
   in its `requires.satisfiableBy` producers transitively (so if create-ticket is a candidate, login is
   automatically in the pool even if the goal text doesn't mention auth). This closure step is what
   makes "from scratch" work — the goal never says "log in first," but the dependency graph does.

### 6.3 The composition prompt (assembled server-side)

```
[system]  You compose an ordered API scenario from a catalog to achieve a goal.
          HARD RULES: choose only from the provided candidate endpoints (by operationId);
          never invent an operationId; output the ordered list + per-step intent as JSON;
          if the goal needs a capability absent from candidates, add it to candidateGaps
          instead of inventing an endpoint; you may rely on dependency info to order steps.
[user]
  GOAL: "create a ticket from scratch"
  CANDIDATE ENDPOINTS (retrieved + dependency-closure):
    <operationId> {name} — {does} [{area}] {method} {template}
      requires: [auth-token, ...]   produces: [resource-id:ticket, ...]   sideEffect: create
    ... (M + closure endpoints, one compact block each)
  EXAMPLE SCENARIOS (how endpoints have been composed before):
    "Login and go to homepage": [login, getProfile, getHomeFeed]
    "Create ticket from homepage": [getHomeFeed, createTicket, getTicket]
    ... (top-K, endpoint names + order only — compact)
  DEPENDENCY FACTS (authoritative, machine-derived):
    createTicket requires auth-token (satisfiableBy: login)
    getTicket requires resource-id:ticket (satisfiableBy: createTicket)
    ...
  TASK: produce ComposedScenario JSON: ordered steps (operationId + intent),
        rationale, and any candidateGaps.
```

Note the division of labor: **examples teach composition patterns**, **dependency facts are
authoritative constraints**. The LLM proposes; §6.4 verifies against the same dependency facts
deterministically.

### 6.4 Dependency validation + auto-completion (deterministic, post-LLM)

This is where derived dependencies earn their keep. Given the LLM's ordered step list:

```
for each step S in order:
  for each slot in requires(S.operationId):
    satisfied if:
       - some earlier step's produces covers the slot's role/edge, OR
       - slot is clientGenerated (mint fresh at test time), OR
       - slot is provided by auth/env config (e.g. static token profile)
    else:
       attempt AUTO-COMPLETE: if exactly one high-confidence producer op satisfies the slot,
         insert it at the earliest valid position (respecting ITS requires, recursively);
         record it in steps with intent="(auto-added dependency)".
       if ambiguous or none: record in unmetDependencies for the human.
```

- After auto-completion, **topologically re-order** so every producer precedes its consumer; if the
  LLM's order already respects dependencies, leave it (it usually reflects real product flow better
  than a raw topo sort).
- The result is a draft that is *dependency-consistent by construction*, or that explicitly lists what
  couldn't be satisfied. No silent guesses.

One repair round-trip is allowed: if validation finds unsatisfiable slots the LLM might fix by picking
a different endpoint, append the failures and ask once more (same pattern as the existing
`validateSpec` repair loop). Then hand to the human regardless.

### 6.5 Human approval → downstream

The draft renders in the portal (§7). On **approve**, the composed scenario becomes a first-class
`Scenario` and flows into the *existing, unchanged* pipeline: `agent.generateTestSpec` → `testkit`
compiler → runner. Your Q4 answer ("draft a human approves") + Q's implied reuse are satisfied without
touching downstream code. Rejected drafts are kept for audit and as negative signal.

## 7. Portal changes

- **Sessions** screen: strip UI-event timeline; render the API-call list (method, path, status,
  timing, expandable req/res). Add name+goal capture at stop.
- **Catalog** + **Endpoint detail**: the annotation surface. Detail shows human meta (name/does/area/
  sideEffect) **and** the derived dependency panel (requires/produces/auth-required) read-only, so the
  analyst sees what the machine inferred. Add a "suggest annotation" button (cheap LLM pass fills
  name/does/area from the endpoint's observed shape for the analyst to accept/edit).
- **Replace ScenarioBuilder with Compose**: a single input ("Describe the scenario") → calls
  `compose` → shows the draft as an ordered, editable list with per-step intent, provenance chips
  ("seen in: Create ticket from homepage"), an **auto-added-dependency** badge on inserted steps, an
  **unmet dependencies** panel, and a **gaps** panel linking to un-annotated endpoints. Buttons:
  Approve / Reject / regenerate. The analyst may reorder or drop steps but does not author from a blank
  list — composition is the LLM's job; the human curates.
- **Scenarios** list: shows both `recorded` and `composed` scenarios; recorded ones double as the
  example corpus, so surface their quality (they're the teachers).


## 8. "Enough scenarios" — making the corpus measurably ready

Since this is retrieval, not training, "enough" is a coverage question you can measure and show on the
dashboard:

- **Annotation coverage**: % of catalog endpoints with `reviewState = ready`. Composition can only
  select ready endpoints, so this is the primary gate.
- **Example coverage**: % of ready endpoints that appear in ≥1 approved/recorded scenario. Endpoints
  never seen in any scenario are hard for the LLM to place — flag them.
- **Dependency resolvability**: % of endpoints whose every `requires` slot has ≥1 known producer in
  the catalog. Low here → compositions will hit `unmetDependencies`.
- **Goal rehearsal**: keep a set of held-out goals; periodically run `compose` and measure how often
  the draft validates with zero unmet dependencies and zero gaps. This is your real "is the corpus
  good enough" signal, and it improves visibly as analysts add scenarios.

There is no magic number. The system is useful at ~10 well-annotated scenarios and keeps getting
better; the dashboard tells the analyst where the next recording session would help most (e.g. "these 6
endpoints are ready but never appear in a scenario").

## 9. Implementation plan (phased, for a coding agent)

Each phase: `pnpm build && pnpm test && pnpm typecheck` green + the stated acceptance check. Reuse
existing code aggressively — most phases are *edits*, not greenfield.

**Phase 1 — Strip UI from capture.** Remove injected script, UI/nav/popup/marker schemas & events,
locators, UI redaction, exposeBinding. Introduce `SessionSchema` v3 (paired `ApiCall[]`). Update
`loadSessions`/`pairCalls` to read the new shape (pairing is now trivial — calls are pre-paired).
*Accept:* record a session against the fixture app; output is a clean ordered `ApiCall[]` with zero UI
artifacts; a typed password in a login form never appears in any stored body/header.

**Phase 2 — Catalog & minimal annotation.** Trim `operation_annotations` to `{name, does, productArea?,
sideEffect?, reviewState}`. Keep `mergeOperation` read-time join. Add "suggest annotation" cheap-LLM
endpoint. Portal: Catalog + Endpoint detail annotation surface. *Accept:* annotate an endpoint once;
every session referencing it shows the name via join; nothing is copied.

**Phase 3 — Dependency graph.** Upgrade `dataflow` output into `CatalogDependencyEdge` +
`OperationDependency` (aggregate per operationId, add role inference §5.2, mark `clientGenerated` and
`authRequired`). Persist. Portal: read-only dependency panel on endpoint detail. *Accept:* on a corpus
containing login + a write endpoint, the write endpoint's `requires` lists an `auth-token` slot
`satisfiableBy` login, derived with no human input.

**Phase 4 — Embedding retrieval.** `embed.ts`: embed ready endpoints + scenarios, store vectors,
brute-force top-K cosine (no external vector DB yet). Re-embed on annotation change. *Accept:* querying
"create a ticket" returns ticket-related endpoints and the create-ticket scenario in top results.

**Phase 5 — Composition engine.** `compose.ts`: retrieval → dependency closure → prompt assembly →
LLM select/order (JSON out, injectable `LlmComplete` like the current agent) → deterministic dependency
validation + auto-completion + topo-reorder → one repair round-trip → `ComposedScenario` draft. Persist
as `draft`. *Accept:* with login/homepage and create-ticket-from-homepage in the corpus, goal "create a
ticket from scratch" yields a draft that includes login (auto-added via dependency closure) → homepage
→ createTicket, ordered dependency-consistently, with provenance chips.

**Phase 6 — Compose portal screen + approval.** Replace ScenarioBuilder. Draft review UI (§7),
Approve→becomes `Scenario`→existing `generateTestSpec` path. *Accept:* analyst types a goal, reviews,
approves; a TestSpec is generated by the untouched downstream.

**Phase 7 — Coverage dashboard.** The four metrics of §8 + goal-rehearsal harness.

## 10. Gotchas specific to this design

1. **The dependency graph is only as good as the corpus.** If login was never recorded in the same
   session as a value it produces being consumed, the `auth-token` edge won't exist. Mitigation: role
   inference via header/cookie/`sideEffect:auth` heuristics (§5.2) catches auth even from a single
   session; and dependency closure only helps if the producer is in the catalog at all. Surface
   `authRequired` endpoints with no known producer as a coverage gap.

2. **Under-templatization poisons dependency roles.** If `/tickets/{id}` wasn't templatized, each id is
   a separate operation and produces/consumes edges fragment. Keep the existing conservative
   templatization + the portal `merge` action; dependency derivation must re-run after a merge.

3. **The LLM will occasionally pick a plausible-but-unobserved endpoint order.** That's fine — the
   deterministic validator is the safety net. Never let the LLM's order ship unchecked; always run
   §6.4. Conversely, don't let a naive topo sort *override* a valid LLM order — real product flows
   carry information a topo sort loses (e.g. a GET-homepage between login and create that isn't a hard
   dependency but reflects real usage).

4. **Retrieval scope, not context size, is the quality lever.** If a composition's prompt exceeds a few
   thousand tokens of candidates, retrieval is too loose. Tighten top-M and lean on dependency closure
   to pull in the *necessary* rather than the *similar*.

5. **Composed ≠ verified.** A dependency-consistent draft can still be semantically wrong (right
   endpoints, wrong intent). That's exactly why Q4's human-approval gate exists; keep it mandatory, and
   keep provenance chips so the human can sanity-check "why is this step here."

6. **Recorded scenarios are your teachers — protect their quality.** Since few-shot examples drive
   composition quality, a badly-named or half-annotated recorded scenario degrades every future compose.
   Consider a lightweight "example-ready" flag (named + all its endpoints annotated) gating whether a
   scenario is used as a few-shot exemplar.

7. **Embeddings drift with annotations.** Re-embed an endpoint whenever its name/does/area changes, or
   retrieval silently rots. Cheap to do on the annotation write path.

8. **Client-generated values are not dependencies.** An idempotency key with no producer is not an
   unmet dependency — it's `clientGenerated`, minted fresh downstream. The validator (§6.4) must treat
   these as satisfied, or every compose will show spurious unmet slots.

## 11. What this does to the current gaps list

- Gap #1 (no free-text flow proposal) — **this whole document is the fix.** `compose.ts` is
  `proposeScenario(freeTextGoal)`.
- Gaps #2/#3 (drift, packDiff) — untouched, still deferred, orthogonal.
- Gap #4 (naive client-generated minting) — worth fixing before Phase 5 lands, since composition leans
  on `clientGenerated` classification for validation; make minting JSONPath-aware.
- Gaps #6/#8/#9 (legacy dead code, schema tests, portal tests) — Phase 1 deletes more legacy; add
  schema tests when you touch `SessionSchema`; portal tests remain optional.

## 12. One-paragraph summary for the coding agent

Strip UI capture so sessions are pure ordered API call lists. Reuse templatize/operationId/inferSchemas
to build a catalog of unique endpoints; let humans annotate each with just name + does (+ optional area/
sideEffect), stored once and joined at read time. Promote the existing dataflow pass into a
catalog-level dependency graph with inferred roles (auth-token, resource-id) — this is derived, never
hand-entered. Build an embedding index over annotated endpoints and scenarios. The new composition
engine takes a free-text goal, retrieves candidate endpoints + example scenarios, expands by dependency
closure (so "from scratch" auto-pulls login), asks an LLM to select and order, then deterministically
validates and auto-completes against the dependency graph, producing a dependency-consistent **draft
scenario**. A human approves it, after which the existing TestSpec generator and testkit run unchanged.
The human never picks the endpoint list; that is the LLM's job, and the machine guarantees the result
is runnable.
