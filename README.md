# Backbencher

Backbencher turns recorded product usage into an API catalog an analyst annotates once, then composes
new API scenarios from that catalog in response to a plain-language goal, and compiles the approved
ones into Playwright API tests.

The point is that the knowledge accumulates. You annotate an endpoint once; every future composition
can use it. There is no training step and no fine-tuning — the corpus grows, retrieval gets better,
and every proposal remains traceable to the exact endpoints and examples that produced it.

## How it works

```
record  →  derive  →  annotate  →  compose  →  generate  →  run
```

1. **Record** a Session by driving the product in a real browser. Only API traffic is captured.
2. **Derive** an API catalog from every Session: path templates, request/response schemas, volatile
   fields, and — most importantly — the dependency edges showing which endpoint produces a value
   another endpoint consumes.
3. **Annotate** each Operation in the portal with a name and a description. That is the whole
   required human surface; a model can propose annotations for you to accept.
4. **Compose** by typing a goal in plain language. Relevant Operations are retrieved, expanded along
   their dependency closure, and a model selects and orders them. Unmet dependencies and missing
   capabilities are surfaced, not guessed.
5. **Generate** a TestSpec from an approved Composition, then **run** it as a Playwright API test.

## Getting started

Requires Node and pnpm.

```bash
pnpm install
pnpm -r build
```

Configure hosts to record, redaction rules, model routing, and target environments in
[bb.config.jsonc](./bb.config.jsonc).

Then either drive everything from the browser:

```bash
pnpm serve            # builds, then starts the portal on http://localhost:4100
```

…or use the CLI:

```bash
bb record --url https://your-app        # opens a browser; you name the session on stop
bb derive --all                         # build the catalog
bb embed                                # embed the catalog for retrieval
bb serve                                # annotate and compose in the portal
bb agent generate --composition <id>    # approved Composition → TestSpec
bb test run --env staging
```

`bb --help` lists everything. Sessions land in `data/sessions/`, and the database is
`data/backbencher.db`; the whole `data/` directory is gitignored.

## Development

```bash
pnpm -r build
pnpm -r typecheck                                    # portal-web is only checked here, not by its build
pnpm -r --filter '!@backbencher/recorder' test       # recorder is a live-browser e2e
```

Packages resolve each other through compiled `dist/`, so rebuild a package before its dependents will
see a change. See [AGENTS.md](./AGENTS.md) for the build order.

## Documentation

- [CONTEXT.md](./CONTEXT.md) — the domain glossary. Start here; the vocabulary is precise on purpose.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — what each package does, and the invariants that are
  easy to violate.
- [docs/adr/](./docs/adr) — why the load-bearing decisions were made.

## License

ISC
