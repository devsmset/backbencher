import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RecordingEventSchema, RecordingMetaSchema } from "@backbencher/schemas";
import { childLogger, dataDir } from "@backbencher/shared";
import type { SessionData } from "./types.js";

// loadSessions pass (architecture §5.1). Reads a session directory (meta.json + events.ndjson),
// validating each line at the boundary.

const log = childLogger({ mod: "derive" });

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
  const loaded: SessionData[] = [];
  for (const entry of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      loaded.push(loadSession(join(sessionsDir, entry.name)));
    } catch (err) {
      // A recording that is still running, or was abandoned before the analyst named it, has no
      // name/goal yet. Skip it rather than failing the whole derivation.
      log.warn({ session: entry.name, err }, "skipping unreadable or unnamed session");
    }
  }
  return loaded.sort((a, b) => a.meta.startedAt - b.meta.startedAt);
}
