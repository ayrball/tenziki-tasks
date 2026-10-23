import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { timeAgo } from '../lib/dateUtils';
import { barDot } from '../lib/taskMeta';

const CONFIRM_WINDOW_MS = 4000;

// A task in the Deleted section: restore it, or delete it for good (two clicks, no undo).
export default function DeletedItem({ task }) {
  const { restoreTask, deleteForever, listById } = useTasks();
  const bar = listById.get(task.list_id);
  const [confirming, setConfirming] = useState(false);

  // The confirm state expires so a stray click later can't permanently delete anything.
  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, paddingBottom: 0, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
      className="list-none pb-2"
    >
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-surface p-3.5 shadow-card transition-colors sm:flex-nowrap ${
          confirming ? 'border-danger/60' : 'border-line'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="break-words text-[15px] font-medium leading-snug text-muted line-through decoration-faint/50">
            {task.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className="whitespace-nowrap rounded-md bg-surface-2 px-1.5 py-0.5 leading-4 text-muted">
              Deleted {timeAgo(task.deleted_at)}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-surface-2 px-1.5 py-0.5 leading-4 text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${barDot(bar?.color)}`} aria-hidden />
              {bar?.name ?? 'No bar'}
            </span>
          </div>
        </div>

        <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
          <button
            type="button"
            onClick={() => restoreTask(task.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-fill hover:text-white"
            aria-label={`Restore "${task.title}"`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Restore
          </button>

          {confirming ? (
            <button
              type="button"
              onClick={() => deleteForever(task.id)}
              onBlur={() => setConfirming(false)}
              autoFocus
              className="inline-flex items-center gap-1.5 rounded-xl bg-danger-fill px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
              aria-label={`Confirm: permanently delete "${task.title}"`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Confirm
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-rose-500/10 hover:text-danger"
              aria-label={`Delete "${task.title}" forever`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete forever
            </button>
          )}
        </div>
      </div>
    </motion.li>
  );
}
