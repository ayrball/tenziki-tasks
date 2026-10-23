// The "Bars" on/off switch. It only changes how tasks are shown: each task keeps its bar and its place,
// so turning bars back on restores the exact layout. Remembered per device (like the theme) and kept in step
// across open tabs.

import { useSyncExternalStore } from 'react';

const KEY = 'tenziki_bars';
const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(KEY) !== 'off'; // on unless explicitly switched off
  } catch {
    return true;
  }
}

let snapshot = typeof window === 'undefined' ? true : read();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setBarsEnabled(on) {
  snapshot = Boolean(on);
  try {
    localStorage.setItem(KEY, snapshot ? 'on' : 'off');
  } catch {
    // storage unavailable: it just won't be remembered
  }
  emit();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) {
      snapshot = read();
      emit();
    }
  });
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useBarsEnabled() {
  const on = useSyncExternalStore(subscribe, () => snapshot, () => true);
  return [on, setBarsEnabled];
}
