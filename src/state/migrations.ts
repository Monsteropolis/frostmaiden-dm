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
  // v1 → v2: party gold on travel, chosen scene on tv (both nested,
  // so the top-level backfill below can't reach them).
  1: (s) => {
    const travel = { ...(s.travel as Record<string, unknown> ?? {}) };
    if (typeof travel.gold !== 'number') travel.gold = 0;
    const tv = { ...(s.tv as Record<string, unknown> ?? {}) };
    if (typeof tv.sceneId !== 'string') tv.sceneId = 'auto';
    return { ...s, travel, tv, version: 2 };
  },
  // v2 → v3: death saves on allies/sidekicks, YouTube ambience id on tv.
  2: (s) => {
    const sidekicks = ((s.sidekicks as Record<string, unknown>[]) ?? []).map((a) => ({
      deathS: 0, deathF: 0, ...a,
    }));
    const tv = { ...(s.tv as Record<string, unknown> ?? {}) };
    if (typeof tv.youtubeId !== 'string') tv.youtubeId = '';
    return { ...s, sidekicks, tv, version: 3 };
  },
  // v3 → v4: youtube show/hide toggle (audio keeps playing when hidden).
  3: (s) => {
    const tv = { ...(s.tv as Record<string, unknown> ?? {}) };
    if (typeof tv.mediaVisible !== 'boolean') tv.mediaVisible = false;
    return { ...s, tv, version: 4 };
  },
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
