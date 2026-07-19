// ============================================================
// Migrations — every schema change gets a numbered step.
// migrate() takes whatever was in storage and walks it forward.
// If anything is unrecoverable, we fall back to a fresh state
// but keep the broken payload under a backup key for rescue.
// ============================================================

import { AppState, SCHEMA_VERSION, defaultState, defaultPlaces, newRealmIdentity } from './schema';

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
  // v4 → v5: the scene slot becomes a 3-way (scene/idle/video); idle
  // fullscreen flag; one-shot poke channel for waves & celebrations.
  4: (s) => {
    const tv = { ...(s.tv as Record<string, unknown> ?? {}) };
    if (typeof tv.slotView !== 'string') tv.slotView = tv.mediaVisible ? 'video' : 'scene';
    if (typeof tv.idleFull !== 'boolean') tv.idleFull = false;
    if (!tv.poke || typeof (tv.poke as { seq?: unknown }).seq !== 'number') {
      tv.poke = { seq: 0, pcId: '', kind: 'wave' };
    }
    return { ...s, tv, version: 5 };
  },
  // v5 → v6: "Idle" becomes "the Realm". slotView 'idle' → 'realm'; the poke
  // gains a general `target` (old pcId '' meant the party); PCs gain DM notes.
  5: (s) => {
    const tv = { ...(s.tv as Record<string, unknown> ?? {}) };
    if (tv.slotView === 'idle') tv.slotView = 'realm';
    const poke = { ...(tv.poke as Record<string, unknown> ?? {}) };
    if (!('target' in poke)) {
      const pcId = typeof poke.pcId === 'string' ? poke.pcId : '';
      poke.target = pcId === '' ? 'party' : pcId;
    }
    delete poke.pcId;
    if (poke.kind !== 'wave' && poke.kind !== 'cheer' && poke.kind !== 'flinch' && poke.kind !== 'taunt') {
      poke.kind = 'wave';
    }
    if (typeof poke.seq !== 'number') poke.seq = 0;
    tv.poke = poke;
    const party = ((s.party as Record<string, unknown>[]) ?? []).map((p) => ({
      notes: '', ...p,
    }));
    return { ...s, tv, party, version: 6 };
  },
  // v6 → v7: chapters gain a manual `done` flag; Chapter 1's milestones become
  // quest-linked "beats". Match by label prefix so real progress/notes survive.
  6: (s) => {
    const quests = (s.quests as { id: string; name: string }[]) ?? [];
    const questIdByName = (name: string) => quests.find((q) => q.name === name)?.id ?? null;
    const chapters = ((s.chapters as Record<string, unknown>[]) ?? []).map((raw) => {
      const ch = { ...raw };
      if (typeof ch.done !== 'boolean') ch.done = false;
      if (ch.id === 1 && Array.isArray(ch.milestones)) {
        const out: Record<string, unknown>[] = [];
        for (const m of ch.milestones as Record<string, unknown>[]) {
          const label = String(m.label ?? '');
          if (label.startsWith('Three or more town quests')) continue; // replaced by the derived checklist
          if (label.startsWith('Cold-Hearted Killer')) out.push({ ...m, label: 'Cold-Hearted Killer', questId: questIdByName('Cold-Hearted Killer') });
          else if (label.startsWith('Nature Spirits')) out.push({ ...m, label: 'Nature Spirits', questId: questIdByName('Nature Spirits') });
          else out.push(m);
        }
        ch.milestones = out;
      }
      return ch;
    });
    return { ...s, chapters, version: 7 };
  },
  // v7 → v8: the region map lands. Custom pins live in state (seeded places
  // are code). PC/Ally `sprite` is optional-undefined — no backfill needed.
  7: (s) => ({ ...s, mapPins: Array.isArray(s.mapPins) ? s.mapPins : [], version: 8 }),
  // v8 → v9: the items domain (inventory) and ally roaming. Existing allies
  // with a linked PC keep hugging them; the rest wander with the party.
  // CustomNpc.sprite / NpcOverride.sprite are optional-undefined — no backfill.
  8: (s) => {
    const sidekicks = ((s.sidekicks as Record<string, unknown>[]) ?? []).map((a) => ({
      ...a,
      follow: a.follow ?? (a.linkedPcId ? 'pc' : 'party'),
    }));
    return { ...s, sidekicks, inventory: Array.isArray(s.inventory) ? s.inventory : [], version: 9 };
  },
  // v9 → v10: monster sprites. Preset bestiary entries get theirs via the
  // monsterOverrides map (id → descriptor id, the npcOverrides pattern);
  // CustomMonster.sprite / OwnedItem.display are optional-undefined — no backfill.
  9: (s) => ({
    ...s,
    monsterOverrides: s.monsterOverrides && typeof s.monsterOverrides === 'object' ? s.monsterOverrides : {},
    version: 10,
  }),
  // v10 → v11: the Places domain — non-town landmarks as first-class entries,
  // seeded from the MAP_PLACES landmarks. DM-only, never projected.
  10: (s) => ({
    ...s,
    places: Array.isArray(s.places) ? s.places : defaultPlaces(),
    version: 11,
  }),
  // v11 → v12: the Realm backend identity (Brief 2). Generated once and MUST
  // then stay stable — the store persists immediately after a migration so a
  // reload can't mint a second campaign id. PC.realmGated is optional-undefined.
  11: (s) => {
    const r = s.realm as Record<string, unknown> | undefined;
    const valid = r && typeof r.campaignId === 'string' && r.campaignId.length > 0
      && typeof r.dmSecret === 'string' && r.dmSecret.length > 0;
    return { ...s, realm: valid ? r : newRealmIdentity(), version: 12 };
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
