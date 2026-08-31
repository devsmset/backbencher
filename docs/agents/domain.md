# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one `CONTEXT.md` at the root and one `docs/adr/` directory. It is a pnpm monorepo, but the packages are pipeline layers (capture → derive → store → compose → test), not separate bounded contexts, and they share one vocabulary.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary.
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in.
- **`docs/ARCHITECTURE.md`** — the current-state architecture. Its "Invariants that are easy to violate" section is the fastest way to avoid a known mistake.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/
│   ├── ARCHITECTURE.md
│   └── adr/
│       ├── 0001-llm-adapter-layer.md
│       ├── 0002-exemplar-composition-split.md
│       ├── 0003-typescript-monorepo-with-shared-contracts.md
│       ├── 0004-api-only-capture.md
│       └── 0005-retrieval-not-training.md
├── packages/
└── apps/
```

If this repo ever splits into genuinely separate contexts, switch to a root `CONTEXT-MAP.md` pointing at one `CONTEXT.md` per context, with context-scoped `docs/adr/` directories alongside them.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

This matters more than usual here, because the glossary's `_Avoid_` lists are the residue of a real migration: `Scenario` was deliberately split into **Exemplar** and **Composition** (ADR-0002), and reintroducing the old word reintroduces the ambiguity that split was meant to remove.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0004 (API-only capture), but worth reopening because…_
