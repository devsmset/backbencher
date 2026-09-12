import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RecordingEventSchema, RecordingMetaSchema } from "@backbencher/schemas";
import { loadSession } from "./loadSessions.js";
import type { SessionData } from "./types.js";

// The Curated Session on disk: raw events minus Redundant Calls minus what the Analyst deleted.
// A derived cache, rewritten on every derivation and on every save — never the durable record of
// the Analyst's intent, which lives in the store's session_curation table. events.ndjson is never
// written after capture (ADR-0006).

export const CURATED_EVENTS_FILE = "curated-events.ndjson";

/** Writes the curated NDJSON, dropping both halves of every excluded Call. Returns events written. */
export function writeCuratedEvents(
  dir: string,
  session: SessionData,
  excluded: ReadonlySet<string>,
): number {
  const kept = session.events.filter((e) => !excluded.has(e.correlationId));
  const body = kept.length > 0 ? `${kept.map((e) => JSON.stringify(e)).join("\n")}\n` : "";
  writeFileSync(join(dir, CURATED_EVENTS_FILE), body);
  return kept.length;
}

/** Reads the Curated Session, falling back to the raw recording when it has not been derived. */
export function loadCuratedOrRawSession(dir: string): SessionData {
  const curated = join(dir, CURATED_EVENTS_FILE);
  if (!existsSync(curated)) return loadSession(dir);
  const meta = RecordingMetaSchema.parse(JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")));
  const events = readFileSync(curated, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => RecordingEventSchema.parse(JSON.parse(l)));
  return { meta, events };
}
