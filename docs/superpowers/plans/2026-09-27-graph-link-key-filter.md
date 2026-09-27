# Graph link-key filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the analyst switch off link keys (e.g. cookies) in a session's dependency graph, saved per session, so calls that only depended on them become orphans the server will let them delete.

**Architecture:** A browser-safe `linkKeys` module in `@backbencher/derive` defines a link's key (`<consumerLocation>:<consumerJsonPath>`) and the one filter function every caller uses. `session_curation` stores the excluded keys; `sessions.graph` returns them, `sessions.setExcludedLinkKeys` saves them, and `sessions.deleteCalls` applies the saved list before its sole-producer check. The graph gets a **Links** popover that saves on every tick and drives orphans, blockers and views from the shown links.

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest, better-sqlite3 + drizzle, tRPC 11, React 18, Tailwind 3, Lucide icons, @testing-library/react (jsdom in portal-web only).

**Spec:** `docs/superpowers/specs/2026-09-27-graph-link-key-filter-design.md`

## Global Constraints

- A link key is exactly `` `${consumerLocation}:${consumerJsonPath}` ``; the location never contains `:`, so split on the **first** `:` only.
- Group of a key: `path` → path, `query` → query, `requestBody` → body, `requestHeader` whose path starts with `Cookie.` → cookie, any other `requestHeader` → header.
- Group order in the UI: Cookies, Headers, Path, Query, Body.
- Stored value is the list of **excluded** keys; default `[]` (everything on). Stored deduplicated and sorted.
- Stored edges (`session_call_edges`) are never modified by this feature.
- `sessions.deleteCalls` reads the **saved** exclusions from the store; it accepts none from the request.
- Script generation, redundant-call filtering and the composer are **not** changed.
- Packages resolve each other through `dist/`: rebuild a package before its dependents see it. Order: derive → store → portal-api → portal-web.
- Commit messages end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No browser/visual tests (the analyst checks the UI by hand); jsdom component tests are fine.

## Review Focus

1. **Esc inside the open Links panel** should close only the panel, not the whole dependency graph (the modal listens for Esc on `window`). Test: Task 6, "Esc closes the panel without reaching window listeners".
2. **Rapid ticks before the first save returns** must build on the latest local list, not the last saved one, or the second tick silently undoes the first. Test: Task 5, `setKeys` composes on its input; wiring in Task 7 always passes the effective (optimistic) list.
3. **Group checkbox while a search is active** should only toggle the keys currently listed, not hidden ones. Test: Task 6, "group checkbox with a search only toggles matching keys".
4. **Excluded keys that no longer exist** (after re-derivation) must not count as hidden links, yet **Show all** must still clear them. Test: Task 5, "ignores stale excluded keys in hidden count but reports them"; Task 6, "Show all is enabled when only stale keys are excluded".
5. **A header or query name containing `:`** must round-trip (`query:a:b` → path `a:b`, group query). Test: Task 1, "splits on the first colon only".

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/derive/src/linkKeys.ts` | create | Key definition, grouping, the one filter function |
| `packages/derive/test/linkKeys.test.ts` | create | Unit tests for the above |
| `packages/derive/src/index.ts` | modify | Re-export link-key helpers |
| `packages/derive/package.json` | modify | `./linkKeys` subpath export (browser-safe) |
| `packages/derive/src/orphans.ts` | modify | `findIsolatedCalls` optional `allEdges` for the single-level rule |
| `packages/derive/test/orphans.test.ts` | modify | Tests for the new rule |
| `packages/store/src/migrate.ts` | modify | Migration `0006_session_link_key_filter` |
| `packages/store/src/schema.ts` | modify | `excludedLinkKeys` column |
| `packages/store/src/repos/curation.ts` | modify | Row field, upsert patch, `setExcludedLinkKeys` |
| `packages/store/test/curation.test.ts` | create | Migration + repo tests |
| `packages/portal-api/src/routers.ts` | modify | `sessions.graph` field, `setExcludedLinkKeys`, `deleteCalls` filter |
| `packages/portal-api/test/curation.test.ts` | modify | API tests |
| `packages/portal-web/src/linkKeySummary.ts` | create | Pure panel data: groups, counts, hints, `setKeys` |
| `packages/portal-web/test/linkKeySummary.test.ts` | create | Unit tests |
| `packages/portal-web/src/screens/LinksFilter.tsx` | create | Links button + popover (owns open state, Esc, outside click) |
| `packages/portal-web/test/LinksFilter.test.tsx` | create | jsdom component tests |
| `packages/portal-web/src/screens/SessionGraph.tsx` | modify | Wire the filter into edges, orphans, blockers, details |

---

### Task 1: Link-key module in derive

**Files:**
- Create: `packages/derive/src/linkKeys.ts`
- Create: `packages/derive/test/linkKeys.test.ts`
- Modify: `packages/derive/src/index.ts` (add an export line after the `orphans.js` export)
- Modify: `packages/derive/package.json` (`exports`)

**Interfaces:**
- Consumes: `SessionCallEdge` from `@backbencher/schemas` (`consumerLocation: "path" | "query" | "requestBody" | "requestHeader"`, `consumerJsonPath: string`).
- Produces:
  - `type LinkKeyEdge = Pick<SessionCallEdge, "consumerLocation" | "consumerJsonPath">`
  - `type LinkKeyGroup = "cookie" | "header" | "path" | "query" | "body"`
  - `linkKey(edge: LinkKeyEdge): string`
  - `linkKeyPath(key: string): string`
  - `linkKeyGroup(key: string): LinkKeyGroup`
  - `withoutExcludedLinks<E extends LinkKeyEdge>(edges: readonly E[], excludedKeys: Iterable<string>): E[]`
  - Importable as `@backbencher/derive/linkKeys` (browser) and from `@backbencher/derive` (server).

- [ ] **Step 1: Write the failing test**

Create `packages/derive/test/linkKeys.test.ts`:

```ts
import type { SessionCallEdge } from "@backbencher/schemas";
import { describe, expect, it } from "vitest";
import { linkKey, linkKeyGroup, linkKeyPath, withoutExcludedLinks } from "../src/linkKeys.js";

function edge(
  consumerLocation: SessionCallEdge["consumerLocation"],
  consumerJsonPath: string,
  consumer = "c",
): SessionCallEdge {
  return {
    producerCorrelationId: "p",
    producerLocation: "responseBody",
    producerJsonPath: "$.v",
    consumerCorrelationId: consumer,
    consumerLocation,
    consumerJsonPath,
    value: "VALUE-abcdef123",
    confidence: "strong",
  };
}

describe("linkKey", () => {
  it("joins the consumer location and path", () => {
    expect(linkKey(edge("requestHeader", "Cookie.JSESSIONID"))).toBe("requestHeader:Cookie.JSESSIONID");
    expect(linkKey(edge("requestHeader", "x-csrf-token"))).toBe("requestHeader:x-csrf-token");
    expect(linkKey(edge("path", "ticketId"))).toBe("path:ticketId");
    expect(linkKey(edge("query", "ref"))).toBe("query:ref");
    expect(linkKey(edge("requestBody", "$.customer.id"))).toBe("requestBody:$.customer.id");
  });
});

describe("linkKeyGroup and linkKeyPath", () => {
  it("groups cookies apart from other headers", () => {
    expect(linkKeyGroup("requestHeader:Cookie.JSESSIONID")).toBe("cookie");
    expect(linkKeyGroup("requestHeader:x-csrf-token")).toBe("header");
  });

  it("groups path, query and body by location", () => {
    expect(linkKeyGroup("path:ticketId")).toBe("path");
    expect(linkKeyGroup("query:ref")).toBe("query");
    expect(linkKeyGroup("requestBody:$.customer.id")).toBe("body");
  });

  it("splits on the first colon only", () => {
    expect(linkKeyPath("query:a:b")).toBe("a:b");
    expect(linkKeyGroup("query:a:b")).toBe("query");
    expect(linkKeyPath(linkKey(edge("requestHeader", "x:odd")))).toBe("x:odd");
  });
});

describe("withoutExcludedLinks", () => {
  const edges = [
    edge("requestHeader", "Cookie.sid", "c1"),
    edge("path", "ticketId", "c2"),
    edge("requestHeader", "Cookie.sid", "c3"),
    edge("query", "ref", "c4"),
  ];

  it("drops exactly the excluded keys and keeps order", () => {
    const kept = withoutExcludedLinks(edges, ["requestHeader:Cookie.sid"]);
    expect(kept.map((e) => e.consumerCorrelationId)).toEqual(["c2", "c4"]);
  });

  it("returns every link, in a new array, when nothing is excluded", () => {
    const kept = withoutExcludedLinks(edges, []);
    expect(kept).toEqual(edges);
    expect(kept).not.toBe(edges);
  });

  it("ignores excluded keys no link uses", () => {
    expect(withoutExcludedLinks(edges, ["path:gone"])).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/derive && pnpm vitest run test/linkKeys.test.ts`
Expected: FAIL — cannot resolve `../src/linkKeys.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/derive/src/linkKeys.ts`:

```ts
import type { SessionCallEdge } from "@backbencher/schemas";

// A link's key is where its value is *used*: the consumer location plus the consumer path, e.g.
// "requestHeader:Cookie.JSESSIONID" or "path:ticketId". The session graph's Links filter and the
// server's delete check both hide links through withoutExcludedLinks, so they can never disagree
// about which links an analyst has switched off. Browser-safe: no Node imports.

export type LinkKeyEdge = Pick<SessionCallEdge, "consumerLocation" | "consumerJsonPath">;
export type LinkKeyGroup = "cookie" | "header" | "path" | "query" | "body";

export function linkKey(edge: LinkKeyEdge): string {
  return `${edge.consumerLocation}:${edge.consumerJsonPath}`;
}

/** The consumer path part of a key. Locations never contain ":", but paths may, so split once. */
export function linkKeyPath(key: string): string {
  const i = key.indexOf(":");
  return i === -1 ? key : key.slice(i + 1);
}

export function linkKeyGroup(key: string): LinkKeyGroup {
  const i = key.indexOf(":");
  const location = i === -1 ? key : key.slice(0, i);
  if (location === "path") return "path";
  if (location === "query") return "query";
  if (location === "requestBody") return "body";
  // derivation decomposes the Cookie header into one consumer per cookie, named "Cookie.<name>"
  return linkKeyPath(key).startsWith("Cookie.") ? "cookie" : "header";
}

export function withoutExcludedLinks<E extends LinkKeyEdge>(edges: readonly E[], excludedKeys: Iterable<string>): E[] {
  const excluded = new Set(excludedKeys);
  return edges.filter((e) => !excluded.has(linkKey(e)));
}
```

In `packages/derive/src/index.ts`, after the line `export type { OrphanedConsumer } from "./orphans.js";` add:

```ts
export { linkKey, linkKeyGroup, linkKeyPath, withoutExcludedLinks } from "./linkKeys.js";
export type { LinkKeyEdge, LinkKeyGroup } from "./linkKeys.js";
```

In `packages/derive/package.json`, replace the `exports` object with:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./orphans": {
      "types": "./dist/orphans.d.ts",
      "import": "./dist/orphans.js"
    },
    "./linkKeys": {
      "types": "./dist/linkKeys.d.ts",
      "import": "./dist/linkKeys.js"
    }
  },
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd packages/derive && pnpm vitest run test/linkKeys.test.ts && pnpm typecheck`
Expected: PASS (6 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/derive/src/linkKeys.ts packages/derive/test/linkKeys.test.ts packages/derive/src/index.ts packages/derive/package.json
git commit -m "feat(derive): add link keys for filtering session graph links" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Single-level rule judged from all links

**Files:**
- Modify: `packages/derive/src/orphans.ts` (the `findIsolatedCalls` function and its comment, lines 48–65)
- Modify: `packages/derive/test/orphans.test.ts` (add a `describe` block; the file already has an `edge(producer, consumer)` helper)

**Interfaces:**
- Consumes: nothing new.
- Produces: `findIsolatedCalls(nodeIds: Iterable<string>, edges: IsolationEdge[], allEdges?: IsolationEdge[]): string[]` where `IsolationEdge = Pick<SessionCallEdge, "producerCorrelationId" | "consumerCorrelationId">`. With `allEdges` omitted, behaviour is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `packages/derive/test/orphans.test.ts`:

```ts
describe("findIsolatedCalls with a link filter", () => {
  it("keeps the two-argument behaviour", () => {
    expect(findIsolatedCalls(["a", "b", "c"], [edge("a", "b")])).toEqual(["c"]);
    expect(findIsolatedCalls(["a", "b"], [])).toEqual([]);
  });

  it("reports no orphans for a session that never had links", () => {
    expect(findIsolatedCalls(["a", "b"], [], [])).toEqual([]);
  });

  it("reports every call when all of a session's links are filtered out", () => {
    expect(findIsolatedCalls(["a", "b", "c"], [], [edge("a", "b")])).toEqual(["a", "b", "c"]);
  });

  it("isolates a call linked only through a filtered-out link", () => {
    const all = [edge("a", "b"), edge("b", "c")];
    const shown = [edge("b", "c")];
    expect(findIsolatedCalls(["a", "b", "c"], shown, all)).toEqual(["a"]);
  });

  it("judges single-level only from links between the given calls", () => {
    // the only link touches a call outside nodeIds (e.g. staged for deletion)
    expect(findIsolatedCalls(["a", "b"], [], [edge("a", "x")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/derive && pnpm vitest run test/orphans.test.ts`
Expected: FAIL — "reports every call when all of a session's links are filtered out" gets `[]`.

- [ ] **Step 3: Write the implementation**

Replace the `findIsolatedCalls` comment and function in `packages/derive/src/orphans.ts` with:

```ts
type IsolationEdge = Pick<SessionCallEdge, "producerCorrelationId" | "consumerCorrelationId">;

// Calls with no Dependency edge in or out among `nodeIds`, judged from `edges` (the links shown).
// When the Session has no edge at all among `nodeIds` it is single-level — every call stands alone —
// and nothing counts as isolated. That check uses `allEdges` (every link, before any Links filter)
// when given, so filtering out all of a Session's links makes every call isolated instead of none.
// Edges touching calls outside `nodeIds` (e.g. ones staged for deletion) are ignored.
export function findIsolatedCalls(
  nodeIds: Iterable<string>,
  edges: IsolationEdge[],
  allEdges: IsolationEdge[] = edges,
): string[] {
  const ids = [...nodeIds];
  const present = new Set(ids);
  const within = (e: IsolationEdge) => present.has(e.producerCorrelationId) && present.has(e.consumerCorrelationId);
  if (!allEdges.some(within)) return [];
  const linked = new Set<string>();
  for (const e of edges) {
    if (!within(e)) continue;
    linked.add(e.producerCorrelationId);
    linked.add(e.consumerCorrelationId);
  }
  return ids.filter((id) => !linked.has(id));
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd packages/derive && pnpm test && pnpm typecheck`
Expected: all derive tests PASS (previous 53 + 6 + 5), typecheck clean.

- [ ] **Step 5: Build derive and commit**

Run: `cd packages/derive && pnpm build` (dependents read `dist/`).

```bash
git add packages/derive/src/orphans.ts packages/derive/test/orphans.test.ts
git commit -m "feat(derive): judge single-level sessions from all links in findIsolatedCalls" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Store the excluded keys per session

**Files:**
- Modify: `packages/store/src/migrate.ts` (append to `MIGRATIONS`, after `0005_drop_exemplars`)
- Modify: `packages/store/src/schema.ts:93-99` (`sessionCuration`)
- Modify: `packages/store/src/repos/curation.ts:6-66`
- Create: `packages/store/test/curation.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `SessionCurationRow.excludedLinkKeys: string[]`
  - `store.sessionCuration.setExcludedLinkKeys(sessionId: string, keys: string[], actor: string): void` (replaces; deduplicated and sorted)

- [ ] **Step 1: Write the failing test**

Create `packages/store/test/curation.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openStore } from "../src/index.js";
import { runMigrations } from "../src/migrate.js";

describe("migration 0006_session_link_key_filter", () => {
  it("gives curation rows that existed before it an empty list", () => {
    const raw = new Database(":memory:");
    runMigrations(raw);
    // Rewind to a pre-0006 database holding an existing curation row.
    raw.exec("ALTER TABLE session_curation DROP COLUMN excluded_link_keys");
    raw.prepare("DELETE FROM _migrations WHERE id = ?").run("0006_session_link_key_filter");
    raw
      .prepare(
        "INSERT INTO session_curation (session_id, deleted_correlation_ids, use_as_reference, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("s-old", '["c1"]', 1, "alice", 1);

    runMigrations(raw);

    const row = raw.prepare("SELECT excluded_link_keys AS keys FROM session_curation WHERE session_id = ?").get("s-old") as {
      keys: string;
    };
    expect(row.keys).toBe("[]");
    raw.close();
  });
});

describe("sessionCuration excluded link keys", () => {
  it("defaults to an empty list", () => {
    const store = openStore(":memory:");
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    expect(store.sessionCuration.get("s1")?.excludedLinkKeys).toEqual([]);
    store.close();
  });

  it("round-trips, deduplicated and sorted, replacing the previous list", () => {
    const store = openStore(":memory:");
    store.sessionCuration.setExcludedLinkKeys("s1", ["requestHeader:Cookie.b", "path:id", "requestHeader:Cookie.b"], "alice");
    expect(store.sessionCuration.get("s1")?.excludedLinkKeys).toEqual(["path:id", "requestHeader:Cookie.b"]);
    store.sessionCuration.setExcludedLinkKeys("s1", ["query:q"], "alice");
    expect(store.sessionCuration.get("s1")?.excludedLinkKeys).toEqual(["query:q"]);
    store.close();
  });

  it("is preserved when deletions or the reference flag change, and vice versa", () => {
    const store = openStore(":memory:");
    store.sessionCuration.setExcludedLinkKeys("s1", ["requestHeader:Cookie.sid"], "alice");
    store.sessionCuration.setDeleted("s1", ["c1"], "alice");
    store.sessionCuration.setUseAsReference("s1", true, "alice");
    expect(store.sessionCuration.get("s1")).toMatchObject({
      excludedLinkKeys: ["requestHeader:Cookie.sid"],
      deletedCorrelationIds: ["c1"],
      useAsReference: true,
    });

    store.sessionCuration.setExcludedLinkKeys("s1", [], "alice");
    expect(store.sessionCuration.get("s1")).toMatchObject({
      excludedLinkKeys: [],
      deletedCorrelationIds: ["c1"],
      useAsReference: true,
    });
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/store && pnpm vitest run test/curation.test.ts`
Expected: FAIL — `no such column: excluded_link_keys` / `setExcludedLinkKeys is not a function`.

- [ ] **Step 3: Write the implementation**

In `packages/store/src/migrate.ts`, append after the `0005_drop_exemplars` entry (inside the `MIGRATIONS` array):

```ts
  {
    id: "0006_session_link_key_filter",
    sql: `
ALTER TABLE session_curation ADD COLUMN excluded_link_keys TEXT NOT NULL DEFAULT '[]';
`,
  },
```

In `packages/store/src/schema.ts`, change `sessionCuration` to:

```ts
export const sessionCuration = sqliteTable("session_curation", {
  sessionId: text("session_id").primaryKey(),
  deletedCorrelationIds: text("deleted_correlation_ids").notNull(), // JSON string[]
  useAsReference: integer("use_as_reference").notNull(),
  excludedLinkKeys: text("excluded_link_keys").notNull().default("[]"), // JSON string[] of link keys
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

In `packages/store/src/repos/curation.ts`:

1. Add the field to the row type:

```ts
export interface SessionCurationRow {
  sessionId: string;
  deletedCorrelationIds: string[];
  useAsReference: boolean;
  /** Link keys (see @backbencher/derive linkKeys) the analyst switched off in this Session's graph. */
  excludedLinkKeys: string[];
  updatedBy: string;
  updatedAt: number;
}
```

2. In `toRow`, add after `useAsReference`:

```ts
    excludedLinkKeys: JSON.parse(r.excludedLinkKeys) as string[],
```

3. Replace `upsert` with:

```ts
  function upsert(
    sessionId: string,
    patch: { deleted?: string[]; useAsReference?: boolean; excludedLinkKeys?: string[] },
    actor: string,
  ): void {
    const existing = db.select().from(sessionCuration).where(eq(sessionCuration.sessionId, sessionId)).get();
    const current = existing ? toRow(existing) : null;
    const deleted = patch.deleted ?? current?.deletedCorrelationIds ?? [];
    const useAsReference = patch.useAsReference ?? current?.useAsReference ?? false;
    const excludedLinkKeys = patch.excludedLinkKeys ?? current?.excludedLinkKeys ?? [];
    const values = {
      sessionId,
      deletedCorrelationIds: JSON.stringify([...new Set(deleted)].sort()),
      useAsReference: useAsReference ? 1 : 0,
      excludedLinkKeys: JSON.stringify([...new Set(excludedLinkKeys)].sort()),
      updatedBy: actor,
      updatedAt: Date.now(),
    };
    db.insert(sessionCuration)
      .values(values)
      .onConflictDoUpdate({ target: sessionCuration.sessionId, set: values })
      .run();
  }
```

4. Add to the returned object, after `setUseAsReference`:

```ts
    /** Replaces the Session's excluded link keys; the graph and deleteCalls ignore links with them. */
    setExcludedLinkKeys: (sessionId: string, keys: string[], actor: string): void => {
      upsert(sessionId, { excludedLinkKeys: keys }, actor);
    },
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd packages/store && pnpm test && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Build store and commit**

Run: `cd packages/store && pnpm build`

```bash
git add packages/store/src/migrate.ts packages/store/src/schema.ts packages/store/src/repos/curation.ts packages/store/test/curation.test.ts
git commit -m "feat(store): store excluded link keys per session (migration 0006)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API — return, save and honour the excluded keys

**Files:**
- Modify: `packages/portal-api/src/routers.ts` — `sessions.graph` (~line 69), `sessions.deleteCalls` (the `assertDeletable(persistedEdges, newlyDeleted)` line), new `sessions.setExcludedLinkKeys` after `setUseAsReference`, and the `@backbencher/derive` import (lines 13–19)
- Modify: `packages/portal-api/test/curation.test.ts` (add tests inside `describe("sessions router", …)`)

**Interfaces:**
- Consumes: `withoutExcludedLinks` from `@backbencher/derive` (Task 1); `store.sessionCuration.get(id)?.excludedLinkKeys`, `store.sessionCuration.setExcludedLinkKeys` (Task 3).
- Produces:
  - `sessions.graph` returns `{ nodes, edges, derived, excludedLinkKeys: string[] }` on **both** return paths.
  - `sessions.setExcludedLinkKeys({ sessionId: string, keys: string[] })` → `{ ok: true }`; audit `{ entityType: "session", entityId: sessionId, action: "curate.linkKeys", diff: { keys } }`.

- [ ] **Step 1: Write the failing tests**

Add inside `describe("sessions router", () => { … })` in `packages/portal-api/test/curation.test.ts`, after the test "rejects deletions that would orphan a consumer". They reuse that test's shape: `c1` sends `p1`'s token in header `x-token`, so the link key is `requestHeader:x-token`.

```ts
  function tokenSession(sessionId: string) {
    resetClock();
    const token = "TOKEN-abcdef123456";
    return completeSession(sessionId, [
      ...apiCall("p1", { url: `${H}/auth/token`, body: { token } }),
      ...apiCall("c1", {
        method: "POST",
        url: `${H}/api/things`,
        reqHeaders: { "x-token": token },
        postData: JSON.stringify({ ok: true }),
        body: { ok: true },
      }),
    ]);
  }

  it("returns the saved excluded link keys with the graph", async () => {
    const session = tokenSession("sess-linkkeys-graph");
    seed(session, { derive: true });
    const sessionId = session.meta.sessionId;

    expect((await caller().sessions.graph({ sessionId })).excludedLinkKeys).toEqual([]);
    await expect(
      caller("alice").sessions.setExcludedLinkKeys({ sessionId, keys: ["requestHeader:x-token"] }),
    ).resolves.toEqual({ ok: true });
    expect((await caller().sessions.graph({ sessionId })).excludedLinkKeys).toEqual(["requestHeader:x-token"]);

    const audit = store.audit.list("session", sessionId);
    expect(audit.some((a) => a.action === "curate.linkKeys" && a.actor === "alice")).toBe(true);
  });

  it("returns an empty excluded list for a session that has not been derived", async () => {
    const session = tokenSession("sess-linkkeys-underived");
    seed(session);
    expect(await caller().sessions.graph({ sessionId: session.meta.sessionId })).toMatchObject({
      derived: false,
      excludedLinkKeys: [],
    });
  });

  it("lets deleteCalls remove a call needed only through an excluded link key", async () => {
    const session = tokenSession("sess-linkkeys-delete");
    seed(session, { derive: true });
    const sessionId = session.meta.sessionId;
    await caller().sessions.setExcludedLinkKeys({ sessionId, keys: ["requestHeader:x-token"] });

    await expect(caller().sessions.deleteCalls({ sessionId, correlationIds: ["p1"] })).resolves.toMatchObject({
      deleted: 1,
    });
  });

  it("still rejects the deletion when a different key is excluded", async () => {
    const session = tokenSession("sess-linkkeys-other");
    seed(session, { derive: true });
    const sessionId = session.meta.sessionId;
    await caller().sessions.setExcludedLinkKeys({ sessionId, keys: ["requestHeader:Cookie.sid"] });

    await expect(caller().sessions.deleteCalls({ sessionId, correlationIds: ["p1"] })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("uses only the saved exclusions, not any sent with the delete", async () => {
    const session = tokenSession("sess-linkkeys-unsaved");
    seed(session, { derive: true });
    const sessionId = session.meta.sessionId;

    await expect(
      caller().sessions.deleteCalls({
        sessionId,
        correlationIds: ["p1"],
        excludedLinkKeys: ["requestHeader:x-token"],
      } as never),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/portal-api && pnpm vitest run test/curation.test.ts`
Expected: FAIL — `excludedLinkKeys` undefined on the graph result; `setExcludedLinkKeys` not a procedure.

- [ ] **Step 3: Write the implementation**

In `packages/portal-api/src/routers.ts`:

1. Add `withoutExcludedLinks` to the existing `import { … } from "@backbencher/derive";` list.

2. In `sessions.graph`, read the saved list first and return it on both paths. Replace the start of the handler:

```ts
    .query(({ ctx, input }) => {
      const dir = join(dataDir(), "sessions", input.sessionId);
      const flows = ctx.store.flows.listBySession(input.sessionId);
      // All edges are returned regardless: the Links filter lists excluded keys too, so they can be
      // switched back on. The client hides them.
      const excludedLinkKeys = ctx.store.sessionCuration.get(input.sessionId)?.excludedLinkKeys ?? [];
      if (!existsSync(dir) || flows.length === 0) return { nodes: [], edges: [], derived: false, excludedLinkKeys };
```

and change the final line of the handler to:

```ts
      return { nodes, edges, derived: true, excludedLinkKeys };
```

3. Add the mutation after `setUseAsReference` (same `sessionsRouter`):

```ts
  setExcludedLinkKeys: publicProcedure
    .input(z.object({ sessionId: z.string(), keys: z.array(z.string()) }))
    .mutation(({ ctx, input }) => {
      // Not validated against current edges: a key can vanish on re-derivation and come back later.
      ctx.store.sessionCuration.setExcludedLinkKeys(input.sessionId, input.keys, ctx.actor);
      ctx.store.audit.append({
        entityType: "session",
        entityId: input.sessionId,
        action: "curate.linkKeys",
        actor: ctx.actor,
        diff: { keys: input.keys },
      });
      return { ok: true as const };
    }),
```

4. In `sessions.deleteCalls`, replace `assertDeletable(persistedEdges, newlyDeleted);` with:

```ts
      // Links the analyst switched off in the graph don't make a call indispensable. Read from the
      // store, never from the request, so a stale browser view can't loosen the check.
      const excludedLinkKeys = ctx.store.sessionCuration.get(input.sessionId)?.excludedLinkKeys ?? [];
      assertDeletable(withoutExcludedLinks(persistedEdges, excludedLinkKeys), newlyDeleted);
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd packages/portal-api && pnpm test && pnpm typecheck`
Expected: PASS (previous 28 + 5), typecheck clean.

- [ ] **Step 5: Build portal-api and commit**

Run: `cd packages/portal-api && pnpm build`

```bash
git add packages/portal-api/src/routers.ts packages/portal-api/test/curation.test.ts
git commit -m "feat(portal-api): save excluded link keys per session and honour them in deleteCalls" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pure summary for the Links panel

**Files:**
- Create: `packages/portal-web/src/linkKeySummary.ts`
- Create: `packages/portal-web/test/linkKeySummary.test.ts`

**Interfaces:**
- Consumes: `linkKey`, `linkKeyGroup`, `linkKeyPath`, `LinkKeyEdge`, `LinkKeyGroup` from `@backbencher/derive/linkKeys` (Task 1, built).
- Produces:
  - `interface LinkKeyRow { key: string; path: string; links: number; from: string; excluded: boolean }`
  - `interface LinkKeyGroupSummary { group: LinkKeyGroup; label: string; links: number; keys: LinkKeyRow[] }`
  - `interface LinkKeySummary { groups: LinkKeyGroupSummary[]; totalLinks: number; hiddenLinks: number; excludedKeys: number }`
  - `summarizeLinkKeys(edges: readonly (LinkKeyEdge & { producerJsonPath: string })[], excludedKeys: Iterable<string>): LinkKeySummary`
  - `setKeys(current: readonly string[], keys: readonly string[], excluded: boolean): string[]` (sorted, deduplicated)

- [ ] **Step 1: Write the failing test**

Create `packages/portal-web/test/linkKeySummary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { setKeys, summarizeLinkKeys } from "../src/linkKeySummary.js";

type E = { consumerLocation: "path" | "query" | "requestBody" | "requestHeader"; consumerJsonPath: string; producerJsonPath: string };
const e = (consumerLocation: E["consumerLocation"], consumerJsonPath: string, producerJsonPath = "$.v"): E => ({
  consumerLocation,
  consumerJsonPath,
  producerJsonPath,
});

const edges: E[] = [
  e("requestHeader", "Cookie.sid", "Set-Cookie.sid"),
  e("requestHeader", "Cookie.sid", "Set-Cookie.sid"),
  e("requestHeader", "Cookie.theme", "Set-Cookie.theme"),
  e("requestHeader", "x-csrf-token", "$.csrf"),
  e("path", "ticketId", "$.data.id"),
  e("path", "ticketId", "$.id"),
  e("path", "ticketId", "$.data.id"),
  e("requestBody", "$.customer.id", "$.data.customerId"),
];

describe("summarizeLinkKeys", () => {
  it("groups keys in the fixed order and skips empty groups", () => {
    const s = summarizeLinkKeys(edges, []);
    expect(s.groups.map((g) => g.label)).toEqual(["Cookies", "Headers", "Path", "Body"]);
    expect(s.totalLinks).toBe(8);
  });

  it("counts links per key and group, most used key first", () => {
    const cookies = summarizeLinkKeys(edges, []).groups[0];
    expect(cookies?.links).toBe(3);
    expect(cookies?.keys.map((k) => [k.path, k.links])).toEqual([
      ["Cookie.sid", 2],
      ["Cookie.theme", 1],
    ]);
  });

  it("hints the most common producer path for a key", () => {
    const path = summarizeLinkKeys(edges, []).groups.find((g) => g.group === "path");
    expect(path?.keys[0]).toMatchObject({ key: "path:ticketId", from: "$.data.id", links: 3 });
  });

  it("marks excluded keys and counts their links as hidden", () => {
    const s = summarizeLinkKeys(edges, ["requestHeader:Cookie.sid", "path:ticketId"]);
    expect(s.hiddenLinks).toBe(5);
    expect(s.excludedKeys).toBe(2);
    expect(s.groups[0]?.keys.find((k) => k.path === "Cookie.sid")?.excluded).toBe(true);
    expect(s.groups[0]?.keys.find((k) => k.path === "Cookie.theme")?.excluded).toBe(false);
  });

  it("ignores stale excluded keys in hidden count but reports them", () => {
    const s = summarizeLinkKeys(edges, ["query:gone"]);
    expect(s.hiddenLinks).toBe(0);
    expect(s.excludedKeys).toBe(1);
  });

  it("returns no groups for a session without links", () => {
    expect(summarizeLinkKeys([], [])).toEqual({ groups: [], totalLinks: 0, hiddenLinks: 0, excludedKeys: 0 });
  });
});

describe("setKeys", () => {
  it("adds and removes keys, sorted and deduplicated", () => {
    expect(setKeys(["b"], ["a", "b"], true)).toEqual(["a", "b"]);
    expect(setKeys(["a", "b"], ["a"], false)).toEqual(["b"]);
  });

  it("composes: a second change builds on the result of the first", () => {
    const afterFirst = setKeys([], ["requestHeader:Cookie.sid"], true);
    expect(setKeys(afterFirst, ["path:ticketId"], true)).toEqual(["path:ticketId", "requestHeader:Cookie.sid"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/portal-web && pnpm vitest run test/linkKeySummary.test.ts`
Expected: FAIL — cannot resolve `../src/linkKeySummary.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/portal-web/src/linkKeySummary.ts`:

```ts
import { type LinkKeyEdge, type LinkKeyGroup, linkKey, linkKeyGroup, linkKeyPath } from "@backbencher/derive/linkKeys";

// Data behind the dependency graph's Links panel: every link key the graph is built on, grouped,
// with how many links use it and where its value usually comes from. Pure, so it's testable
// without rendering the graph.

const GROUP_ORDER: LinkKeyGroup[] = ["cookie", "header", "path", "query", "body"];
const GROUP_LABEL: Record<LinkKeyGroup, string> = {
  cookie: "Cookies",
  header: "Headers",
  path: "Path",
  query: "Query",
  body: "Body",
};

export interface LinkKeyRow {
  key: string;
  path: string;
  links: number;
  /** The producer path this key's value most often comes from, as a hint. */
  from: string;
  excluded: boolean;
}

export interface LinkKeyGroupSummary {
  group: LinkKeyGroup;
  label: string;
  links: number;
  keys: LinkKeyRow[];
}

export interface LinkKeySummary {
  groups: LinkKeyGroupSummary[];
  totalLinks: number;
  /** Links currently hidden. Excluded keys no link uses don't count. */
  hiddenLinks: number;
  /** Every excluded key, including ones no current link uses (so "Show all" can clear them). */
  excludedKeys: number;
}

function mostCommon(counts: Map<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [value, n] of counts) {
    if (n > bestCount || (n === bestCount && value.localeCompare(best) < 0)) {
      best = value;
      bestCount = n;
    }
  }
  return best;
}

export function summarizeLinkKeys(
  edges: readonly (LinkKeyEdge & { producerJsonPath: string })[],
  excludedKeys: Iterable<string>,
): LinkKeySummary {
  const excluded = new Set(excludedKeys);
  const byKey = new Map<string, { links: number; producers: Map<string, number> }>();
  for (const e of edges) {
    const key = linkKey(e);
    const entry = byKey.get(key) ?? { links: 0, producers: new Map<string, number>() };
    entry.links += 1;
    entry.producers.set(e.producerJsonPath, (entry.producers.get(e.producerJsonPath) ?? 0) + 1);
    byKey.set(key, entry);
  }

  const groups = GROUP_ORDER.map((group) => {
    const keys = [...byKey]
      .filter(([key]) => linkKeyGroup(key) === group)
      .map(([key, v]) => ({
        key,
        path: linkKeyPath(key),
        links: v.links,
        from: mostCommon(v.producers),
        excluded: excluded.has(key),
      }))
      .sort((a, b) => b.links - a.links || a.path.localeCompare(b.path));
    return { group, label: GROUP_LABEL[group], links: keys.reduce((n, k) => n + k.links, 0), keys };
  }).filter((g) => g.keys.length > 0);

  const hiddenLinks = groups.flatMap((g) => g.keys).reduce((n, k) => n + (k.excluded ? k.links : 0), 0);
  return { groups, totalLinks: edges.length, hiddenLinks, excludedKeys: excluded.size };
}

/** `current` with `keys` switched off (`excluded` true) or back on. Sorted, deduplicated. */
export function setKeys(current: readonly string[], keys: readonly string[], excluded: boolean): string[] {
  const next = new Set(current);
  for (const key of keys) {
    if (excluded) next.add(key);
    else next.delete(key);
  }
  return [...next].sort();
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd packages/portal-web && pnpm vitest run test/linkKeySummary.test.ts && pnpm typecheck`
Expected: PASS (8 tests), typecheck clean. (If `@backbencher/derive/linkKeys` doesn't resolve, derive wasn't built: run `cd packages/derive && pnpm build`.)

- [ ] **Step 5: Commit**

```bash
git add packages/portal-web/src/linkKeySummary.ts packages/portal-web/test/linkKeySummary.test.ts
git commit -m "feat(portal-web): summarize a session graph's link keys for the Links panel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Links button and popover component

**Files:**
- Create: `packages/portal-web/src/screens/LinksFilter.tsx`
- Create: `packages/portal-web/test/LinksFilter.test.tsx`

**Interfaces:**
- Consumes: `LinkKeySummary` (Task 5); `Icon` from `../ui.js`; `SlidersHorizontalIcon` from `lucide-react`.
- Produces:
  - `LinksFilter(props: { summary: LinkKeySummary; locked: boolean; saving: boolean; error: string | null; onSetExcluded: (keys: string[], excluded: boolean) => void; onShowAll: () => void }): JSX.Element`
  - Button label: `Links` when `summary.hiddenLinks === 0`, else `Links · <hiddenLinks> hidden`.
  - Owns open/closed state. Closes on Esc (without letting the key reach `window`) and on a pointer-down outside the component.

- [ ] **Step 1: Write the failing test**

Create `packages/portal-web/test/LinksFilter.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizeLinkKeys } from "../src/linkKeySummary.js";
import { LinksFilter } from "../src/screens/LinksFilter.js";

type E = { consumerLocation: "path" | "query" | "requestBody" | "requestHeader"; consumerJsonPath: string; producerJsonPath: string };
const edges: E[] = [
  { consumerLocation: "requestHeader", consumerJsonPath: "Cookie.sid", producerJsonPath: "Set-Cookie.sid" },
  { consumerLocation: "requestHeader", consumerJsonPath: "Cookie.theme", producerJsonPath: "Set-Cookie.theme" },
  { consumerLocation: "path", consumerJsonPath: "ticketId", producerJsonPath: "$.data.id" },
];

function setup(excluded: string[] = [], overrides: Partial<Parameters<typeof LinksFilter>[0]> = {}) {
  const onSetExcluded = vi.fn();
  const onShowAll = vi.fn();
  render(
    <LinksFilter
      summary={summarizeLinkKeys(edges, excluded)}
      locked={false}
      saving={false}
      error={null}
      onSetExcluded={onSetExcluded}
      onShowAll={onShowAll}
      {...overrides}
    />,
  );
  return { onSetExcluded, onShowAll };
}

const open = () => fireEvent.click(screen.getByRole("button", { name: /^Links/ }));

describe("LinksFilter", () => {
  afterEach(cleanup);

  it("labels the button with the number of hidden links", () => {
    setup(["requestHeader:Cookie.sid"]);
    expect(screen.getByRole("button", { name: "Links · 1 hidden" })).toBeTruthy();
  });

  it("lists groups with their keys and producer hints", () => {
    setup();
    open();
    expect(screen.getByText("Cookies")).toBeTruthy();
    expect(screen.getByText("Path")).toBeTruthy();
    expect(screen.getByText("from $.data.id")).toBeTruthy();
    expect(screen.getByText("3 of 3 links shown")).toBeTruthy();
  });

  it("unticking a key excludes just that key", () => {
    const { onSetExcluded } = setup();
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cookie.sid" }));
    expect(onSetExcluded).toHaveBeenCalledWith(["requestHeader:Cookie.sid"], true);
  });

  it("the group checkbox excludes every key in the group when all are on", () => {
    const { onSetExcluded } = setup();
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "All Cookies" }));
    expect(onSetExcluded).toHaveBeenCalledWith(["requestHeader:Cookie.sid", "requestHeader:Cookie.theme"], true);
  });

  it("the group checkbox turns a mixed group back on", () => {
    const { onSetExcluded } = setup(["requestHeader:Cookie.sid"]);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "All Cookies" }));
    expect(onSetExcluded).toHaveBeenCalledWith(["requestHeader:Cookie.sid", "requestHeader:Cookie.theme"], false);
  });

  it("group checkbox with a search only toggles matching keys", () => {
    const { onSetExcluded } = setup();
    open();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search keys" }), { target: { value: "theme" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "All Cookies" }));
    expect(onSetExcluded).toHaveBeenCalledWith(["requestHeader:Cookie.theme"], true);
  });

  it("is locked while deletions are staged", () => {
    setup([], { locked: true });
    open();
    expect((screen.getByRole("checkbox", { name: "Cookie.sid" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Save or discard your staged changes first")).toBeTruthy();
  });

  it("Show all is enabled when only stale keys are excluded", () => {
    const { onShowAll } = setup(["query:gone"]);
    open();
    const showAll = screen.getByRole("button", { name: "Show all" }) as HTMLButtonElement;
    expect(showAll.disabled).toBe(false);
    fireEvent.click(showAll);
    expect(onShowAll).toHaveBeenCalled();
  });

  it("Esc closes the panel without reaching window listeners", () => {
    setup();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    open();
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search keys" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Links filter" })).toBeNull();
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("says so when the session has no links", () => {
    render(
      <LinksFilter
        summary={summarizeLinkKeys([], [])}
        locked={false}
        saving={false}
        error={null}
        onSetExcluded={vi.fn()}
        onShowAll={vi.fn()}
      />,
    );
    open();
    expect(screen.getByText("This session has no links.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/portal-web && pnpm vitest run test/LinksFilter.test.tsx`
Expected: FAIL — cannot resolve `../src/screens/LinksFilter.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/portal-web/src/screens/LinksFilter.tsx`:

```tsx
import { SlidersHorizontalIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LinkKeyRow, LinkKeySummary } from "../linkKeySummary.js";
import { Icon } from "../ui.js";

// The dependency graph's Links button and its drop-down panel: every key the graph's links are
// built on, grouped, each switchable off. Changes are reported up immediately; the graph saves
// them (sessions.setExcludedLinkKeys) so its view and the server's delete check never differ.

function GroupCheckbox({ label, keys, disabled, onToggle }: { label: string; keys: LinkKeyRow[]; disabled: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const on = keys.filter((k) => !k.excluded).length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = on > 0 && on < keys.length;
  }, [on, keys.length]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={`All ${label}`}
      className="m-0 h-4 w-4 p-0 accent-[--accent]"
      checked={on === keys.length}
      disabled={disabled}
      onChange={onToggle}
    />
  );
}

export function LinksFilter({
  summary,
  locked,
  saving,
  error,
  onSetExcluded,
  onShowAll,
}: {
  summary: LinkKeySummary;
  locked: boolean;
  saving: boolean;
  error: string | null;
  onSetExcluded: (keys: string[], excluded: boolean) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const needle = query.trim().toLowerCase();
  const groups = summary.groups
    .map((g) => ({ ...g, keys: g.keys.filter((k) => !needle || k.path.toLowerCase().includes(needle)) }))
    .filter((g) => g.keys.length > 0);
  const shown = summary.totalLinks - summary.hiddenLinks;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        className="rounded-md border border-[--line] px-2 py-1 text-xs font-semibold"
        title="Choose which kinds of values the graph's links are built on"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon icon={SlidersHorizontalIcon} className="mr-1.5" />
        {summary.hiddenLinks === 0 ? "Links" : `Links · ${summary.hiddenLinks} hidden`}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Links filter"
          className="absolute right-0 top-full z-20 mt-1 flex max-h-[60vh] w-[360px] flex-col rounded-lg border border-[--line] bg-[--panel] text-xs shadow-panel"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // The graph modal closes itself on Esc via a window listener; keep this Esc for the panel.
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div className="border-b border-[--line] p-2">
            <input
              type="search"
              aria-label="Search keys"
              className="w-full"
              placeholder="Search keys"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // biome-ignore lint/a11y/noAutofocus: the search is the panel's first control
              autoFocus
            />
            {locked && <div className="mt-1.5 text-[#ffc078]">Save or discard your staged changes first</div>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {summary.groups.length === 0 && <div className="text-[--muted]">This session has no links.</div>}
            {summary.groups.length > 0 && groups.length === 0 && <div className="text-[--muted]">No keys match.</div>}
            {groups.map((g) => {
              const allOn = g.keys.every((k) => !k.excluded);
              return (
                <fieldset key={g.group} className="m-0 mb-2 border-0 p-0">
                  <legend className="flex w-full items-center gap-2 p-0 py-1 font-semibold">
                    <GroupCheckbox
                      label={g.label}
                      keys={g.keys}
                      disabled={locked || saving}
                      onToggle={() => onSetExcluded(g.keys.map((k) => k.key), allOn)}
                    />
                    <span>{g.label}</span>
                    <span className="font-normal text-[--muted]">
                      {g.links} links · {g.keys.length} keys
                    </span>
                  </legend>
                  <ul className="m-0 list-none p-0 pl-6">
                    {g.keys.map((k) => (
                      <li key={k.key} className="flex items-center gap-2 py-0.5">
                        <input
                          type="checkbox"
                          aria-label={k.path}
                          className="m-0 h-3.5 w-3.5 p-0 accent-[--accent]"
                          checked={!k.excluded}
                          disabled={locked || saving}
                          onChange={() => onSetExcluded([k.key], !k.excluded)}
                        />
                        <code className="min-w-0 truncate" title={k.path}>
                          {k.path}
                        </code>
                        <span className="text-[--muted]">{k.links}</span>
                        <span className="ml-auto truncate text-[--muted]" title={`from ${k.from}`}>
                          from {k.from}
                        </span>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[--line] p-2">
            <span className="text-[--muted]">
              {shown} of {summary.totalLinks} links shown
            </span>
            <button type="button" disabled={locked || saving || summary.excludedKeys === 0} onClick={onShowAll}>
              Show all
            </button>
          </div>
          {error && <div className="border-t border-[--line] p-2 text-[#ff8787]">{error}</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd packages/portal-web && pnpm vitest run test/LinksFilter.test.tsx && pnpm typecheck`
Expected: PASS (10 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/portal-web/src/screens/LinksFilter.tsx packages/portal-web/test/LinksFilter.test.tsx
git commit -m "feat(portal-web): add the Links filter button and panel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wire the filter into the dependency graph

**Files:**
- Modify: `packages/portal-web/src/screens/SessionGraph.tsx`
  - imports (lines 1–22)
  - `ConnectedEdges` (line ~272) and `NodeDetails` (line ~376): hidden-links note
  - `SessionGraphModal` (line ~430): state, `shownEdges`, both memos (~505–530), `graphEdgesRaw` / `isolatedIds` / `blockersFor` (~668–679), Orphans title (~767), toolbar (insert before the Orphans button), `NodeDetails` usage (~953)

**Interfaces:**
- Consumes: `withoutExcludedLinks` (Task 1, via `@backbencher/derive/linkKeys`); `findIsolatedCalls(ids, edges, allEdges)` (Task 2); `trpc.sessions.graph` → `excludedLinkKeys`, `trpc.sessions.setExcludedLinkKeys` (Task 4); `summarizeLinkKeys`, `setKeys` (Task 5); `LinksFilter` (Task 6).
- Produces: no new exports.

There is no automated test for this task (no browser tests in this repo); verification is typecheck, the full suite, and a build. The behaviour it wires is covered by Tasks 1–6.

- [ ] **Step 1: Imports**

Add to the imports of `SessionGraph.tsx`:

```ts
import { withoutExcludedLinks } from "@backbencher/derive/linkKeys";
import { setKeys, summarizeLinkKeys } from "../linkKeySummary.js";
import { LinksFilter } from "./LinksFilter.js";
```

- [ ] **Step 2: Hidden-links note in call details**

Change `ConnectedEdges` to accept a `hidden` count and show it. Its props become:

```tsx
function ConnectedEdges({
  edges,
  correlationId,
  nodesById,
  hidden,
}: {
  edges: GraphEdge[];
  correlationId: string;
  nodesById: Map<string, GraphCallNode>;
  /** This call's links hidden by the Links filter. */
  hidden: number;
}) {
```

Replace its early return `if (related.length === 0) return <Muted>No connected values.</Muted>;` with:

```tsx
  const hiddenNote =
    hidden > 0 ? (
      <Muted>
        {hidden} {hidden === 1 ? "link" : "links"} hidden by the Links filter
      </Muted>
    ) : null;
  if (related.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <Muted>No connected values.</Muted>
        {hiddenNote}
      </div>
    );
  }
```

and render `{hiddenNote}` as the last child of its `<div className="flex flex-col gap-2">`.

Add an `allEdges: GraphEdge[]` prop to `NodeDetails` (next to `edges`), and pass the count down where it renders `ConnectedEdges`:

```tsx
        <ConnectedEdges
          edges={edges}
          correlationId={node.correlationId}
          nodesById={nodesById}
          hidden={
            allEdges.filter((e) => e.producerCorrelationId === node.correlationId || e.consumerCorrelationId === node.correlationId)
              .length -
            edges.filter((e) => e.producerCorrelationId === node.correlationId || e.consumerCorrelationId === node.correlationId)
              .length
          }
        />
```

- [ ] **Step 3: Filter state in `SessionGraphModal`**

After `const graph = trpc.sessions.graph.useQuery({ sessionId });` add:

```tsx
  // Keys the analyst switched off. Optimistic: a tick shows at once; the override is dropped once the
  // saved list is back from the server (or on error, which reverts to what's saved). `saveSeq`
  // makes sure only the latest of several quick ticks clears it.
  const [excludedOverride, setExcludedOverride] = useState<string[] | null>(null);
  const saveSeq = useRef(0);
  const saveExcluded = trpc.sessions.setExcludedLinkKeys.useMutation();
  const excludedLinkKeys = excludedOverride ?? graph.data?.excludedLinkKeys ?? [];
  const excludedSignature = excludedLinkKeys.join("\n");
  const allEdges = graph.data?.edges ?? [];
  // Every graph view, orphan check and blocker check below reads these, never graph.data.edges.
  const shownEdges = useMemo(
    () => withoutExcludedLinks(graph.data?.edges ?? [], excludedSignature ? excludedSignature.split("\n") : []),
    [graph.data, excludedSignature],
  );
  const updateExcluded = (next: string[]) => {
    const seq = ++saveSeq.current;
    setExcludedOverride(next);
    saveExcluded.mutate(
      { sessionId, keys: next },
      {
        onSuccess: async () => {
          await utils.sessions.graph.invalidate({ sessionId });
          if (saveSeq.current === seq) setExcludedOverride(null);
        },
        onError: () => {
          if (saveSeq.current === seq) setExcludedOverride(null);
        },
      },
    );
  };
```

(`useRef`, `useMemo` and `useState` are already imported; `utils` is already defined in this component.)

- [ ] **Step 4: Views use the shown links**

In the `filteredIds` memo and the layout memo, replace `(graph.data?.edges ?? []).filter(` with `shownEdges.filter(` (two places), and add `shownEdges` to both dependency arrays, e.g.:

```tsx
    const graphEdgesRaw = shownEdges.filter(
      (e) => !pendingDeletes.has(e.producerCorrelationId) && !pendingDeletes.has(e.consumerCorrelationId),
    );
    return computeFilteredIds(graphMode, selectedId, presentIds, graphEdgesRaw);
  }, [graph.data, shownEdges, pendingDeletes, graphMode, selectedId]);
```

Do the same for the layout memo's `graphEdgesRaw` and its dependency array.

- [ ] **Step 5: Orphans and blockers use the shown links**

Replace the block from `const graphEdgesRaw = (graph.data?.edges ?? []).filter(` through `findOrphanedConsumers(graph.data?.edges ?? [], …)` with:

```tsx
  const notStaged = (e: GraphEdge) => !pendingDeletes.has(e.producerCorrelationId) && !pendingDeletes.has(e.consumerCorrelationId);
  const graphEdgesRaw = shownEdges.filter(notStaged);
  const allEdgesRaw = allEdges.filter(notStaged);
  // Computed over the whole visible session, not the Trace/Producers/Consumers scope: a call is an
  // orphan by the session's graph, not by whatever subset happens to be on screen. Single-level is
  // judged from every link, so filtering all links out makes every call an orphan (spec §5).
  const isolatedIds = findIsolatedCalls(visibleNodesById.keys(), graphEdgesRaw, allEdgesRaw);
  // Everything below stages only; nothing is permanent until Save changes. Each staging action is
  // checked against the same producer rule the server enforces, over the same shown links, so it is
  // disabled with the reason up front instead of failing at save time.
  const blockersFor = (ids: Iterable<string>) => findOrphanedConsumers(shownEdges, new Set([...pendingDeletes, ...ids]));
```

In the Orphans button's `title`, change `graphEdgesRaw.length === 0` to `allEdgesRaw.length === 0`.

- [ ] **Step 6: Toolbar and details**

Immediately before the Orphans `<button …>`, insert:

```tsx
            <LinksFilter
              summary={summarizeLinkKeys(allEdges, excludedLinkKeys)}
              locked={pendingDeletes.size > 0}
              saving={saveExcluded.isPending}
              error={saveExcluded.error?.message ?? null}
              onSetExcluded={(keys, excluded) => updateExcluded(setKeys(excludedLinkKeys, keys, excluded))}
              onShowAll={() => updateExcluded([])}
            />
```

Where `NodeDetails` is rendered, add the unfiltered links:

```tsx
              <NodeDetails
                sessionId={sessionId}
                node={selectedNode}
                edges={graphEdgesRaw}
                allEdges={allEdgesRaw}
                nodesById={visibleNodesById}
              />
```

- [ ] **Step 7: Verify**

Run:

```bash
cd packages/portal-web && pnpm typecheck && pnpm test && pnpm build
```

Expected: typecheck clean; all portal-web tests PASS (8 existing + 8 + 10); build succeeds.

Also confirm nothing still reads unfiltered edges for views or checks:

```bash
grep -n "graph.data?.edges" packages/portal-web/src/screens/SessionGraph.tsx
```

Expected: only the `allEdges` and `shownEdges` definitions from Step 3.

- [ ] **Step 8: Commit**

```bash
git add packages/portal-web/src/screens/SessionGraph.tsx
git commit -m "feat(portal-web): filter the dependency graph by link key" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification

**Files:** none changed.

- [ ] **Step 1: Build in dependency order**

```bash
for p in derive store portal-api portal-web; do (cd packages/$p && pnpm build) || break; done
```

Expected: every build succeeds.

- [ ] **Step 2: Typecheck and test everything**

```bash
pnpm -r typecheck
pnpm -r --filter '!@backbencher/recorder' test
```

Expected: all typechecks clean, all suites PASS.

- [ ] **Step 3: Tell the analyst to restart the API server**

The API server (`apps/cli`: `node dist/index.js serve --port 4100`) loads portal-api once at startup, and migration `0006` runs when it opens the store. It must be restarted before the Links panel works; the Vite dev server needs nothing.
