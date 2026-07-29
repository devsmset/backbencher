import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema.js";

// Shared DB handle type (kept separate to avoid import cycles between db.ts and repos).
export type Db = BetterSQLite3Database<typeof schema>;
