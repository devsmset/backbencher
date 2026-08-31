# Verbatim Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every API call verbatim — no redaction, no body cap — so sessions, dataflow edges, and generated tests reflect exactly what the product sent and received.

**Architecture:** Five tasks, ordered so the repository builds and tests green after every one. Consumers stop depending on redaction and truncation first (recorder, then derive), then the schema drops the now-dead flags and bumps the recording format to v4, then the redaction module and its configuration are deleted, then documentation and recorded data are reset.

**Tech Stack:** TypeScript (strict, ESM), pnpm workspaces + Turborepo, Zod schemas, Vitest, Playwright, Biome.

## Global Constraints

- Spec of record: [docs/superpowers/specs/2026-08-31-verbatim-capture-design.md](../specs/2026-08-31-verbatim-capture-design.md). Do not widen scope beyond it.
- Packages resolve each other through compiled `dist/`, **not** live source. Run `pnpm -r build` before running tests in a dependent package.
- Build/dependency order: schemas → shared → llm → derive → store → agent → testkit → recorder → portal-api → portal-web → cli.
- `pnpm -r build` excludes `test/`, and `portal-web` is built by Vite which strips types without checking them. A green build proves nothing on its own — always also run `pnpm -r typecheck` and the test suite.
- Repo-wide test command: `pnpm -r --filter '!@backbencher/recorder' test`. The recorder package is excluded because its e2e drives a live browser; run it separately with `pnpm --filter @backbencher/recorder test`.
- Out of scope, do not touch: binary response body capture, `recorder.apiFilter` (including `dropMethods: ["OPTIONS"]`), and any filtering at the LLM / knowledge-pack / generated-test boundaries.
- Use git bash for all commands. Run them from the repository root, `c:/Users/akarmakar/Projects/backbencher`.
- Do not edit files under `.planning/` or any `dist/` directory. Both are generated and gitignored.
- Commit after every task. Do not use `--no-verify`.

## File Structure

| File | Task | Responsibility after the change |
| ---- | ---- | ------------------------------- |
| `packages/recorder/src/bodyCapture.ts` | 1, 3 | Classify and read a response body in full. No cap, no redaction. |
| `packages/recorder/test/bodyCapture.test.ts` | 1 (create) | Unit-proves full-size and secret-bearing bodies survive, and that binary is still dropped. Runs without a browser. |
| `packages/recorder/src/recorder.ts` | 1, 3 | Write URL, headers, and bodies exactly as Playwright reports them. |
| `packages/recorder/test/recorder.e2e.test.ts` | 1 | Live-browser proof that the password and server token reach `events.ndjson` verbatim. |
| `packages/derive/src/dataflow.ts` | 2 | Collect every producer/consumer value. No `REDACTED` substring filter. |
| `packages/derive/src/types.ts`, `pairCalls.ts`, `inferSchemas.ts`, `volatile.ts` | 2 | `PairedCall` without truncation flags; every body contributes to inference. |
| `packages/derive/fixtures/sessions.ts` | 2, 3 | Fixtures; gains `literalRedactedFixture`. |
| `packages/derive/test/dataflow.test.ts` | 2 | Proves a value containing the substring `REDACTED` now produces an edge. |
| `packages/schemas/src/recording.ts` | 3 | v4 event contract without `postDataTruncated` / `bodyTruncated`. |
| `packages/schemas/generated/jsonschema/RecordingEvent.schema.json` | 3 | Regenerated artifact. Never hand-edited. |
| `packages/shared/src/config.ts`, `index.ts` | 4 | Config surface without `redaction` and without `recorder.bodyCapBytes`. |
| `packages/shared/src/redaction.ts`, `packages/shared/test/redaction.test.ts` | 4 (delete) | — |
| `packages/shared/test/config.test.ts` | 4 (create) | Locks in that the config surface no longer offers redaction or a body cap. |
| `bb.config.jsonc` | 4 | Runtime config without the `redaction` block and `bodyCapBytes`. |
| `docs/adr/0006-verbatim-capture.md` | 5 (create) | Records the decision and the credential-handling constraints. |
| `docs/ARCHITECTURE.md`, `README.md` | 5 | Documentation matches reality. |

---

### Task 1: Recorder captures verbatim

Removes redaction and the body cap from the capture path. The `postDataTruncated` and `bodyTruncated`
fields are still written as `false` here because the schema still requires them; Task 3 removes them.

**Files:**
- Modify: `packages/recorder/src/bodyCapture.ts` (whole file)
- Modify: `packages/recorder/src/recorder.ts:13-22, 76, 110-140, 152-170`
- Test: `packages/recorder/test/bodyCapture.test.ts` (create)
- Test: `packages/recorder/test/recorder.e2e.test.ts:9-12, 22, 55-68`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `captureBody(response: Response): Promise<BodyCapture>` — the `cap: number` and
  `cfg: RedactionConfig` parameters are gone. `BodyCapture` keeps the shape
  `{ bodyKind: "json" | "text" | "binary" | "empty" | "unavailable"; body: unknown; bodyBytes?: number; bodyTruncated: boolean }`
  until Task 3.

- [ ] **Step 1: Write the failing test**

Create `packages/recorder/test/bodyCapture.test.ts`:

```ts
import type { Response } from "playwright";
import { describe, expect, it } from "vitest";
import { captureBody } from "../src/bodyCapture.js";

// captureBody only ever calls headers() and body(); a structural stand-in avoids a live browser.
function fakeResponse(headers: Record<string, string>, body: Buffer): Response {
  return { headers: () => headers, body: async () => body } as unknown as Response;
}

describe("captureBody", () => {
  it("keeps a JSON body larger than the old 256 KiB cap as parsed JSON", async () => {
    const big = { note: "x".repeat(300_000) };
    const buf = Buffer.from(JSON.stringify(big), "utf8");

    const capture = await captureBody(fakeResponse({ "content-type": "application/json" }, buf));

    expect(capture.bodyKind).toBe("json");
    expect(capture.body).toEqual(big);
    expect(capture.bodyBytes).toBe(buf.length);
  });

  it("keeps secret-named fields verbatim", async () => {
    const buf = Buffer.from(JSON.stringify({ password: "hunter2", token: "abc123" }), "utf8");

    const capture = await captureBody(fakeResponse({ "content-type": "application/json" }, buf));

    expect(capture.body).toEqual({ password: "hunter2", token: "abc123" });
  });

  it("still drops a binary body but records its size", async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const capture = await captureBody(fakeResponse({ "content-type": "image/png" }, buf));

    expect(capture.bodyKind).toBe("binary");
    expect(capture.body).toBeNull();
    expect(capture.bodyBytes).toBe(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @backbencher/recorder test
```

Expected: FAIL. `captureBody` currently takes three arguments, so the calls raise
`Expected 3 arguments, but got 1`, and the 300 KB body would come back as `bodyKind: "text"`.

- [ ] **Step 3: Rewrite `bodyCapture.ts`**

Replace the entire contents of `packages/recorder/src/bodyCapture.ts` with:

```ts
import type { Response } from "playwright";

// Response body handling (architecture §3.4). Read eagerly inside the response handler —
// lazily-read bodies get evicted from Playwright's buffer.

export interface BodyCapture {
  bodyKind: "json" | "text" | "binary" | "empty" | "unavailable";
  body: unknown;
  bodyBytes?: number;
  bodyTruncated: boolean;
}

export async function captureBody(response: Response): Promise<BodyCapture> {
  const ct = (response.headers()["content-type"] ?? "").toLowerCase();
  let buf: Buffer;
  try {
    buf = await response.body();
  } catch {
    // 204s, redirects, evicted bodies
    return { bodyKind: "unavailable", body: null, bodyTruncated: false };
  }
  if (buf.length === 0) return { bodyKind: "empty", body: null, bodyTruncated: false };
  if (!ct.includes("json") && !ct.startsWith("text/")) {
    return { bodyKind: "binary", body: null, bodyBytes: buf.length, bodyTruncated: false };
  }
  const text = buf.toString("utf8");
  if (ct.includes("json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      return { bodyKind: "json", body: parsed, bodyBytes: buf.length, bodyTruncated: false };
    } catch {
      // malformed JSON — keep the raw text rather than losing the body
    }
  }
  return { bodyKind: "text", body: text, bodyBytes: buf.length, bodyTruncated: false };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @backbencher/recorder test
```

Expected: the three `captureBody` tests PASS. The `recorder e2e` suite either fails on the canary
assertion (fixed in Step 6) or is skipped if no Chromium is installed.

- [ ] **Step 5: Strip redaction from `recorder.ts`**

In `packages/recorder/src/recorder.ts`, remove the three redaction imports so the `@backbencher/shared`
import block reads:

```ts
import {
  type BbConfig,
  childLogger,
  dataDir,
  loadConfig,
  newId,
} from "@backbencher/shared";
```

Delete the line `const redaction = config.redaction;` (just below `const rec = config.recorder;`).

In the `context.on("request", ...)` handler, replace the `postData` block and the event literal with:

```ts
    let postData: string | null = null;
    try {
      postData = request.postData() ?? null;
    } catch {
      postData = null;
    }

    const event: ApiRequestEvent = {
      type: "api_request",
      correlationId,
      timestamp,
      method,
      url,
      resourceType: mapResourceType(resourceType),
      headers: request.headers(),
      headersSource: "sync",
      postData,
      postDataTruncated: false,
    };
```

(`let postDataTruncated = false;` and the `Buffer.byteLength` cap check are deleted outright.)

In the same handler's header upgrade, drop the `redactHeaders` wrapper:

```ts
    Promise.race([request.allHeaders(), delay(5000)])
      .then((headers) => {
        if (headers) {
          event.headers = headers;
          event.headersSource = "all";
        }
        writeQueue.push(Object.freeze(event));
      })
      .catch(() => writeQueue.push(Object.freeze(event)));
```

In the `context.on("response", ...)` handler, replace the header capture and the `captureBody` call:

```ts
    let headers = response.headers();
    let headersSource: "sync" | "all" = "sync";
    try {
      const allHeaders = await Promise.race([response.allHeaders(), delay(5000)]);
      if (allHeaders) {
        headers = allHeaders;
        headersSource = "all";
      }
    } catch {
      // Keep the sync headers already captured above.
    }

    if (shouldDropCapturedResponse(rec.apiFilter, response.url(), headers)) return;

    const capture = await captureBody(response);
```

Leave `shouldDropCapturedResponse`, the `requestfailed` handler, and everything below unchanged.

- [ ] **Step 6: Update the e2e test to assert the opposite**

In `packages/recorder/test/recorder.e2e.test.ts`, replace the header comment (lines 10-12) with:

```ts
// Real e2e: Playwright drives the fixture app while the recorder captures. Verifies events are
// schema-valid and that a typed password and a server-issued token are stored verbatim.
// Skips gracefully if no Chromium is installed.
```

Rename the canary value so it no longer claims the opposite of what is asserted:

```ts
const CANARY = "hunter2-canary-PASSWORD-stored-verbatim";
```

Replace the final assertion loop (the `for (const f of [...])` block) with:

```ts
    const eventsText = readFileSync(result.eventsPath, "utf8");
    expect(eventsText).toContain(CANARY);
    expect(eventsText).toContain("server-issued-token");
    expect(eventsText).not.toContain("***REDACTED***");
```

The `join` import is still used by `sessionDir` handling elsewhere in the file; leave the import list alone.

- [ ] **Step 7: Build, typecheck, and run the recorder tests**

```bash
pnpm -r build && pnpm -r typecheck && pnpm --filter @backbencher/recorder test
```

Expected: PASS. If Chromium is absent the `recorder e2e` suite reports as skipped, which is acceptable —
the `captureBody` unit tests still prove the change.

- [ ] **Step 8: Run the repo-wide suite to confirm nothing else broke**

```bash
pnpm -r --filter '!@backbencher/recorder' test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/recorder/src/bodyCapture.ts packages/recorder/src/recorder.ts packages/recorder/test/bodyCapture.test.ts packages/recorder/test/recorder.e2e.test.ts
git commit -m "recorder: capture urls, headers, and bodies verbatim"
```

---

### Task 2: Derive stops compensating for missing data

Deletes the `REDACTED` substring filter that was severing real dataflow edges, and drops the
truncation flags from `PairedCall`. The schema still emits those flags; `pairCalls` simply stops
reading them.

**Files:**
- Modify: `packages/derive/src/dataflow.ts:27-28, 63, 69, 89, 94, 100, 105`
- Modify: `packages/derive/src/types.ts:28, 34`
- Modify: `packages/derive/src/pairCalls.ts:53, 59`
- Modify: `packages/derive/src/inferSchemas.ts:22, 33`
- Modify: `packages/derive/src/volatile.ts:29`
- Modify: `packages/derive/fixtures/sessions.ts` (add one fixture)
- Test: `packages/derive/test/dataflow.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at the type level.
- Produces: `PairedCall` without `requestBodyTruncated` and `responseBodyTruncated`;
  `literalRedactedFixture(): SessionData` exported from `packages/derive/fixtures/sessions.ts`.

- [ ] **Step 1: Write the failing test**

Append to `packages/derive/fixtures/sessions.ts`, directly after `dataflowFixture`:

```ts
// A legitimate identifier that happens to contain the substring "REDACTED". The old isRedacted()
// guard dropped any such value, severing a real edge.
export function literalRedactedFixture(): SessionData {
  resetClock();
  const sid = "REDACTED-SESSION-9f8e7d6c";
  return makeSession("sess-literal-redacted", [
    ...apiCall("lr1", { url: `${H}/auth/session`, body: { sid } }),
    ...apiCall("lr2", { url: `${H}/api/things?sid=${sid}`, body: { ok: true } }),
  ]);
}
```

Add this test to `packages/derive/test/dataflow.test.ts`, inside the existing
`describe("buildDataflowGraph", ...)` block, and extend the fixture import on line 2 to
`import { dataflowFixture, literalRedactedFixture } from "../fixtures/sessions.js";`:

```ts
  it("links a value that contains the substring REDACTED", () => {
    const result = runDerivation([literalRedactedFixture()]);
    const edge = result.dataflow.find(
      (e) => e.producer.jsonPath === "$.sid" && e.consumer.jsonPath === "sid",
    );
    expect(edge).toBeDefined();
    expect(edge?.producer.location).toBe("responseBody");
    expect(edge?.consumer.location).toBe("query");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm -r build && pnpm --filter @backbencher/derive test
```

Expected: FAIL on the new test with `expected undefined not to be undefined` — `isRedacted` drops
both the producer and the consumer, so no edge is built.

- [ ] **Step 3: Delete `isRedacted` and its guards**

In `packages/derive/src/dataflow.ts`, delete the function:

```ts
function isRedacted(v: string): boolean {
  return v.includes("REDACTED");
}
```

In `collectProducers`, delete the line `if (isRedacted(leaf.value)) continue;`, and change the
response-header guard to:

```ts
        if (STD_RES_HEADERS.has(name.toLowerCase())) continue;
```

In `collectConsumers`, make these four changes:

```ts
      const value = c.segments[p.position];
      if (value) {
        consumers.push({ op, location: "path", jsonPath: p.name, value, ts: c.requestTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
      }
    }
    for (const [name, value] of c.query) {
      consumers.push({ op, location: "query", jsonPath: name, value, ts: c.requestTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
    }
    if (c.requestBody !== null && c.requestBody !== undefined) {
      for (const leaf of walkScalars(c.requestBody)) {
        consumers.push({ op, location: "requestBody", jsonPath: leaf.path, value: leaf.value, ts: c.requestTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
      }
    }
    for (const [name, value] of Object.entries(c.requestHeaders)) {
      if (STD_REQ_HEADERS.has(name.toLowerCase())) continue;
      consumers.push({ op, location: "requestHeader", jsonPath: name, value, ts: c.requestTimestamp, sessionId: c.sessionId, correlationId: c.correlationId });
    }
```

Leave `STD_REQ_HEADERS`, `STD_RES_HEADERS`, `COMMON_WORDS`, and `entropy` untouched. `authorization`
and `cookie` stay on `STD_REQ_HEADERS` — that is an unrelated noise filter, and ADR-0004's dependency
detection relies on it.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm -r build && pnpm --filter @backbencher/derive test
```

Expected: PASS, including the pre-existing `links a token produced in a response` test.

- [ ] **Step 5: Drop the truncation flags from `PairedCall`**

In `packages/derive/src/types.ts`, delete the two lines `requestBodyTruncated: boolean;` and
`responseBodyTruncated: boolean;` from the `PairedCall` interface.

In `packages/derive/src/pairCalls.ts`, delete `requestBodyTruncated: req.postDataTruncated,` and
`responseBodyTruncated: res ? res.bodyTruncated : false,` from the `calls.push({...})` literal.

In `packages/derive/src/inferSchemas.ts`, simplify both guards:

```ts
  const bodies = calls
    .filter((c) => isObjectBody(c.requestBody))
    .map((c) => c.requestBody);
```

```ts
    if (c.status === null) continue;
```

In `packages/derive/src/volatile.ts`, inside `detectVolatileFields`:

```ts
    if (c.status === null) continue;
```

- [ ] **Step 6: Build, typecheck, and run the full suite**

```bash
pnpm -r build && pnpm -r typecheck && pnpm -r --filter '!@backbencher/recorder' test
```

Expected: PASS. `pairCalls` no longer reads `postDataTruncated`/`bodyTruncated`, but the schema still
defines them, so nothing else needs changing yet.

- [ ] **Step 7: Commit**

```bash
git add packages/derive/src packages/derive/test/dataflow.test.ts packages/derive/fixtures/sessions.ts
git commit -m "derive: keep every captured value in the dataflow graph"
```

---

### Task 3: Recording schema v4 drops the truncation flags

With no cap, `postDataTruncated` and `bodyTruncated` are permanently `false`. Remove them and bump
the recording format version so a stale v3 file fails loudly at parse instead of being misread.

**Files:**
- Modify: `packages/schemas/src/recording.ts:3-4, 7, 40-58`
- Modify: `packages/schemas/generated/jsonschema/RecordingEvent.schema.json` (regenerated, not hand-edited)
- Modify: `packages/schemas/test/schemas.test.ts:22`
- Modify: `packages/recorder/src/bodyCapture.ts` (drop `bodyTruncated`)
- Modify: `packages/recorder/src/recorder.ts:28, 212` and the two response event literals
- Modify: `packages/derive/fixtures/sessions.ts:37, 47, 59`
- Modify: `packages/store/test/store.test.ts:91`
- Modify: `scripts/e2e-portal.mjs:44, 46, 49`

**Interfaces:**
- Consumes: `captureBody(response)` from Task 1; `PairedCall` from Task 2.
- Produces: `ApiRequestEvent` without `postDataTruncated`; `ApiResponseEvent` without `bodyTruncated`;
  `BodyCapture` narrowed to `{ bodyKind; body; bodyBytes? }`; `RecordingMeta.version` is the literal
  `4`; `RECORDER_VERSION === "4.0.0"`.

- [ ] **Step 1: Write the failing test**

In `packages/schemas/test/schemas.test.ts`, delete the line `postDataTruncated: false,` from
`baseRequest` and add this test inside `describe("recording contracts", ...)`:

```ts
  it("rejects a v3 session meta", () => {
    expect(() =>
      RecordingMetaSchema.parse({
        version: 3,
        sessionId: "s1",
        startUrl: "https://example.net/",
        startedAt: 1,
        userAgent: "t",
        recorderVersion: "t",
        name: "n",
        goal: "g",
      }),
    ).toThrow();
  });
```

Add `RecordingMetaSchema` to the import list at the top of the file, keeping the existing entries in
alphabetical order:

```ts
import {
  ApiRequestEventSchema,
  KnowledgePackSchema,
  OperationSchema,
  RecordingEventSchema,
  RecordingMetaSchema,
  TestSpecSchema,
  schemaRegistry,
} from "../src/index.js";
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @backbencher/schemas test
```

Expected: FAIL — `rejects a v3 session meta` does not throw (version 3 is still the literal), and
`parses a valid api_request event` fails because `postDataTruncated` is still required.

- [ ] **Step 3: Update the recording schema**

In `packages/schemas/src/recording.ts`, change the header comment and the version literal:

```ts
// Session recording v4 (realignment guide §3) — pure, timestamped API request/response
// sequences. No UI events, no locators, no popups: a session is a scenario made of API calls.
// Everything is stored verbatim: no redaction, no body cap (ADR-0006).

const SessionMetaBase = z.object({
  version: z.literal(4),
```

Replace the tail of `ApiRequestEventSchema` (from `headers` onward) with:

```ts
  headers: z.record(z.string()),
  headersSource: z.enum(["sync", "all"]), // §3.1 bug 4: which header set was captured
  postData: z.string().nullable(),
});
```

In `ApiResponseEventSchema`, update the `body` comment and delete `bodyTruncated`:

```ts
  bodyKind: z.enum(["json", "text", "binary", "empty", "unavailable"]),
  body: z.unknown().nullable(), // parsed JSON if json, full string if text, null otherwise
  bodyBytes: z.number().int().optional(),
  timing: z
```

- [ ] **Step 4: Regenerate the JSON Schema artifact**

```bash
pnpm --filter @backbencher/schemas gen:jsonschema
git --no-pager diff --stat packages/schemas/generated
```

Expected: `RecordingEvent.schema.json` loses its `postDataTruncated` and `bodyTruncated` properties
and their `required` entries. Do not edit this file by hand.

- [ ] **Step 5: Update every producer of the two fields**

`packages/recorder/src/bodyCapture.ts` — delete `bodyTruncated: boolean;` from the `BodyCapture`
interface and `bodyTruncated: false` from all five return statements. The file becomes:

```ts
import type { Response } from "playwright";

// Response body handling (architecture §3.4). Read eagerly inside the response handler —
// lazily-read bodies get evicted from Playwright's buffer.

export interface BodyCapture {
  bodyKind: "json" | "text" | "binary" | "empty" | "unavailable";
  body: unknown;
  bodyBytes?: number;
}

export async function captureBody(response: Response): Promise<BodyCapture> {
  const ct = (response.headers()["content-type"] ?? "").toLowerCase();
  let buf: Buffer;
  try {
    buf = await response.body();
  } catch {
    // 204s, redirects, evicted bodies
    return { bodyKind: "unavailable", body: null };
  }
  if (buf.length === 0) return { bodyKind: "empty", body: null };
  if (!ct.includes("json") && !ct.startsWith("text/")) {
    return { bodyKind: "binary", body: null, bodyBytes: buf.length };
  }
  const text = buf.toString("utf8");
  if (ct.includes("json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      return { bodyKind: "json", body: parsed, bodyBytes: buf.length };
    } catch {
      // malformed JSON — keep the raw text rather than losing the body
    }
  }
  return { bodyKind: "text", body: text, bodyBytes: buf.length };
}
```

`packages/recorder/src/recorder.ts` — four edits:

```ts
export const RECORDER_VERSION = "4.0.0";
```

Delete `postDataTruncated: false,` from the `ApiRequestEvent` literal.

Delete `bodyTruncated: capture.bodyTruncated,` from the `api_response` event in the response handler,
and `bodyTruncated: false,` from the `api_response` event in the `requestfailed` handler.

In the `meta` literal, change `version: 3,` to `version: 4,`.

`packages/derive/fixtures/sessions.ts` — delete `postDataTruncated: false,` from the `req` literal in
`apiCall`, delete `bodyTruncated: false,` from the `res` literal, and change `version: 3,` to
`version: 4,` in `makeSession`.

`packages/store/test/store.test.ts` — in the `upsertFromMeta` call, change `version: 3,` to `version: 4,`.

`scripts/e2e-portal.mjs` — change both `version: 3` occurrences (the `upsertFromMeta` call and the
`meta.json` write) to `version: 4`, and delete `postDataTruncated: false` from the `api_request`
object written into `events.ndjson`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm -r build && pnpm -r typecheck && pnpm -r --filter '!@backbencher/recorder' test && pnpm --filter @backbencher/recorder test
```

Expected: PASS. If `pnpm -r typecheck` reports a leftover `postDataTruncated` or `bodyTruncated`
reference, fix that call site — the search below should be empty.

- [ ] **Step 7: Verify no references survive**

```bash
git --no-pager grep -n "postDataTruncated\|bodyTruncated\|responseBodyTruncated\|requestBodyTruncated\|version: 3\|literal(3)" -- ':!*/dist/*'
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add packages/schemas packages/recorder/src packages/derive/fixtures/sessions.ts packages/store/test/store.test.ts scripts/e2e-portal.mjs
git commit -m "schemas: recording v4 without truncation flags"
```

---

### Task 4: Delete the redaction layer

Nothing imports `@backbencher/shared`'s redaction functions after Tasks 1-3, so the module and its
configuration can go.

**Files:**
- Delete: `packages/shared/src/redaction.ts`
- Delete: `packages/shared/test/redaction.test.ts`
- Modify: `packages/shared/src/index.ts:4`
- Modify: `packages/shared/src/config.ts:21, 26-39, 135`
- Modify: `bb.config.jsonc:16, 18-38`
- Test: `packages/shared/test/config.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `BbConfig` without the `redaction` key; `RecorderConfig` without `bodyCapBytes`.
  `RedactionConfigSchema` and the `RedactionConfig` type no longer exist.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BbConfigSchema } from "../src/config.js";

describe("BbConfigSchema", () => {
  it("has no redaction surface", () => {
    const cfg = BbConfigSchema.parse({});
    expect(cfg).not.toHaveProperty("redaction");
  });

  it("has no body cap", () => {
    const cfg = BbConfigSchema.parse({});
    expect(cfg.recorder).not.toHaveProperty("bodyCapBytes");
  });

  it("still defaults the recorder api filter", () => {
    const cfg = BbConfigSchema.parse({});
    expect(cfg.recorder.apiFilter.dropMethods).toEqual(["OPTIONS"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @backbencher/shared test
```

Expected: FAIL on the first two tests — `redaction` and `bodyCapBytes` are still defaulted onto the
parsed config.

- [ ] **Step 3: Delete the module and its configuration**

```bash
rm packages/shared/src/redaction.ts packages/shared/test/redaction.test.ts
```

In `packages/shared/src/index.ts`, delete the line `export * from "./redaction.js";`. The file becomes:

```ts
export * from "./config.js";
export * from "./logger.js";
export * from "./ids.js";
```

In `packages/shared/src/config.ts`, delete the line `bodyCapBytes: z.number().int().positive().default(262144),`
from `RecorderConfigSchema`, delete the whole `RedactionConfigSchema` declaration and its
`export type RedactionConfig = ...` line, and delete `redaction: RedactionConfigSchema.default({}),`
from `BbConfigSchema`, which becomes:

```ts
export const BbConfigSchema = z.object({
  recorder: RecorderConfigSchema.default({}),
  agent: AgentConfigSchema.default({}),
  llm: LlmConfigSchema.default({}),
  environments: z.array(EnvironmentConfigSchema).default([]),
});
```

In `bb.config.jsonc`, delete the `"bodyCapBytes": 262144,` line from the `recorder` block and the
entire `"redaction": { ... }` block. The top of the file becomes:

```jsonc
{
  // Backbencher configuration (architecture §3.2). Loaded by @backbencher/shared.
  "recorder": {
    "defaultUrl": null, // must be passed via --url when null
    "tlsPermissive": false, // opt-in; sets ignoreHTTPSErrors + cert flags
    "apiFilter": {
      "hostAllowlist": ["*.otxlab.net"], // empty = all hosts
      "pathAllowPatterns": ["/api/", "/idm-service/", "/bo/"],
      "resourceTypes": ["xhr", "fetch"],
      "dropContentTypes": ["image/", "font/", "text/css", "text/javascript"],
      "dropPathPatterns": ["/analytics", "/telemetry", "/sockjs", "\\.js$", "\\.css$"],
      "dropMethods": ["OPTIONS"]
    },
    "inputDebounceMs": 1000,
    "blockServiceWorkers": true
  },
  // Deprecated: superseded by "llm" below. Still honoured when "llm.models" is empty.
  "agent": {
```

`redaction.uiRedactSelectors` had no consumer in any source file — it survived only in stale `dist/`
artifacts from the pre-ADR-0004 DOM-capture recorder — so it needs no replacement.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm -r build && pnpm -r typecheck && pnpm -r --filter '!@backbencher/recorder' test && pnpm --filter @backbencher/recorder test
```

Expected: PASS.

- [ ] **Step 5: Verify no references survive**

```bash
git --no-pager grep -in "redact\|bodyCapBytes" -- ':!*/dist/*' ':!docs/*' ':!README.md'
```

Expected: only `packages/recorder/test/recorder.e2e.test.ts`, which asserts
`expect(eventsText).not.toContain("***REDACTED***")`. Documentation is handled in Task 5.

- [ ] **Step 6: Commit**

```bash
git add -A packages/shared bb.config.jsonc
git commit -m "shared: delete the redaction layer and the body cap"
```

---

### Task 5: Documentation, ADR, and data reset

**Files:**
- Create: `docs/adr/0006-verbatim-capture.md`
- Modify: `docs/ARCHITECTURE.md:52, 58, 83, 115-117, 341, 375-376`
- Modify: `README.md:37`
- Delete: contents of `data/sessions/` and `data/knowledge-packs/`

**Interfaces:**
- Consumes: every change from Tasks 1-4.
- Produces: nothing consumed by code.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0006-verbatim-capture.md`:

```markdown
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
```

- [ ] **Step 2: Update `docs/ARCHITECTURE.md`**

Line 52 — drop redaction from the config description:

```
├── bb.config.jsonc          recorder, llm models/tasks, environments
```

Line 58 — drop redaction from the shared package description:

```
│   ├── shared/              config, logger, ids, dataDir
```

Line 83 — the `ApiResponseEventSchema` summary no longer has truncation flags:

```
  status, `bodyKind`, `bodyBytes`).
```

Lines 115-117 — the `bodyCapture.ts` bullet:

```
- **`bodyCapture.ts`** — reads the body eagerly inside the response handler, which avoids Playwright's
  evicted-body trap; stores it in full; classifies `json|text|binary|empty|unavailable`. Binary bodies
  are dropped, with `bodyBytes` recorded.
```

Line 341 — replace invariant 8:

```
8. **Capture verbatim.** No redaction, no body cap. Sessions hold live credentials, so `data/` stays
   gitignored and recordings use non-production accounts (ADR-0006).
```

Lines 375-376 — the History section no longer credits redaction and truncation:

```
correlationId-based pairing and entropy-gated dataflow exist because the prototype got those wrong.
Capture-time redaction and body truncation were later removed for the reasons in ADR-0006.
See ADR-0003, ADR-0004, and ADR-0006.
```

- [ ] **Step 3: Update `README.md`**

Line 37:

```
Configure hosts to record, model routing, and target environments in
```

- [ ] **Step 4: Reset the recorded data**

Both directories are gitignored, so this is a filesystem-only change:

```bash
rm -rf data/sessions data/knowledge-packs
```

Delete the SQLite store too, since it holds operations derived from the v3 sessions:

```bash
rm -f data/backbencher.db data/backbencher.db-shm data/backbencher.db-wal
```

- [ ] **Step 5: Full verification**

```bash
pnpm -r build && pnpm -r typecheck && pnpm -r --filter '!@backbencher/recorder' test && pnpm --filter @backbencher/recorder test
```

Expected: PASS across every package.

- [ ] **Step 6: Commit**

```bash
git add docs README.md
git commit -m "docs: ADR-0006 verbatim capture"
```

- [ ] **Step 7: Manual acceptance — record a fresh session**

Record against a real target, then inspect `data/sessions/<id>/events.ndjson` and confirm all four:

1. an `Authorization` header carries its real token value, not `Bearer ***REDACTED***`;
2. a `Cookie` header carries its real value;
3. a response body larger than 262144 bytes is stored in full with `bodyKind: "json"`, not `"text"`;
4. a request body containing a `password` or `token` field carries the real value.

Then run derivation over that session and confirm the dataflow graph contains at least one edge whose
value is a token or session identifier — an edge redaction previously suppressed. Report the results
rather than assuming them.

---

## Self-Review

**Spec coverage.** Spec §1 (delete the redaction layer) → Task 4. §2 (recorder captures verbatim) →
Task 1, with the `bodyCapBytes` config removal deferred to Task 4 because the recorder must stop
reading it first. §3 (schema drops the flags, version bump) → Task 3. §4 (derive stops compensating)
→ Task 2. §5 (data reset and documentation) → Task 5. Spec "Verification" → Task 5 Steps 5-7. No gaps.

**Placeholder scan.** Every code step carries the literal replacement text. No "TBD", no "add
appropriate error handling", no "similar to Task N".

**Type consistency.** `captureBody` is defined once per shape and both are shown in full:
`captureBody(response): Promise<BodyCapture>` with `bodyTruncated` in Task 1, without it in Task 3.
`BodyCapture`, `PairedCall`, `ApiRequestEvent`, `ApiResponseEvent`, `RecordingMeta.version`, and
`literalRedactedFixture` are consistent across the tasks that use them. Task 1 deliberately keeps
`postDataTruncated: false` and `bodyTruncated: false`, which Task 3 removes — this is the ordering
that keeps the build green after every task, and both tasks list the file.
