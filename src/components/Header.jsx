import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, LogIn, Moon, RefreshCw, Sun, WifiOff } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { getGreeting } from '../lib/dateUtils';
import InstallApp from './InstallApp';

const dateFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

function SyncStatus() {
  const { syncState, pendingCount } = useTasks();
  if (syncState === 'local') return null;

  const waiting = pendingCount > 0 ? ` · ${pendingCount} waiting` : '';
  const config = {
    syncing: {
      label: `Syncing${waiting}`,
      icon: <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />,
      tone: 'text-muted',
    },
    synced: {
      label: 'Synced',
      icon: <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />,
      tone: 'text-muted',
    },
    offline: {
      label: `Offline${waiting}`,
      icon: <WifiOff className="h-3 w-3" aria-hidden />,
      tone: 'text-amber-700 dark:text-amber-400',
    },
  }[syncState];

  // Always show problems; the calm "Synced" state only needs the room on wider screens.
  const visibility = syncState === 'offline' || pendingCount > 0 ? 'inline-flex' : 'hidden sm:inline-flex';

  return (
    <span
      className={`items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium ${visibility} ${config.tone}`}
      role="status"
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function Avatar({ user }) {
  if (user.picture) {
    return (
      <img
        src={user.picture}
        alt=""
        referrerPolicy="no-referrer"
        className="h-7 w-7 rounded-full object-cover ring-1 ring-line"
      />
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-xs font-bold text-white">
      {(user.name || user.email || '?').charAt(0).toUpperCase()}
    </span>
  );
}

export default function Header({ onOpenAuth, isDarkMode, onToggleTheme }) {
  const { user, isAuthenticated } = useAuth();
  const firstName = user?.name?.split(' ')[0];
  const [dateLabel] = useState(() => dateFormat.format(new Date()));

  return (
    <header className="pb-2 pt-5 sm:pt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-fill to-fill-2 text-white shadow-card">
            <Check className="h-4 w-4 stroke-[3]" aria-hidden />
          </span>
          <span className="text-[15px] font-bold tracking-tight">Tenziki Tasks</span>
        </div>

        <div className="flex items-center gap-2">
          <SyncStatus />
          <InstallApp />

          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={onToggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-fg"
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </motion.button>

          {isAuthenticated ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={onOpenAuth}
              className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm font-semibold transition-colors hover:border-line-strong"
              aria-label="Account"
            >
              <Avatar user={user} />
              <span className="hidden max-w-[7rem] truncate sm:inline">{firstName}</span>
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={onOpenAuth}
              className="flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden />
              Sign in
            </motion.button>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-4xl">
          {getGreeting()}
          {firstName ? (
            <>
              , <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">{firstName}</span>
            </>
          ) : null}
        </h1>
        <p className="mt-1.5 text-sm font-medium text-muted">{dateLabel}</p>
      </div>
    </header>
  );
}
