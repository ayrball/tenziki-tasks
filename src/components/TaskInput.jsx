import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Calendar, CalendarX2, Plus, StickyNote } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useBarsEnabled } from '../lib/barsPref';
import { formatDisplayDate, getTodayDateString, getTomorrowDateString } from '../lib/dateUtils';
import { PRIORITIES, barDot, openDatePicker } from '../lib/taskMeta';

const chipBase = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors';
const chipOff = 'text-muted hover:bg-surface-2 hover:text-fg';
const chipOn = 'bg-accent-soft text-accent';

function isTypingTarget(el) {
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export default function TaskInput() {
  const { addTask, lists } = useTasks();
  const [barsOn] = useBarsEnabled();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [priority, setPriority] = useState('medium');
  const [chosenList, setChosenList] = useState(null);
  // The bar picked here, or the first bar if none was picked (or the picked one has since been deleted).
  const listId = lists.some((l) => l.id === chosenList) ? chosenList : (lists[0]?.id ?? null);
  const [dueDate, setDueDate] = useState(getTodayDateString);
  const [isOpen, setIsOpen] = useState(false);

  const formRef = useRef(null);
  const titleRef = useRef(null);
  const dateRef = useRef(null);

  // Collapse when clicking away (focus events are unreliable for buttons in Safari).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (e) => {
      if (!formRef.current?.contains(e.target) && !title.trim() && !description.trim()) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, title, description]);

  // Press "n" anywhere to start a new task.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(document.activeElement)) return;
      e.preventDefault();
      titleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({ title, priority, list_id: listId, due_date: dueDate, description });
    setTitle('');
    setDescription('');
    setShowNote(false);
    setDueDate(getTodayDateString());
    titleRef.current?.focus();
  };

  const today = getTodayDateString();
  const tomorrow = getTomorrowDateString();
  const isCustomDate = Boolean(dueDate) && dueDate !== today && dueDate !== tomorrow;
  const canSubmit = Boolean(title.trim());

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
          document.activeElement?.blur();
        }
      }}
      className={`mt-4 rounded-3xl border bg-surface p-2 shadow-card transition-[border-color,box-shadow] duration-200 ${
        isOpen ? 'border-accent/60 ring-4 ring-accent/10' : 'border-line hover:border-line-strong'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden />
        </span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder="Add a task…"
          aria-label="New task title"
          className="bare-input min-w-0 flex-1 bg-transparent py-2 text-[15px] font-medium text-fg placeholder:text-faint"
        />
        {!isOpen && !title && (
          <kbd className="mr-2 hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] font-semibold text-faint sm:block">
            N
          </kbd>
        )}
        <motion.button
          type="submit"
          disabled={!canSubmit}
          whileTap={canSubmit ? { scale: 0.9 } : undefined}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition-all ${
            canSubmit
              ? 'bg-gradient-to-br from-fill to-fill-2 text-white shadow-card'
              : 'bg-surface-2 text-faint'
          }`}
          aria-label="Add task"
        >
          <ArrowUp className="h-4 w-4 stroke-[2.5]" />
        </motion.button>
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
            <div className="mx-1 mt-2 flex flex-col gap-2 border-t border-line pb-1 pt-3">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDueDate(today)}
                  className={`${chipBase} ${dueDate === today ? chipOn : chipOff}`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDueDate(tomorrow)}
                  className={`${chipBase} ${dueDate === tomorrow ? chipOn : chipOff}`}
                >
                  Tomorrow
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => openDatePicker(dateRef.current)}
                    className={`${chipBase} ${isCustomDate ? chipOn : chipOff}`}
                  >
                    <Calendar className="h-3.5 w-3.5" aria-hidden />
                    {isCustomDate ? formatDisplayDate(dueDate) : 'Pick date'}
                  </button>
                  <input
                    ref={dateRef}
                    type="date"
                    tabIndex={-1}
                    aria-hidden
                    value={isCustomDate ? dueDate : ''}
                    onChange={(e) => e.target.value && setDueDate(e.target.value)}
                    className="date-proxy"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDueDate(null)}
                  className={`${chipBase} ${dueDate === null ? chipOn : chipOff}`}
                >
                  <CalendarX2 className="h-3.5 w-3.5" aria-hidden />
                  No date
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                {barsOn && lists.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Add to bar">
                  {lists.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setChosenList(l.id)}
                      aria-pressed={listId === l.id}
                      className={`${chipBase} max-w-[10rem] ${listId === l.id ? chipOn : chipOff}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${barDot(l.color)}`} aria-hidden />
                      <span className="truncate">{l.name}</span>
                    </button>
                  ))}
                </div>
                ) : (
                  <span aria-hidden />
                )}

                <div className="flex items-center gap-1" role="group" aria-label="Priority">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      aria-pressed={priority === p.id}
                      className={`${chipBase} ${priority === p.id ? chipOn : chipOff}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${p.dot}`} aria-hidden />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowNote((v) => !v)}
                  aria-expanded={showNote}
                  className={`${chipBase} ${showNote || description.trim() ? chipOn : chipOff}`}
                >
                  <StickyNote className="h-3.5 w-3.5" aria-hidden />
                  {description.trim() ? 'Note added' : 'Add note'}
                </button>
              </div>

              <AnimatePresence initial={false}>
                {showNote && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Notes, links, anything you need to remember…"
                      aria-label="Task notes"
                      rows={3}
                      maxLength={4000}
                      className="w-full resize-none rounded-2xl border border-line bg-surface-2 p-3 text-sm leading-relaxed text-fg placeholder:text-faint focus-visible:border-accent/60"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
