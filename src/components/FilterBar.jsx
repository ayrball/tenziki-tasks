import { useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { Calendar, Check, ChevronDown, Flame, Layers, Rows3, Search, Trash2, X } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useBarsEnabled } from '../lib/barsPref';
import { acceptsDrop } from '../lib/tabDrop';
import { useBoard } from './DragBoard';

// One tab. While a task is being dragged, Today, Urgent, Done and Deleted light up as places to drop it.
function TabButton({ tab, active, focusable, onSelect, dragging }) {
  const Icon = tab.icon;
  const droppable = acceptsDrop(tab.id);
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${tab.id}`, data: { type: 'tab', tab: tab.id }, disabled: !droppable });

  return (
    <button
      ref={setNodeRef}
      id={`tab-${tab.id}`}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls="task-panel"
      tabIndex={focusable ? 0 : -1}
      onClick={onSelect}
      className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-[13px] font-semibold transition-[color,box-shadow,transform] sm:px-3 sm:text-sm ${
        active ? 'text-white' : 'text-muted hover:text-fg'
      } ${dragging && droppable && !isOver ? 'ring-2 ring-inset ring-accent/30' : ''} ${
        isOver ? 'z-10 scale-105 bg-accent-soft text-accent ring-2 ring-inset ring-accent' : ''
      } ${dragging && !droppable ? 'opacity-50' : ''}`}
    >
      {active && (
        <motion.span
          layoutId="active-tab"
          className={`absolute inset-0 rounded-xl bg-gradient-to-br from-fill to-fill-2 shadow-card ${isOver ? 'opacity-0' : ''}`}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
      <span className="relative z-10 flex items-center gap-1.5">
        <Icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
        {tab.label}
        {tab.count > 0 && (
          <span
            className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums leading-5 ${
              active && !isOver ? 'bg-white/25 text-white' : `bg-surface-2 text-muted ${active ? '' : 'hidden sm:inline'}`
            }`}
          >
            {tab.count}
          </span>
        )}
      </span>
    </button>
  );
}

export default function FilterBar() {
  const {
    filter,
    setFilter,
    lists,
    selectedList,
    setSelectedList,
    searchQuery,
    setSearchQuery,
    totalCount,
    completedCount,
    dueTodayCount,
    overdueCount,
    highCount,
    deletedCount,
  } = useTasks();
  const [barsOn, setBarsOn] = useBarsEnabled();
  const dragging = Boolean(useBoard()?.active);

  const tabs = [
    { id: 'today', label: 'Today', icon: Calendar, count: dueTodayCount + overdueCount },
    { id: 'all', label: 'All', icon: Layers, count: totalCount },
    { id: 'high', label: 'Urgent', icon: Flame, count: highCount },
    { id: 'completed', label: 'Done', icon: Check, count: completedCount },
    { id: 'deleted', label: 'Deleted', icon: Trash2, count: deletedCount },
  ];

  // Arrow keys / Home / End move between tabs (the standard keyboard pattern for tab lists).
  const onTabKeyDown = (e) => {
    const index = tabs.findIndex((t) => t.id === filter);
    const last = tabs.length - 1;
    const next = { ArrowRight: index >= last ? 0 : index + 1, ArrowLeft: index <= 0 ? last : index - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setFilter(tabs[next].id);
    e.currentTarget.querySelector(`#tab-${tabs[next].id}`)?.focus();
  };

  // When a hidden view (like "no date") is showing, keep the first tab reachable with the keyboard.
  const focusableId = tabs.some((t) => t.id === filter) ? filter : tabs[0].id;

  const toggleBars = () => {
    if (barsOn) setSelectedList('All'); // the "one bar" filter makes no sense without bars
    setBarsOn(!barsOn);
  };

  return (
    <>
      {/* The tabs stay in view while a task is being dragged, so they can always be reached on a long list. */}
      <div
        role="tablist"
        aria-label="Task filter"
        onKeyDown={onTabKeyDown}
        className={`no-scrollbar mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1 shadow-card ${
          dragging ? 'sticky top-3 z-30 shadow-pop' : ''
        }`}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={filter === tab.id}
            focusable={tab.id === focusableId}
            onSelect={() => setFilter(tab.id)}
            dragging={dragging}
          />
        ))}
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="h-full w-full appearance-none rounded-2xl border border-line bg-surface py-2.5 pl-10 pr-9 text-sm font-medium text-fg placeholder:text-faint transition-colors hover:border-line-strong focus-visible:border-accent/60 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {barsOn && lists.length > 0 && (
          <div className="relative shrink-0">
            <select
              value={lists.some((l) => l.id === selectedList) ? selectedList : 'All'}
              onChange={(e) => setSelectedList(e.target.value)}
              aria-label="Show only one bar"
              className="h-full max-w-[7.5rem] appearance-none truncate rounded-2xl border border-line bg-surface py-2.5 pl-3.5 pr-9 text-sm font-semibold text-fg transition-colors hover:border-line-strong focus-visible:border-accent/60 sm:max-w-[14rem]"
            >
              <option value="All">All bars</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          </div>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={barsOn}
          aria-label="Group tasks into bars"
          title={barsOn ? 'Bars are on. Click to show one plain list.' : 'Bars are off. Click to group tasks into bars.'}
          onClick={toggleBars}
          className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition-colors ${
            barsOn ? 'border-accent/60 bg-surface text-accent' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg'
          }`}
        >
          <Rows3 className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Bars</span>
          <span className="hidden text-xs font-bold sm:inline" aria-hidden>
            {barsOn ? 'On' : 'Off'}
          </span>
        </button>
      </div>
    </>
  );
}
