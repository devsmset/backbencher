# The curated Session is the composer's reference; Exemplar is deleted

The `Exemplar` type — its schema, table, repository, tRPC router, portal screen, and
`draftExemplarFromSession` — is removed. A Session the Analyst marks **use as reference** is what
teaches the composer, carrying its own ordered Operations and its own call-level dependency edges.

## Why

An Exemplar held nothing its Session did not. Its `name` and `goal` were copied verbatim from
`session.meta`; its `steps[].operationId` came from the Session's `ObservedFlow`. Its only original
field, `steps[].intent`, was drafted by a model and read by no consumer: `buildPrompt` rendered each
example as `"{name}": [op names]` and `exemplarRetrievalText` as `"{name}. {goal}. steps: {names}"`.

Promotion also duplicated curation. The Analyst now prunes a Session directly against its dependency
graph, on real Calls rather than an operationId list, so the Session already carries the judgement
that promotion was supposed to add.

ADR-0002's split of Exemplar from Composition was about approval lifecycle, and it survives: the
teaching artifact is still never approved and never tested. This supersedes only ADR-0002's
consequence that Sessions are promoted into Exemplars.

## Consequences

- Recorded Exemplars are discarded rather than migrated, following ADR-0002's own precedent. Their
  only non-derivable field was the unused `intent`.
- Knowledge packs carry `referenceSessions` in place of `exemplars`, so every existing pack's
  `contentHash` changes on the next build.
- A Session teaches only when the Analyst marks it, which replaces the promote step.
- `CompositionStep.fromExemplarIds` becomes `fromSessionIds`.
