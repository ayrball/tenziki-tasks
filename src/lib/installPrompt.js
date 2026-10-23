// Holds the browser's "this site can be installed" event so a button can trigger it later.
// Imported first in main.jsx because the browser can fire the event before the UI has mounted.

import { detectEnvironment } from './install.js';

const hasWindow = typeof window !== 'undefined';

let deferred = null;
let snapshot = { canPrompt: false, installed: false };
const listeners = new Set();

function isStandalone() {
  if (!hasWindow) return false;
  const mq = (q) => window.matchMedia?.(q).matches;
  return Boolean(mq('(display-mode: standalone)') || mq('(display-mode: window-controls-overlay)') || window.navigator.standalone === true);
}

function update(partial) {
  snapshot = { ...snapshot, ...partial };
  listeners.forEach((l) => l());
}

if (hasWindow) {
  snapshot = { canPrompt: false, installed: isStandalone() };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = event;
    update({ canPrompt: true });
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    update({ canPrompt: false, installed: true });
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => update({ installed: isStandalone() }));
}

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => ({ canPrompt: false, installed: false });

export const currentEnvironment = () =>
  hasWindow ? detectEnvironment({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }) : { browser: 'other', os: 'other' };

// Starts the browser's own install dialog. Resolves 'accepted', 'dismissed' or 'unavailable'.
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const event = deferred;
  deferred = null; // each event can only be used once
  update({ canPrompt: false });
  const result = await event.prompt();
  const choice = result?.outcome ? result : await event.userChoice;
  return choice?.outcome ?? 'dismissed';
}
