/**
 * SQLite connection + schema. The append-only `events` table is the source
 * of truth; `cards` is a materialized projection kept in sync in the same
 * transaction as each event append (see card-store.ts). `cards` is therefore
 * disposable — it can always be rebuilt by replaying `events` — which is why
 * no foreign key points from the truth (`events`) to the cache (`cards`).
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

export const DEFAULT_DB_PATH = "data/agent-kanban.db";

const SCHEMA = `
CREATE TABLE cards (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  state         TEXT NOT NULL,
  executor      TEXT NOT NULL,
  review_policy TEXT NOT NULL,
  paused_from   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX cards_state    ON cards(state);
CREATE INDEX cards_executor ON cards(executor);

CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id       TEXT NOT NULL,
  type          TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  actor_type    TEXT NOT NULL,
  from_state    TEXT,
  to_state      TEXT,
  executor      TEXT NOT NULL,
  review_policy TEXT NOT NULL,
  note          TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX events_card ON events(card_id, id);
`;

/**
 * Open (creating if needed) and migrate a database. Pass ":memory:" for an
 * ephemeral database in tests.
 */
export function openDb(path: string = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH): Db {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const apply = db.transaction(() => {
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version < 1) {
      db.exec(SCHEMA);
      db.pragma("user_version = 1");
    }
  });
  apply();
}
