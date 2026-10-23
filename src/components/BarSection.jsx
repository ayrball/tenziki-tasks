import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { LIST_NAME_MAX } from '../lib/limits';
import { barDot } from '../lib/taskMeta';
import BarMenu from './BarMenu';
import SortableTask from './SortableTask';

// One bar: a named, coloured section holding its tasks. It is a drop target for dragged tasks, and the
// header lets you collapse it, rename it (here or from its menu), or open its menu.
//   hint: where a task dragged in from another bar would land: { beforeId } | { afterId } | { atEnd } | null
export default function BarSection({ bar, tasks, count, index, total, collapsed, onToggle, hint, showEmptyHint }) {
  const { updateList } = useTasks();
  const { setNodeRef } = useDroppable({ id: `bar:${bar.id}`, data: { type: 'bar', listId: bar.id } });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bar.name);
  const inputRef = useRef(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const startRename = () => {
    setDraft(bar.name);
    setRenaming(true);
  };
  const saveRename = () => {
    const next = draft.trim();
    if (next && next !== bar.name) updateList(bar.id, { name: next });
    setRenaming(false);
  };

  const lastId = tasks[tasks.length - 1]?.id;
  const indicatorFor = (taskId) => {
    if (!hint) return null;
    if (hint.beforeId === taskId) return 'before';
    if (hint.afterId === taskId || (hint.atEnd && taskId === lastId)) return 'after';
    return null;
  };

  return (
    <section
      ref={setNodeRef}
      aria-label={bar.name}
      className={`mt-5 rounded-3xl p-1 transition-colors ${hint ? 'bg-accent-soft ring-2 ring-accent/40' : ''}`}
    >
      <div className="flex items-center gap-1">
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${barDot(bar.color)}`} aria-hidden />
            <input
              ref={inputRef}
              value={draft}
              maxLength={LIST_NAME_MAX}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              aria-label="Bar name"
              className="min-w-0 flex-1 rounded-lg border border-accent/60 bg-surface-2 px-2 py-1 text-sm font-bold text-fg"
            />
          </div>
        ) : (
          <h3 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
            >
              <ChevronDown className={`h-4 w-4 shrink-0 text-faint transition-transform ${collapsed ? '-rotate-90' : ''}`} aria-hidden />
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${barDot(bar.color)}`} aria-hidden />
              <span className="min-w-0 truncate text-sm font-bold">{bar.name}</span>
              <span className="rounded-full bg-surface-2 px-2 text-xs font-bold leading-5 tabular-nums text-muted">{count}</span>
            </button>
          </h3>
        )}
        <BarMenu bar={bar} index={index} total={total} onRename={startRename} />
      </div>

      {!collapsed && (
        <SortableContext id={bar.id} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="mt-2 min-h-[2.5rem]" aria-label={`${bar.name} tasks`}>
            <AnimatePresence initial={false}>
              {tasks.map((task) => (
                <SortableTask key={task.id} task={task} listId={bar.id} indicator={indicatorFor(task.id)} />
              ))}
            </AnimatePresence>
            {tasks.length === 0 && count > 0 && (
              <li className="list-none rounded-2xl border border-dashed border-line px-4 py-3 text-center text-xs text-muted">
                {count} more {count === 1 ? 'task' : 'tasks'} load as you scroll down
              </li>
            )}
            {tasks.length === 0 && showEmptyHint && (
              <li className="list-none rounded-2xl border border-dashed border-line-strong px-4 py-4 text-center text-xs text-muted">
                {hint ? 'Drop here' : 'Nothing here yet. Drag a task in, or add one above.'}
              </li>
            )}
          </ul>
        </SortableContext>
      )}
    </section>
  );
}
