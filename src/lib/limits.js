// Limits shared by the Worker (enforces them) and the UI (explains them).

// Tasks in Deleted are removed for good this many days after they were deleted.
export const TRASH_RETENTION_DAYS = 30;

// Most task rows (active + Deleted) one account can hold.
export const MAX_TASKS_PER_USER = 3000;

// Longest a signed-in session lasts without signing in again.
export const SESSION_TTL_DAYS = 30;
