// ============================================================
// Store — single source of truth.
//   state.value        → read anywhere (components auto-subscribe)
//   patch(fn)          → mutate a draft copy; autosaves (debounced)
// No "lost my notes" failure mode: every patch persists within
// 400ms, and flushes immediately when the tab is hidden/closed.
// ============================================================

import { signal } from '@preact/signals';
import { AppState, STORAGE_KEY, defaultState } from './schema';
import { migrate } from './migrations';

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error('State load failed — starting fresh, backing up payload', err);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(STORAGE_KEY + '_backup', raw);
    } catch { /* storage unavailable */ }
    return defaultState();
  }
}

export const state = signal<AppState>(load());

let saveTimer: number | undefined;

function saveNow() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value));
  } catch (err) {
    console.error('State save failed', err);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, 400);
}

/** Mutate state through a draft. Triggers re-render + autosave. */
export function patch(fn: (draft: AppState) => void) {
  const draft = structuredClone(state.value);
  fn(draft);
  state.value = draft;
  scheduleSave();
}

// Flush pending writes when the app is backgrounded or closed —
// the moment a phone screen locks mid-session must not lose data.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { clearTimeout(saveTimer); saveNow(); }
});
window.addEventListener('pagehide', () => { clearTimeout(saveTimer); saveNow(); });
