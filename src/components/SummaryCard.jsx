import { motion } from 'framer-motion';
import { CheckCheck, Trash2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';

const RADIUS = 26;

function ProgressRing({ percent }) {
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r={RADIUS} fill="none" stroke="var(--line)" strokeWidth="6" />
        <motion.circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: percent / 100, opacity: percent === 0 ? 0 : 1 }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

export default function SummaryCard() {
  const {
    totalCount,
    completedCount,
    progressPercent,
    dueTodayCount,
    overdueCount,
    clearCompleted,
    markAllComplete,
  } = useTasks();

  const open = totalCount - completedCount;
  const headline =
    totalCount === 0 ? 'A clean slate' : open === 0 ? 'All done. Nice work!' : `${open} ${open === 1 ? 'task' : 'tasks'} to go`;

  return (
    <section
      aria-label="Progress summary"
      className="mt-6 flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 shadow-card sm:gap-5 sm:p-5"
    >
      <ProgressRing percent={progressPercent} />

      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold tracking-tight">{headline}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          {totalCount === 0 ? (
            <span>Add your first task below.</span>
          ) : (
            <>
              <span className="tabular-nums">
                {completedCount} of {totalCount} done
              </span>
              {dueTodayCount > 0 && <span className="tabular-nums">{dueTodayCount} due today</span>}
              {overdueCount > 0 && (
                <span className="font-semibold tabular-nums text-danger">{overdueCount} overdue</span>
              )}
            </>
          )}
        </p>
      </div>

      {totalCount > 0 && (
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:gap-1.5">
          {open > 0 && (
            <button
              type="button"
              onClick={markAllComplete}
              className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-accent-soft hover:text-accent"
              title="Mark every task as done"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Complete all</span>
              <span className="sm:hidden">All</span>
            </button>
          )}
          {completedCount > 0 && (
            <button
              type="button"
              onClick={clearCompleted}
              className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-rose-500/10 hover:text-danger"
              title="Move completed tasks to Deleted"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Clear done</span>
              <span className="sm:hidden">Clear</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
