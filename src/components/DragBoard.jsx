import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTasks } from '../context/TaskContext';
import TaskPreview from './TaskPreview';

// Owns dragging for the whole task area, so one drag can end on a bar, between tasks, or on a tab.
// It wraps the tab bar and the task list, and shares what is being dragged (and where it would land) with them.

const BoardContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useBoard = () => useContext(BoardContext);

const COLLAPSED_KEY = 'tenziki_collapsed_bars';
const TAB_NAMES = { today: 'Today', high: 'Urgent', completed: 'Done', deleted: 'Deleted' };

// Which bars are collapsed (remembered on this device).
function useCollapsedBars() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });

  const save = (next) => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // storage unavailable: it just won't be remembered
    }
    return next;
  };
  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return save(next);
    });
  const expand = (id) =>
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return save(next);
    });
  return [collapsed, toggle, expand];
}

// What is under the pointer? A tab beats everything (the tab bar floats over the list while dragging),
// then the task under it, then the bar it is over.
function collide(args) {
  // With a mouse or finger only what is actually under the pointer counts, so letting go over a non-target
  // (like the All tab) or empty space drops nothing instead of landing on whatever the card happens to overlap.
  // Keyboard dragging has no pointer, so it goes by overlap.
  const found = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
  const typeOf = (hit) => hit.data?.droppableContainer?.data?.current?.type;
  const tab = found.find((h) => typeOf(h) === 'tab');
  if (tab) return [tab];
  const task = found.find((h) => typeOf(h) === 'task');
  return task ? [task] : found.slice(0, 1);
}

// Where would the dragged task go?
//   over a tab: that tab's action (Today, Urgent, Done, Deleted).
//   over a bar (not a task): the end of that bar.
//   over a task in the same bar: the slot of that task (the same order the sortable list shows while dragging).
//   over a task in another bar: before or after it, depending on which half of it the POINTER is in
//   (not the floating card, whose size and offset are only cosmetic).
function resolveDrop(active, over, pointer) {
  if (!over || over.id === active.id) return null;
  const data = over.data.current;
  if (data?.type === 'tab') return { tab: data.tab };
  if (data?.type === 'bar') return { listId: data.listId, target: { atEnd: true } };
  if (data?.type !== 'task') return null;

  const from = active.data.current?.sortable;
  const to = over.data.current?.sortable;
  let after;
  if (from && to && from.containerId === to.containerId) {
    after = to.index > from.index;
  } else if (pointer) {
    after = pointer.y > over.rect.top + over.rect.height / 2;
  } else {
    // keyboard drag: no pointer, so go by the dragged card
    const rect = active.rect.current.translated;
    after = rect ? rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 : false;
  }
  return { listId: data.listId, target: after ? { afterId: over.id } : { beforeId: over.id } };
}

// Holds the floating card slightly below and to the right of the pointer, so what is under the pointer stays visible.
// (It only moves the picture; where a drop lands is decided from the pointer itself.)
const offsetFromPointer = ({ transform }) => ({ ...transform, x: transform.x + 14, y: transform.y + 34 });

const sameDrop = (a, b) => a?.listId === b?.listId && a?.tab === b?.tab && JSON.stringify(a?.target) === JSON.stringify(b?.target);

export default function DragBoard({ children }) {
  const { tasks, listById, moveTask, moveToTab } = useTasks();
  const [collapsed, toggleCollapsed, expand] = useCollapsedBars();
  const [active, setActive] = useState(null); // the task being dragged: { id, listId, task }
  const [drop, setDrop] = useState(null); // where it would land: { listId, target } or { tab }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const pointerRef = useRef(null); // where the pointer is, as the collision detection sees it
  const collisionDetection = useCallback((args) => {
    pointerRef.current = args.pointerCoordinates;
    return collide(args);
  }, []);
  const resetDrag = () => {
    setActive(null);
    setDrop(null);
  };

  // Screen-reader announcements use task, bar and tab names instead of internal ids.
  const titleOf = (id) => `“${tasks.find((t) => t.id === id)?.title ?? 'task'}”`;
  const placeOf = (over) => {
    const data = over?.data.current;
    if (data?.type === 'tab') return `onto the ${TAB_NAMES[data.tab]} tab`;
    if (data?.type === 'bar') return `in the ${listById.get(data.listId)?.name} bar`;
    return `next to ${titleOf(over?.id)}`;
  };
  const announcements = {
    onDragStart: ({ active: a }) => `Picked up ${titleOf(a.id)}. Use the arrow keys to move it, then Space to drop it.`,
    onDragOver: ({ active: a, over }) => (over && over.id !== a.id ? `${titleOf(a.id)} is ${placeOf(over)}.` : undefined),
    onDragEnd: ({ active: a, over }) =>
      over && over.id !== a.id ? `Dropped ${titleOf(a.id)} ${placeOf(over)}.` : `${titleOf(a.id)} was not moved.`,
    onDragCancel: ({ active: a }) => `Cancelled. ${titleOf(a.id)} did not move.`,
  };

  const value = useMemo(() => ({ active, drop, collapsed, toggleCollapsed }), [active, drop, collapsed, toggleCollapsed]);

  return (
    <BoardContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{ announcements }}
        // Hovering a tab near the top of the screen must not make the page scroll away from it.
        autoScroll={{ enabled: !drop?.tab }}
        onDragStart={({ active: a }) => setActive({ id: a.id, listId: a.data.current?.listId, task: tasks.find((t) => t.id === a.id) })}
        onDragOver={(e) => {
          const next = resolveDrop(e.active, e.over, pointerRef.current);
          setDrop((prev) => (sameDrop(prev, next) ? prev : next));
        }}
        onDragEnd={(e) => {
          const next = resolveDrop(e.active, e.over, pointerRef.current);
          resetDrag();
          if (!next) return;
          if (next.tab) {
            moveToTab(e.active.id, next.tab);
          } else {
            moveTask(e.active.id, next.listId, next.target);
            expand(next.listId); // so the task doesn't vanish into a collapsed bar
          }
        }}
        onDragCancel={resetDrag}
      >
        {children}
        {/* A compact card, so it never hides the tab or bar it is being dropped on. */}
        <DragOverlay modifiers={[offsetFromPointer]} style={{ width: 'auto', height: 'auto', maxWidth: '16rem' }}>{active?.task ? <TaskPreview task={active.task} /> : null}</DragOverlay>
      </DndContext>
    </BoardContext.Provider>
  );
}
