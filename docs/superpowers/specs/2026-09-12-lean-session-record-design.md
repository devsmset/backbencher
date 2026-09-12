# Lean session records replace Exemplars as composition context

Date: 2026-09-12
Status: approved, not yet implemented

## Problem

The intended product flow is:

1. The analyst records product usage; every Call lands in `events.ndjson`.
2. Deriving the Session filters out Calls that carry no new information, and adds every unique
   Operation to the Catalog.
3. The Session's dependency graph is drawn from what survives.
4. The analyst prunes further, by hand, against that graph — producing a lean Session record.
5. That lean record, plus the Catalog, is what the composer reads to build new flows.

Three parts of that are missing or wired differently today.

### Derivation filters nothing

There is no filtering pass anywhere in `packages/derive`. Every captured Call becomes an
`ObservedFlow` step and a `DataflowEdge`. A Session that re-fetches `GET /bo/rest/entities/tenant`
three times contributes three producer Calls of the same `tenantId`, and the session graph's
"Connected values" panel shows three interchangeable edges into the same consumer slot. The analyst
cannot tell which one matters, because none of them does individually.

### The Session's dependency graph is not an artifact

`buildSessionCallGraph` is called from exactly one place: the `sessions.graph` tRPC query. It is
recomputed from raw NDJSON on every page load, is never persisted, never reaches `saveDerivation`,
never enters the knowledge pack, and never reaches the composer's prompt. What the composer actually
sees under `DEPENDENCY FACTS` is `computeDependencyGraph` — Catalog-level facts aggregated across
every Session, of the form `opA requires auth-token (satisfiableBy: opB, opC)`. Nothing tells it
that, in one particular recorded run, *this* Call fed *that* one.

That query also re-templatizes a single Session's Calls in isolation
(`templatizePaths(calls)` over one Session), so the operationIds it produces come from a
single-session prefix trie and are not guaranteed to match the Catalog's.

### A Session teaches nothing until it is copied into an Exemplar

`retrievalCorpus()` retrieves two kinds of thing: Ready Operations, and Exemplars. `ObservedFlow` is
not retrievable. With no Exemplar promoted, the compose prompt's `EXAMPLE SCENARIOS` section renders
the literal string `(none yet)`.

And an Exemplar is a copy of its Session:

| Exemplar field | Where it comes from |
| -------------- | ------------------- |
| `name`, `goal` | copied verbatim from `session.meta` |
| `steps[].operationId` | copied from the Session's `ObservedFlow` |
| `sourceFlowIds` | pointers back to those same flows |
| `steps[].intent` | drafted by an LLM — **and read by nothing** |

`buildPrompt` renders each example as `"{name}": [op names]`. `exemplarRetrievalText` is
`"{name}. {goal}. steps: {names}"`. Neither reads `intent`. The only reason
`draftExemplarFromSession` makes a model call is to produce a field no consumer uses.

So Exemplar is a hand-copied duplicate of a Session, plus dead text, plus its own schema, table,
repository, router, and screen. The curation this spec adds — the analyst deciding which Calls
belong — is the one job Exemplar promotion was doing, done better: against real Calls and a real
dependency graph rather than an operationId list.

## Decision

Curation happens on the Session. The Session itself becomes the composer's context. Exemplar is
deleted.

Concretely:

- Derivation gains a redundant-Call filter, and materialises a lean `curated-events.ndjson` per
  Session.
- The analyst's manual deletions live in a new human-owned store table and survive re-derivation.
- Each Session's call-level dependency graph becomes a persisted derivation output.
- The analyst marks a Session **use as reference**; reference Sessions whose Operations are all
  Ready are retrieved as composition context, carrying both their step order and their own dataflow
  edges.
- `Exemplar` — schema, table, repository, router, screen, and `draftExemplarFromSession` — is
  removed.

### Rejected alternatives

- **Keep Exemplar, feed it from the curated Session.** Preserves a second copy of the same data and
  a second place for the analyst to curate, for no capability the Session cannot carry itself.
- **Mutate `events.ndjson` in place.** Contradicts ADR-0006 (capture is verbatim) and makes curation
  unrecoverable. The raw recording is never written to after capture.
- **Store manual deletions in the curated NDJSON alone.** Re-running derivation regenerates that
  file from raw and would silently resurrect deleted Calls. The human layer must be separately
  durable — the same rule ADR-0003's architecture already applies to annotations.

## Relationship to ADR-0002

ADR-0002 splits *Exemplar (teaches, never approved)* from *Composition (proposed, must be
approved)*. That split is about approval lifecycle and it survives intact: the teaching artifact
becomes the Session, which is still never approved and never tested. ADR-0002 removed
`scenarios.fromFlow` "in favour of promoting a Session directly into an Exemplar, so that every
Exemplar inherits the analyst's own goal" — this removes the remaining indirection in that same
direction.

A new ADR records the removal and supersedes that consequence of ADR-0002.

## Vocabulary

`CONTEXT.md` changes. Removed: **Exemplar**, **Example-ready**. Added, under Capture:

> **Redundant Call**:
> A Call that produces no value an earlier Call to the same Operation in the same Session has not
> already produced.
> _Avoid_: Duplicate call, repeat, noise
>
> **Curated Session**:
> A Session reduced to the Calls that carry its meaning — the recording minus Redundant Calls and
> minus what the Analyst deleted by hand.
> _Avoid_: Cleaned session, filtered session, lean session

And under Composition, replacing the Exemplar entries:

> **Reference Session**:
> A Curated Session the Analyst has marked as teaching material for the composer. It is never
> approved and never tested — it only teaches.
> _Avoid_: Exemplar, scenario, example, template
>
> **Reference-ready**:
> The state of a Reference Session whose Operations are all Ready, making it eligible to be shown to
> the composer. Derived, never set by hand.
> _Avoid_: Published, enabled

## What curation does and does not affect

This is the load-bearing rule of the design.

**The Catalog is exhaustive and curation never shrinks it.** Operations, inferred schemas,
`DataflowEdge`s, and `dependency_facts` are always derived from **raw** events. Curation states
which Calls tell this Session's story; it does not deny that an Operation exists in the product or
that one Operation can produce another's input.

**Curation affects only the per-Session narrative artifacts**: `ObservedFlow`, the persisted
`SessionCallEdge[]`, and the materialised `curated-events.ndjson`.

This also removes a hazard: manual deletion of the last remaining Call of an Operation would
otherwise drop that Operation from the Catalog.

## Architecture

```
events.ndjson (raw, verbatim, never written after capture)
   │
   ├─► pairCalls → templatizePaths → inferSchemas → buildDataflowGraph   ─►  Catalog
   │        (raw — exhaustive, unaffected by curation)                        dataflow_edges
   │                                                                          dependency_facts
   │
   └─► minus (auto-filtered ∪ analyst-deleted correlationIds)
            │
            ├─► extractObservedFlow      ─► observed_flows
            ├─► buildSessionCallGraph    ─► session_call_edges   (new)
            └─► materialise              ─► curated-events.ndjson (new)
                                                     │
   session_curation (new, human-owned, survives re-derivation)
            ▲                                        │
            └──────── analyst Save ──────────────────┘

reference Sessions + Catalog  ─►  compose prompt
```

### 1. Redundant-Call filter — `packages/derive/src/redundant.ts` (new)

```ts
export function findRedundantCalls(
  calls: PairedCall[],
  callOp: Map<PairedCall, string>,
): Set<string>; // correlationIds to drop
```

Algorithm, per Session:

1. Compute each Call's **produced set**: the `(jsonPath, value)` pairs from `collectProducers`
   belonging to that correlationId, keeping only pairs where the existing `entropy(value).keep` gate
   passes. Reusing that gate means the filter and the dataflow join agree on what counts as a value.
2. Group Calls by operationId. A Call with no operationId is never dropped.
3. Walk each group in ascending `(requestTimestamp, correlationId)` order, holding a `seen` set of
   pairs:
   - Produced set empty → **keep**. A Call that produces nothing entropy-worthy is not a candidate;
     consumer-only Calls (list fetches, pagination, navigation reads) are never removed.
   - Every pair already in `seen` → **drop**. It re-fetched what an earlier Call of the same
     Operation already produced.
   - Otherwise → **keep**, and add its pairs to `seen`.

Two properties this guarantees, both worth asserting in tests:

- **It never orphans a consumer.** Every pair of a dropped Call is in `seen`, so some strictly
  earlier kept Call produced that same value — and earlier still satisfies the
  producer-precedes-consumer rule. A value a kept Call consumes therefore always retains a producer.
- **It never removes an Operation from the flow.** `seen` starts empty, so the first Call in each
  group is always kept.

The sort key makes it deterministic, consistent with the architecture's "determinism everywhere
except the model call".

### 2. Derivation output — `packages/derive/src/pipeline.ts`

`runDerivation` gains an options argument and two result fields:

```ts
export interface RunDerivationOptions {
  /** sessionId -> correlationIds the analyst deleted by hand. */
  deletedCorrelationIds?: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface DerivationResult {
  operations: Operation[];          // unchanged — from raw
  dataflow: DataflowEdge[];         // unchanged — from raw
  clientGeneratedFields: Record<string, string[]>; // unchanged — from raw
  flows: ObservedFlow[];            // now from curated Calls
  sessionGraphs: Record<string, SessionCallEdge[]>;  // new, from curated Calls
  autoFiltered: Record<string, string[]>;            // new, sessionId -> dropped correlationIds
}
```

Order of work: pair and templatize all Calls globally as today; derive Operations, schemas,
dataflow, and client-generated fields from that full set; then, per Session, compute
`findRedundantCalls`, union it with `deletedCorrelationIds` for that Session, and build
`ObservedFlow` and `SessionCallEdge[]` from the surviving Calls only.

Building the session graph here rather than in the router fixes the single-session templatization
mismatch described in the Problem: the graph's operationIds now come from the same global trie as
the Catalog's.

### 3. Store

New migration `0004_session_curation_and_graph`:

```sql
CREATE TABLE IF NOT EXISTS session_curation (
  session_id TEXT PRIMARY KEY,
  deleted_correlation_ids TEXT NOT NULL,  -- JSON string[]
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
DELETE FROM embeddings WHERE kind = 'exemplar';
DROP TABLE IF EXISTS exemplars;
```

Dropping recorded Exemplars rather than migrating them follows ADR-0002's own precedent; their only
non-derivable field is the unused `intent`.

`saveDerivation` full-replaces `session_call_edges` alongside the four tables it already replaces,
and — as with every other derived table — **never touches `session_curation`**. That is what makes
the analyst's deletions durable across re-derivation.

New repositories:

- `sessionCurationRepo`: `get(sessionId)`, `list()`, `setDeleted(sessionId, ids, actor)`,
  `setUseAsReference(sessionId, on, actor)`.
- `sessionGraphsRepo`: `listBySession(sessionId)`, `all()`.

Removed: `exemplarsRepo` and its `Store` entry.

### 4. Curated NDJSON materialisation

`packages/derive/src/curatedEvents.ts` (new):

```ts
export function writeCuratedEvents(dir: string, session: SessionData, excluded: ReadonlySet<string>): number;
export function loadCuratedOrRawSession(dir: string): SessionData;
```

`writeCuratedEvents` writes `data/sessions/<sessionId>/curated-events.ndjson`: the raw lines in their
original order, minus every event whose `correlationId` is excluded — both the `api_request` and its
`api_response`, so the file always parses as valid pairs. It returns the number of events written.

It is rewritten at exactly two moments: at the end of a derivation run, and when the analyst saves
deletions. `loadCuratedOrRawSession` prefers the curated file and falls back to raw, and is used by
the timeline view so the analyst sees the lean Session everywhere.

`events.ndjson` and `meta.json` are never written after capture.

### 5. Portal API — `packages/portal-api/src/routers.ts`

`derive.run` reads `session_curation` for the deletion map, passes it to `runDerivation`, saves the
result, then calls `writeCuratedEvents` for each processed Session. Its response gains
`callsFiltered` so the UI can report how much was removed.

`sessions.graph` stops recomputing. It reads persisted artifacts:

- edges from `store.sessionGraphs.listBySession(sessionId)`
- nodes by pairing `loadCuratedOrRawSession(dir)`, which is already the lean event set — no further
  filtering is applied, since the curated file is written from the same exclusion set the edges were
  built from

If the Session has no derivation yet, it returns `{ nodes: [], edges: [], derived: false }` and the
screen says to run derive first, rather than silently deriving on a page load.

`sessions.timeline` switches from `loadSession` to `loadCuratedOrRawSession`.

New `sessions.curation({ sessionId })` query, backing the session detail screen:

```ts
{
  useAsReference: boolean;
  deletedCorrelationIds: string[];
  rawCallCount: number;      // pairs in events.ndjson
  curatedCallCount: number;  // pairs in curated-events.ndjson
}
```

The redundant-Call count is `rawCallCount - curatedCallCount - deletedCorrelationIds.length`, so
auto-filtered ids need no persistence of their own.

New `sessions.deleteCalls`:

```ts
.input(z.object({ sessionId: z.string(), correlationIds: z.array(z.string()).min(1) }))
```

It validates every correlationId exists in the Session, re-runs the **sole-producer guard**
server-side over the Session's persisted edges (see below), rejects with `PRECONDITION_FAILED`
listing the orphaned consumers if the guard trips, then unions the ids into
`session_curation.deleted_correlation_ids`, rewrites `curated-events.ndjson`, recomputes that
Session's `ObservedFlow` and `SessionCallEdge[]`, and appends an audit entry
(`entityType: "session"`, `action: "curate.delete"`). Already-deleted ids are idempotent.

New `sessions.setUseAsReference({ sessionId, useAsReference })`, audited as
`action: "curate.reference"`.

The whole `exemplarsRouter` is removed.

### 6. Sole-producer guard

Shared pure function in `packages/derive`, so the UI and the API enforce the same rule:

```ts
export function findOrphanedConsumers(
  edges: SessionCallEdge[],
  deleting: ReadonlySet<string>,
): Array<{ consumerCorrelationId: string; consumerJsonPath: string; value: string }>;
```

For each edge whose consumer is **not** being deleted but whose producer **is**, the
`(consumerCorrelationId, consumerJsonPath)` slot is orphaned unless another edge feeds that same
slot from a producer that is also surviving. Non-empty result means the deletion is blocked.

Evaluating it against the whole pending deletion set — not one Call at a time — is what makes a
queue of deletions safe: deleting two Calls that each cover for the other is correctly rejected.

### 7. Portal web

`SessionGraph.tsx` gains, in the node detail panel, a **Delete call** action:

- Clicking it opens a confirmation listing what the Call produces and consumes, and which other
  Calls in the Session use those values.
- If `findOrphanedConsumers` — evaluated over the current pending set *plus* this Call — is
  non-empty, the dialog shows the orphaned consumers and the confirm button is disabled, with an
  explanation that the Call is the only remaining producer for those slots.
- Otherwise confirming adds the Call to local pending state. The graph re-filters live so the
  analyst sees the resulting shape before committing.

A **Save** button, enabled only when the pending set is non-empty, sends one `sessions.deleteCalls`
call. Closing the modal with unsaved deletions warns first. Deleted Calls are gone from the graph
after a successful save; there is no undo in this iteration beyond re-deriving with the deletion
removed, which is not exposed in the UI.

The session detail screen gains a **Use as reference for composing** toggle wired to
`sessions.setUseAsReference`, plus a line reporting `N redundant calls filtered, M deleted by you`
from `sessions.curation`.

Removed: `screens/Exemplars.tsx`, its `App.tsx` route and nav entry, and the
`View exemplars →` link in `Compose.tsx`.

### 8. Composition context — `packages/agent`

`embed.ts`:

- `RetrievalResult.exemplars` → `referenceSessions: Array<ReferenceSession & { score: number }>`,
  where `ReferenceSession` carries `sessionId`, `name`, `goal`, ordered `steps[].operationId`, and
  the Session's `SessionCallEdge[]`.
- `exemplarRetrievalText` → `sessionRetrievalText(session, opNameById)`, same shape:
  `"{name}. {goal}. steps: {endpoint names}"`.
- `isExampleReady` → `isReferenceReady(session, readyOpIds)`, unchanged in substance: every step's
  Operation must be Ready, so the composer never sees a step it cannot name.
- `retrievalCorpus` builds its second arm from Sessions where
  `session_curation.use_as_reference` is set **and** `isReferenceReady` holds.
- `RetrieveOptions.topExemplars` → `topReferenceSessions`, default unchanged at 4.
- Embedding `kind` `"exemplar"` → `"session"`.

`compose.ts` replaces the `EXAMPLE SCENARIOS` prompt section with `REFERENCE SESSIONS`, which is the
part that answers "how these endpoints tie together":

```
REFERENCE SESSIONS (real recorded flows, curated by an analyst):
"Raise a support ticket" — goal: "file a ticket against a tenant as an admin"
  steps: Log in, List tenants, Create ticket
  dataflow: Log in.token → List tenants.Authorization
            List tenants.data[0].id → Create ticket.tenantId
```

Step names come from `ObservedFlow` operationIds resolved through `opNameById`; dataflow lines
render each `SessionCallEdge` as `{producer name}.{producerJsonPath} → {consumer name}.{consumerJsonPath}`,
with edges deduplicated by that rendered string and sorted for determinism. Values themselves are
never rendered — they are live credentials (ADR-0006).

The system prompt's dependency rule gains one line: reference Sessions show how values have actually
flowed between endpoints in practice; the `DEPENDENCY FACTS` block remains the authoritative,
machine-derived statement.

`exemplar.ts` is deleted, along with `draftExemplarFromSession` and its export.

### 9. Schemas — `packages/schemas`

- Delete `ExemplarSchema`, `ExemplarStepSchema`, and their `index.ts` exports and registry entry.
- `CompositionStepSchema.fromExemplarIds` → `fromSessionIds` (same `z.array(z.string()).default([])`).
- Knowledge pack: `exemplars` → `referenceSessions`. `renderCatalogMd` heading follows.
- New `SessionCurationSchema`: `{ sessionId, deletedCorrelationIds: string[], useAsReference: boolean, updatedBy, updatedAt }`.

`buildKnowledgePack` emits reference Sessions in place of Exemplars, sorted by `sessionId`. The pack
`contentHash` changes for every existing pack; this is expected and needs no migration, since packs
are content-addressed and rebuilt on demand.

## Error handling

| Situation | Behaviour |
| --------- | --------- |
| Graph opened for an underived Session | `derived: false`; screen prompts to run derive |
| `deleteCalls` with an unknown correlationId | `BAD_REQUEST` naming the ids |
| `deleteCalls` that would orphan a consumer | `PRECONDITION_FAILED` listing orphaned consumer slots |
| `deleteCalls` re-sending an already-deleted id | idempotent no-op |
| Modal closed with unsaved pending deletions | warn before discarding |
| `curated-events.ndjson` missing or unreadable | fall back to raw events |
| Session with every Call deleted | allowed; produces an empty flow, and `isReferenceReady` is false, so it never teaches |

The sole-producer guard is enforced in the API, not only the UI. The client's pending-set evaluation
is a convenience.

## Testing

**`packages/derive`**
- `findRedundantCalls`: drops a repeated fetch producing identical values; keeps repeated fetches
  producing different values; never drops a consumer-only Call; never drops an unclassified Call;
  always keeps the first Call of each Operation; stable under input reordering.
- Invariant test over the existing session fixtures: for every Session, no edge survives the filter
  with a surviving consumer and a dropped sole producer.
- `findOrphanedConsumers`: single deletion with an alternative producer is allowed; sole producer is
  blocked; two mutually-covering Calls deleted together are blocked.
- `writeCuratedEvents`: drops both halves of an excluded pair; preserves order; output re-parses
  through `loadSession`.
- `runDerivation`: Catalog Operation count is identical with and without deletions; flows and
  session graphs shrink accordingly.

**`packages/store`**
- `saveDerivation` full-replaces `session_call_edges` and leaves `session_curation` untouched.
- Migration `0004` drops `exemplars` and its embeddings on an existing database.

**`packages/agent`**
- `retrievalCorpus` includes a Session only when the toggle is on and every step Operation is Ready.
- The compose prompt contains a `REFERENCE SESSIONS` block with rendered dataflow lines, and no
  captured values.
- `buildKnowledgePack` emits `referenceSessions`; `contentHash` is stable across repeated builds.

**`packages/portal-api`**
- `deleteCalls` rewrites the curated file, updates curation, and recomputes flow and graph.
- The guard rejects a sole-producer deletion.
- Acceptance test updated for `fromSessionIds`.

UI behaviour is verified manually by the analyst; no browser automation is added.

## Out of scope

- Any change to Composition approval, TestSpec generation, or `packages/testkit`.
- Reinstating deleted Calls through the UI.
- Per-Call editing of request or response content. Curation removes Calls; it never rewrites them.
- Changing the entropy gate, the templatizer, or `flows.ts`'s existing `repeated: n` polling
  collapse, which operates on consecutive identical operationIds and is orthogonal to this filter.
- Cross-session deduplication. The Catalog already aggregates Operations across Sessions.

## Consequences

- A Session that nobody marks as reference contributes nothing to composition, exactly as an
  unpromoted Session does today. The toggle replaces the promote step.
- Re-running derivation after curating changes that Session's flow and graph. This is intended: the
  analyst's deletions are the durable input, and the derived artifacts follow them.
- Existing Exemplars are discarded, and existing knowledge packs are superseded on next build.
