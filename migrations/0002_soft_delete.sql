-- Deleted section: tasks are moved to "Deleted" (deleted_at set) and only removed for good from there.
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted ON tasks (user_id, deleted_at);
