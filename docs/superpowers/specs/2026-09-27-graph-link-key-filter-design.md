# Filter the session dependency graph by link key

Date: 2026-09-27
Status: approved, not yet implemented

## Problem

The session dependency graph links two Calls whenever a value from one Call's response reappears in
a later Call's request. Many of those links travel through cookies (`Set-Cookie.X` → `Cookie.X`) or
other headers that carry no meaning for a test script. Test scripts mostly care about values created
or fetched in response bodies and reused in paths, queries and bodies.

These links do real harm during curation:

- They make Calls look connected, so the **Orphans** button can't find Calls that are really
  unrelated to the flow.
- They make Calls look like the sole producer of a value a kept Call needs, so the graph and the
  server both refuse to delete them.

They don't affect generated scripts: `generateFromSession` only templates values produced by a
response body and skips `Cookie.*` consumers. The problem is curation, not generation.

## Goal

In the dependency graph, the analyst sees every **link key** the graph is built on and can switch
keys off. Links through a switched-off key disappear, so Calls that only depended on them become
orphans and can be deleted with the existing Remove → Save changes flow.

Success: a Call "connected" to the flow only through cookies can be selected with Orphans and
deleted, and the server accepts the deletion.

## Decisions

These were settled with the analyst during design:

1. **Saved per Session.** The selection is stored on the Session and applies every time its graph is
   opened. The server's delete check honours it.
2. **A key is where the value is used.** One key per request field: consumer location plus consumer
   path (e.g. `Cookie.JSESSIONID`, header `x-csrf-token`, path `ticketId`, body `$.customer.id`), not
   per producer→consumer pair. Keys are grouped Cookies / Headers / Path / Query / Body.
3. **Everything is on by default.** Nothing is hidden until the analyst unticks it. The stored value
   is the list of *excluded* keys, so a key that appears after re-derivation starts switched on.
4. **Scope is the graph and deletion only.** Script generation, redundant-call filtering and the
   composer keep using every link. Stored links are never modified; excluding only hides them.

## Design

### 1. Shared key definition — `packages/derive/src/linkKeys.ts`

New browser-safe module (no Node imports), exported as the subpath `@backbencher/derive/linkKeys`
alongside the existing `./orphans` export in `packages/derive/package.json`.

- `linkKey(edge)` → `"<consumerLocation>:<consumerJsonPath>"`, for example
  `requestHeader:Cookie.JSESSIONID`, `path:ticketId`, `requestBody:$.customer.id`. Locations are the
  `SessionCallEdge.consumerLocation` enum (`path`, `query`, `requestBody`, `requestHeader`), none of
  which contains `:`, so the first `:` always separates location from path.
- `linkKeyGroup(key)` → `"cookie" | "header" | "path" | "query" | "body"`. A `requestHeader` key whose
  path starts with `Cookie.` is `cookie` (derivation already decomposes the Cookie header into one
  consumer per cookie, `dataflow.ts`); any other `requestHeader` key is `header`.
- `withoutExcludedLinks(edges, excludedKeys)` → the edges whose `linkKey` is not in `excludedKeys`,
  order preserved. Every place that applies the filter goes through this function, so the browser
  and the server cannot disagree about which links are hidden.

### 2. Storage — `packages/store`

- Migration `0006_session_link_key_filter`:
  `ALTER TABLE session_curation ADD COLUMN excluded_link_keys TEXT NOT NULL DEFAULT '[]'`.
  Existing rows get an empty list.
- `schema.ts`: add the `excludedLinkKeys` column (JSON `string[]`).
- `repos/curation.ts`:
  - `SessionCurationRow` gains `excludedLinkKeys: string[]`.
  - `upsert` accepts `excludedLinkKeys?` in its patch and preserves the current value when it is
    absent, as it already does for `deleted` and `useAsReference`. Stored deduplicated and sorted.
  - New `setExcludedLinkKeys(sessionId, keys, actor)` replaces the list.

### 3. API — `packages/portal-api`

- `sessions.graph` response adds `excludedLinkKeys: string[]` (empty when there is no curation row).
  It still returns every edge, so the UI can list excluded keys with their counts. The
  not-yet-derived early return includes `excludedLinkKeys: []` too.
- New mutation `sessions.setExcludedLinkKeys({ sessionId, keys: string[] })`: saves the list and
  appends an audit entry (`entityType: "session"`, `action: "curate.linkKeys"`, diff `{ keys }`).
  Keys are not validated against current edges: a key may legitimately disappear after
  re-derivation and reappear later.
- `sessions.deleteCalls`: the sole-producer guard becomes
  `assertDeletable(withoutExcludedLinks(persistedEdges, savedExcludedKeys), newlyDeleted)`. It reads
  the **saved** list from the store and accepts nothing from the request, so a stale browser view
  can't loosen the check.

### 4. Filter UI — `packages/portal-web/src/screens/SessionGraph.tsx`

**Toolbar button.** A new **Links** button next to Orphans (Lucide `SlidersHorizontalIcon`). Label:
`Links` when nothing is excluded, `Links · N hidden` otherwise.

**Panel.** Opens as a panel dropping down from the button; Esc or an outside click closes it.

- A search box filtering keys by name.
- Groups in fixed order: Cookies, Headers, Path, Query, Body. Empty groups are not shown. Each group
  header has a checkbox for the whole group (indeterminate when mixed) and a count, e.g.
  "Cookies · 41 links · 6 keys".
- Keys within a group sorted by link count, highest first. Each row: checkbox, the key's path (the
  part after `location:`), its link count, and a muted "from <producer path>" hint showing the most
  common producer path for that key.
- Footer: **Show all** (clears the exclusions) and "N of M links shown".
- Counts cover only links whose producer and consumer both still exist in the Session (the same set
  the graph draws).

**Applying changes.** Each checkbox change saves immediately via `sessions.setExcludedLinkKeys` and
the graph redraws. On failure the checkboxes revert to the last saved list and the error shows in
the panel. There is no separate Apply step: immediate saving keeps the browser's view and the
server's delete check identical.

**Locked while deletions are staged.** While any deletion is staged, the panel's checkboxes are
disabled with the note "Save or discard your staged changes first" (the same rule the Compose
TestSpec button follows). Otherwise an analyst could stage a Call as an orphan, re-enable the key
that made it necessary, and have Save rejected by the server.

**What follows the filter.** Everything in the graph uses the shown links
(`withoutExcludedLinks(edges, excludedLinkKeys)`):

- the drawn edges;
- Producers / Consumers / Trace views;
- the call-details "produces / consumes" list, which adds a muted line "N links hidden by the Links
  filter" when some of that Call's links are hidden;
- Orphans, Remove, Keep only these, and the "can't remove these calls yet" warning.

The panel's grouping and counting live in a small exported pure function (for example
`summarizeLinkKeys(edges, excludedKeys)`) so they can be unit-tested without rendering.

### 5. Orphans rule change — `packages/derive/src/orphans.ts`

Today `findIsolatedCalls` returns nothing when no edge survives, treating the Session as
single-level. With a filter, excluding every key a Session's links use would trigger that rule and
report zero orphans exactly when the analyst wants them.

New rule: *single-level* is decided from **all** of the Session's links (unfiltered, between
present Calls); isolation is decided from the **shown** links. `findIsolatedCalls` gains an optional
argument for the unfiltered edges; when it is supplied, the "no edges → nothing isolated" check uses
it instead of the shown edges. Existing callers that pass no third argument behave as today.

- A Session that never had links: no orphans, as today.
- A Session whose links are all excluded: every Call is an orphan.

### Consequence accepted

If the analyst excludes a key, deletes a Call that was only needed through it, and later re-enables
the key, those links return pointing at a Call that no longer exists. The graph only draws links
between present Calls, so they don't appear and nothing breaks. The deletion itself stays permanent,
as deletions already are.

## Out of scope

- Using the filter in script generation, redundant-call filtering on re-derivation, or the
  composer's dependency checks.
- Excluding links by producer→consumer pair, or by value.
- A default exclusion list (e.g. cookies off for new Sessions).

## Testing

No browser or visual tests; the analyst checks the UI by hand.

**derive**
- `linkKeys.test.ts`: key format for each consumer location; grouping (`Cookie.*` → cookie, other
  headers → header, path / query / body); `withoutExcludedLinks` removes exactly the excluded keys and
  preserves order.
- `orphans.test.ts`: never-linked Session → no orphans; all links excluded → every Call isolated; a
  Call linked only through an excluded key is isolated, one linked through a kept key is not;
  existing two-argument behaviour unchanged.

**store**
- Migration `0006` on a database with existing curation rows: `excludedLinkKeys` defaults to `[]`.
- `setExcludedLinkKeys` round-trips (deduplicated, sorted).
- Setting deleted Calls or the reference flag preserves excluded keys, and vice versa.

**portal-api**
- `sessions.graph` returns `excludedLinkKeys`.
- `setExcludedLinkKeys` persists and writes the audit entry.
- `deleteCalls` accepts deleting a Call needed only through an excluded key, still rejects when the
  needed link's key is kept, and ignores anything but the saved list.

**portal-web**
- `summarizeLinkKeys`: groups, per-key counts, the most common producer hint, counts that ignore
  links to absent Calls, and the hidden count.

**Build and verify.** Packages resolve each other through `dist/`, so build in order: derive → store →
portal-api → portal-web. Then run `typecheck`, `test` and `build` for each changed
package, and restart the API server (it loads portal-api once at startup).
