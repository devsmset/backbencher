# Verbatim capture: remove redaction and the body cap

Date: 2026-08-31
Status: approved, not yet implemented

## Problem

Recorded sessions lose parts of the API calls they capture. Four separate mechanisms are
responsible, and only the first two are in scope here:

| # | Mechanism | Where | What is lost | In scope |
| - | --------- | ----- | ------------ | -------- |
| 1 | Redaction denylists replace values with `***REDACTED***` | `packages/shared/src/redaction.ts`, applied in `packages/recorder/src/recorder.ts` and `bodyCapture.ts` | `authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `proxy-authorization`; query params `code`, `token`, `access_token`, `id_token`, `session`, `apikey`, `api_key`; any body key containing `password`, `secret`, `token`, `apiKey`, `clientSecret` | yes |
| 2 | Body cap of 262144 bytes | `packages/recorder/src/bodyCapture.ts`, `recorder.ts` | the tail of large request and response bodies; a truncated JSON body also downgrades to `bodyKind: "text"` | yes |
| 3 | Binary response bodies are never stored | `bodyCapture.ts` | the body of any non-JSON, non-`text/*` response | no |
| 4 | API filter drops whole calls | `bb.config.jsonc` `recorder.apiFilter` | entire calls, not parts of them | no |

Redaction costs more than storage fidelity. `packages/derive/src/dataflow.ts` skips any value
containing the string `REDACTED` when collecting producers and consumers, so every dataflow edge
that runs through a token, session id, or secret-named field is silently severed. Those are exactly
the edges the composer needs.

## Decision

Remove the redaction layer and the body cap outright. Do not gate them behind configuration, and do
not add compensating redaction at the egress boundaries.

Rejected alternatives:

- **Raw on disk, redact at egress.** Keeps secrets off the wire by filtering LLM prompts, generated
  `.spec.ts` files, and `pack.json`. Rejected: more code, and the analyst wants complete data at
  every stage, including what the model sees.
- **Configuration toggle.** Keeps the redaction machinery behind `redaction.enabled`. Rejected:
  leaves an unused code path and an unused config surface to maintain.

Binary response bodies keep their current treatment: `bodyKind: "binary"`, `body: null`, with
`bodyBytes` recorded.

## Consequences

Live bearer tokens, cookies, and password fields will exist in plaintext in `data/sessions/`, in
`data/knowledge-packs/*/pack.json`, in LLM request payloads, and potentially inlined into generated
Playwright specs via `packages/testkit/src/security.ts`, which uses `observedValues[0]` for path
parameters.

Therefore:

- `data/` must remain gitignored.
- Recordings must be made against non-production credentials.
- Generated specs must be reviewed before being committed to any shared repository.

These constraints are recorded in a new ADR rather than only in this spec.

## Changes

### 1. Delete the redaction layer

- Delete `packages/shared/src/redaction.ts` and `packages/shared/test/redaction.test.ts`.
- Remove `export * from "./redaction.js"` from `packages/shared/src/index.ts`.
- Remove `RedactionConfigSchema` and the `RedactionConfig` type from
  `packages/shared/src/config.ts`, and the `redaction` key from `BbConfigSchema`.
- Remove the `redaction` block from `bb.config.jsonc`.

`redaction.uiRedactSelectors` has no consumer in any source file. It survives only in stale `dist/`
artifacts from the pre-ADR-0004 DOM-capture recorder and is removed with the rest of the schema.

### 2. Recorder captures verbatim

- `packages/recorder/src/recorder.ts`: write `url`, request `headers`, response `headers`, and
  `postData` exactly as Playwright reports them. Drop the `redactUrl`, `redactHeaders`, and
  `redactBodyText` imports, the `const redaction = config.redaction` binding, and the byte-length
  check that slices `postData`.
- `packages/recorder/src/bodyCapture.ts`: the signature narrows to `captureBody(response)`. No cap
  parameter, no `RedactionConfig` parameter, no `redactJsonBody` call. A JSON content-type always
  attempts `JSON.parse`; the existing fallback to `bodyKind: "text"` on parse failure stays, it is
  simply no longer reachable through truncation.
- Remove `bodyCapBytes` from `RecorderConfigSchema` in `packages/shared/src/config.ts` and from
  `bb.config.jsonc`.

### 3. Recording schema drops the truncation flags

With no cap, `postDataTruncated` and `bodyTruncated` are permanently `false`, so they are removed
rather than left as dead fields.

- `packages/schemas/src/recording.ts`: remove `postDataTruncated` from `ApiRequestEventSchema` and
  `bodyTruncated` from `ApiResponseEventSchema`. Correct the `// post-redaction` and
  `// post-redaction, capped` comments, which no longer describe the fields.
- Regenerate `packages/schemas/generated/jsonschema/RecordingEvent.schema.json`.
- Update the fixture in `packages/schemas/test/schemas.test.ts` and the synthetic event in
  `scripts/e2e-portal.mjs`.

Because the on-disk event shape changes, bump the recording format version so a stale file fails
loudly at parse instead of being silently misread:

- `packages/schemas/src/recording.ts`: `SessionMetaBase.version` becomes `z.literal(4)`; update the
  "Session recording v3" header comment.
- `packages/recorder/src/recorder.ts`: `RECORDER_VERSION` becomes `"4.0.0"` and the meta draft
  writes `version: 4`.
- Update `version: 3` in `packages/derive/fixtures/sessions.ts`,
  `packages/store/test/store.test.ts`, and the two occurrences in `scripts/e2e-portal.mjs`.

### 4. Derive stops compensating for missing data

- `packages/derive/src/dataflow.ts`: delete `isRedacted()` and its six guard sites in
  `collectProducers()` and `collectConsumers()`.
- `packages/derive/src/types.ts` and `pairCalls.ts`: drop `requestBodyTruncated` and
  `responseBodyTruncated`.
- `packages/derive/src/inferSchemas.ts`: drop the `!c.requestBodyTruncated` filter, so every request
  body contributes to schema inference.
- `packages/derive/src/volatile.ts`: the guard narrows to `c.status === null`.
- `packages/derive/fixtures/sessions.ts`: remove the truncation flags from the fixtures.

### 5. Data reset and documentation

- Delete the contents of `data/sessions/` and `data/knowledge-packs/`. The existing session and the
  two packs are v3 recordings and will no longer parse. They are throwaway test data and will be
  re-recorded.
- Update the redaction references in `docs/ARCHITECTURE.md` (§3.5 and the tree listing) and in
  `README.md`.
- Add `docs/adr/0006-verbatim-capture.md` recording the decision and the credential-handling
  constraints from the Consequences section above.

## Verification

Respect the package rebuild order (schemas, shared, llm, derive, store, agent, testkit, recorder,
portal-api, portal-web, cli), since packages resolve each other through compiled `dist/`:

```bash
pnpm -r build
pnpm -r typecheck
pnpm -r --filter '!@backbencher/recorder' test
```

Then record a fresh session and confirm by inspecting `data/sessions/<id>/events.ndjson`:

- an `Authorization` header appears with its real token value, not `Bearer ***REDACTED***`;
- a `Cookie` header appears with its real value;
- a response body larger than 262144 bytes is stored in full with `bodyKind: "json"`, not `"text"`;
- a request body containing a `password` or `token` field carries the real value.

Then run derivation over that session and confirm the dataflow graph contains at least one edge
whose value is a token or session id, which redaction previously suppressed.

## Out of scope

- Binary response body capture (mechanism 3).
- Changes to `recorder.apiFilter`, including `dropMethods: ["OPTIONS"]` (mechanism 4).
- Any redaction or filtering at the LLM, knowledge-pack, or generated-test boundaries.
