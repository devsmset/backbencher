# Backbencher — Architecture & Implementation Guide

**Target audience:** a coding agent (Claude Sonnet-class) plus human reviewers.
**Input state:** the existing JS prototype described in the technical report (recorder.js + filter-api.js).
**Target state:** a full API-QA platform — Recorder → Derivation → Knowledge Store → Analyst Portal → QA Agent → Test Compiler/Runner.

This document is prescriptive. Where it says MUST, implement exactly that. Where it says SHOULD, deviate only with a written reason in the PR description.

---

## 0. Language Decision: Rewrite in TypeScript — YES

Rewrite everything in TypeScript. This is not cosmetic; it is load-bearing for this specific system:

1. **The whole product is data contracts.** Recording schema, derived API spec, analyst annotations, agent knowledge pack, test spec — five serialized formats flowing across six packages. In JS these contracts live in prose (the tech report §5 is literally hand-maintained schema documentation). In TS they live once in a `schemas` package as Zod schemas, from which you get: compile-time types (`z.infer`), runtime validation at every package boundary, and generated JSON Schema for non-TS consumers (the LLM prompt, external tools).
2. **The known bugs in the report are type-shaped bugs.** Bug #1 (operator precedence on possibly-null `text`) is caught by `strictNullChecks`. Bug #3 (URL-heuristic pairing) disappears when `correlationId` is a required field of both event types. Bug #4 (header mutation race) is prevented by making event objects `Readonly<>` after append.
3. **Coding-agent leverage.** Types are guardrails for LLM-driven development: `tsc --noEmit` in CI catches a large class of agent mistakes before tests run, and typed repository/tRPC layers let the agent discover APIs from signatures instead of guessing.
4. **The portal needs it anyway.** A React portal + API server in 2026 without types is self-sabotage; tRPC gives end-to-end type safety between portal-web and portal-api with zero client codegen.

**One deliberate exception:** the browser-injected instrumentation script (locator generation + DOM listeners) is authored as TypeScript but **compiled to a single self-contained JS string at build time** (esbuild `--bundle --format=iife`) and injected via `addInitScript`. This also kills report bug #2 (200-line duplication) — one source, one artifact, injected in both code paths.

**Toolchain (fixed, do not bikeshed):**

| Concern | Choice |
|---|---|
| Runtime | Node 22 LTS |
| Package manager / monorepo | pnpm workspaces |
| Task runner | turborepo |
| Bundler for injected script & CLI | esbuild |
| Validation / types-from-schema | zod v3 + `zod-to-json-schema` |
| DB | SQLite via Drizzle ORM (upgrade path: Postgres — Drizzle supports both; write no raw SQL outside migrations) |
| API server | Fastify + tRPC (`@trpc/server` with `fastify` adapter) |
| Portal frontend | React 18 + Vite + TanStack Query + tRPC client |
| Test framework (our own tests) | Vitest |
| Generated API tests | Playwright Test (`@playwright/test`, API-mode via `request` fixture) |
| Lint/format | Biome (single tool, fast) |
| LLM access | `@anthropic-ai/sdk` |

`tsconfig` base MUST enable: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`. ESM everywhere (`"type": "module"`).

---

## 1. System Overview

```
                ┌────────────────────────────────────────────────────────────┐
                │                        PORTAL (web UI)                     │
                │  session review · endpoint curation · docs · analyst      │
                │  guides · flow builder · scenario decisions · approvals    │
                └───────────────▲───────────────────────────┬────────────────┘
                                │ tRPC                      │ export
┌──────────┐  NDJSON   ┌────────┴───────┐   derived   ┌─────▼──────────┐
│ RECORDER │──────────▶│ INGEST+DERIVE  │────────────▶│ KNOWLEDGE      │
│ (human   │ sessions  │ (deterministic │   facts     │ STORE (SQLite) │
│  drives  │           │  pipeline)     │             │ derived+human  │
│  browser)│           └────────────────┘             └─────┬──────────┘
└──────────┘                                                │ knowledge pack
                                                            ▼
                                                   ┌────────────────┐
                                                   │  QA AGENT      │
                                                   │  scenario →    │
                                                   │  TestSpec YAML │
                                                   └─────┬──────────┘
                                                         │ compile
                                                   ┌─────▼──────────┐
                                                   │  TESTKIT       │
                                                   │  Playwright    │
                                                   │  tests + run + │
                                                   │  report        │
                                                   └────────────────┘
```

Core principle carried through every layer: **derived facts and human knowledge are separate, layered records.** Derivation is re-runnable and never overwrites analyst input; the agent consumes a merged view where human input wins.

### 1.1 Monorepo layout

```
backbencher/
├── package.json                  # workspace root, private
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
├── tsconfig.base.json
├── .env.example
├── packages/
│   ├── schemas/                  # @backbencher/schemas — Zod contracts, NO deps on other pkgs
│   ├── shared/                   # @backbencher/shared — logger, config loader, redaction, ids
│   ├── recorder/                 # @backbencher/recorder — Playwright capture CLI
│   │   └── src/injected/         # instrumentation TS, bundled to string at build
│   ├── derive/                   # @backbencher/derive — deterministic derivation pipeline
│   ├── store/                    # @backbencher/store — Drizzle schema, migrations, repositories
│   ├── portal-api/               # @backbencher/portal-api — Fastify + tRPC + static portal hosting
│   ├── portal-web/               # @backbencher/portal-web — React app
│   ├── agent/                    # @backbencher/agent — knowledge pack, prompts, TestSpec generation
│   └── testkit/                  # @backbencher/testkit — TestSpec compiler, runner, reporter
├── apps/
│   └── cli/                      # @backbencher/cli — single `bb` entry: record|derive|serve|agent|test
├── data/                         # gitignored: sqlite db, sessions/, knowledge-packs/, generated-tests/
└── recordings/                   # LEGACY dir — migrate then delete; add to .gitignore immediately
```

Dependency direction (enforce with `eslint-plugin-boundaries`-style check or a simple depcheck script in CI):
`schemas ← shared ← {recorder, derive, store} ← {portal-api, agent, testkit} ← cli`. `portal-web` depends only on `schemas` types + the tRPC router *type* import from `portal-api`.

### 1.2 The `bb` CLI (apps/cli)

```
bb record [--url <u>] [--profile <auth-profile>] [--session-name <n>]
bb derive [--session <id>|--all] [--rebuild]
bb serve  [--port 4000]                # portal-api + portal-web static
bb agent generate --scenario <id>      # produce TestSpec YAML
bb test compile --spec <file|dir>      # TestSpec → Playwright files
bb test run [--env <name>] [--grep <pattern>]
bb export knowledge-pack [--out <dir>]
bb migrate legacy --file recordings/recording-*.json   # import v1 recordings
```

---

## 2. Data Contracts (`packages/schemas`)

Everything below is a Zod schema in `packages/schemas/src/`. Types are `z.infer<>`. Every file read/write at a package boundary MUST `.parse()` (or `.safeParse()` + structured error). Version every top-level document with a literal `version` field.

### 2.1 Recording v2 (`recording.ts`) — replaces §5.1 of the tech report

Key changes vs v1: **correlation ids**, **redaction applied before serialization**, **NDJSON streaming format**, immutable events, request/response bodies size-capped symmetrically, frame-aware UI events.

```ts
export const RecordingMetaSchema = z.object({
  version: z.literal(2),
  sessionId: z.string(),            // ulid()
  sessionName: z.string().optional(),
  startUrl: z.string().url(),
  startedAt: z.number().int(),      // epoch ms
  endedAt: z.number().int().optional(),
  userAgent: z.string(),
  operator: z.string().optional(),  // analyst identifier
  authProfile: z.string().optional(), // e.g. "admin", "viewer" — CRITICAL for authz matrix later
  appVersion: z.string().optional(),  // version of the app-under-test if known
  recorderVersion: z.string(),
});

export const ApiRequestEventSchema = z.object({
  type: z.literal("api_request"),
  correlationId: z.string(),        // ulid, minted per request — THE pairing key
  timestamp: z.number().int(),
  method: z.string(),
  url: z.string(),
  resourceType: z.enum(["xhr", "fetch", "document", "other"]),
  headers: z.record(z.string()),    // post-redaction
  postData: z.string().nullable(),  // post-redaction, capped
  postDataTruncated: z.boolean(),
  frameUrl: z.string().optional(),
  pageLabel: z.string(),            // "main" | "popup1" | ...
});

export const ApiResponseEventSchema = z.object({
  type: z.literal("api_response"),
  correlationId: z.string(),        // matches its request
  timestamp: z.number().int(),
  status: z.number().int(),
  headers: z.record(z.string()),
  bodyKind: z.enum(["json", "text", "binary", "empty", "unavailable"]),
  body: z.unknown().nullable(),     // parsed JSON if json, capped string if text, null otherwise
  bodyBytes: z.number().int().optional(),
  bodyTruncated: z.boolean(),
  timing: z.object({ requestStart: z.number(), responseEnd: z.number() }).partial().optional(),
});

export const UiEventSchema = z.object({
  type: z.literal("ui_event"),
  timestamp: z.number().int(),
  action: z.enum(["click", "input", "change", "keypress", "submit"]),
  pageLabel: z.string(),
  frameUrl: z.string().optional(),
  locators: z.object({
    xpath: z.string().optional(), css: z.string().optional(), id: z.string().optional(),
    tag: z.string().optional(), text: z.string().optional(),
    dataTestId: z.string().optional(), name: z.string().optional(),
    role: z.string().optional(), ariaLabel: z.string().optional(),  // NEW: best replay locators
  }),
  value: z.string().nullable(),     // "***REDACTED***" for password/secret fields
  redacted: z.boolean(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  key: z.string().optional(),
  intentLabel: z.string().optional(), // operator-supplied step label (see §3.6)
});

export const NavigationEventSchema = z.object({
  type: z.literal("navigation"), timestamp: z.number().int(),
  url: z.string(), pageLabel: z.string(),
});
export const PopupEventSchema = z.object({
  type: z.literal("popup"), timestamp: z.number().int(),
  action: z.enum(["opened", "closed"]), url: z.string().optional(), popupId: z.string(),
});
export const MarkerEventSchema = z.object({   // NEW: operator step boundaries
  type: z.literal("marker"), timestamp: z.number().int(), label: z.string(),
});

export const RecordingEventSchema = z.discriminatedUnion("type", [
  ApiRequestEventSchema, ApiResponseEventSchema, UiEventSchema,
  NavigationEventSchema, PopupEventSchema, MarkerEventSchema,
]);
```

**On-disk format:** `data/sessions/<sessionId>/meta.json` + `events.ndjson` (one event per line, appended as captured — fixes the unbounded-memory gap, report §9). A completed session additionally gets `summary.json` (event histogram, duration, distinct endpoints touched).

### 2.2 Derived API model (`apimodel.ts`)

Produced by `derive`, stored in DB, never hand-edited.

```ts
export const PathTemplateSchema = z.object({
  template: z.string(),             // "/bo/api/v1/invoices/{invoiceId}"
  params: z.array(z.object({
    name: z.string(),               // "invoiceId"
    position: z.number().int(),     // path segment index
    kind: z.enum(["uuid", "numeric", "slug", "opaque"]),
    observedValues: z.array(z.string()).max(20),
  })),
});

export const OperationSchema = z.object({
  operationId: z.string(),          // stable hash of method+template
  method: z.string(),
  host: z.string(),
  pathTemplate: PathTemplateSchema,
  observedCount: z.number().int(),
  statusCodesObserved: z.record(z.number().int()),   // {"200": 41, "401": 2}
  requestSchema: z.unknown().nullable(),   // JSON Schema (draft 2020-12), unioned across observations
  responseSchemas: z.record(z.unknown()),  // keyed by status code
  queryParams: z.array(z.object({
    name: z.string(), required: z.boolean(),          // required = seen in ≥95% of observations
    observedValues: z.array(z.string()).max(10),
  })),
  authObserved: z.enum(["cookie", "bearer", "none", "mixed"]),
  contentTypes: z.array(z.string()),
  exampleCorrelationIds: z.array(z.string()).max(5), // pointers back into sessions for full examples
  firstSeenSessionId: z.string(),
  lastSeenAt: z.number().int(),
  volatileResponseFields: z.array(z.string()),       // JSON paths that differ across identical calls (§5.4)
});

export const DataflowEdgeSchema = z.object({
  producer: z.object({ operationId: z.string(), location: z.enum(["responseBody","responseHeader"]), jsonPath: z.string() }),
  consumer: z.object({ operationId: z.string(), location: z.enum(["path","query","requestBody","requestHeader"]), jsonPath: z.string() }),
  evidenceCount: z.number().int(),  // sessions in which this link was observed
  valueEntropyOk: z.boolean(),      // false = low-entropy match, treat as suspect
});

export const ObservedFlowSchema = z.object({       // per-session call chain, pre-human
  flowId: z.string(),
  sessionId: z.string(),
  steps: z.array(z.object({
    operationId: z.string(), correlationId: z.string(),
    precedingUiIntent: z.string().optional(),      // nearest ui_event/marker label before this call
  })),
});
```

### 2.3 Human knowledge layer (`knowledge.ts`)

Analyst-authored records, created in the portal. These NEVER live in the same rows as derived facts.

```ts
export const ReviewState = z.enum(["unreviewed", "in_review", "approved", "deprecated", "ignored"]);

export const OperationAnnotationSchema = z.object({
  operationId: z.string(),
  displayName: z.string().optional(),        // "Create Invoice"
  description: z.string().optional(),        // markdown
  productArea: z.string().optional(),        // "Billing"
  reviewState: ReviewState,
  paramDocs: z.record(z.string()).optional(),          // paramName -> markdown
  correctionOverrides: z.object({                      // human beats derivation
    pathTemplate: z.string().optional(),               // fix wrong templatization
    requiredQueryParams: z.array(z.string()).optional(),
    ignoreFields: z.array(z.string()).optional(),      // extra volatile/irrelevant fields
  }).partial().optional(),
  testingGuidance: z.string().optional(),    // markdown: "never call DELETE on shared env", etc.
  tags: z.array(z.string()).default([]),
  updatedBy: z.string(), updatedAt: z.number().int(),
});

export const AnalystGuideSchema = z.object({  // free-form product knowledge docs
  guideId: z.string(),
  title: z.string(),
  body: z.string(),                           // markdown
  scope: z.object({                           // what this guide attaches to
    productArea: z.string().optional(),
    operationIds: z.array(z.string()).default([]),
    flowIds: z.array(z.string()).default([]),
  }),
  audience: z.literal("qa_agent"),            // future: "human"
  priority: z.enum(["must_read", "reference"]),
  updatedBy: z.string(), updatedAt: z.number().int(),
});

export const ScenarioSchema = z.object({      // curated, testable business scenario
  scenarioId: z.string(),
  name: z.string(),                           // "Invoice lifecycle: create → send → void"
  description: z.string(),                    // markdown, analyst-written intent
  sourceFlowIds: z.array(z.string()),         // observed flows this was distilled from
  steps: z.array(z.object({
    operationId: z.string(),
    intent: z.string(),                       // "Create a draft invoice for the test customer"
    notes: z.string().optional(),
  })),
  preconditions: z.string().optional(),       // markdown
  dataRequirements: z.string().optional(),    // "needs a customer with credit terms"
  testDecision: z.object({                    // the analyst's testing decision record
    inScope: z.boolean(),
    strategy: z.enum(["api_functional", "api_negative", "authz", "contract_only", "skip"]),
    rationale: z.string(),
    riskLevel: z.enum(["critical", "high", "medium", "low"]),
    environments: z.array(z.string()),        // which envs this may run against
  }),
  reviewState: ReviewState,
  updatedBy: z.string(), updatedAt: z.number().int(),
});
```

### 2.4 Knowledge pack (`pack.ts`) — the agent's food

Exported bundle, versioned + content-hashed, so agent runs are reproducible.

```ts
export const KnowledgePackSchema = z.object({
  version: z.literal(1),
  builtAt: z.number().int(),
  contentHash: z.string(),
  catalog: z.array(z.object({          // ONE COMPACT LINE PER OPERATION — always in agent context
    operationId: z.string(), method: z.string(), template: z.string(),
    name: z.string().optional(), area: z.string().optional(),
    auth: z.string(), statuses: z.array(z.number()), reviewState: ReviewState,
  })),
  operations: z.record(z.unknown()),   // operationId -> full merged detail doc (derived ⊕ annotation), retrieved on demand
  flows: z.array(z.unknown()),         // approved Scenario objects
  guides: z.array(z.unknown()),        // AnalystGuide objects
  dataflow: z.array(DataflowEdgeSchema),
  authProfiles: z.array(z.object({ name: z.string(), description: z.string() })), // NO SECRETS — resolved at runtime from env
  environments: z.array(z.object({ name: z.string(), baseUrl: z.string(), destructive: z.boolean() })),
});
```

### 2.5 TestSpec (`testspec.ts`) — the agent's output

Declarative YAML the agent emits; the compiler turns it into Playwright. The LLM never writes runnable code directly.

```ts
export const TestSpecSchema = z.object({
  version: z.literal(1),
  specId: z.string(),
  scenarioId: z.string(),
  title: z.string(),
  environment: z.string(),
  authProfile: z.string(),
  tags: z.array(z.string()),
  steps: z.array(z.object({
    id: z.string(),                                   // "createInvoice"
    operationId: z.string(),
    description: z.string(),
    request: z.object({
      pathParams: z.record(z.string()).optional(),    // values or "{{steps.login.extract.token}}"
      query: z.record(z.string()).optional(),
      headers: z.record(z.string()).optional(),
      body: z.unknown().optional(),                   // may contain {{templates}} and {{faker.*}}
    }).optional(),
    extract: z.record(z.string()).optional(),         // varName -> JSONPath into response
    expect: z.object({
      status: z.number().int().or(z.array(z.number().int())),
      schemaConformance: z.boolean().default(true),
      jsonAssertions: z.array(z.object({
        path: z.string(),
        op: z.enum(["equals","notEquals","contains","matches","exists","absent","gt","lt","lengthGte"]),
        value: z.unknown().optional(),
      })).default([]),
    }),
    poll: z.object({ untilStatus: z.number().optional(), untilPath: z.string().optional(),
      untilValue: z.unknown().optional(), timeoutMs: z.number(), intervalMs: z.number() }).optional(),
    continueOnFailure: z.boolean().default(false),
  })),
  cleanup: z.array(z.object({ operationId: z.string(),
    request: z.unknown().optional(), ignoreFailure: z.boolean().default(true) })).default([]),
});
```

Template syntax in string values: `{{steps.<stepId>.extract.<var>}}`, `{{env.<key>}}`, `{{faker.uuid}}`, `{{faker.email}}`, `{{now.iso}}`. The compiler resolves these; unknown templates are a compile error, which is the main guardrail against agent hallucination.

---

## 3. Recorder v2 (`packages/recorder`)

Port of the existing recorder with the report's bugs fixed and the missing capabilities added. Keep the working parts: human-in-the-loop headed Chromium, debounced input capture, popup handling, event ordering.

### 3.1 Fixes mapped from the tech report

| Report item | Resolution in v2 |
|---|---|
| Bug 1: `startsWith` precedence | Rewritten body handler (§3.4 below); `strictNullChecks` makes the old form uncompilable |
| Bug 2: duplicated injected script | Single `src/injected/instrument.ts`, esbuild-bundled to a string constant; injected via `addInitScript` AND `page.evaluate` for already-loaded popups from the same artifact |
| Bug 3: URL+timestamp pairing | `correlationId` (ulid) minted on request, stamped on both events; filter stage deleted entirely — pairing is a trivial join |
| Bug 4: header mutation race | Request event written to NDJSON only after `allHeaders()` resolves OR a 5s timeout falls back to sync headers, with `headersSource: "sync"|"all"` recorded; events are frozen before write |
| Bug 5: phantom `index.js` | Proper package exports per workspace package |
| Bug 6: hardcoded URL | `bb.config.jsonc` + env vars; no defaults pointing at any real tenant |
| Bug 7: asymmetric truncation | Both request `postData` and response bodies capped at configurable `bodyCapBytes` (default 256 KB) with explicit `*Truncated` flags; JSON bodies larger than cap are stored as truncated text with `bodyKind:"text"` |
| Bug 8: silent catches | Every catch logs via pino at `warn` with event context; a `recorder_warning` counter is printed in the session summary |
| §9 memory growth | NDJSON append-on-capture via a single serialized write queue |
| §9 iframes | `attachUIListeners` applied per page; injected script installs listeners at `document` level with capture=true which covers same-origin iframes; cross-origin iframes: instrument via `context.addInitScript` (context-wide) so every frame document gets it |
| §7 secrets | Redaction module (§3.5) applied BEFORE serialization; `recordings/` and `data/` gitignored; committed v1 samples deleted from git history (`git filter-repo`) and the exposed cookies/codes rotated on the target env |

### 3.2 Configuration (`bb.config.jsonc` at repo root, loaded by `shared/config`)

```jsonc
{
  "recorder": {
    "defaultUrl": null,                       // must be passed via --url if null
    "tlsPermissive": false,                   // opt-in; sets ignoreHTTPSErrors + cert flags
    "apiFilter": {
      "hostAllowlist": ["*.otxlab.net"],      // empty = all hosts
      "pathAllowPatterns": ["/api/", "/idm-service/", "/bo/"],
      "resourceTypes": ["xhr", "fetch"],
      "dropContentTypes": ["image/", "font/", "text/css", "text/javascript"],
      "dropPathPatterns": ["/analytics", "/telemetry", "/sockjs", "\\.js$", "\\.css$"],
      "dropMethods": ["OPTIONS"]
    },
    "inputDebounceMs": 1000,
    "bodyCapBytes": 262144,
    "blockServiceWorkers": true
  },
  "redaction": {
    "headerDenylist": ["authorization", "cookie", "set-cookie", "x-csrf-token", "proxy-authorization"],
    "queryParamDenylist": ["code", "token", "access_token", "id_token", "session", "apikey", "api_key"],
    "bodyFieldDenylist": ["password", "secret", "token", "apiKey", "clientSecret"],
    "placeholder": "***REDACTED***",
    "keepAuthShape": true                     // record "Bearer ***" not "***" so auth KIND survives
  },
  "environments": [
    { "name": "staging", "baseUrl": "https://te-smax-stg-m.otxlab.net", "destructive": true },
    { "name": "preprod", "baseUrl": "https://…", "destructive": false }
  ]
}
```

### 3.3 Capture pipeline (Node side)

```
page.on("request") ──▶ apiFilter.matches()? ──▶ mint correlationId
                                             ──▶ build ApiRequestEvent (sync headers)
                                             ──▶ schedule allHeaders() upgrade (5s cap)
                                             ──▶ redact ──▶ freeze ──▶ writeQueue.push()
page.on("response") ─▶ correlated? ──▶ read body per §3.4 ─▶ redact ─▶ freeze ─▶ writeQueue
page.on("requestfailed") ─▶ correlated? ─▶ ApiResponseEvent{status:0, bodyKind:"unavailable"}   // NEW: v1 lost these
```

Use `context.on("request")`/`context.on("response")` (context-level, Playwright ≥1.40) instead of per-page handlers — one registration covers main page, popups, and all frames, removing a whole class of "forgot to wire the popup" bugs. Keep `Map<Request, correlationId>` as the in-flight correlation; entries are deleted on response/requestfailed, and any still-pending entries at save time are flushed as `status: -1` responses so nothing is silently dropped.

### 3.4 Response body handling (replaces the buggy block)

```ts
async function captureBody(response: Response, cap: number): Promise<BodyCapture> {
  const ct = (response.headers()["content-type"] ?? "").toLowerCase();
  let buf: Buffer;
  try { buf = await response.body(); }
  catch (e) { return { bodyKind: "unavailable", body: null, bodyTruncated: false }; } // 204s, redirects, evicted bodies
  if (buf.length === 0) return { bodyKind: "empty", body: null, bodyTruncated: false };
  if (!ct.includes("json") && !ct.startsWith("text/")) 
    return { bodyKind: "binary", body: null, bodyBytes: buf.length, bodyTruncated: false };
  const truncated = buf.length > cap;
  const text = buf.subarray(0, cap).toString("utf8");
  if (ct.includes("json") && !truncated) {
    try { return { bodyKind: "json", body: JSON.parse(text), bodyBytes: buf.length, bodyTruncated: false }; }
    catch { /* fall through to text */ }
  }
  return { bodyKind: "text", body: text, bodyBytes: buf.length, bodyTruncated: truncated };
}
```

Read the body eagerly inside the `response` handler (report gotcha: lazily-read bodies get evicted from the buffer, especially large/streamed ones).

### 3.5 Redaction (`shared/redaction.ts`) — turn the `sanitizeValue` stub into a real module

Pure functions, unit-tested first (this is the highest-risk correctness area):

- `redactHeaders(h)` — case-insensitive denylist; with `keepAuthShape`, `authorization: "Bearer eyJ…"` → `"Bearer ***REDACTED***"`.
- `redactUrl(u)` — parse with `URL`, replace denylisted query param values, return string. Applied to every stored URL including navigation events.
- `redactJsonBody(obj)` — deep walk; any key case-insensitively containing a denylist term gets the placeholder; arrays walked; depth-capped at 50.
- UI values: the injected script itself sends `redacted: true, value: null` for `input[type=password]`, `autocomplete` hints (`current-password`, `new-password`, `one-time-code`), and elements matching a configurable selector list — redact **in the browser before crossing the bridge**, so secrets never reach Node memory or logs.

Rule: redaction runs at capture time, not at export time. A raw file with secrets must never exist on disk.

### 3.6 Operator intent capture (NEW — the biggest knowledge-quality lever)

The report's samples show why untagged calls are weak (`POST …/token?code=…` means nothing alone). Add two mechanisms:

1. **Terminal markers:** while recording, the operator can type a label + ENTER in the terminal (readline). Empty ENTER still means "save & exit"; non-empty input emits `MarkerEvent{label}`. Cheap, zero UI work.
2. **Auto-intent:** at derive time, each API call inherits the nearest preceding `ui_event` (click text / dataTestId) or `marker` within 3s as `precedingUiIntent`. No recorder change needed beyond what exists.

Optionally later: a small floating in-page toolbar (injected) with a "label next step" input. Do not build this in phase 1.

### 3.7 Auth profiles

`bb record --profile admin` records `authProfile` into meta. Profiles are just names here — the recorder does NOT log in for you; the human does. The value is that derivation can later diff "what did admin see vs viewer" and the authz test generator (§7.5) needs sessions per role. Document for analysts: **record every core flow at least twice under different roles.**

---

## 4. Legacy migration (`bb migrate legacy`)

One-off importer for v1 recordings (the three committed samples + any others):

1. Parse v1 JSON, map fields to v2 events. Missing correlation ids: re-derive pairs using the v1 filter heuristic (URL + first-unused + timestamp) and mint synthetic correlation ids for the pairs it finds; flag `meta.migratedFromV1: true`.
2. Run redaction over everything (the v1 files contain live cookies/codes — treat them as compromised regardless; rotate those credentials).
3. Write as v2 session dirs, then delete `recordings/` from the working tree and history.

---

## 5. Derivation pipeline (`packages/derive`)

Deterministic, idempotent, re-runnable: `sessions in → facts out`. No LLM calls in this package. Every pass is a pure function over typed inputs with fixture-based unit tests.

### 5.1 Pass order

```
loadSessions ▶ pairCalls ▶ normalize ▶ templatizePaths ▶ inferSchemas
            ▶ detectVolatileFields ▶ buildDataflowGraph ▶ extractObservedFlows ▶ persist
```

### 5.2 `templatizePaths`

Input: all observed `(method, host, path)` tuples. Algorithm:

1. Split paths into segments; group by `(method, host, segmentCount, staticPrefix)`.
2. A segment position is a **parameter** if EITHER: (a) regex-classified as uuid/numeric/base64-ish across ≥2 distinct values, OR (b) values vary across observations while all sibling positions are constant AND at least one observed value also appears as a scalar in some response body in the corpus (the "id-ish corroboration" signal — this catches slug ids that regex misses).
3. Param naming: if corroborated by a response field, use that field's key path tail (`invoiceId`); else positional (`p3`). Analysts rename in the portal via `correctionOverrides.pathTemplate`.
4. `operationId = sha1(method + " " + host + template).slice(0, 12)` — stable across re-derivation as long as the template is stable. When a human overrides a template, the override version wins for id computation from then on (store the mapping old→new id so annotations survive).

Gotcha: one wrong merge (templatizing `/api/reports/daily` and `/api/reports/{id}` together) poisons schemas downstream. Bias conservative: when in doubt, keep segments static; the portal exposes a "merge operations" action for humans to fix under-merging, which is much safer than auto over-merging.

### 5.3 `inferSchemas`

- Use `genson-js` (or port genson's algorithm) to union JSON Schemas across all observed bodies per operation per status code.
- `required` = present in ≥95% of observations (config), not "present in one sample".
- Enum candidates: string fields with ≤8 distinct observed values across ≥5 observations; record as `x-observed-enum` (annotation, not a hard `enum` constraint — inference from happy paths must not fail valid unseen values).
- Cap: skip schema inference for bodies with `bodyTruncated: true`; count them in `observedCount` but exclude from schema union.

### 5.4 `detectVolatileFields`

For each operation, take pairs of observations with **identical request shape** (same path, query, body hash after removing client-generated fields); diff their response bodies; JSON paths that differ are volatile (timestamps, generated ids, cursors, ordering). Output feeds `Operation.volatileResponseFields`, which the TestSpec compiler uses as the default assertion exclusion mask. If a live environment is reachable, `bb derive --probe` MAY additionally replay idempotent GETs twice for higher-confidence masks — gate this behind an explicit flag and only for operations the analyst has marked safe.

### 5.5 `buildDataflowGraph`

1. Index every scalar in every response body/header as `producer(correlationId, jsonPath, value)`.
2. Index every scalar in every request (path param values, query values, body scalars, non-standard headers) as `consumer(...)`.
3. Join on exact value where `producer.timestamp < consumer.timestamp` within the same session.
4. **Entropy gate:** drop candidate values matching: length < 6, booleans, small integers (< 10000), common words, dates truncated to day. Record `valueEntropyOk` on surviving low-confidence edges instead of dropping when value length is 6–8.
5. Aggregate across sessions: edge weight = number of distinct sessions exhibiting the link. Portal shows weight; agent pack includes only edges with weight ≥ 2 OR analyst-confirmed.
6. Values appearing as consumers with **no producer** in any session and non-constant across sessions → tag the operation input field `clientGenerated: true` (idempotency keys, client uuids). The TestSpec compiler must mint fresh values for these, never replay recorded constants.

### 5.6 `extractObservedFlows`

Per session: ordered list of paired calls, each annotated with `precedingUiIntent` (§3.6). Collapse obvious polling (same operation repeating ≥3× consecutively with no UI event between) into one step with `repeated: n`. These raw flows are the raw material analysts distill into `Scenario`s in the portal.

### 5.7 OpenAPI reconciliation (optional input, high value)

If the product has an OpenAPI spec, `bb derive --openapi <file>`: match operations by method+template, then (a) prefer spec schemas as the base and attach observed examples/volatility to them, (b) emit a **drift report**: operations observed but not in spec, spec operations never observed (coverage gap), fields observed but undocumented. Surface the drift report in the portal dashboard.


---

## 6. Store + Portal

### 6.1 Database (`packages/store`, Drizzle + SQLite at `data/backbencher.db`)

Tables (columns abridged; JSON-typed columns hold Zod-validated payloads):

```
sessions            (session_id PK, name, started_at, ended_at, auth_profile, operator, meta JSON)
operations          (operation_id PK, method, host, template, derived JSON, last_derived_at)
operation_annotations(operation_id PK→operations, payload JSON, review_state, updated_by, updated_at)
dataflow_edges      (id PK, producer_op, consumer_op, payload JSON, evidence_count)
observed_flows      (flow_id PK, session_id FK, payload JSON)
scenarios           (scenario_id PK, payload JSON, review_state, updated_by, updated_at)
analyst_guides      (guide_id PK, payload JSON, updated_by, updated_at)
knowledge_packs     (pack_id PK, built_at, content_hash, path)
test_specs          (spec_id PK, scenario_id FK, yaml TEXT, generated_by, model, pack_id FK, created_at, status)
test_runs           (run_id PK, spec_id FK, env, started_at, finished_at, status, report JSON)
audit_log           (id PK, entity_type, entity_id, action, actor, at, diff JSON)
```

Rules: derivation writes ONLY `operations/dataflow_edges/observed_flows` (full replace per derive run, inside a transaction). Portal writes ONLY annotation/scenario/guide tables. Every portal mutation appends to `audit_log`. Repositories in `store/src/repos/*` are the only DB access path; portal-api and agent import repos, never Drizzle directly.

### 6.2 Portal API (`packages/portal-api`)

Fastify on :4000, serving the built portal-web statically plus tRPC at `/trpc`. Routers:

```
sessions.list / sessions.get(sessionId) / sessions.timeline(sessionId)   // merged event stream for the session viewer
operations.list({area?, reviewState?, q?}) / operations.get(id)          // derived ⊕ annotation merged view
operations.annotate(id, patch) / operations.setReviewState(id, state)
operations.merge([ids], targetTemplate)                                   // fix under-templatization; re-keys annotations
flows.listBySession(sessionId) / flows.get(flowId)
scenarios.crud… / scenarios.fromFlow(flowId)                              // prefill steps from an observed flow
guides.crud…
dataflow.forOperation(operationId)
pack.build() / pack.list() / pack.diff(a, b)
agent.generate(scenarioId, {model}) → specId                              // server-side agent call (API key stays server-side)
specs.get / specs.updateYaml / specs.approve
runs.start(specId, env) / runs.get(runId) / runs.report(runId)
drift.report()                                                            // §5.7 output
```

Auth: single shared analyst token via env (`PORTAL_TOKEN`) checked in a Fastify hook — this is an internal tool; do not build user management in v1, but DO record `updatedBy` from a header the UI sets per analyst name.

### 6.3 Portal Web (`packages/portal-web`) — screens, in build order

1. **Sessions** — list; detail = timeline view interleaving navigation / UI events / API calls (color-coded, expandable request/response, redaction indicators). This is the debugging workhorse; build it first, it validates the whole recorder.
2. **Endpoint Catalog** — table of operations: method, template, name, area, observed count, statuses seen, review state. Filters + full-text. Bulk actions: set area, set state, ignore (noise endpoints analysts want the agent to never see).
3. **Operation Detail** — three tabs. *Derived:* schemas (rendered JSON Schema tree), observed statuses, query params, volatile fields, example calls (linked to sessions), dataflow in/out edges. *Annotation:* editable name/description/param docs/testing guidance (markdown editor), correction overrides (template fix, required params, extra ignore fields). *Diff:* what changed since last derive run (schema diff rendered field-level).
4. **Flow → Scenario builder** — left: observed flow steps with UI-intent labels; right: scenario draft. Analyst drags/edits steps, writes intent per step, fills preconditions/data requirements, completes the `testDecision` block (in scope? strategy? risk? rationale? allowed envs?). Save as draft → approve.
5. **Guides** — markdown docs with scope pickers (product area / operations / flows), `must_read` vs `reference` priority.
6. **Pack & Agent** — build pack (shows contents summary + hash + diff vs previous), pick approved scenario → "Generate TestSpec" → YAML editor with schema validation inline → approve spec.
7. **Runs** — trigger run per env, live status, per-step results, response diffs on failure, flake quarantine badge (§7.4).
8. **Dashboard** — coverage: % operations reviewed, % operations with ≥1 approved scenario, statuses-observed heatmap, drift alerts.

UI conventions: everything keyboard-fast (analysts will process hundreds of endpoints); every derived value visually distinct from every human value (e.g., derived = gray chip, human = solid); optimistic updates with TanStack Query.

### 6.4 The merge rule (single source of truth for "what the agent sees")

`mergedOperation = derived ⊕ annotation` where: human `displayName/description/paramDocs/testingGuidance` are additive; `correctionOverrides` REPLACE the corresponding derived values; `reviewState: "ignored"` excludes the operation from packs entirely; unreviewed operations enter the pack catalog flagged `unreviewed` (agent may read but must not target them as test subjects unless the scenario explicitly includes them).

---

## 7. QA Agent (`packages/agent`) + Testkit (`packages/testkit`)

### 7.1 Knowledge pack build

`pack.build()` = query approved+annotated knowledge → assemble `KnowledgePackSchema` → write `data/knowledge-packs/<hash>/pack.json` + a human-readable `catalog.md`. Determinism: sort every array; hash the canonical JSON; identical knowledge ⇒ identical hash.

### 7.2 Generation flow (server-side, in portal-api, using `@anthropic-ai/sdk`)

Context assembly for one scenario — strict budget, biggest quality lever:

```
[system]  role + TestSpec authoring rules + template syntax + hard constraints
          (never invent operationIds; only use dataflow edges or scenario steps for chaining;
           mint fresh values for clientGenerated fields; respect testingGuidance; output YAML only)
[user]    1. catalog (compact lines, ~1 per operation)          — always
          2. must_read guides in scope for this scenario         — always
          3. scenario object (steps, intents, decision record)   — always
          4. full merged detail docs for ONLY the operations in scenario.steps
             + their 1-hop dataflow neighbors                    — retrieved
          5. relevant dataflow edges among those operations
          6. one concrete example call per step operation (redacted, from exampleCorrelationIds)
          7. auth profile + environment names (no secrets)
          8. task: emit TestSpec YAML for strategy=<scenario.testDecision.strategy>
```

Post-process: parse YAML → `TestSpecSchema.parse` → cross-checks (every `operationId` exists in pack; every `{{steps.x.extract.y}}` references an earlier step's declared extract; every extract JSONPath is syntactically valid; steps writing data have cleanup entries or an explicit `# no-cleanup: <reason>` comment). On violation: one automatic repair round-trip with the validator errors appended; if still invalid, surface errors in the portal editor for the human. Persist the spec with `model`, `pack_id`, and prompt hash for reproducibility.

Strategy variants prompt differences: `api_negative` additionally receives the request schema and instructions to synthesize missing-required / wrong-type / boundary / unknown-enum / expired-auth cases; `authz` receives the multi-role instruction (§7.5); `contract_only` emits GET-only status+schema checks.

### 7.3 TestSpec compiler (`testkit`)

`compile(spec) → generated-tests/<specId>.spec.ts` (Playwright Test, API mode):

- One `test()` per TestSpec; steps become sequential `request.fetch` calls via a small runtime (`testkit/runtime.ts`) that resolves templates, applies auth, extracts via JSONPath (`jsonpath-plus`), asserts.
- **Auth injection at runtime, never from the pack:** `authProfiles` resolve against env vars `BB_AUTH_<PROFILE>_*`; support two modes — static bearer/cookie from env, or a login TestSpec fragment executed in `beforeAll` (analyst defines the login scenario once; compiler references it).
- Schema conformance assertion: validate response against the pack's response schema for that status with `ajv`, with `volatileResponseFields ∪ ignoreFields` removed from `required` and excluded from strict checks.
- Polling steps compile to a backoff loop (never `sleep`).
- Cleanup compiles to `afterAll` with failure tolerance + logging.
- Fresh-value minting for `clientGenerated` fields even if the agent hardcoded something (compiler wins — defense in depth against replayed stale ids).

Compiler is deterministic and unit-tested against fixture specs; this is where correctness lives, so the LLM never touches emitted code.

### 7.4 Runner + trust

`bb test run` wraps `npx playwright test` with: env selection (refuse `destructive: false` envs for specs whose scenario strategy writes data), JSON reporter parsed into `test_runs.report`, and a **quarantine pass**: failures are auto-retried once; pass-on-retry is recorded as `flaky`, not `failed`, and surfaces separately in the portal. A QA agent that files false failures gets ignored by humans within weeks — flake segregation is a first-class feature, not a nicety.

### 7.5 Two near-free high-value generators (post-MVP but design for them now)

- **Authz matrix:** with sessions recorded per role, generate for each state-changing operation a spec that replays it under every other role expecting 401/403; the `authProfile` field and per-role recordings exist precisely for this.
- **BOLA/IDOR probe:** replay role A's request with role B's auth, swapping only the resource id from B's own data; expect non-200. Both are compiler-level generators (no LLM needed) driven by pack data.

---

## 8. Implementation Plan (phased, sized for a coding agent)

Each phase ends with: `pnpm build && pnpm test && pnpm typecheck` green, plus the listed acceptance check. Write tests alongside code, not after — `schemas`, `redaction`, `derive` passes, and `testkit` compiler are the must-test surfaces (pure functions, fixture-friendly).

**Phase 0 — Scaffold (0.5 day-equivalent):** monorepo, tsconfig/biome/turbo, empty packages with build wiring, CI (typecheck+test+depcheck), `.gitignore` for `data/` + `recordings/`, `bb.config.jsonc` loader in `shared`. *Accept:* `bb --help` runs.

**Phase 1 — Schemas + Redaction:** all of §2 as Zod, `shared/redaction.ts` fully unit-tested (header/url/body/UI cases incl. `keepAuthShape`). *Accept:* JSON Schema export (`pnpm -F schemas gen:jsonschema`) produces files for all contracts.

**Phase 2 — Recorder v2:** port recorder per §3; injected script as bundled TS; context-level handlers; NDJSON writer; markers; requestfailed capture; legacy migrator. *Accept:* record a session against a demo app (use a local `httpbin`-style fixture app in `packages/recorder/fixtures` for CI, e2e-tested with Playwright driving Playwright); events validate against schemas; a password typed in the fixture never appears anywhere in `data/`.

**Phase 3 — Derive:** all passes of §5 with fixture sessions committed under `packages/derive/fixtures`; include a fixture reproducing the SSO flow shape from the report's samples (synthetic values). *Accept:* templatization fixture with uuid + slug ids both parameterize; dataflow fixture links token → subsequent auth'd call; volatile-field fixture masks a timestamp.

**Phase 4 — Store + Portal API:** Drizzle schema + migrations + repos; tRPC routers; pack builder. *Accept:* derive persists; `pack.build` emits a valid, hash-stable pack.

**Phase 5 — Portal Web:** screens in the order of §6.3 (Sessions timeline first). *Accept:* an analyst can, end-to-end: view a session → rename/document an operation → build a scenario from a flow → approve it → build a pack containing it.

**Phase 6 — Agent + Testkit:** generation flow, validator+repair loop, compiler, runner, runs UI. *Accept:* approved scenario → generated YAML → compiled Playwright file → green run against the fixture app, including one extraction chain and one cleanup.

**Phase 7 — Hardening:** drift report + dashboard, negative-case strategy, quarantine lane, authz/BOLA generators, `--probe` volatility mode.

---

## 9. Gotchas Checklist (carry into code review)

1. **Never let raw HAR-scale data near the LLM.** The pack catalog + on-demand detail docs is the contract; if a prompt exceeds ~60k tokens for one scenario, the retrieval scoping is wrong, not the budget.
2. **Redact in the browser for UI values, at capture for network** — no unredacted intermediate artifacts, ever. Add a CI grep-test that scans fixture outputs for seeded canary secrets.
3. **Rotate the credentials in the committed v1 samples** and scrub git history; treat them as leaked today.
4. **Conservative templatization + human merge tool** beats aggressive auto-merge (poisoned schemas are expensive to detect).
5. **Client-generated values must be minted fresh** at compile time regardless of what the agent wrote.
6. **`allHeaders()` timing**, service workers, and lazily-read bodies are the three Playwright capture traps; all three have explicit handling above — do not "simplify" them away.
7. **Human data survives re-derivation**: annotations key on `operationId`; when a template override changes an id, migrate annotations via the old→new map in the same transaction.
8. **The agent never targets `unreviewed` operations** as test subjects; the compiler enforces env destructiveness. Safety rails live in deterministic code, not prompts.
9. **Flake ≠ failure.** Quarantine before reporting, or the whole system loses credibility.
10. **Determinism everywhere but the one LLM call:** derive, pack build, compile are pure; reproducibility = (pack hash, prompt hash, model, spec) all persisted.

---

## Appendix — What carries over from the current codebase

Keep conceptually: human-driven headed capture; immediate-push request events for ordering; input debounce (1000 ms) semantics; popup lifecycle events; the locator field set (extended with `role`/`ariaLabel`); event-histogram session summary. Everything else is superseded per §3.1. The `filter-api.js` stage is deleted — with correlation ids it is a 5-line join inside `derive.pairCalls`, and its unit tests become fixtures for that pass.