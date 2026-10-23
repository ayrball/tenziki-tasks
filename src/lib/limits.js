// Limits shared by the Worker (enforces them) and the UI (explains them).

// Tasks in Deleted are removed for good this many days after they were deleted.
export const TRASH_RETENTION_DAYS = 30;

// Most task rows (active + Deleted) one account can hold.
export const MAX_TASKS_PER_USER = 3000;

// Longest a signed-in session lasts without signing in again.
export const SESSION_TTL_DAYS = 30;

// "Bars" are the user's own named sections that tasks are grouped into (stored as `lists`).
export const MAX_LISTS_PER_USER = 30;
export const LIST_NAME_MAX = 40;

// Colours a bar can have. The UI maps each id to a class in src/lib/taskMeta.js.
export const BAR_COLOR_IDS = ['sky', 'violet', 'emerald', 'amber', 'rose', 'pink', 'teal', 'orange', 'indigo', 'slate'];

// The bars every account starts with (they replace the old fixed categories).
export const DEFAULT_BARS = [
  { name: 'Personal', color: 'sky' },
  { name: 'Work', color: 'violet' },
  { name: 'Fitness', color: 'emerald' },
  { name: 'Ideas', color: 'amber' },
];
