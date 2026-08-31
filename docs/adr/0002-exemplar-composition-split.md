# Exemplars and Compositions are separate types

A single `Scenario` type with an `origin` field currently represents three different things: a
recorded flow that teaches the composer, a model-proposed draft awaiting approval, and a
hand-authored curated scenario. We are splitting it into **Exemplar** (a promoted Session that
teaches and is never approved or tested) and **Composition** (a model proposal that must be approved
before it becomes a test), with separate schemas and separate tables.

## Why

The two have opposite lifecycles and opposite required fields. An Exemplar must have a human-written
goal and per-step intents, and has no notion of approval, environments, or a testing strategy — it is
input to retrieval. A Composition starts empty of human judgement and must be approved before it may
reach the test compiler. Encoding that difference in an enum meant every consumer re-derived the
distinction with a filter, and it was possible to construct records that were neither thing: the old
`scenarios.fromFlow` produced empty-intent, `origin: "manual"` records that silently failed the
retrieval filter.

## Consequences

- `testDecision` moves off the Exemplar entirely. Only Compositions carry a testing strategy, and
  only after approval.
- `CatalogAnnotation` (name, description, product area, side effect) is likewise split from
  `TestingAnnotation` (testing guidance, correction overrides, param docs, tags). An Operation's
  Ready state — which gates whether the composer may select it — must not depend on testing metadata.
- `scenarios.fromFlow` is removed in favour of promoting a Session directly into an Exemplar, so that
  every Exemplar inherits the analyst's own goal.
- Existing recorded data is discarded rather than migrated: the three existing sessions predate
  required goals, and the intent text cannot be reconstructed after the fact.
