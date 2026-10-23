-- Bars: user-defined, editable sections that tasks live in (replaces the four fixed categories).
CREATE TABLE IF NOT EXISTS lists (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'violet',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lists_user ON lists (user_id, position);

-- Which bar a task is in, and its place inside that bar (smaller = nearer the top).
ALTER TABLE tasks ADD COLUMN list_id TEXT;
ALTER TABLE tasks ADD COLUMN position REAL;

-- Keep today's order: newest first, exactly as before (newest = most negative).
UPDATE tasks SET position = COALESCE(-CAST(strftime('%s', created_at) AS REAL), 0) WHERE position IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_list ON tasks (user_id, list_id, position);

-- list_id for existing tasks is filled in by the Worker the first time each user loads their tasks
-- (it creates their bars from the categories they already use).
