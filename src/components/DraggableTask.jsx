import { useDraggable } from '@dnd-kit/core';
import DragHandle from './DragHandle';
import TaskItem from './TaskItem';

// A task in the plain list (bars off). It can be dragged onto a tab (Today, Urgent, Done, Deleted),
// but not reordered: ordering belongs to bars.
export default function DraggableTask({ task }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'task', listId: task.list_id },
  });

  const handle = (
    <DragHandle
      label={`Drag "${task.title}" onto a tab such as Today, Urgent, Done or Deleted`}
      activatorRef={setActivatorNodeRef}
      attributes={attributes}
      listeners={listeners}
    />
  );

  return (
    <li ref={setNodeRef} className="relative list-none">
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
