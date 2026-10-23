import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ArrowLeft, CalendarX2, CheckCircle2, ChevronRight, Inbox, PartyPopper, SearchX, Trash2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { TRASH_RETENTION_DAYS } from '../lib/limits';
import { groupByList } from '../lib/lists';
import AddBar from './AddBar';
import BarSection from './BarSection';
import DeletedItem from './DeletedItem';
import TaskItem from './TaskItem';
import TaskPreview from './TaskPreview';

const PAGE_SIZE = 60;

// Renders a long list in chunks as you scroll, so thousands of tasks don't mean thousands of DOM nodes.
// The count resets to one page whenever `resetKey` (filter, search, category) changes.
function useProgressive(total, resetKey) {
  const [state, setState] = useState({ key: resetKey, count: PAGE_SIZE });
  const count = state.key === resetKey ? state.count : PAGE_SIZE;
  const more = () =>
    setState((s) => {
      const base = s.key === resetKey ? s.count : PAGE_SIZE;
      return { key: resetKey, count: Math.min(total, base + PAGE_SIZE) };
    });
  return [Math.min(count, total), more];
}

// An invisible marker near the end of the list: when it scrolls into view, show the next page.
function LoadMore({ remaining, onMore }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && onMore(), { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  });

  return (
    <li ref={ref} className="list-none pb-2 pt-1 text-center">
      <button
        type="button"
        onClick={onMore}
        className="rounded-xl px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        Show {Math.min(PAGE_SIZE, remaining)} more ({remaining} left)
      </button>
    </li>
  );
}

function EmptyState({ icon: Icon, title, hint, tone = 'text-accent bg-accent-soft' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center"
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-4 text-base font-bold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>
    </motion.div>
  );
}

// Open tasks with no due date never appear in Today, so say so and offer a way to find them.
function NoDateHint({ count, onShow }) {
  return (
    <button
      type="button"
      onClick={onShow}
      className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-line-strong"
    >
      <span className="flex items-center gap-2.5 text-muted">
        <CalendarX2 className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold text-fg">{count}</span> {count === 1 ? 'task has' : 'tasks have'} no due date
        </span>
      </span>
      <span className="flex items-center gap-1 text-xs font-semibold text-accent">
        View <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}

function NoDateHeader({ onBack }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarX2 className="h-4 w-4 text-muted" aria-hidden />
        Tasks with no due date
      </p>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Today
      </button>
    </div>
  );
}

// Shown above the Deleted list: explains how it works and offers "Empty Deleted" (with its own confirmation).
function DeletedHeader({ count, onEmpty }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface-2 px-4 py-3">
      {confirming ? (
        <>
          <p className="text-sm font-semibold" role="alert">
            Permanently delete {count} {count === 1 ? 'task' : 'tasks'}? This can&apos;t be undone.
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onEmpty();
              }}
              autoFocus
              className="inline-flex items-center gap-1.5 rounded-xl bg-danger-fill px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete forever
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Restore a task to bring it back. Deleting from here is <span className="font-semibold text-fg">permanent</span>, and
            anything left here is removed after {TRASH_RETENTION_DAYS} days.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Empty Deleted ({count})
          </button>
        </>
      )}
    </div>
  );
}

const COLLAPSED_KEY = 'tenziki_collapsed_bars';

// Which bars are collapsed (remembered on this device).
function useCollapsedBars() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });

  const save = (next) => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // storage unavailable: it just won't be remembered
    }
    return next;
  };
  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return save(next);
    });
  const expand = (id) =>
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return save(next);
    });
  return [collapsed, toggle, expand];
}

// Prefer the task under the pointer; otherwise the bar it is over.
function collide(args) {
  const hits = pointerWithin(args);
  const found = hits.length > 0 ? hits : rectIntersection(args);
  const task = found.find((h) => h.data?.droppableContainer?.data?.current?.type === 'task');
  return task ? [task] : found.slice(0, 1);
}

// Where would the dragged task land?
//   over a bar (not a task): the end of that bar.
//   over a task in the same bar: the slot of that task (the same order the sortable list shows while dragging).
//   over a task in another bar: before or after it, depending on which half of it the dragged card is in.
function resolveDrop(active, over) {
  if (!over || over.id === active.id) return null;
  const data = over.data.current;
  if (data?.type === 'bar') return { listId: data.listId, target: { atEnd: true } };
  if (data?.type !== 'task') return null;

  const from = active.data.current?.sortable;
  const to = over.data.current?.sortable;
  let after;
  if (from && to && from.containerId === to.containerId) {
    after = to.index > from.index;
  } else {
    const rect = active.rect.current.translated;
    after = rect ? rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 : false;
  }
  return { listId: data.listId, target: after ? { afterId: over.id } : { beforeId: over.id } };
}

const sameDrop = (a, b) => a?.listId === b?.listId && JSON.stringify(a?.target) === JSON.stringify(b?.target);

export default function TaskList() {
  const {
    filteredTasks,
    filter,
    setFilter,
    searchQuery,
    selectedList,
    totalCount,
    deletedCount,
    noDateCount,
    emptyTrash,
    lists,
    listById,
    moveTask,
  } = useTasks();
  const inDeleted = filter === 'deleted';
  const [visibleCount, showMore] = useProgressive(filteredTasks.length, `${filter}|${selectedList}|${searchQuery}`);
  const shown = filteredTasks.slice(0, visibleCount);
  const remaining = filteredTasks.length - shown.length;

  const [collapsed, toggleCollapsed, expand] = useCollapsedBars();
  const [active, setActive] = useState(null); // the task being dragged: { id, listId, task }
  const [drop, setDrop] = useState(null); // where it would land: { listId, target }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const resetDrag = () => {
    setActive(null);
    setDrop(null);
  };

  // Screen-reader announcements use task and bar names instead of internal ids.
  const titleOf = (id) => `“${filteredTasks.find((t) => t.id === id)?.title ?? 'task'}”`;
  const placeOf = (over) =>
    over?.data.current?.type === 'bar'
      ? `in the ${listById.get(over.data.current.listId)?.name} bar`
      : `next to ${titleOf(over?.id)}`;
  const announcements = {
    onDragStart: ({ active: a }) => `Picked up ${titleOf(a.id)}. Use the arrow keys to move it, then Space to drop it.`,
    onDragOver: ({ active: a, over }) => (over && over.id !== a.id ? `${titleOf(a.id)} is ${placeOf(over)}.` : undefined),
    onDragEnd: ({ active: a, over }) => (over && over.id !== a.id ? `Dropped ${titleOf(a.id)} ${placeOf(over)}.` : `${titleOf(a.id)} was not moved.`),
    onDragCancel: ({ active: a }) => `Cancelled. ${titleOf(a.id)} did not move.`,
  };

  const hint =
    filter === 'today' && noDateCount > 0 && !searchQuery.trim() && selectedList === 'All' ? (
      <NoDateHint count={noDateCount} onShow={() => setFilter('nodate')} />
    ) : null;

  if (filteredTasks.length === 0 && !(filter === 'all' && lists.length > 0 && !searchQuery.trim())) {
    const filtering = searchQuery.trim() || selectedList !== 'All';
    let state;
    if (filtering) {
      state = { icon: SearchX, title: 'No matches', hint: 'Try a different search or bar.', tone: 'text-muted bg-surface-2' };
    } else if (inDeleted) {
      state = { icon: Trash2, title: 'Nothing deleted', hint: 'Tasks you delete show up here until you remove them for good.', tone: 'text-muted bg-surface-2' };
    } else if (filter === 'nodate') {
      state = { icon: CalendarX2, title: 'Every task has a date', hint: 'Nothing is waiting without a due date.', tone: 'text-success bg-success/10' };
    } else if (totalCount === 0) {
      state = { icon: Inbox, title: 'No tasks yet', hint: 'Type above and press Enter to add your first task.' };
    } else if (filter === 'today') {
      state = { icon: PartyPopper, title: "You're all caught up", hint: 'Nothing is due today. Enjoy it, or plan ahead in All.' };
    } else if (filter === 'completed') {
      state = { icon: CheckCircle2, title: 'Nothing finished yet', hint: 'Completed tasks show up here.', tone: 'text-success bg-success/10' };
    } else {
      state = { icon: CheckCircle2, title: 'Nothing urgent', hint: 'No open high-priority tasks.', tone: 'text-success bg-success/10' };
    }
    return (
      <>
        {filter === 'nodate' && <NoDateHeader onBack={() => setFilter('today')} />}
        <div className="mt-5">
          <EmptyState {...state} />
        </div>
        {hint}
        {!inDeleted && lists.length > 0 && <AddBar />}
      </>
    );
  }

  if (inDeleted) {
    return (
      <>
        <DeletedHeader count={deletedCount} onEmpty={emptyTrash} />
        <ul className="mt-3" aria-label="Deleted tasks">
          <AnimatePresence initial={false}>
            {shown.map((task) => (
              <DeletedItem key={task.id} task={task} />
            ))}
          </AnimatePresence>
          {remaining > 0 && <LoadMore remaining={remaining} onMore={showMore} />}
        </ul>
      </>
    );
  }

  // No bars yet (signed in, first load, nothing saved): show tasks plainly until the account's bars arrive.
  if (lists.length === 0) {
    return (
      <ul className="mt-5" aria-label="Tasks">
        {shown.map((task) => (
          <li key={task.id} className="list-none">
            <TaskItem task={task} />
          </li>
        ))}
      </ul>
    );
  }

  // Bars with tasks in this view are shown; in All, every bar is, even empty ones, so tasks can be dragged into them.
  const showEmptyBars = filter === 'all' && !searchQuery.trim();
  // Load a page of rows top to bottom through the bars, so what is on screen is always one unbroken run.
  const fullGroups = groupByList(filteredTasks, lists);
  const groups = fullGroups
    .map((g, i) => {
      const before = fullGroups.slice(0, i).reduce((sum, earlier) => sum + earlier.tasks.length, 0);
      return { list: g.list, tasks: g.tasks.slice(0, Math.max(0, visibleCount - before)), count: g.tasks.length };
    })
    .filter((g) => g.count > 0 || (showEmptyBars && (selectedList === 'All' || selectedList === g.list.id)));

  return (
    <>
      {filter === 'nodate' && <NoDateHeader onBack={() => setFilter('today')} />}
      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        accessibility={{ announcements }}
        onDragStart={({ active: a }) =>
          setActive({ id: a.id, listId: a.data.current?.listId, task: filteredTasks.find((t) => t.id === a.id) })
        }
        onDragOver={(e) => {
          const next = resolveDrop(e.active, e.over);
          setDrop((prev) => (sameDrop(prev, next) ? prev : next));
        }}
        onDragEnd={(e) => {
          const next = resolveDrop(e.active, e.over);
          resetDrag();
          if (next) {
            moveTask(e.active.id, next.listId, next.target);
            expand(next.listId); // so the task doesn't vanish into a collapsed bar
          }
        }}
        onDragCancel={resetDrag}
      >
        {groups.map((g) => (
          <BarSection
            key={g.list.id}
            bar={g.list}
            tasks={g.tasks}
            count={g.count}
            index={lists.findIndex((l) => l.id === g.list.id)}
            total={lists.length}
            collapsed={collapsed.has(g.list.id)}
            onToggle={() => toggleCollapsed(g.list.id)}
            hint={drop && drop.listId === g.list.id && active?.listId !== g.list.id ? drop.target : null}
            showEmptyHint={g.count === 0}
          />
        ))}
        {remaining > 0 && (
          <ul className="mt-3">
            <LoadMore remaining={remaining} onMore={showMore} />
          </ul>
        )}
        <DragOverlay>{active?.task ? <TaskPreview task={active.task} /> : null}</DragOverlay>
      </DndContext>
      <AddBar />
      {hint}
    </>
  );
}
