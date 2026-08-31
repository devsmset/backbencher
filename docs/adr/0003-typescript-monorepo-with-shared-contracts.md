# The system is a TypeScript monorepo with every contract in one schemas package

The v1 prototype was two plain-JavaScript files. It was rewritten as a pnpm/Turborepo TypeScript
monorepo in which every data contract that crosses a package boundary is declared once as a Zod
schema in `@backbencher/schemas`, and nothing else declares one.

## Why

The product *is* its data contracts. Five serialized formats — the recording, the derived API model,
the analyst's annotations, the knowledge pack, and the TestSpec — flow across ten packages and out to
a language model. In JavaScript those contracts live in prose and drift apart silently. Declared once
in Zod they yield compile-time types via `z.infer`, runtime validation at every boundary, and
generated JSON Schema for the consumers that are not TypeScript at all — principally the LLM prompt.

The prototype's known defects were type-shaped, which is what made a rewrite rather than a repair the
cheaper option. Its body-classification crash on a null response body is caught outright by
`strictNullChecks`. Its response-pairing bug — matching on URL and timestamp, which mis-pairs
concurrent identical requests — cannot be expressed at all once `correlationId` is a required field of
both event types.

## Consequences

- Packages depend on each other's compiled `dist/`, not live source. After editing a package you must
  rebuild it before dependents see the change; the order is schemas → shared → llm → derive → store →
  agent → testkit → recorder → portal-api → portal-web → cli.
- `@backbencher/schemas` depends on no other workspace package, so it can be imported from anywhere
  without a cycle.
- Validation is `.parse()`/`.safeParse()` at boundaries rather than trusted shapes. Derivation
  validates every NDJSON line it reads.
- A clean `tsc` build is not a guarantee of correctness: test files are excluded from package builds,
  and `portal-web` is built by Vite, which strips types without checking them. Run that package's
  `typecheck` script explicitly.
