import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { LIST_NAME_MAX, MAX_LISTS_PER_USER } from '../lib/limits';
import { nextBarColor } from '../lib/lists';
import { BAR_COLORS } from '../lib/taskMeta';

// "+ New bar": type a name, pick a colour, press Enter.
export default function AddBar() {
  const { lists, addList } = useTasks();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const chosen = color ?? nextBarColor(lists);
  const full = lists.length >= MAX_LISTS_PER_USER;

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    addList(name, chosen);
    setName('');
    setColor(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={full}
        title={full ? `You can have up to ${MAX_LISTS_PER_USER} bars` : undefined}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-3 text-sm font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden />
        New bar
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      className="mt-5 rounded-2xl border border-accent/40 bg-surface p-3 shadow-card"
    >
      <label className="sr-only" htmlFor="new-bar-name">
        Bar name
      </label>
      <input
        id="new-bar-name"
        ref={inputRef}
        value={name}
        maxLength={LIST_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name your bar, e.g. Groceries"
        className="bare-input w-full bg-transparent px-1 py-1.5 text-[15px] font-medium text-fg placeholder:text-faint"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colour">
          {BAR_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setColor(c.id)}
              aria-pressed={chosen === c.id}
              aria-label={c.id}
              className={`h-6 w-6 rounded-full ${c.dot} ring-offset-2 ring-offset-surface transition-shadow ${
                chosen === c.id ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-line-strong'
              }`}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-xl bg-gradient-to-br from-fill to-fill-2 px-3.5 py-1.5 text-xs font-bold text-white transition-opacity disabled:opacity-40"
          >
            Add bar
          </button>
        </div>
      </div>
    </form>
  );
}
