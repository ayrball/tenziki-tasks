import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CalendarX2, CheckCircle2, ChevronRight, Inbox, PartyPopper, SearchX, Trash2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useBarsEnabled } from '../lib/barsPref';
import { TRASH_RETENTION_DAYS } from '../lib/limits';
import { groupByList } from '../lib/lists';
import AddBar from './AddBar';
import BarSection from './BarSection';
import { useBoard } from './DragBoard';
import DeletedItem from './DeletedItem';
import DraggableTask from './DraggableTask';

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
  } = useTasks();
  const [barsOn] = useBarsEnabled();
  const { active, drop, collapsed, toggleCollapsed } = useBoard();
  const inDeleted = filter === 'deleted';
  // Bars on and at least one bar: tasks are grouped into their bars. Otherwise one plain list.
  const grouped = barsOn && lists.length > 0;
  const [visibleCount, showMore] = useProgressive(filteredTasks.length, `${filter}|${selectedList}|${searchQuery}|${grouped}`);
  const shown = filteredTasks.slice(0, visibleCount);
  const remaining = filteredTasks.length - shown.length;

  const hint =
    filter === 'today' && noDateCount > 0 && !searchQuery.trim() && (selectedList === 'All' || !grouped) ? (
      <NoDateHint count={noDateCount} onShow={() => setFilter('nodate')} />
    ) : null;

  if (filteredTasks.length === 0 && !(grouped && filter === 'all' && !searchQuery.trim())) {
    const filtering = searchQuery.trim() || (grouped && selectedList !== 'All');
    let state;
    if (filtering) {
      state = { icon: SearchX, title: 'No matches', hint: grouped ? 'Try a different search or bar.' : 'Try a different search.', tone: 'text-muted bg-surface-2' };
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
        {!inDeleted && grouped && <AddBar />}
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

  // Bars off (or no bars yet): one plain list. Rows can still be dragged onto a tab; ordering belongs to bars.
  if (!grouped) {
    return (
      <>
        {filter === 'nodate' && <NoDateHeader onBack={() => setFilter('today')} />}
        <ul className="mt-5" aria-label="Tasks">
          <AnimatePresence initial={false}>
            {shown.map((task) => (
              <DraggableTask key={task.id} task={task} />
            ))}
          </AnimatePresence>
          {remaining > 0 && <LoadMore remaining={remaining} onMore={showMore} />}
        </ul>
        {hint}
      </>
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
          hint={drop?.target && drop.listId === g.list.id && active?.listId !== g.list.id ? drop.target : null}
          showEmptyHint={g.count === 0}
        />
      ))}
      {remaining > 0 && (
        <ul className="mt-3">
          <LoadMore remaining={remaining} onMore={showMore} />
        </ul>
      )}
      <AddBar />
      {hint}
    </>
  );
}
