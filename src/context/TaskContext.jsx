import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { sounds } from '../lib/audio';
import { api } from '../lib/apiClient';
import { addDays, getTodayDateString, normalizeDueDate } from '../lib/dateUtils';
import { LIST_NAME_MAX, MAX_LISTS_PER_USER } from '../lib/limits';
import { compareTasks, nextBarColor, planGuestImport, planMove, seedLists } from '../lib/lists';
import { dropOnTab, previousValues } from '../lib/tabDrop';
import { drainQueue, loadQueue, retryDelayMs, runOp, saveQueue } from '../lib/syncQueue';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const TaskContext = createContext(null);

const GUEST_KEY = 'tenziki_tasks_guest';
const GUEST_LISTS_KEY = 'tenziki_lists_guest';
const LEGACY_KEY = 'tenziki_tasks_data'; // single shared cache used before per-account storage
const userKey = (uid) => `tenziki_tasks_${uid}`;
const listsKey = (uid) => `tenziki_lists_${uid}`;

const POLL_MS = 60000; // how often an open, visible tab checks for changes made on other devices
const MIN_FOCUS_SYNC_MS = 10000;

const isDemo = (id) => String(id).startsWith('demo-');
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const byNewest = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');

function welcomeTasks() {
  const now = new Date().toISOString();
  const today = getTodayDateString();
  return [
    {
      id: 'demo-1',
      title: 'Click a task to add notes, or double-click to rename it',
      description: 'Notes, priority, category and due date all live in the expanded view.',
      completed: false,
      priority: 'high',
      category: 'Work',
      due_date: today,
      created_at: now,
    },
    {
      id: 'demo-2',
      title: 'Plan the week ahead',
      description: '',
      completed: false,
      priority: 'medium',
      category: 'Personal',
      due_date: addDays(today, 1),
      created_at: now,
    },
    {
      id: 'demo-3',
      title: 'Sign in with Google to sync across your devices',
      description: '',
      completed: false,
      priority: 'low',
      category: 'Ideas',
      due_date: null,
      created_at: now,
    },
  ];
}

function readStored(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw === null ? null : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeTask(task) {
  return {
    ...task,
    description: task.description || '',
    priority: task.priority || 'medium',
    category: task.category || 'Personal',
    completed: Boolean(task.completed),
    due_date: normalizeDueDate(task.due_date, task.created_at),
    deleted_at: task.deleted_at || null,
  };
}

function loadInitial(uid) {
  let tasks;
  if (uid) {
    tasks = (readStored(userKey(uid)) ?? []).map(normalizeTask);
  } else {
    const stored = readStored(GUEST_KEY) ?? readStored(LEGACY_KEY);
    tasks = stored ? stored.map(normalizeTask) : welcomeTasks();
  }

  const lists = readStored(uid ? listsKey(uid) : GUEST_LISTS_KEY);
  if (!lists || lists.length === 0) {
    // First run with bars, or a saved copy from before they existed: make the standard bars and file tasks into them.
    // (A signed-in account with nothing saved yet just waits for the server's bars.)
    if (!uid || tasks.length > 0) return seedLists(tasks);
    return { tasks, lists: [] };
  }

  // Tasks pointing at a bar that no longer exists go to the first bar.
  const ids = new Set(lists.map((l) => l.id));
  return { tasks: tasks.map((t) => (ids.has(t.list_id) ? t : { ...t, list_id: lists[0].id })), lists };
}

// What was made while signed out: tasks plus the bars they're in (built from old categories if there are none yet).
function loadGuestSnapshot() {
  const tasks = (readStored(GUEST_KEY) ?? readStored(LEGACY_KEY) ?? []).map(normalizeTask);
  const lists = readStored(GUEST_LISTS_KEY);
  return lists && lists.length > 0 ? { tasks, lists } : seedLists(tasks);
}

// TaskProvider is keyed by account in App.jsx, so it remounts (and reloads its own list) on sign in/out.
export function TaskProvider({ children }) {
  const { user, token, signOut } = useAuth();
  const { notify } = useToast();
  const uid = user?.uid ?? null;

  const [initial] = useState(() => loadInitial(uid));
  const [tasks, setTasks] = useState(initial.tasks);
  const [lists, setLists] = useState(initial.lists);
  const [filter, setFilter] = useState('today');
  const [selectedList, setSelectedList] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  // 'local' (not signed in) | 'syncing' | 'synced' | 'offline'
  const [syncState, setSyncState] = useState(token ? 'syncing' : 'local');
  const [pendingCount, setPendingCount] = useState(() => (uid ? loadQueue(uid).length : 0));

  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  const listsRef = useRef(lists);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  // Changes waiting to reach the server (persisted, so they survive going offline or reloading).
  const queueRef = useRef(uid ? loadQueue(uid) : []);
  const flushingRef = useRef(false);
  const mutationRef = useRef(0); // bumped on every local change, so a slow fetch can tell it was overtaken
  const retryRef = useRef({ timer: null, attempt: 0 });
  const lastSyncRef = useRef(0);
  const flushRef = useRef(async () => {});
  const refreshRef = useRef(async () => {});

  const setQueue = useCallback(
    (queue) => {
      queueRef.current = queue;
      if (uid) saveQueue(uid, queue);
      setPendingCount(queue.length);
    },
    [uid]
  );

  // Keep a local copy per account for instant loads and offline viewing.
  useEffect(() => {
    try {
      localStorage.setItem(uid ? userKey(uid) : GUEST_KEY, JSON.stringify(tasks));
      if (!uid) localStorage.removeItem(LEGACY_KEY);
    } catch {
      // storage full/unavailable
    }
  }, [tasks, uid]);
  useEffect(() => {
    try {
      localStorage.setItem(uid ? listsKey(uid) : GUEST_LISTS_KEY, JSON.stringify(lists));
    } catch {
      // storage full/unavailable
    }
  }, [lists, uid]);

  const handleUnauthorized = useCallback(() => {
    notify('You were signed out. Sign in again to keep syncing.', { tone: 'error' });
    signOut({ revoke: false }); // the server already ended this session
  }, [notify, signOut]);

  // Replaces the list with the server's copy. Skipped while local changes are waiting to be sent,
  // or if the user changed something while the request was in flight (the server's answer would be stale).
  const refresh = useCallback(async () => {
    if (!token || flushingRef.current || queueRef.current.length > 0) return;
    const startedAt = mutationRef.current;
    try {
      const [remoteLists, remote] = await Promise.all([api.listBars(token), api.listTasks(token)]);
      if (mutationRef.current !== startedAt || queueRef.current.length > 0) return;
      setLists(remoteLists);
      setTasks(remote.map(normalizeTask));
      setSyncState('synced');
      lastSyncRef.current = Date.now();
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else setSyncState('offline');
    }
  }, [token, handleUnauthorized]);

  const scheduleRetry = useCallback(() => {
    clearTimeout(retryRef.current.timer);
    const delay = retryDelayMs(retryRef.current.attempt);
    retryRef.current.attempt += 1;
    retryRef.current.timer = setTimeout(() => flushRef.current(), delay);
  }, []);

  // Sends waiting changes to the server, in order.
  const flush = useCallback(async () => {
    if (!token || flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;
    clearTimeout(retryRef.current.timer);

    let result;
    try {
      result = await drainQueue({
        peek: () => queueRef.current[0],
        run: (op) => runOp(token, op),
        remove: (id) => setQueue(queueRef.current.filter((op) => op.id !== id)),
      });
    } finally {
      flushingRef.current = false;
    }

    if (result.status === 'unauthorized') {
      handleUnauthorized();
      return;
    }
    if (result.status === 'offline') {
      setSyncState('offline');
      scheduleRetry();
      return;
    }

    retryRef.current.attempt = 0;
    setSyncState('synced');
    lastSyncRef.current = Date.now();

    if (result.dropped.length > 0) {
      // The server refused something (task gone, limit reached...). Tell the user and show the server's truth.
      const refused = result.dropped.find((d) => d.status !== 404);
      if (refused) notify(refused.message || "Some changes couldn't be saved", { tone: 'error' });
      refresh();
    }
  }, [token, setQueue, handleUnauthorized, scheduleRetry, notify, refresh]);

  useEffect(() => {
    flushRef.current = flush;
    refreshRef.current = refresh;
  }, [flush, refresh]);

  // Records a change that was already applied on screen and sends it (now, or when back online).
  const enqueue = useCallback(
    (op) => {
      if (!token) return; // signed out: tasks only live on this device
      mutationRef.current += 1;
      setQueue([...queueRef.current, { id: newId(), ...op }]);
      flush();
    },
    [token, setQueue, flush]
  );

  // On sign-in: send anything made offline, load the account's tasks, and bring over tasks made while signed out.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    (async () => {
      try {
        if (queueRef.current.length > 0) {
          await flushRef.current();
          if (cancelled) return;
          if (queueRef.current.length > 0) {
            setSyncState('offline'); // still can't reach the server: keep showing the local copy
            return;
          }
        }

        const startedAt = mutationRef.current;
        const [remoteLists, remoteRaw] = await Promise.all([api.listBars(token), api.listTasks(token)]);
        if (cancelled) return;
        const remote = remoteRaw.map(normalizeTask);

        // Repair old "Today"/"Tomorrow" strings on the server.
        remoteRaw.forEach((raw, i) => {
          if (raw.due_date !== remote[i].due_date) {
            api.updateTask(token, raw.id, { due_date: remote[i].due_date }).catch(() => {});
          }
        });

        // Tasks made while signed out come along; their bars are matched to the account's bars by name,
        // and any bar the account doesn't have yet is created.
        const snapshot = loadGuestSnapshot();
        const known = new Set(remote.map((t) => t.id));
        const guest = snapshot.tasks.filter((t) => !isDemo(t.id) && !known.has(t.id));
        const accountLists = [...remoteLists];
        let idMap = new Map();
        if (guest.length > 0) {
          const plan = planGuestImport(snapshot.lists, remoteLists);
          idMap = plan.idMap;
          for (const bar of plan.toCreate) {
            try {
              await api.createBar(token, { id: bar.id, name: bar.name, color: bar.color });
              accountLists.push(bar);
            } catch (err) {
              if (err.status === 401) throw err;
              idMap.set(bar.id, remoteLists[0]?.id);
            }
          }
        }

        const imported = [];
        let importFailed = false;
        for (const original of guest) {
          if (cancelled) return;
          const task = { ...original, list_id: idMap.get(original.list_id) ?? accountLists[0]?.id };
          try {
            await api.createTask(token, task);
            imported.push(task);
          } catch (err) {
            if (err.status === 401) throw err;
            importFailed = true;
          }
        }
        if (cancelled) return;

        if (mutationRef.current === startedAt) {
          setLists(accountLists);
          setTasks([...imported, ...remote].sort(byNewest));
        } else {
          // The user changed something while this loaded; show the server's list once their change is sent.
          setTimeout(() => refreshRef.current(), 1500);
        }
        setSyncState('synced');
        lastSyncRef.current = Date.now();
        if (!importFailed) {
          localStorage.setItem(GUEST_KEY, '[]');
          localStorage.setItem(GUEST_LISTS_KEY, '[]');
          localStorage.removeItem(LEGACY_KEY);
        }
        if (imported.length > 0) {
          notify(`Added ${imported.length} task${imported.length === 1 ? '' : 's'} from this device to your account`);
        }
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401) handleUnauthorized();
        else setSyncState('offline');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, notify, handleUnauthorized]);

  // Keep devices in step: re-check when the tab comes back into view, when the connection returns,
  // and every minute while the tab is open.
  useEffect(() => {
    if (!token) return undefined;
    const sync = async () => {
      await flushRef.current();
      await refreshRef.current();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSyncRef.current > MIN_FOCUS_SYNC_MS) sync();
    };
    const onOnline = () => {
      retryRef.current.attempt = 0;
      sync();
    };
    const timer = setInterval(() => document.visibilityState === 'visible' && sync(), POLL_MS);
    const retry = retryRef.current;

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      clearTimeout(retry.timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [token]);

  const triggerCelebration = useCallback(() => {
    sounds.playSuccess();
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 50, 30]);
    // Loaded only when it's needed (finishing everything), to keep the first load smaller.
    import('canvas-confetti')
      .then(({ default: confetti }) =>
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.7 },
          colors: ['#6d5efc', '#a78bfa', '#f472b6', '#34d399'],
          disableForReducedMotion: true,
        })
      )
      .catch(() => {
        // offline and not cached yet: skip the confetti
      });
  }, []);

  const restoreTasks = useCallback(
    (ids) => {
      setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, deleted_at: null } : t)));
      ids.forEach((id) => enqueue({ type: 'restore', id }));
    },
    [enqueue]
  );

  const addTask = useCallback(
    ({ title, priority = 'medium', list_id = null, due_date = null, description = '' }) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      sounds.playPop();

      // Into the chosen bar, or the first one. (With no bars yet the server picks the account's first.)
      const bars = listsRef.current;
      const task = {
        id: newId(),
        title: cleanTitle,
        description: description.trim(),
        completed: false,
        priority,
        list_id: bars.some((l) => l.id === list_id) ? list_id : bars[0]?.id ?? null,
        position: -Date.now() / 1000, // nearest the top of its bar
        due_date,
        created_at: new Date().toISOString(),
      };
      setTasks((prev) => [task, ...prev]);
      enqueue({ type: 'create', task });
    },
    [enqueue]
  );

  // Moves a task into a bar (or within its bar). `target` says where: { beforeId } | { afterId } | { atEnd } | {} (top).
  const moveTask = useCallback(
    (id, listId, target = {}) => {
      const plan = planMove(tasksRef.current, id, listId, target);
      if (!plan) return;
      const renumbered = new Map((plan.rebalance ?? []).map((m) => [m.id, m.position]));
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === id) return { ...t, list_id: listId, position: renumbered.get(id) ?? plan.position };
          return renumbered.has(t.id) ? { ...t, position: renumbered.get(t.id) } : t;
        })
      );
      if (plan.rebalance) {
        // Positions got too tight: renumber this bar in one go (in chunks the server accepts).
        const moves = plan.rebalance.map((m) => ({ id: m.id, list_id: listId, position: m.position }));
        for (let i = 0; i < moves.length; i += 500) enqueue({ type: 'reorderTasks', moves: moves.slice(i, i + 500) });
      } else {
        enqueue({ type: 'update', id, updates: { list_id: listId, position: plan.position } });
      }
    },
    [enqueue]
  );

  const addList = useCallback(
    (name, color) => {
      const clean = String(name).trim().replace(/\s+/g, ' ').slice(0, LIST_NAME_MAX);
      if (!clean) return null;
      const bars = listsRef.current;
      if (bars.length >= MAX_LISTS_PER_USER) {
        notify(`You can have up to ${MAX_LISTS_PER_USER} bars. Delete one to add another.`, { tone: 'error' });
        return null;
      }
      const bar = {
        id: newId(),
        name: clean,
        color: color || nextBarColor(bars),
        position: (bars.length ? Math.max(...bars.map((b) => b.position)) : -1) + 1,
        created_at: new Date().toISOString(),
      };
      setLists((prev) => [...prev, bar]);
      enqueue({ type: 'createBar', bar: { id: bar.id, name: bar.name, color: bar.color } });
      return bar.id;
    },
    [enqueue, notify]
  );

  const updateList = useCallback(
    (id, updates) => {
      const next = { ...updates };
      if (next.name !== undefined) {
        next.name = String(next.name).trim().replace(/\s+/g, ' ').slice(0, LIST_NAME_MAX);
        if (!next.name) return;
      }
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, ...next } : l)));
      enqueue({ type: 'updateBar', id, updates: next });
    },
    [enqueue]
  );

  // Moves a bar up (-1) or down (+1) among the others.
  const moveList = useCallback(
    (id, delta) => {
      const bars = [...listsRef.current].sort((a, b) => a.position - b.position);
      const from = bars.findIndex((l) => l.id === id);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= bars.length) return;
      [bars[from], bars[to]] = [bars[to], bars[from]];
      const renumbered = bars.map((l, i) => ({ ...l, position: i }));
      setLists(renumbered);
      enqueue({ type: 'reorderBars', ids: renumbered.map((l) => l.id) });
    },
    [enqueue]
  );

  // Deleting a bar never deletes its tasks: they move to another bar (the first remaining one by default).
  const removeList = useCallback(
    (id, moveTo) => {
      const bars = [...listsRef.current].sort((a, b) => a.position - b.position);
      const target = bars.find((l) => l.id === id);
      const others = bars.filter((l) => l.id !== id);
      if (!target || others.length === 0) return;
      const destination = others.find((l) => l.id === moveTo) ?? others[0];
      const count = tasksRef.current.filter((t) => t.list_id === id && !t.deleted_at).length;

      setTasks((prev) => prev.map((t) => (t.list_id === id ? { ...t, list_id: destination.id } : t)));
      setLists((prev) => prev.filter((l) => l.id !== id));
      setSelectedList((current) => (current === id ? 'All' : current));
      enqueue({ type: 'deleteBar', id, moveTo: destination.id });
      notify(
        count > 0
          ? `Deleted “${target.name}”. Its ${count} task${count === 1 ? '' : 's'} moved to “${destination.name}”.`
          : `Deleted “${target.name}”.`
      );
    },
    [enqueue, notify]
  );

  const toggleTask = useCallback(
    (id) => {
      const target = tasksRef.current.find((t) => t.id === id);
      if (!target) return;

      const completed = !target.completed;
      if (completed) {
        sounds.playPop();
        if (navigator.vibrate) navigator.vibrate(15);
      }
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed } : t)));

      const othersOpen = tasksRef.current.some((t) => !t.completed && !t.deleted_at && t.id !== id);
      if (completed && !othersOpen) triggerCelebration();

      enqueue({ type: 'update', id, updates: { completed } });
    },
    [enqueue, triggerCelebration]
  );

  const editTask = useCallback(
    (id, updates) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
      enqueue({ type: 'update', id, updates });
    },
    [enqueue]
  );

  // Deleting moves a task to the Deleted section; it can be restored from there (or via Undo).
  const deleteTask = useCallback(
    (id) => {
      const target = tasksRef.current.find((t) => t.id === id && !t.deleted_at);
      if (!target) return;
      sounds.playDelete();
      const deletedAt = new Date().toISOString();
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, deleted_at: deletedAt } : t)));
      enqueue({ type: 'delete', id });
      notify('Moved to Deleted', { action: { label: 'Undo', onClick: () => restoreTasks([id]) } });
    },
    [enqueue, notify, restoreTasks]
  );

  // "Clear done" also moves tasks to Deleted rather than destroying them.
  const clearCompleted = useCallback(() => {
    const ids = tasksRef.current.filter((t) => t.completed && !t.deleted_at).map((t) => t.id);
    if (ids.length === 0) return;
    sounds.playDelete();
    const deletedAt = new Date().toISOString();
    setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, deleted_at: deletedAt } : t)));
    enqueue({ type: 'clearCompleted' });
    notify(`Moved ${ids.length} completed task${ids.length === 1 ? '' : 's'} to Deleted`, {
      action: { label: 'Undo', onClick: () => restoreTasks(ids) },
    });
  }, [enqueue, notify, restoreTasks]);

  // Permanent: only reachable from the Deleted section (the server enforces this too). No undo.
  const deleteForever = useCallback(
    (id) => {
      const target = tasksRef.current.find((t) => t.id === id && t.deleted_at);
      if (!target) return;
      sounds.playDelete();
      setTasks((prev) => prev.filter((t) => t.id !== id));
      enqueue({ type: 'forever', id });
    },
    [enqueue]
  );

  const emptyTrash = useCallback(() => {
    const count = tasksRef.current.filter((t) => t.deleted_at).length;
    if (count === 0) return;
    sounds.playDelete();
    setTasks((prev) => prev.filter((t) => !t.deleted_at));
    enqueue({ type: 'emptyTrash' });
    notify(`Permanently deleted ${count} task${count === 1 ? '' : 's'}`);
  }, [enqueue, notify]);

  // A task dragged onto a tab at the top: Today, Urgent, Done or Deleted (see src/lib/tabDrop.js for the rules).
  const moveToTab = useCallback(
    (id, tabId) => {
      const task = tasksRef.current.find((t) => t.id === id && !t.deleted_at);
      if (!task) return;
      const result = dropOnTab(tabId, task, getTodayDateString());
      if (!result) return;

      if (result.unchanged) {
        notify(result.unchanged);
        return;
      }
      if (result.action === 'delete') {
        deleteTask(id); // soft delete, with its own Undo
        return;
      }

      const previous = previousValues(task, result.updates);
      if (result.updates.completed === true) toggleTask(id); // same path as the checkbox, so finishing the last task still celebrates
      else editTask(id, result.updates);
      notify(result.label, { action: { label: 'Undo', onClick: () => editTask(id, previous) } });
    },
    [notify, deleteTask, toggleTask, editTask]
  );

  const markAllComplete = useCallback(() => {
    if (!tasksRef.current.some((t) => !t.completed && !t.deleted_at)) return;
    setTasks((prev) => prev.map((t) => (t.deleted_at ? t : { ...t, completed: true })));
    triggerCelebration();
    enqueue({ type: 'completeAll' });
  }, [enqueue, triggerCelebration]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.deleted_at), [tasks]);
  const trashedTasks = useMemo(
    () => tasks.filter((t) => t.deleted_at).sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)),
    [tasks]
  );

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const orderedLists = useMemo(() => [...lists].sort((a, b) => a.position - b.position), [lists]);

  const filteredTasks = useMemo(() => {
    const today = getTodayDateString();
    const query = searchQuery.trim().toLowerCase();

    return (filter === 'deleted' ? trashedTasks : activeTasks)
      .filter((task) => {
        if (query) {
          const haystack = `${task.title} ${listById.get(task.list_id)?.name ?? ''} ${task.description || ''}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        if (selectedList !== 'All' && task.list_id !== selectedList) return false;

        switch (filter) {
          case 'completed':
            return task.completed;
          case 'high':
            return task.priority === 'high' && !task.completed;
          case 'today':
            // due today, or overdue and still open
            return !task.completed && Boolean(task.due_date) && task.due_date <= today;
          case 'nodate':
            return !task.completed && !task.due_date;
          default:
            return true;
        }
      })
      // Open tasks first, then the user's own order inside each bar. Deleted keeps most-recently-deleted first.
      .sort((a, b) => (filter === 'deleted' ? 0 : compareTasks(a, b)));
  }, [activeTasks, trashedTasks, filter, selectedList, searchQuery, listById]);

  // Progress and counts only look at tasks that aren't deleted.
  const stats = useMemo(() => {
    const today = getTodayDateString();
    const completed = activeTasks.filter((t) => t.completed).length;
    const open = activeTasks.filter((t) => !t.completed);
    return {
      totalCount: activeTasks.length,
      completedCount: completed,
      progressPercent: activeTasks.length === 0 ? 0 : Math.round((completed / activeTasks.length) * 100),
      dueTodayCount: open.filter((t) => t.due_date === today).length,
      overdueCount: open.filter((t) => t.due_date && t.due_date < today).length,
      highCount: open.filter((t) => t.priority === 'high').length,
      noDateCount: open.filter((t) => !t.due_date).length,
      deletedCount: trashedTasks.length,
    };
  }, [activeTasks, trashedTasks]);

  const value = {
    tasks,
    filteredTasks,
    filter,
    setFilter,
    lists: orderedLists,
    listById,
    selectedList,
    setSelectedList,
    searchQuery,
    setSearchQuery,
    addTask,
    moveTask,
    moveToTab,
    addList,
    updateList,
    moveList,
    removeList,
    toggleTask,
    editTask,
    deleteTask,
    restoreTask: (id) => restoreTasks([id]),
    deleteForever,
    emptyTrash,
    clearCompleted,
    markAllComplete,
    syncState,
    pendingCount,
    ...stats,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTasks must be used within a TaskProvider');
  return ctx;
}
