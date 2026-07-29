import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "@backbencher/shared";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Db } from "./dbtypes.js";
import { runMigrations } from "./migrate.js";
import { type Repos, createRepos } from "./repos/index.js";
import { type DerivationInput, saveDerivation } from "./saveDerivation.js";
import * as schema from "./schema.js";

// Store entry point (architecture §6.1). openStore() opens SQLite, applies migrations, and
// returns the repositories — the only sanctioned DB access path for portal-api and agent.

export interface Store extends Repos {
  db: Db;
  raw: Database.Database;
  saveDerivation(input: DerivationInput): void;
  close(): void;
}

export function defaultDbPath(): string {
  return join(dataDir(), "backbencher.db");
}

export function openStore(dbPath: string = defaultDbPath()): Store {
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const raw = new Database(dbPath);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  runMigrations(raw);
  const db: Db = drizzle(raw, { schema });

  return {
    ...createRepos(db),
    db,
    raw,
    saveDerivation: (input) => saveDerivation(db, input),
    close: () => raw.close(),
  };
}
