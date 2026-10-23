import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragHandle from './DragHandle';
import TaskItem from './TaskItem';

// A task row that can be dragged (by its grip handle) to reorder it, move it to another bar, or drop it on a tab.
// The handle is a real button, so it also works with the keyboard: Space to pick up, arrow keys to move, Space to drop.
// `indicator` draws a line where a task from another bar would land.
export default function SortableTask({ task, listId, indicator = null }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', listId },
  });

  const handle = (
    <DragHandle
      label={`Drag "${task.title}" to reorder, move to another bar or drop on a tab`}
      activatorRef={setActivatorNodeRef}
      attributes={attributes}
      listeners={listeners}
    />
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
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative list-none ${line}`}
    >
      {/* While it is being dragged, its old spot shows an empty dashed slot (the card itself floats with the pointer). */}
      <div className={isDragging ? 'opacity-0' : undefined}>
        <TaskItem task={task} handle={handle} />
      </div>
      {isDragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 bottom-2 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft"
        />
      )}
    </li>
  );
}
