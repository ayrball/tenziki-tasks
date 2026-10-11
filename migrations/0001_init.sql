-- Tenziki Tasks: D1 schema. Safe to run on a database that already has a tasks table.
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  completed   INTEGER NOT NULL DEFAULT 0,
  priority    TEXT NOT NULL DEFAULT 'medium',
  category    TEXT NOT NULL DEFAULT 'Personal',
  due_date    TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON tasks (user_id, created_at DESC);
