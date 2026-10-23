// What happens when a task is dragged onto one of the tabs at the top.
//   Today   -> due today
//   Urgent  -> priority High
//   Done    -> completed
//   Deleted -> moved to Deleted (with Undo, like the delete button)
//   All     -> not a drop target
// Its bar and its place in the bar never change. Dropping a completed task on Today or Urgent also reopens it,
// otherwise it would disappear from the very tab it was just dropped on (those tabs only list open tasks).
// Pure, so it can be unit-tested; the store applies the result.

export const DROP_TABS = ['today', 'high', 'completed', 'deleted'];
export const acceptsDrop = (tabId) => DROP_TABS.includes(tabId);

// Returns:
//   { updates, label }     fields to change on the task, and a short message for the toast
//   { action: 'delete' }   move the task to Deleted
//   { unchanged }          already the way that tab means (a message to show)
//   null                   not a drop target
export function dropOnTab(tabId, task, today) {
  const reopen = task.completed ? { completed: false } : {};

  switch (tabId) {
    case 'today':
      if (task.due_date === today && !task.completed) return { unchanged: 'Already due today' };
      return { updates: { due_date: today, ...reopen }, label: task.completed ? 'Reopened, due today' : 'Due today' };
    case 'high':
      if (task.priority === 'high' && !task.completed) return { unchanged: 'Already urgent' };
      return { updates: { priority: 'high', ...reopen }, label: task.completed ? 'Reopened as urgent' : 'Marked urgent' };
    case 'completed':
      if (task.completed) return { unchanged: 'Already done' };
      return { updates: { completed: true }, label: 'Marked done' };
    case 'deleted':
      return { action: 'delete' };
    default:
      return null;
  }
}

// The values to put back to undo `updates`.
export const previousValues = (task, updates) => Object.fromEntries(Object.keys(updates).map((key) => [key, task[key]]));
