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
