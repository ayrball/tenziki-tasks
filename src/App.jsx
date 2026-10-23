import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider, useTasks } from './context/TaskContext';
import { downloadTasksJson } from './lib/exportTasks';
import { ToastProvider } from './context/ToastContext';
import Header from './components/Header';
import SummaryCard from './components/SummaryCard';
import TaskInput from './components/TaskInput';
import DragBoard from './components/DragBoard';
import FilterBar from './components/FilterBar';
import TaskList from './components/TaskList';
import AuthModal from './components/AuthModal';

function readInitialTheme() {
  try {
    const saved = localStorage.getItem('tenziki_theme');
    if (saved) return saved === 'dark';
  } catch {
    // storage unavailable
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function MainApp() {
  const { isAuthenticated } = useAuth();
  const { tasks, lists } = useTasks();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      localStorage.setItem('tenziki_theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // storage unavailable
    }
  }, [isDarkMode]);

  const toggleTheme = useCallback(() => setIsDarkMode((v) => !v), []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-16 sm:px-6">
      <Header onOpenAuth={() => setIsAuthOpen(true)} isDarkMode={isDarkMode} onToggleTheme={toggleTheme} />

      <main className="flex-1">
        <SummaryCard />
        <TaskInput />
        <DragBoard>
          <FilterBar />
          <div id="task-panel" role="tabpanel">
            <TaskList />
          </div>
        </DragBoard>
      </main>

      <footer className="mt-12 flex flex-col items-center gap-1.5 text-center text-xs text-faint">
        <p>{isAuthenticated ? 'Synced to your Google account' : 'Saved on this device · Sign in to sync across devices'}</p>
        <button
          type="button"
          onClick={() => downloadTasksJson(tasks, lists)}
          className="rounded-md px-2 py-1 font-semibold underline-offset-2 transition-colors hover:text-fg hover:underline"
        >
          Export my tasks
        </button>
      </footer>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
}

// Remount the task store whenever the account changes so each account loads its own list.
function TaskScope({ children }) {
  const { user } = useAuth();
  return <TaskProvider key={user?.uid ?? 'guest'}>{children}</TaskProvider>;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <TaskScope>
            <MainApp />
          </TaskScope>
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
