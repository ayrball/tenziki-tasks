import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/apiClient';

const AuthContext = createContext(null);

const SESSION_KEY = 'tenziki_session';
// Earlier versions kept an unverified, client-made "Google user" here. Drop it.
const LEGACY_USER_KEY = 'tenziki_google_user';

function loadSession() {
  try {
    localStorage.removeItem(LEGACY_USER_KEY);
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.token || !session?.user?.uid || session.expiresAt * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);
  // undefined = still loading, null = Google sign-in not configured on the server
  const [googleClientId, setGoogleClientId] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .getAuthConfig()
      .then((cfg) => !cancelled && setGoogleClientId(cfg?.googleClientId || null))
      .catch(() => !cancelled && setGoogleClientId(null));
    return () => {
      cancelled = true;
    };
  }, []);

  // Ends the session in this browser and, unless the server already ended it, on the server too so
  // the token stops working immediately. `everywhere` signs every device out.
  const signOut = useCallback(
    ({ revoke = true, everywhere = false } = {}) => {
      if (revoke && session?.token) {
        const request = everywhere ? api.signOutAll : api.signOut;
        request(session.token).catch(() => {
          // offline: the token still expires on its own; the browser is signed out regardless
        });
      }
      setSession(null);
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        // storage unavailable
      }
    },
    [session]
  );

  // Exchanges a Google ID token for a Worker-signed session.
  const signInWithCredential = useCallback(async (credential) => {
    const result = await api.signInWithGoogle(credential);
    const next = { token: result.token, user: result.user, expiresAt: result.expiresAt };
    setSession(next);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: session lasts until reload
    }
    return next.user;
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session),
      googleClientId,
      signInWithCredential,
      signOut,
    }),
    [session, googleClientId, signInWithCredential, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
