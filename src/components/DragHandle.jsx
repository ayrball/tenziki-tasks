import { GripVertical } from 'lucide-react';

// The grip button at the left of a task. Grab it with the mouse or a finger, or focus it and press Space.
export default function DragHandle({ label, activatorRef, attributes, listeners }) {
  return (
    <button
      type="button"
      ref={activatorRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className="mt-px flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}
