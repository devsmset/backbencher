# ADR-0006: Capture verbatim, with no redaction and no body cap

Status: accepted

## Context

Capture-time redaction (ADR-0004, consequence 3) replaced denylisted header values, query
parameters, and body fields with `***REDACTED***`, and `recorder.bodyCapBytes` truncated bodies at
256 KiB.

The cost was larger than the storage fidelity it bought. `buildDataflowGraph` skipped any value
containing the substring `REDACTED`, so every dataflow edge running through a token, a session
identifier, or a field whose name merely contained `token` or `secret` was silently severed. Those
are exactly the edges the composer needs to order a scenario. Truncation removed request bodies from
schema inference entirely, and downgraded large JSON responses to opaque text.

## Decision

Capture everything verbatim. The redaction module, the `redaction` configuration block, and
`recorder.bodyCapBytes` are deleted rather than made configurable — a disabled code path is a
maintenance cost with no user.

Binary response bodies are unchanged: still `bodyKind: "binary"` with the body dropped and
`bodyBytes` recorded. The `recorder.apiFilter` is unchanged.

This supersedes consequence 3 of ADR-0004 ("Redaction happens at exactly one boundary, at capture
time on the Node side"). There is now no redaction boundary at all.

## Consequences

Live bearer tokens, cookies, and password fields exist in plaintext in `data/sessions/`, in
`data/knowledge-packs/*/pack.json`, in LLM request payloads, and potentially inlined into generated
Playwright specs via `packages/testkit/src/security.ts`, which uses `observedValues[0]` for path
parameters.

Therefore:

- `data/` must stay gitignored.
- Recordings must be made against non-production credentials.
- Generated specs must be reviewed before being committed to any shared repository.

The recording format is bumped to v4; v3 sessions no longer parse.
