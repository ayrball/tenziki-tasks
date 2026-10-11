import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { sounds } from '../lib/audio';
import { api } from '../lib/apiClient';
import { addDays, getTodayDateString, normalizeDueDate } from '../lib/dateUtils';
import { drainQueue, loadQueue, retryDelayMs, runOp, saveQueue } from '../lib/syncQueue';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const TaskContext = createContext(null);

const GUEST_KEY = 'tenziki_tasks_guest';
const LEGACY_KEY = 'tenziki_tasks_data'; // single shared cache used before per-account storage
const userKey = (uid) => `tenziki_tasks_${uid}`;

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
  if (uid) return (readStored(userKey(uid)) ?? []).map(normalizeTask);
  const stored = readStored(GUEST_KEY) ?? readStored(LEGACY_KEY);
  return stored ? stored.map(normalizeTask) : welcomeTasks();
}

// TaskProvider is keyed by account in App.jsx, so it remounts (and reloads its own list) on sign in/out.
export function TaskProvider({ children }) {
  const { user, token, signOut } = useAuth();
  const { notify } = useToast();
  const uid = user?.uid ?? null;

  const [tasks, setTasks] = useState(() => loadInitial(uid));
  const [filter, setFilter] = useState('today');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  // 'local' (not signed in) | 'syncing' | 'synced' | 'offline'
  const [syncState, setSyncState] = useState(token ? 'syncing' : 'local');
  const [pendingCount, setPendingCount] = useState(() => (uid ? loadQueue(uid).length : 0));

  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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
      const remote = await api.listTasks(token);
      if (mutationRef.current !== startedAt || queueRef.current.length > 0) return;
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
        const remoteRaw = await api.listTasks(token);
        if (cancelled) return;
        const remote = remoteRaw.map(normalizeTask);

        // Repair old "Today"/"Tomorrow" strings on the server.
        remoteRaw.forEach((raw, i) => {
          if (raw.due_date !== remote[i].due_date) {
            api.updateTask(token, raw.id, { due_date: remote[i].due_date }).catch(() => {});
          }
        });

        const known = new Set(remote.map((t) => t.id));
        const guest = (readStored(GUEST_KEY) ?? readStored(LEGACY_KEY) ?? [])
          .filter((t) => !isDemo(t.id) && !known.has(t.id))
          .map(normalizeTask);

        const imported = [];
        let importFailed = false;
        for (const task of guest) {
          if (cancelled) return;
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
          setTasks([...imported, ...remote].sort(byNewest));
        } else {
          // The user changed something while this loaded; show the server's list once their change is sent.
          setTimeout(() => refreshRef.current(), 1500);
        }
        setSyncState('synced');
        lastSyncRef.current = Date.now();
        if (!importFailed) {
          localStorage.setItem(GUEST_KEY, '[]');
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
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.7 },
      colors: ['#6d5efc', '#a78bfa', '#f472b6', '#34d399'],
      disableForReducedMotion: true,
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
    ({ title, priority = 'medium', category = 'Personal', due_date = null, description = '' }) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      sounds.playPop();

      const task = {
        id: newId(),
        title: cleanTitle,
        description: description.trim(),
        completed: false,
        priority,
        category,
        due_date,
        created_at: new Date().toISOString(),
      };
      setTasks((prev) => [task, ...prev]);
      enqueue({ type: 'create', task });
    },
    [enqueue]
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

  const filteredTasks = useMemo(() => {
    const today = getTodayDateString();
    const query = searchQuery.trim().toLowerCase();

    return (filter === 'deleted' ? trashedTasks : activeTasks)
      .filter((task) => {
        if (query) {
          const haystack = `${task.title} ${task.category} ${task.description || ''}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        if (selectedCategory !== 'All' && task.category !== selectedCategory) return false;

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
      // Open tasks first (stable: keeps newest-first inside each group). Deleted keeps most-recently-deleted first.
      .sort((a, b) => (filter === 'deleted' ? 0 : Number(a.completed) - Number(b.completed)));
  }, [activeTasks, trashedTasks, filter, selectedCategory, searchQuery]);

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
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    addTask,
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
