import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { BAR_COLORS } from '../lib/taskMeta';

const item =
  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40';

// The "..." menu on a bar: rename, colour, move up/down, delete. Deleting asks first and never deletes tasks.
export default function BarMenu({ bar, index, total, onRename }) {
  const { lists, tasks, updateList, moveList, removeList } = useTasks();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => !rootRef.current?.contains(e.target) && close();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  const taskCount = tasks.filter((t) => t.list_id === bar.id && !t.deleted_at).length;
  const destination = lists.find((l) => l.id !== bar.id);
  const canDelete = total > 1;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={`Options for ${bar.name}`}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          open ? 'bg-surface-2 text-fg' : 'text-faint hover:bg-surface-2 hover:text-fg'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="group"
          aria-label={`${bar.name} options`}
          className="absolute right-0 z-30 mt-1 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
        >
          {confirming ? (
            <div className="p-2">
              <p className="text-sm font-semibold" role="alert">
                Delete “{bar.name}”?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {taskCount === 0
                  ? 'It has no tasks.'
                  : taskCount === 1
                    ? `Its 1 task won’t be deleted. It moves to “${destination?.name}”.`
                    : `Its ${taskCount} tasks won’t be deleted. They move to “${destination?.name}”.`}
              </p>
              <div className="mt-3 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-xl border border-line py-1.5 text-xs font-semibold transition-colors hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    removeList(bar.id);
                  }}
                  autoFocus
                  className="flex-1 rounded-xl bg-danger-fill py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
                >
                  Delete bar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={item}
                onClick={() => {
                  close();
                  onRename();
                }}
              >
                <Pencil className="h-4 w-4 text-muted" aria-hidden />
                Rename
              </button>

              <div className="px-2.5 py-2">
                <p className="mb-2 text-xs font-semibold text-muted">Colour</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colour">
                  {BAR_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => updateList(bar.id, { color: c.id })}
                      aria-pressed={bar.color === c.id}
                      aria-label={c.id}
                      className={`h-6 w-6 rounded-full ${c.dot} ring-offset-2 ring-offset-surface transition-shadow ${
                        bar.color === c.id ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-line-strong'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <button type="button" className={item} disabled={index === 0} onClick={() => moveList(bar.id, -1)}>
                <ArrowUp className="h-4 w-4 text-muted" aria-hidden />
                Move up
              </button>
              <button type="button" className={item} disabled={index === total - 1} onClick={() => moveList(bar.id, 1)}>
                <ArrowDown className="h-4 w-4 text-muted" aria-hidden />
                Move down
              </button>

              <button
                type="button"
                className={`${item} text-danger`}
                disabled={!canDelete}
                onClick={() => setConfirming(true)}
                title={canDelete ? undefined : 'Keep at least one bar'}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete bar…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
