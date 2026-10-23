import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import TaskItem from './TaskItem';

// A task row that can be dragged (by its grip handle) to reorder it or move it to another bar.
// The handle is a real button, so it also works with the keyboard: Space to pick up, arrow keys to move, Space to drop.
// `indicator` draws a line where a task from another bar would land.
export default function SortableTask({ task, listId, indicator = null }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', listId },
  });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag "${task.title}" to reorder or move to another bar`}
      className="mt-px flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );

  const line =
    indicator === 'before'
      ? "before:absolute before:-top-1 before:left-0 before:right-0 before:z-10 before:h-0.5 before:rounded-full before:bg-accent before:content-['']"
      : indicator === 'after'
        ? "after:absolute after:-bottom-1 after:left-0 after:right-0 after:z-10 after:h-0.5 after:rounded-full after:bg-accent after:content-['']"
        : '';

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`relative list-none ${line}`}
    >
      <TaskItem task={task} handle={handle} />
    </li>
  );
}
