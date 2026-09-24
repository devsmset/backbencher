import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type SessionData, runDerivation } from "@backbencher/derive";
import { dataDir } from "@backbencher/shared";
import { openStore } from "@backbencher/store";
import { afterEach, describe, expect, it } from "vitest";
import { apiCall, makeSession, resetClock } from "../../derive/fixtures/sessions.js";
import {
  NoReplayableCallsError,
  proposeCompositionFromSession,
  UnansweredCallsError,
  UnclassifiedCallsError,
} from "../src/composeFromSession.js";

// Mirrors packages/portal-api/test/curation.test.ts's fixture pattern: real files under the real
// dataDir(), tracked and removed in afterEach. Never the unscoped pattern derivation.test.ts had
// before its fix — this suite must not touch any session it didn't create itself.
const createdDirs: string[] = [];
afterEach(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
  createdDirs.length = 0;
});

function writeSession(session: SessionData): string {
  const dir = join(dataDir(), "sessions", session.meta.sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(session.meta));
  writeFileSync(
    join(dir, "events.ndjson"),
    `${session.events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
  createdDirs.push(dir);
  return dir;
}

function completeSession(sessionId: string, events: SessionData["events"], goal: string): SessionData {
  const session = makeSession(sessionId, events);
  return { ...session, meta: { ...session.meta, name: `${sessionId} fixture`, goal } };
}

describe("proposeCompositionFromSession", () => {
  it("builds a draft Composition from a curated session's real calls, in order", () => {
    resetClock();
    const session = completeSession(
      "sess-propose-1",
      [
        ...apiCall("c1", { method: "POST", url: "https://app.example.net/auth/login", body: { token: "abc123def456" } }),
        ...apiCall("c2", {
          method: "POST",
          url: "https://app.example.net/api/tickets",
          reqHeaders: { authorization: "Bearer abc123def456" },
          body: { id: "t1" },
        }),
      ],
      "log in and create a ticket",
    );
    writeSession(session);

    const store = openStore(":memory:");
    const derived = runDerivation([session]);
    store.saveDerivation(derived);
    store.sessions.upsertFromMeta(session.meta);

    const composition = proposeCompositionFromSession(store, "sess-propose-1", "alice");

    expect(composition.goal).toBe("log in and create a ticket");
    expect(composition.sourceSessionId).toBe("sess-propose-1");
    expect(composition.status).toBe("draft");
    expect(composition.steps).toHaveLength(2);
    expect(composition.steps[0]?.sourceCorrelationId).toBe("c1");
    expect(composition.steps[1]?.sourceCorrelationId).toBe("c2");
    expect(composition.steps.every((s) => s.fromSessionIds.includes("sess-propose-1"))).toBe(true);
    expect(store.compositions.get(composition.compositionId)).toEqual(composition);
  });

  it("refuses when a curated call has no derived operationId", () => {
    resetClock();
    const session = completeSession(
      "sess-propose-2",
      [...apiCall("c1", { url: "https://app.example.net/api/things", body: { ok: true } })],
      "do a thing",
    );
    writeSession(session);

    const store = openStore(":memory:");
    // No saveDerivation call at all — the store has no Flow for this session, so every call is
    // unclassified. This also covers the "session not derived" case, since flow?.steps ?? [] is [].
    store.sessions.upsertFromMeta(session.meta);

    expect(() => proposeCompositionFromSession(store, "sess-propose-2", "alice")).toThrow(UnclassifiedCallsError);
    try {
      proposeCompositionFromSession(store, "sess-propose-2", "alice");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UnclassifiedCallsError);
      expect((e as UnclassifiedCallsError).calls).toHaveLength(1);
      expect((e as UnclassifiedCallsError).calls[0]?.correlationId).toBe("c1");
    }
  });

  function deriveInto(session: SessionData) {
    writeSession(session);
    const store = openStore(":memory:");
    store.saveDerivation(runDerivation([session]));
    store.sessions.upsertFromMeta(session.meta);
    return store;
  }

  it("refuses a call whose recorded status is 0 (request failed)", () => {
    resetClock();
    const session = completeSession(
      "sess-propose-3",
      [...apiCall("c1", { url: "https://app.example.net/api/things", status: 0 })],
      "failed call",
    );
    const store = deriveInto(session);

    try {
      proposeCompositionFromSession(store, "sess-propose-3", "alice");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UnansweredCallsError);
      expect((e as UnansweredCallsError).calls[0]).toMatchObject({ correlationId: "c1", status: 0 });
    }
  });

  it("refuses a request that never got a response event", () => {
    resetClock();
    const session = completeSession(
      "sess-propose-4",
      [apiCall("c1", { url: "https://app.example.net/api/things" })[0] as SessionData["events"][number]],
      "unanswered call",
    );
    const store = deriveInto(session);

    try {
      proposeCompositionFromSession(store, "sess-propose-4", "alice");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UnansweredCallsError);
      expect((e as UnansweredCallsError).calls[0]).toMatchObject({ correlationId: "c1", status: null });
    }
  });

  it("refuses a session whose only calls are assets", () => {
    resetClock();
    const session = completeSession(
      "sess-propose-5",
      [
        ...apiCall("a1", {
          url: "https://app.example.net/logo.png",
          resHeaders: { "content-type": "image/png" },
          bodyKind: "binary",
        }),
      ],
      "only assets",
    );
    const store = deriveInto(session);

    expect(() => proposeCompositionFromSession(store, "sess-propose-5", "alice")).toThrow(NoReplayableCallsError);
  });
});
