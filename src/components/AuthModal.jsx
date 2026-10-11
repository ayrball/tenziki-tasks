import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Cloud, Loader2, LogOut, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loadGoogleIdentity } from '../lib/googleIdentity';

function GoogleButton({ clientId, onCredential, onError }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  // Latest callbacks, so Google is initialised once per client id rather than on every render.
  const handlers = useRef({ onCredential, onError });
  useEffect(() => {
    handlers.current = { onCredential, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => handlers.current.onCredential(response.credential),
          use_fedcm_for_button: true,
        });
        google.accounts.id.renderButton(containerRef.current, {
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 280,
        });
        setReady(true);
      })
      .catch((err) => !cancelled && handlers.current.onError(err.message));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div className="flex min-h-[44px] items-center justify-center">
      {!ready && <Loader2 className="h-5 w-5 animate-spin text-faint" aria-label="Loading Google sign-in" />}
      <div ref={containerRef} className={ready ? '' : 'hidden'} />
    </div>
  );
}

export default function AuthModal({ isOpen, onClose }) {
  const { user, isAuthenticated, googleClientId, signInWithCredential, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen, onClose]);

  const handleCredential = async (credential) => {
    setBusy(true);
    setError('');
    try {
      await signInWithCredential(credential);
      onClose();
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
            aria-labelledby="auth-title"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
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

            {isAuthenticated ? (
              <div className="text-center">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="mx-auto h-16 w-16 rounded-full object-cover ring-2 ring-line"
                  />
                ) : (
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-fill text-2xl font-bold text-white">
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </span>
                )}
                <h2 id="auth-title" className="mt-4 text-lg font-bold">
                  {user.name}
                </h2>
                <p className="text-sm text-muted">{user.email}</p>

                <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-accent-soft px-3 py-2.5 text-xs font-medium text-accent">
                  <Cloud className="h-4 w-4 shrink-0" aria-hidden />
                  Your tasks sync across every device you sign in on.
                </div>

                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    onClose();
                  }}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-2.5 text-sm font-semibold transition-colors hover:bg-surface-2"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => {
                    signOut({ everywhere: true });
                    onClose();
                  }}
                  className="mt-2 w-full rounded-2xl py-2 text-xs font-semibold text-muted transition-colors hover:text-danger"
                >
                  Sign out of all devices
                </button>
              </div>
            ) : (
              <div className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fill to-fill-2 text-white shadow-card">
                  <Cloud className="h-6 w-6" aria-hidden />
                </span>
                <h2 id="auth-title" className="mt-4 text-lg font-bold">
                  Sync your tasks
                </h2>
                <p className="mx-auto mt-1.5 max-w-[16rem] text-sm text-muted">
                  Sign in with Google to keep your list in step on your phone, tablet and computer.
                </p>

                <div className="mt-6">
                  {googleClientId === undefined && (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-faint" aria-label="Loading" />
                  )}
                  {googleClientId === null && (
                    <p className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-left text-xs leading-relaxed text-muted">
                      Google sign-in isn&apos;t set up on this site yet. Your tasks still work and are saved on this
                      device.
                    </p>
                  )}
                  {googleClientId && (
                    <div className={busy ? 'pointer-events-none opacity-50' : ''}>
                      <GoogleButton clientId={googleClientId} onCredential={handleCredential} onError={setError} />
                    </div>
                  )}
                  {busy && (
                    <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> Signing you in…
                    </p>
                  )}
                  {error && (
                    <p className="mt-3 text-xs font-medium text-danger" role="alert">
                      {error}
                    </p>
                  )}
                </div>

                <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-faint">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Only your name, email and photo are used.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
