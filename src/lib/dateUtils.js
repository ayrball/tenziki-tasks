// Date helpers. Due dates are stored as local calendar dates: "YYYY-MM-DD" (or null).

const pad = (n) => String(n).padStart(2, '0');

export function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number);
  return toDateString(new Date(y, m - 1, d + days));
}

export function getTodayDateString() {
  return toDateString(new Date());
}

export function getTomorrowDateString() {
  return addDays(getTodayDateString(), 1);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isTaskDueToday(dueDate) {
  return dueDate === getTodayDateString();
}

export function isOverdue(dueDate) {
  return Boolean(dueDate && DATE_RE.test(dueDate) && dueDate < getTodayDateString());
}

export function formatDisplayDate(dueDate) {
  if (!dueDate || !DATE_RE.test(dueDate)) return null;
  const today = getTodayDateString();
  if (dueDate === today) return 'Today';
  if (dueDate === addDays(today, 1)) return 'Tomorrow';
  if (dueDate === addDays(today, -1)) return 'Yesterday';

  const [y, m, d] = dueDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

// "just now", "5 min ago", "3 h ago", "2 days ago", then a short date.
export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Older versions saved the words "Today"/"Tomorrow" instead of a date, which never rolled over.
// Resolve them against the day the task was created.
export function normalizeDueDate(dueDate, createdAt) {
  if (!dueDate) return null;
  if (DATE_RE.test(dueDate)) return dueDate;
  const created = createdAt && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt) : new Date();
  const base = toDateString(created);
  if (dueDate === 'Today') return base;
  if (dueDate === 'Tomorrow') return addDays(base, 1);
  const parsed = new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? null : toDateString(parsed);
}
