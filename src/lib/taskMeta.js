// Shared labels and colours for task fields. Priority ids must match the validation in src/worker.js.

// Colours a bar can have. The ids come from src/lib/limits.js (BAR_COLOR_IDS), which the Worker validates against.
// Full class names are written out so Tailwind can see them.
export const BAR_COLORS = [
  { id: 'sky', dot: 'bg-sky-500' },
  { id: 'violet', dot: 'bg-violet-500' },
  { id: 'emerald', dot: 'bg-emerald-500' },
  { id: 'amber', dot: 'bg-amber-500' },
  { id: 'rose', dot: 'bg-rose-500' },
  { id: 'pink', dot: 'bg-pink-500' },
  { id: 'teal', dot: 'bg-teal-500' },
  { id: 'orange', dot: 'bg-orange-500' },
  { id: 'indigo', dot: 'bg-indigo-500' },
  { id: 'slate', dot: 'bg-slate-500' },
];

export const barDot = (colorId) => BAR_COLORS.find((c) => c.id === colorId)?.dot ?? 'bg-zinc-400';

export const PRIORITIES = [
  {
    id: 'low',
    label: 'Low',
    dot: 'bg-sky-500',
    chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  },
  {
    id: 'medium',
    label: 'Medium',
    dot: 'bg-amber-500',
    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  {
    id: 'high',
    label: 'High',
    dot: 'bg-rose-500',
    chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  },
];

export const priorityMeta = (id) => PRIORITIES.find((p) => p.id === id) ?? PRIORITIES[1];

export function openDatePicker(input) {
  if (!input) return;
  try {
    if (input.showPicker) input.showPicker();
    else input.focus();
  } catch {
    input.focus();
  }
}
