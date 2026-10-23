// Pure logic for bars (the user's named sections) and for ordering tasks inside them.
// No browser globals, so it is unit-tested in Node.

import { BAR_COLOR_IDS, DEFAULT_BARS, LIST_NAME_MAX, MAX_LISTS_PER_USER } from './limits.js';

const GAP = 1024; // spacing used when a task is put at the very top/bottom of a bar
const MIN_GAP = 1e-6; // below this, two positions are too close to split again

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'bar';

// Where a task sits inside its bar (smaller = nearer the top). Older tasks without one keep newest-first.
export function taskPosition(task) {
  return typeof task.position === 'number' && Number.isFinite(task.position) ? task.position : -(Date.parse(task.created_at) || 0) / 1000;
}

// Open tasks first, then by position, then newest first.
export function compareTasks(a, b) {
  return (
    Number(a.completed) - Number(b.completed) ||
    taskPosition(a) - taskPosition(b) ||
    (b.created_at || '').localeCompare(a.created_at || '')
  );
}

// `positions` are the other tasks' positions in the target bar, smallest first.
// Returns a position that puts the moved task at `index` among them.
export function positionForIndex(positions, index, now = Date.now()) {
  if (positions.length === 0) return -now / 1000;
  if (index <= 0) return positions[0] - GAP;
  if (index >= positions.length) return positions[positions.length - 1] + GAP;
  return (positions[index - 1] + positions[index]) / 2;
}

// True when `value` landed so close to a neighbour that a few more moves there would run out of room.
export function isCrowded(positions, index, value) {
  const prev = positions[index - 1];
  const next = positions[index];
  return (prev !== undefined && value - prev < MIN_GAP) || (next !== undefined && next - value < MIN_GAP);
}

// Evenly spaced positions for tasks that are already in the right order.
export const spreadPositions = (orderedIds) => orderedIds.map((id, i) => ({ id, position: (i + 1) * GAP }));

// Works out where a dragged task goes in a bar, from the full (unfiltered) order of that bar.
//   target: { beforeId } | { afterId } | { atEnd: true } | {} (top)
// A task never jumps across the open/completed split (completed tasks always sit below open ones),
// so only tasks in the same state count as neighbours.
export function planMove(allTasks, movingId, listId, target = {}, now = Date.now()) {
  const moving = allTasks.find((t) => t.id === movingId);
  if (!moving) return null;

  const siblings = allTasks
    .filter((t) => !t.deleted_at && t.list_id === listId && t.id !== movingId && t.completed === moving.completed)
    .sort(compareTasks);

  let index = 0;
  const anchor = allTasks.find((t) => t.id === (target.beforeId ?? target.afterId));
  if (anchor && anchor.completed !== moving.completed) {
    // Dropped next to a task in the other group: an open task goes to the end of the open ones,
    // a completed task to the start of the completed ones.
    index = moving.completed ? 0 : siblings.length;
  } else if (target.beforeId) {
    index = Math.max(0, siblings.findIndex((t) => t.id === target.beforeId));
  } else if (target.afterId) {
    const at = siblings.findIndex((t) => t.id === target.afterId);
    index = at === -1 ? siblings.length : at + 1;
  } else if (target.atEnd) {
    index = siblings.length;
  }

  const positions = siblings.map(taskPosition);
  const position = positionForIndex(positions, index, now);

  if (isCrowded(positions, index, position)) {
    // Out of room: renumber the whole group so it can keep being split.
    const ordered = siblings.map((t) => t.id);
    ordered.splice(index, 0, movingId);
    return { list_id: listId, position, rebalance: spreadPositions(ordered) };
  }
  return { list_id: listId, position, rebalance: null };
}

// Tasks grouped by bar, in the bars' order. A task whose bar is missing lands in the first bar.
export function groupByList(tasks, lists) {
  const groups = new Map(lists.map((list) => [list.id, { list, tasks: [] }]));
  const fallback = lists[0] ? groups.get(lists[0].id) : null;
  for (const task of tasks) (groups.get(task.list_id) ?? fallback)?.tasks.push(task);
  return lists.map((list) => groups.get(list.id));
}

// Bars for data that doesn't have any yet (signed-out use, or a cache from before bars existed):
// the standard four plus any extra category already in use, with every task filed into the matching bar.
export function seedLists(tasks, now = new Date().toISOString()) {
  const names = DEFAULT_BARS.map((b) => b.name);
  for (const t of tasks) {
    const extra = String(t.category || '').trim().slice(0, LIST_NAME_MAX);
    if (extra && !names.some((n) => n.toLowerCase() === extra.toLowerCase())) names.push(extra);
  }
  const lists = names.slice(0, MAX_LISTS_PER_USER).map((name, i) => ({
    id: `local-${slug(name)}`,
    name,
    color: DEFAULT_BARS.find((b) => b.name === name)?.color ?? BAR_COLOR_IDS[i % BAR_COLOR_IDS.length],
    position: i,
    created_at: now,
  }));
  const byName = new Map(lists.map((l) => [l.name.toLowerCase(), l.id]));
  const filed = tasks.map((t) =>
    t.list_id && lists.some((l) => l.id === t.list_id)
      ? t
      : { ...t, list_id: byName.get(String(t.category || '').trim().toLowerCase()) ?? lists[0].id }
  );
  return { lists, tasks: filed };
}

// When someone signs in, their signed-out bars are matched to their account's bars by name.
// Bars the account doesn't have are created (up to the limit); tasks in any other bar go to the first one.
export function planGuestImport(guestLists, accountLists) {
  const byName = new Map(accountLists.map((l) => [l.name.toLowerCase(), l.id]));
  const idMap = new Map();
  const toCreate = [];
  let room = MAX_LISTS_PER_USER - accountLists.length;
  const fallback = accountLists[0]?.id ?? null;

  for (const g of guestLists) {
    const hit = byName.get(g.name.toLowerCase());
    if (hit) idMap.set(g.id, hit);
    else if (room > 0) {
      room -= 1;
      toCreate.push(g);
      idMap.set(g.id, g.id);
      byName.set(g.name.toLowerCase(), g.id);
    } else idMap.set(g.id, fallback);
  }
  return { idMap, toCreate };
}

// The first colour not already used by a bar (so each new bar looks different).
export function nextBarColor(lists) {
  const used = new Set(lists.map((l) => l.color));
  return BAR_COLOR_IDS.find((c) => !used.has(c)) ?? BAR_COLOR_IDS[lists.length % BAR_COLOR_IDS.length];
}
