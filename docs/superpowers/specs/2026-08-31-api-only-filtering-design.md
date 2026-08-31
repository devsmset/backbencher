# Capture API calls only: drop assets, pages, and static bundles as whole pairs

Date: 2026-08-31
Status: approved (decided autonomously; user reviewing after the fact)

## Problem

Session `01M1C8JWJMA28A20XPAT55117D` recorded 33 requests but only 23 responses. The 10-event gap and
the surviving non-API traffic have two distinct causes.

### Cause 1: filtering is asymmetric, so assets leave half a record

`makeApiFilter().matches()` decides at request time; `shouldDropCapturedResponse()` decides at
response time. The request handler pushes its `api_request` event to the write queue as soon as the
`allHeaders()` race resolves, before any response exists. When `shouldDropCapturedResponse` later
drops the response, the request event is already on disk.

Every dropped asset therefore leaves an orphan `api_request` with no `api_response`. All 10 orphans
in the session are `.woff` and `.svg` files under `/bo/static/media/` and `/idm-service/idm/v0/`:

```
ORPHAN other GET /bo/static/media/Metric-Regular.705b5691360f157a137e.woff
ORPHAN other GET /idm-service/idm/v0/favicon.svg
ORPHAN other GET /bo/static/media/default-avatar.ea24c6e0b3490e5c0de2816a2750b37f.svg
...
```

`ASSET_PATH_RE` already exists in `apiFilter.ts` and correctly identifies all ten — but it is only
consulted from `shouldDropCapturedResponse`, never from `matches()`, even though a `.woff` URL is
recognisable as an asset before any response arrives.

Downstream, `pairCalls` turns each orphan into a `PairedCall` with `status: null`, which then reaches
templatization as a distinct operation.

### Cause 2: page navigations and static bundles are not filtered at all

| Kind | Count | Example |
| ---- | ----- | ------- |
| `document` navigations returning `text/html` | 2 | `GET /idm-service/idm/v0/login?tenant=sysbo` |
| Static JSON bundles | 2 | `GET /idm-service/idm/v0/assets/i18n/en.json` |

`text/html` is absent from `dropContentTypes`, so the login and logout pages are recorded with their
full markup as `bodyKind: "text"`. The i18n bundle is genuinely `application/json`, so no
content-type rule can distinguish it from an API response.

## Decision

Two changes, one structural and one to configuration.

### Structural: a request/response pair is written atomically or not at all

The recorder buffers the `api_request` event instead of streaming it. The event is held in the
existing `inflight` map until its fate is known, then written immediately before its `api_response`.
A pair that fails the response-side filter is discarded whole, and no orphan can exist by
construction.

This also removes a latent ordering hazard. Today the request event is pushed only after the
`allHeaders()` race resolves, up to five seconds later, so request and response events can already be
written out of order. Buffering makes request/response adjacency deterministic.

Three exits write the buffered request event:

- **response received** — write request, then response, unless the pair is dropped
- **`requestfailed`** — write request, then the `status: 0` response (a failed API call is an
  observation worth keeping)
- **`stop()` drain** — write request, then the `status: -1` still-pending response (§3.3, unchanged)

Rejected alternative: keep streaming and strip orphans in a post-pass at `stop()`. It requires
rewriting `events.ndjson` after the fact, which defeats the append-on-capture design that
`WriteQueue` exists to provide.

Rejected alternative: filter orphans in `packages/derive` instead. The capture boundary is the right
layer — ADR-0004 established that filtering happens once, on the Node side — and a derive-side filter
would leave the noise on disk and in the portal timeline.

### Request-time asset rejection

`matches()` gains an `ASSET_PATH_RE` check, so assets are rejected before the correlation id is
minted. This is redundant for correctness once pairs are atomic, but it avoids a wasted
`allHeaders()` race and body read per asset, and it makes the request-side filter honest about what
it accepts.

### A `document` navigation that returns HTML is a page, not an API call

`shouldDropCapturedResponse` gains the request's `resourceType` and drops the pair when a `document`
request returns an HTML content type.

Scoping the rule to `document` rather than adding `text/html` to `dropContentTypes` is deliberate.
Enterprise applications routinely answer an XHR with an HTML error page when a session expires; that
is a real, testable behaviour and must survive. Only a top-level navigation that renders markup is
categorically not an API call.

The three 302 redirect hops — `POST /bo/boLogin`, `GET /bo/postBoLogin`, `GET /bo/boLogout` — are
kept. They are the auth handshake, and they carry the `code` query parameter that flows into
`GET /idm-service/idm/v0/api/public/token?code=…`. Dropping them would sever a real dataflow edge,
the exact failure ADR-0006 was written to fix. They cost nothing: a 302 has no body. A 302 also
carries no `content-type`, so the HTML rule spares them without a special case.

### Configuration: static bundles

`recorder.apiFilter.dropPathPatterns` gains `/assets/`, matching the existing idiom of `/analytics`
and `/telemetry`. This drops `/idm-service/idm/v0/assets/i18n/en.json`.

This is the one judgement call worth revisiting: an application whose REST surface includes a real
`/assets/{id}` endpoint would need a narrower pattern. It is configuration precisely so it can be
tuned per target.

`text/plain` API responses are kept. `GET /bo/rest/entities/configuration/common/suiteVersion`
returns a scalar as `text/plain` and is a real endpoint.

## Expected result

Re-recording the same flow should yield 19 requests and 19 responses, with zero orphans:

| | Count |
| --- | ----- |
| Requests captured today | 33 |
| Dropped: `.woff` / `.svg` assets | −10 |
| Dropped: `document` navigations returning HTML | −2 |
| Dropped: `/assets/i18n/en.json` bundles | −2 |
| **Kept** | **19** |

The 19 are 16 real API calls plus the 3 redirect hops. Response count matches at 19: of today's 23
responses, the same 2 HTML pages and 2 bundles are dropped.

## Changes

### `packages/recorder/src/apiFilter.ts`

- `matches()` rejects any URL whose pathname matches `ASSET_PATH_RE`.
- `shouldDropCapturedResponse()` takes a fourth parameter, `resourceType: string`, and returns true
  when `resourceType === "document"` and the content type starts with `text/html`.

### `packages/recorder/src/recorder.ts`

- `inflight` becomes `Map<Request, InflightEntry>` where `InflightEntry` is
  `{ correlationId: string; event: ApiRequestEvent; headersUpgraded: Promise<void> }`.
- The request handler builds the event, stores it, and starts the `allHeaders()` upgrade as a promise
  that mutates the stored event. It no longer pushes to the write queue.
- The response handler awaits `headersUpgraded`, evaluates the drop rule, and on keep pushes the
  request event followed by the response event. On drop it pushes neither.
- The `requestfailed` handler pushes the buffered request event before its `status: 0` response.
- The `stop()` drain pushes each buffered request event before its `status: -1` response.

### `bb.config.jsonc`

- `recorder.apiFilter.dropPathPatterns` gains `"/assets/"`.

### `packages/recorder/test/apiFilter.test.ts` (new)

Unit tests for the pure filter functions: assets rejected at request time; `document` + `text/html`
dropped; `xhr` + `text/html` kept; `document` with no content type (a 302) kept; `text/plain` kept;
`/assets/` rejected via `dropPathPatterns`.

### `packages/recorder/fixtures/app.ts` and `packages/recorder/test/recorder.e2e.test.ts`

The fixture app serves a `.svg` asset and an HTML page, and the page requests both. The e2e asserts
that every recorded `api_request` has a matching `api_response` — the atomicity guarantee — and that
neither the asset nor the HTML page appears.

## Verification

```bash
pnpm -r build
pnpm -r typecheck
pnpm -r --filter '!@backbencher/recorder' test
pnpm --filter @backbencher/recorder test
```

Then re-record the flow and confirm with the counts in "Expected result" that request and response
counts are equal and no `.woff`, `.svg`, or `text/html` body appears in `events.ndjson`.

## Out of scope

- Filtering already-recorded sessions. The existing session must be re-recorded.
- Any change to `dropContentTypes`, `hostAllowlist`, `pathAllowPatterns`, or `resourceTypes`.
- Any change to `packages/derive`.
