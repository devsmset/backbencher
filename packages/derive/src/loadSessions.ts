import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RecordingEventSchema, RecordingMetaSchema } from "@backbencher/schemas";
import { dataDir } from "@backbencher/shared";
import type { SessionData } from "./types.js";

// loadSessions pass (architecture §5.1). Reads a session directory (meta.json + events.ndjson),
// validating each line at the boundary.

export function loadSession(dir: string): SessionData {
  const meta = RecordingMetaSchema.parse(JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")));
  const events = readFileSync(join(dir, "events.ndjson"), "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => RecordingEventSchema.parse(JSON.parse(l)));
  return { meta, events };
}

export function loadAllSessions(sessionsDir: string = join(dataDir(), "sessions")): SessionData[] {
  if (!existsSync(sessionsDir)) return [];
  return readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadSession(join(sessionsDir, d.name)))
    .sort((a, b) => a.meta.startedAt - b.meta.startedAt);
}
