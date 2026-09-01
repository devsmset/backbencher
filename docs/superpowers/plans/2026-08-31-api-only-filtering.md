# API-Only Capture Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop recording static assets, page navigations, and static bundles, and make every recorded request/response pair atomic so no orphan events can exist.

**Architecture:** Three tasks in one package. Task 1 changes the two pure filter functions and their configuration, proven by unit tests. Task 2 makes the recorder buffer the `api_request` event so a pair is written whole or not at all. Task 3 proves both end to end against a live browser.

**Tech Stack:** TypeScript (strict, ESM), pnpm workspaces + Turborepo, Vitest, Playwright, Biome.

## Global Constraints

- Spec of record: [docs/superpowers/specs/2026-08-31-api-only-filtering-design.md](../specs/2026-08-31-api-only-filtering-design.md).
- Packages resolve each other through compiled `dist/`, not live source. Run `pnpm -r build` before running tests in a dependent package.
- A green build proves nothing on its own: `build` excludes `test/`, and `portal-web` is built by Vite which strips types without checking. Always also run `pnpm -r typecheck`.
- Repo-wide tests: `pnpm -r --filter '!@backbencher/recorder' test`. Recorder tests run separately: `pnpm --filter @backbencher/recorder test`.
- Use git bash, run from the repository root. Never edit `dist/` or `.planning/`. No `git commit --no-verify`.
- Out of scope: `packages/derive`, `dropContentTypes`, `hostAllowlist`, `pathAllowPatterns`, `resourceTypes`, and filtering already-recorded sessions.
- Behaviour that must survive unchanged: 302 `document` redirect hops are recorded; `text/plain` API responses are recorded; an `xhr` returning `text/html` is recorded.

## File Structure

| File | Task | Responsibility after the change |
| ---- | ---- | ------------------------------- |
| `packages/recorder/src/apiFilter.ts` | 1 | Both filter decisions. `matches()` rejects assets by URL; `shouldDropCapturedResponse()` also rejects `document` navigations returning HTML. |
| `packages/recorder/test/apiFilter.test.ts` | 1 (create) | Unit-proves every keep/drop rule without a browser. |
| `bb.config.jsonc` | 1 | `dropPathPatterns` gains `/assets/`. |
| `packages/recorder/src/recorder.ts` | 2 | Buffers the request event; writes pairs atomically. |
| `packages/recorder/fixtures/app.ts` | 3 | Also serves an SVG asset and an HTML page. |
| `packages/recorder/test/recorder.e2e.test.ts` | 3 | Asserts pair atomicity and asset/page exclusion against a live browser. |

---

### Task 1: Filter rules

**Files:**
- Modify: `packages/recorder/src/apiFilter.ts`
- Modify: `bb.config.jsonc`
- Test: `packages/recorder/test/apiFilter.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `shouldDropCapturedResponse(cfg: ApiFilterConfig, url: string, headers: Record<string, string>, resourceType: string): boolean` — note the new fourth parameter. `makeApiFilter(cfg).matches(method, url, resourceType)` is unchanged in signature.

- [x] **Step 1: Write the failing test**

Create `packages/recorder/test/apiFilter.test.ts`:

```ts
import { ApiFilterConfigSchema } from "@backbencher/shared";
import { describe, expect, it } from "vitest";
import { makeApiFilter, shouldDropCapturedResponse } from "../src/apiFilter.js";

const cfg = ApiFilterConfigSchema.parse({
  hostAllowlist: ["*.otxlab.net"],
  pathAllowPatterns: ["/api/", "/idm-service/", "/bo/"],
  resourceTypes: ["xhr", "fetch"],
  dropContentTypes: ["image/", "font/", "text/css", "text/javascript"],
  dropPathPatterns: ["/analytics", "/telemetry", "/assets/"],
  dropMethods: ["OPTIONS"],
});

const H = "https://te-smax-qa1-m.otxlab.net";
const filter = makeApiFilter(cfg);

describe("matches", () => {
  it("rejects static assets even when their path is allow-listed", () => {
    expect(filter.matches("GET", `${H}/bo/static/media/Metric-Regular.705b.woff`, "other")).toBe(false);
    expect(filter.matches("GET", `${H}/idm-service/idm/v0/favicon.svg`, "other")).toBe(false);
    expect(filter.matches("GET", `${H}/bo/static/media/logo.png`, "other")).toBe(false);
  });

  it("rejects an asset carrying a query string", () => {
    expect(filter.matches("GET", `${H}/bo/static/media/icon.woff2?v=3`, "other")).toBe(false);
  });

  it("rejects static bundles under /assets/", () => {
    expect(filter.matches("GET", `${H}/idm-service/idm/v0/assets/i18n/en.json`, "xhr")).toBe(false);
  });

  it("accepts real api calls", () => {
    expect(filter.matches("GET", `${H}/bo/rest/entities/tenant?limit=250`, "xhr")).toBe(true);
    expect(filter.matches("POST", `${H}/idm-service/idm/v0/api/public/authenticate`, "xhr")).toBe(true);
  });

  it("accepts a document navigation on an allow-listed path", () => {
    expect(filter.matches("POST", `${H}/bo/boLogin`, "document")).toBe(true);
  });
});

describe("shouldDropCapturedResponse", () => {
  const html = { "content-type": "text/html; charset=utf-8" };

  it("drops a document navigation that renders html", () => {
    expect(shouldDropCapturedResponse(cfg, `${H}/idm-service/idm/v0/login?tenant=sysbo`, html, "document")).toBe(true);
  });

  it("keeps an xhr that returns html, which is how session expiry surfaces", () => {
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/rest/entities/user`, html, "xhr")).toBe(false);
  });

  it("keeps a redirect hop, which has no content type", () => {
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/postBoLogin?code=abc`, {}, "document")).toBe(false);
  });

  it("keeps a text/plain api response", () => {
    const headers = { "content-type": "text/plain" };
    const url = `${H}/bo/rest/entities/configuration/common/suiteVersion`;
    expect(shouldDropCapturedResponse(cfg, url, headers, "xhr")).toBe(false);
  });

  it("keeps a json api response", () => {
    const headers = { "content-type": "application/json" };
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/userProfile`, headers, "xhr")).toBe(false);
  });

  it("still drops images and fonts by content type", () => {
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/img`, { "content-type": "image/png" }, "other")).toBe(true);
    expect(shouldDropCapturedResponse(cfg, `${H}/bo/f`, { "content-type": "font/woff2" }, "other")).toBe(true);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
pnpm -r build && pnpm --filter @backbencher/recorder test apiFilter
```

Expected: FAIL. `shouldDropCapturedResponse` takes three arguments, so every call raises
`Expected 3 arguments, but got 4`; the asset and `/assets/` cases in `matches` return `true`.

- [x] **Step 3: Implement the filter changes**

In `packages/recorder/src/apiFilter.ts`, replace `shouldDropCapturedResponse` with:

```ts
export function shouldDropCapturedResponse(
  cfg: ApiFilterConfig,
  url: string,
  headers: Record<string, string>,
  resourceType: string,
): boolean {
  const contentType = headers["content-type"] ?? "";
  // A top-level navigation that renders markup is a page, not an API call (ADR-0004). Scoped to
  // `document` so an XHR answering with an HTML error page — how session expiry usually surfaces —
  // is still recorded.
  if (resourceType === "document" && matchesContentType("text/html", contentType)) return true;
  if (cfg.dropContentTypes.some((pattern) => matchesContentType(pattern, contentType))) {
    return true;
  }
  try {
    return ASSET_PATH_RE.test(new URL(url).pathname);
  } catch {
    return ASSET_PATH_RE.test(url);
  }
}
```

In `makeApiFilter`, add the asset rejection immediately after the URL parse, before the host check:

```ts
      if (ASSET_PATH_RE.test(u.pathname)) return false;
```

In `bb.config.jsonc`, add `/assets/` to `recorder.apiFilter.dropPathPatterns`:

```jsonc
      "dropPathPatterns": ["/analytics", "/telemetry", "/sockjs", "/assets/", "\\.js$", "\\.css$"],
```

- [x] **Step 4: Run the test to verify it passes**

```bash
pnpm -r build && pnpm --filter @backbencher/recorder test apiFilter
```

Expected: PASS, 11 tests. The recorder package will not compile yet if `recorder.ts` still calls
`shouldDropCapturedResponse` with three arguments — fix that call site in Task 2. If `pnpm -r build`
fails on that call, pass `request.resourceType()` as the fourth argument now and leave the rest of
`recorder.ts` alone.

- [x] **Step 5: Commit**

```bash
git add packages/recorder/src/apiFilter.ts packages/recorder/test/apiFilter.test.ts bb.config.jsonc
git commit -m "recorder: reject assets at request time and html page navigations"
```

---

### Task 2: Atomic request/response pairs

**Files:**
- Modify: `packages/recorder/src/recorder.ts`

**Interfaces:**
- Consumes: `shouldDropCapturedResponse(cfg, url, headers, resourceType)` from Task 1.
- Produces: no exported signature changes. `inflight` becomes `Map<Request, InflightEntry>`, an
  internal type: `{ correlationId: string; event: ApiRequestEvent; headersUpgraded: Promise<void> }`.

- [x] **Step 1: Replace the request handler**

In `packages/recorder/src/recorder.ts`, declare the entry type above `startRecording`:

```ts
interface InflightEntry {
  correlationId: string;
  event: ApiRequestEvent;
  /** Resolves when the allHeaders() upgrade has finished mutating `event`. */
  headersUpgraded: Promise<void>;
}
```

Change the map declaration:

```ts
  const inflight = new Map<Request, InflightEntry>();
```

Replace the body of `context.on("request", ...)` after the `apiFilter.matches` guard with:

```ts
    const correlationId = newId();
    const timestamp = Date.now();

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

    // Upgrade to the fuller header set if allHeaders() resolves within 5s (§3.1 bug 4). The event is
    // not written here — it is held until its response decides whether the pair is kept.
    const headersUpgraded = Promise.race([request.allHeaders(), delay(5000)])
      .then((headers) => {
        if (headers) {
          event.headers = headers;
          event.headersSource = "all";
        }
      })
      .catch(() => undefined);

    inflight.set(request, { correlationId, event, headersUpgraded });
```

Note `postDataTruncated: false` is not in the current file — check before copying. If the current
`ApiRequestEvent` literal has no `postDataTruncated`, omit that line; the v4 schema removed it.

- [x] **Step 2: Replace the response handler**

```ts
  context.on("response", async (response: Response) => {
    const request = response.request();
    const entry = inflight.get(request);
    if (!entry) return;
    inflight.delete(request);

    await entry.headersUpgraded;

    // Upgrade to the fuller header set via allHeaders() (raw HTTP headers, incl. ones
    // CORS-safelisting hides from headers()), mirroring the request-side upgrade above.
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

    // Drop the pair whole: writing the request without its response leaves an orphan.
    if (shouldDropCapturedResponse(rec.apiFilter, response.url(), headers, request.resourceType())) {
      return;
    }

    const capture = await captureBody(response);

    writeQueue.push(Object.freeze(entry.event));
    writeQueue.push(
      Object.freeze({
        type: "api_response",
        correlationId: entry.correlationId,
        timestamp: Date.now(),
        status: response.status(),
        headers,
        headersSource,
        bodyKind: capture.bodyKind,
        body: capture.body ?? null,
        ...(capture.bodyBytes !== undefined ? { bodyBytes: capture.bodyBytes } : {}),
      } satisfies ApiResponseEvent),
    );
  });
```

- [x] **Step 3: Replace the requestfailed handler**

A failed API call is an observation worth keeping, so the buffered request is written with its
`status: 0` response.

```ts
  context.on("requestfailed", (request: Request) => {
    const entry = inflight.get(request);
    if (!entry) return;
    inflight.delete(request);
    writeQueue.push(Object.freeze(entry.event));
    writeQueue.push(
      Object.freeze({
        type: "api_response",
        correlationId: entry.correlationId,
        timestamp: Date.now(),
        status: 0, // requestfailed (§3.3)
        headers: {},
        bodyKind: "unavailable",
        body: null,
      } satisfies ApiResponseEvent),
    );
  });
```

- [x] **Step 4: Replace the stop() flush**

In `stop()`, the still-pending flush must now write the buffered request first:

```ts
      // Flush any still-pending requests so nothing is silently dropped (§3.3).
      for (const [, entry] of inflight) {
        writeQueue.push(Object.freeze(entry.event));
        writeQueue.push(
          Object.freeze({
            type: "api_response",
            correlationId: entry.correlationId,
            timestamp: Date.now(),
            status: -1,
            headers: {},
            bodyKind: "unavailable",
            body: null,
          } satisfies ApiResponseEvent),
        );
      }
      inflight.clear();
```

- [x] **Step 5: Build, typecheck, and run the suites**

```bash
pnpm -r build && pnpm -r typecheck && pnpm --filter @backbencher/recorder test && pnpm -r --filter '!@backbencher/recorder' test
```

Expected: PASS. If `satisfies ApiResponseEvent` causes a type error because the event literal is
inferred too loosely, declare the object as `const event: ApiResponseEvent = {...}` and push it
instead — match whichever form the surrounding file already uses.

- [x] **Step 6: Commit**

```bash
git add packages/recorder/src/recorder.ts
git commit -m "recorder: write request and response as an atomic pair"
```

---

### Task 3: End-to-end proof

**Files:**
- Modify: `packages/recorder/fixtures/app.ts`
- Modify: `packages/recorder/test/recorder.e2e.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: nothing.

- [x] **Step 1: Serve an asset and a page from the fixture app**

In `packages/recorder/fixtures/app.ts`, add two routes inside the request handler, before the 404
fallback:

```ts
    if (url === "/api/logo.svg") {
      res.setHeader("content-type", "image/svg+xml");
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
      return;
    }
    if (url === "/api/page") {
      res.setHeader("content-type", "text/html");
      res.end("<!doctype html><html><body>a page, not an api</body></html>");
      return;
    }
```

In the inline `<script>` of `HTML`, fetch both after login so the recorder sees them. Add these two
lines immediately after the `const j = await r.json();` line:

```js
        await fetch('/api/logo.svg');
        await fetch('/api/page');
```

- [x] **Step 2: Assert atomicity and exclusion in the e2e**

In `packages/recorder/test/recorder.e2e.test.ts`, add these assertions immediately after the existing
`expect(eventsText).not.toContain("***REDACTED***");` line:

```ts
    const requests = events.filter((e) => e.type === "api_request");
    const responseIds = new Set(
      events.filter((e) => e.type === "api_response").map((e) => e.correlationId),
    );
    const orphans = requests.filter((r) => !responseIds.has(r.correlationId));
    expect(orphans.map((o) => o.url)).toEqual([]);

    expect(requests.some((r) => r.url.includes("/api/logo.svg"))).toBe(false);
    expect(requests.some((r) => r.url.includes("/api/page"))).toBe(false);
```

`orphans.map(...)` rather than a bare length check so a failure names the offending URLs.

- [x] **Step 3: Run the e2e**

```bash
pnpm -r build && pnpm --filter @backbencher/recorder test
```

Expected: PASS. If no Chromium is installed the e2e suite skips, and the `apiFilter` and
`bodyCapture` unit suites still prove the filter rules — say so explicitly rather than claiming
end-to-end verification that did not run.

- [x] **Step 4: Full verification**

```bash
pnpm -r build && pnpm -r typecheck && pnpm -r --filter '!@backbencher/recorder' test && pnpm --filter @backbencher/recorder test
```

- [x] **Step 5: Commit**

```bash
git add packages/recorder/fixtures/app.ts packages/recorder/test/recorder.e2e.test.ts
git commit -m "recorder: prove pair atomicity and asset exclusion end to end"
```

---

## Self-Review

**Spec coverage.** Spec "Structural: atomic pairs" → Task 2 (all four write sites: response,
requestfailed, stop-flush, plus the buffering itself). "Request-time asset rejection" → Task 1
Step 3. "A `document` navigation that returns HTML" → Task 1 Step 3 with the `xhr`-returning-HTML
counter-case tested. "Configuration: static bundles" → Task 1 Step 3. Spec "Verification" → Task 3
Steps 3-4. No gaps.

**Placeholder scan.** Every step carries literal code. Two steps carry a conditional instruction
(the `postDataTruncated` line in Task 2 Step 1, the `satisfies` fallback in Task 2 Step 5) because
the exact current text of `recorder.ts` depends on the v4 schema change that landed earlier today;
both name the precise check to make and the precise action for each outcome.

**Type consistency.** `shouldDropCapturedResponse` gains its fourth parameter in Task 1 and every
Task 2 call site passes `request.resourceType()`. `InflightEntry` is defined once in Task 2 Step 1
and its three fields are used consistently across Steps 2-4. `ApiRequestEvent` and
`ApiResponseEvent` are the existing schema types, unchanged by this plan.
