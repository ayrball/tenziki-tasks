// Shared labels and colours for task fields. These ids must match the validation lists in src/worker.js.

export const CATEGORIES = [
  { id: 'Personal', dot: 'bg-sky-500' },
  { id: 'Work', dot: 'bg-violet-500' },
  { id: 'Fitness', dot: 'bg-emerald-500' },
  { id: 'Ideas', dot: 'bg-amber-500' },
];

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

export const categoryDot = (id) => CATEGORIES.find((c) => c.id === id)?.dot ?? 'bg-zinc-400';
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
