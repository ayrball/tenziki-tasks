import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { installGuide } from '../lib/install';
import { currentEnvironment, getServerSnapshot, getSnapshot, promptInstall, subscribe } from '../lib/installPrompt';

function GuideDialog({ guide, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.14, ease: 'easeIn' } }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-pop"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fill to-fill-2 text-white shadow-card">
          <Download className="h-6 w-6" aria-hidden />
        </span>
        <h2 id="install-title" className="mt-4 text-lg font-bold">
          {guide.title}
        </h2>

        <ol className="mt-3 space-y-2.5">
          {guide.steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm leading-snug">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {guide.note && <p className="mt-4 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">{guide.note}</p>}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-line py-2.5 text-sm font-semibold transition-colors hover:bg-surface-2"
        >
          Got it
        </button>
      </motion.div>
    </motion.div>
  );
}

// One "Install app" button for every browser. Chrome and Edge install with one click; in browsers where a page
// can't start the install itself (Firefox, Safari...) it shows the exact steps for that browser and OS.
export default function InstallApp() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { notify } = useToast();
  const [env] = useState(currentEnvironment);
  const [guideOpen, setGuideOpen] = useState(false);

  if (state.installed) return null;

  const onClick = async () => {
    if (state.canPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        notify(env.os === 'windows' ? 'Installed. Right-click its taskbar icon and choose “Pin to taskbar”.' : 'Installed.', {
          duration: 8000,
        });
      }
      return;
    }
    setGuideOpen(true); // no one-click install available (or it was dismissed): explain how
  };

  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-sm font-semibold text-muted transition-colors hover:text-fg sm:px-3"
        aria-label="Install app"
        title="Install as an app"
      >
        <Download className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Install</span>
      </motion.button>

      <AnimatePresence>
        {guideOpen && <GuideDialog guide={installGuide(env)} onClose={() => setGuideOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
