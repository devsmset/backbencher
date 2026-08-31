# Backbencher

Turns recorded product usage into an API catalog an analyst annotates once, then composes new API
scenarios from that catalog in response to a plain-language goal, and compiles the approved ones into
Playwright API tests.

Start with [CONTEXT.md](./CONTEXT.md) for vocabulary and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
for how the pieces fit.

## Build and test

pnpm workspaces + Turborepo, TypeScript strict.

```bash
pnpm -r build                                        # all packages
pnpm -r typecheck                                    # includes portal-web, which vite build does not check
pnpm -r --filter '!@backbencher/recorder' test       # recorder is a live-browser e2e
```

Packages resolve each other through compiled `dist/`, not live source, so **rebuild a package before
its dependents will see a change**. The order is: schemas → shared → llm → derive → store → agent →
testkit → recorder → portal-api → portal-web → cli.

Two things a green build does not prove: package `build` excludes `test/`, and `portal-web` is built
by Vite, which strips types without checking them. Run `typecheck` and the test suite too.

## Agent skills

### Issue tracker

No git remote is configured; issues live as markdown files under `.scratch/`. See
[docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, unchanged, recorded as a `Status:` line in each issue file. See
[docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`. See
[docs/agents/domain.md](./docs/agents/domain.md).
