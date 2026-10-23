import { GripVertical } from 'lucide-react';

// What follows the pointer while a task is being dragged.
export default function TaskPreview({ task }) {
  return (
    <div className="flex cursor-grabbing items-center gap-2.5 rounded-2xl border border-accent/50 bg-surface py-3.5 pl-2 pr-4 shadow-pop">
      <GripVertical className="h-4 w-4 shrink-0 text-faint" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-fg">{task.title}</span>
    </div>
  );
}
