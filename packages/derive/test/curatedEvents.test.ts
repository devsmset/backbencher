import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../fixtures/sessions.js";
import { loadCuratedOrRawSession, writeCuratedEvents } from "../src/curatedEvents.js";

const H = "https://app.example.net";
let dir: string;

function seed() {
  resetClock();
  const session = makeSession("sess-curated", [
    ...apiCall("k1", { url: `${H}/api/a`, body: { id: "AAAA1111BBBB2222" } }),
    ...apiCall("k2", { url: `${H}/api/b`, body: { id: "CCCC3333DDDD4444" } }),
  ]);
  // loadSession validates meta, which requires a name and a goal.
  const meta = { ...session.meta, name: "curated fixture", goal: "exercise curation" };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
  writeFileSync(
    join(dir, "events.ndjson"),
    `${session.events.map((e) => JSON.stringify(e)).join("\n")}\n`,
  );
  return { ...session, meta };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bb-curated-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeCuratedEvents", () => {
  it("drops both halves of an excluded call and keeps order", () => {
    const session = seed();
    const written = writeCuratedEvents(dir, session, new Set(["k1"]));
    expect(written).toBe(2);
    const curated = loadCuratedOrRawSession(dir);
    expect(curated.events.map((e) => e.correlationId)).toEqual(["k2", "k2"]);
  });

  it("writes every event when nothing is excluded", () => {
    const session = seed();
    expect(writeCuratedEvents(dir, session, new Set())).toBe(4);
  });
});

describe("loadCuratedOrRawSession", () => {
  it("falls back to raw events when no curated file exists", () => {
    seed();
    expect(loadCuratedOrRawSession(dir).events).toHaveLength(4);
  });

  it("prefers the curated file when it exists", () => {
    const session = seed();
    writeCuratedEvents(dir, session, new Set(["k2"]));
    expect(loadCuratedOrRawSession(dir).events.map((e) => e.correlationId)).toEqual(["k1", "k1"]);
  });
});
