// ============================================================
// Migrations — every schema change gets a numbered step.
// migrate() takes whatever was in storage and walks it forward.
// If anything is unrecoverable, we fall back to a fresh state
// but keep the broken payload under a backup key for rescue.
// ============================================================

import { AppState, SCHEMA_VERSION, defaultState } from './schema';

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;

// index = version being upgraded FROM (migrations[1] takes v1 → v2)
const migrations: Record<number, Migration> = {
  // Example for the future:
  // 1: (s) => ({ ...s, version: 2, newField: [] }),
};

export function migrate(raw: unknown): AppState {
  if (raw === null || typeof raw !== 'object') return defaultState();
  let s = raw as Record<string, unknown>;

  let v = typeof s.version === 'number' ? s.version : 0;
  if (v < 1) return defaultState(); // pre-versioned or foreign payload

  while (v < SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) return defaultState();
    s = step(s);
    v = s.version as number;
  }

  // Backfill any missing top-level keys against the default shape,
  // so adding optional fields doesn't always require a version bump.
  const base = defaultState() as unknown as Record<string, unknown>;
  for (const k of Object.keys(base)) {
    if (!(k in s)) s[k] = base[k];
  }

  return s as unknown as AppState;
}
