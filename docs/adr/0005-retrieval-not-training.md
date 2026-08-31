# Composition is retrieval over a corpus, not model training

Backbencher never trains or fine-tunes a model. What grows as the system is used is a corpus —
annotated Operations and promoted Exemplars. At composition time the relevant slice of that corpus is
retrieved into the context window as a candidate Operation pool plus few-shot Exemplars, and the model
is asked to select and order.

## Why

There is no offline training step, no ML infrastructure, and no accelerator to provision. Quality
rises monotonically as the corpus grows, and every step is inspectable: for any Composition you can
name the exact Operations retrieved and the exact Exemplars shown. A fine-tuned model would bury that
provenance in weights and would need retraining every time the product's API changed, which is the
thing that changes most often.

Calling the corpus "training data" is the misreading this record exists to prevent.

## Consequences

- Retrieval scope, not context size, is the quality lever. If a compose prompt runs to more than a few
  thousand tokens of candidates, tighten top-M and lean on dependency closure — do not raise the
  budget.
- Retrieval is embedding similarity *plus* transitive dependency closure. Similarity alone omits the
  login step that a goal never mentions but every write depends on.
- Embeddings must not go stale against edited annotations. The cache is keyed by model name and text
  hash so an edit misses the cache and re-embeds (see ADR-0001); do not add an explicit re-embed hook.
- The model's output is never trusted directly. A deterministic validator reconciles dependencies
  afterwards, and unmet dependencies and capability gaps are surfaced rather than guessed at.
- Corpus readiness is therefore measurable, and is measured: annotation coverage, example coverage,
  dependency resolvability, and goal rehearsal.
- A badly named Operation or a half-written Exemplar degrades every future composition, which is why
  Ready and Example-ready are derived gates rather than manual flags.
