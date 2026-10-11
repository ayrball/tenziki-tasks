import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, ChevronDown, Flag, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { formatDisplayDate, isOverdue, isTaskDueToday } from '../lib/dateUtils';
import { CATEGORIES, PRIORITIES, categoryDot, openDatePicker, priorityMeta } from '../lib/taskMeta';

const chip = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4';

export default function TaskItem({ task }) {
  const { toggleTask, deleteTask, editTask } = useTasks();
  const [isEditing, setIsEditing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [noteDraft, setNoteDraft] = useState(task.description || '');
  const titleInputRef = useRef(null);
  const noteRef = useRef(null);
  const dateRef = useRef(null);

  const startEditing = () => {
    setTitleDraft(task.title);
    setIsEditing(true);
  };

  // Pull in note changes from elsewhere (another device, undo) unless the box is being typed in.
  useEffect(() => {
    if (document.activeElement !== noteRef.current) setNoteDraft(task.description || '');
  }, [task.description]);

  useEffect(() => {
    if (isEditing) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditing]);

  // Auto-grow the notes box
  useEffect(() => {
    const el = noteRef.current;
    if (!isOpen || !el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(64, el.scrollHeight)}px`;
  }, [isOpen, noteDraft]);

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== task.title) editTask(task.id, { title: next });
    else setTitleDraft(task.title);
    setIsEditing(false);
  };

  const saveNote = () => {
    const next = noteDraft.trim();
    if (next !== (task.description || '')) editTask(task.id, { description: next });
  };

  // Notes save ~1s after typing stops, and immediately if the tab is hidden or closed,
  // so text is never lost just because the box didn't lose focus first.
  const saveNoteRef = useRef(saveNote);
  useEffect(() => {
    saveNoteRef.current = saveNote;
  });
  useEffect(() => {
    if (noteDraft.trim() === (task.description || '')) return undefined;
    const timer = setTimeout(() => saveNoteRef.current(), 1000);
    return () => clearTimeout(timer);
  }, [noteDraft, task.description]);
  useEffect(() => {
    const flush = () => document.visibilityState !== 'visible' && saveNoteRef.current();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const priority = priorityMeta(task.priority);
  const overdue = !task.completed && isOverdue(task.due_date);
  const dueToday = !task.completed && isTaskDueToday(task.due_date);
  const dateLabel = formatDisplayDate(task.due_date);
  const toggleOpen = () => !isEditing && setIsOpen((v) => !v);

  const dateTone = overdue
    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
    : dueToday
      ? 'bg-accent-soft text-accent'
      : 'bg-surface-2 text-muted';

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
        className={`group rounded-2xl border bg-surface shadow-card transition-colors ${
          isOpen ? 'border-accent/40' : 'border-line hover:border-line-strong'
        }`}
      >
        <div className="flex items-start gap-3 p-3.5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.82 }}
            onClick={() => toggleTask(task.id)}
            role="checkbox"
            aria-checked={task.completed}
            aria-label={`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`}
            className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              task.completed
                ? 'border-transparent bg-gradient-to-br from-fill to-fill-2'
                : 'border-line-strong hover:border-accent'
            }`}
          >
            {task.completed && (
              <motion.svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="4" aria-hidden>
                <motion.path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                />
              </motion.svg>
            )}
          </motion.button>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                maxLength={200}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') {
                    setTitleDraft(task.title);
                    setIsEditing(false);
                  }
                }}
                aria-label="Task title"
                className="w-full rounded-lg border border-accent/60 bg-surface-2 px-2 py-1 text-[15px] font-medium text-fg"
              />
            ) : (
              <button
                type="button"
                onClick={toggleOpen}
                onDoubleClick={() => !task.completed && startEditing()}
                aria-expanded={isOpen}
                className="block w-full cursor-pointer text-left"
              >
                <span
                  className={`break-words text-[15px] font-medium leading-snug transition-colors ${
                    task.completed ? 'text-faint line-through decoration-faint/60' : 'text-fg'
                  }`}
                >
                  {task.title}
                </span>
              </button>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {dateLabel && (
                <span className={`${chip} ${dateTone}`}>
                  <Calendar className="h-3 w-3" aria-hidden />
                  {overdue ? `Overdue · ${dateLabel}` : dateLabel}
                </span>
              )}
              <span className={`${chip} bg-surface-2 text-muted`}>
                <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(task.category)}`} aria-hidden />
                {task.category}
              </span>
              {task.priority !== 'medium' && (
                <span className={`${chip} ${priority.chip}`}>
                  <Flag className="h-3 w-3" aria-hidden />
                  {priority.label}
                </span>
              )}
              {task.description && !isOpen && (
                <span className={`${chip} bg-surface-2 text-muted`} title="Has notes">
                  <StickyNote className="h-3 w-3" aria-hidden />
                  Note
                </span>
              )}
            </div>
          </div>

          <div className="-mr-1 flex shrink-0 items-center gap-0.5">
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              {!task.completed && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                  aria-label={`Rename "${task.title}"`}
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteTask(task.id)}
                className="rounded-lg p-1.5 text-faint transition-colors hover:bg-rose-500/10 hover:text-danger"
                aria-label={`Delete "${task.title}"`}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={toggleOpen}
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Hide details' : 'Show details'}
              className={`rounded-lg p-1.5 transition-colors ${
                isOpen ? 'bg-accent-soft text-accent' : 'text-faint hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-line px-3.5 pb-3.5 pt-3">
                <textarea
                  ref={noteRef}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={saveNote}
                  rows={2}
                  maxLength={4000}
                  placeholder="Add notes, links or details…"
                  aria-label="Task notes"
                  className="w-full resize-none overflow-hidden rounded-xl border border-line bg-surface-2 p-3 text-sm leading-relaxed text-fg placeholder:text-faint focus-visible:border-accent/60"
                />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <div className="flex items-center gap-1" role="group" aria-label="Priority">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => editTask(task.id, { priority: p.id })}
                        aria-pressed={task.priority === p.id}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                          task.priority === p.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${p.dot}`} aria-hidden />
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <span className="sr-only">Category</span>
                    <select
                      value={task.category}
                      onChange={(e) => editTask(task.id, { category: e.target.value })}
                      className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs font-semibold text-fg"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => openDatePicker(dateRef.current)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs font-semibold text-fg transition-colors hover:border-line-strong"
                    >
                      <Calendar className="h-3.5 w-3.5 text-muted" aria-hidden />
                      {dateLabel || 'Set date'}
                    </button>
                    <input
                      ref={dateRef}
                      type="date"
                      tabIndex={-1}
                      aria-hidden
                      value={task.due_date || ''}
                      onChange={(e) => e.target.value && editTask(task.id, { due_date: e.target.value })}
                      className="date-proxy"
                    />
                  </div>

                  {task.due_date && (
                    <button
                      type="button"
                      onClick={() => editTask(task.id, { due_date: null })}
                      className="text-xs font-semibold text-faint transition-colors hover:text-danger"
                    >
                      Remove date
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}
