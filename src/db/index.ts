import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as schema from "./schema";

const defaultPath = join(
  homedir(),
  "Library",
  "Application Support",
  "FocusFlow",
  "assistant.sqlite",
);
export const databasePath = process.env.ASSISTANT_DB_PATH ?? defaultPath;

type DbState = {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

const globalForDb = globalThis as typeof globalThis & {
  __focusFlowDb?: DbState;
};

function createDatabase(): DbState {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned', sort_order INTEGER NOT NULL DEFAULT 0,
      horizon TEXT NOT NULL DEFAULT 'today', list TEXT NOT NULL DEFAULT 'work',
      importance INTEGER NOT NULL DEFAULT 3,
      energy INTEGER NOT NULL DEFAULT 3, estimate_minutes INTEGER, due_at INTEGER,
      tags TEXT NOT NULL DEFAULT '[]', flag_color TEXT, recurrence_rule TEXT, recurrence_source_id TEXT,
      priority_override REAL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
    CREATE TABLE IF NOT EXISTS time_blocks (
      id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_start ON time_blocks(starts_at);
    CREATE TABLE IF NOT EXISTS outlook_events (
      id TEXT PRIMARY KEY, subject TEXT NOT NULL, starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL, is_all_day INTEGER NOT NULL DEFAULT 0,
      show_as TEXT NOT NULL DEFAULT 'busy', web_link TEXT, synced_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outlook_start ON outlook_events(starts_at);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS change_log (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      action TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, topics TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  const taskColumns = sqlite.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!taskColumns.some((column) => column.name === "sort_order")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    sqlite.exec(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) * 10 AS position
        FROM tasks
      )
      UPDATE tasks
      SET sort_order = (SELECT position FROM ordered WHERE ordered.id = tasks.id);
    `);
  }
  if (!taskColumns.some((column) => column.name === "horizon")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN horizon TEXT NOT NULL DEFAULT 'today'");
  }
  if (!taskColumns.some((column) => column.name === "flag_color")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN flag_color TEXT");
  }
  if (!taskColumns.some((column) => column.name === "list")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN list TEXT NOT NULL DEFAULT 'work'");
  }
  sqlite.exec("UPDATE tasks SET horizon = 'later' WHERE horizon IS NULL OR horizon IN ('', 'none')");
  sqlite.exec("UPDATE tasks SET status = 'planned' WHERE status = 'inbox'");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(sort_order)");
  const peopleColumns = sqlite.prepare("PRAGMA table_info(people)").all() as { name: string }[];
  if (!peopleColumns.some((column) => column.name === "pinned")) {
    sqlite.exec("ALTER TABLE people ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  }
  if (!peopleColumns.some((column) => column.name === "sort_order")) {
    sqlite.exec("ALTER TABLE people ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    sqlite.exec(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY name) * 10 AS position FROM people
      )
      UPDATE people
      SET sort_order = (SELECT position FROM ordered WHERE ordered.id = people.id);
    `);
  }
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

const state = globalForDb.__focusFlowDb ?? createDatabase();
if (process.env.NODE_ENV !== "production") globalForDb.__focusFlowDb = state;

export const db = state.db;
export const sqlite = state.sqlite;
