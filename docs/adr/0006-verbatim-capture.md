# Capture is verbatim: no redaction, no body cap

The redaction module, the `redaction` configuration block, and `recorder.bodyCapBytes` are deleted.
URLs, request and response headers, and request and response bodies are recorded exactly as sent and
received. Binary response bodies are unchanged: still `bodyKind: "binary"` with the body dropped and
`bodyBytes` recorded. The `recorder.apiFilter` is unchanged.

## Why

Capture-time redaction (ADR-0004, consequence 3) replaced denylisted header values, query parameters,
and body fields with `***REDACTED***`. `recorder.bodyCapBytes` truncated bodies at 256 KiB. The cost
was larger than the storage fidelity it bought.

`buildDataflowGraph` skipped any value containing the substring `REDACTED`, severing exactly the token
and session-identifier edges the composer needs to order a scenario, including edges through values
that merely contained that substring. Truncation removed request bodies from schema inference entirely
and downgraded large JSON responses to opaque text.

This was deleted outright rather than made configurable. A disabled code path is a maintenance cost
with no user.

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

This supersedes consequence 3 of ADR-0004 ("Redaction happens at exactly one boundary, at capture
time on the Node side"). There is now no redaction boundary at all.
