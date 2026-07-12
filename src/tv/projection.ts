// ============================================================
// PLAYER PROJECTION — the security boundary between DM and TV.
// projectPlayerView() is a PURE function: AppState in, PlayerView
// out. The TV never receives AppState. Anything not explicitly
// copied here never leaves the phone (secrets, DM notes, monster
// AC/exact HP, dormant quests, session prep…).
//
// Rules:
//  - PCs & allies: exact numbers (players know their own sheets)
//  - Monsters: abstracted HP (healthy/bloodied/critical/down),
//    never AC, never exact HP. Names maskable per-combatant via
//    state.tv.hiddenCombatantIds → shown as "???".
//  - Quests: active + escalating only; name/town/status, no notes.
//  - Mode: combat when tracker is running, else exploration.
// ============================================================

import {
  AppState, Combatant, WEATHER, WeatherId, QuestStatus, Poke, PokeKind,
} from '../state/schema';
import { resolveScene } from './scenes';

export const PV_VERSION = 2;

export type { Poke, PokeKind } from '../state/schema';

/** The transient reaction the TV plays for ~2.6s when a poke fires. `seq`
 *  lets the stage re-key an actor so a repeated reaction replays. */
export type PokeActive = { seq: number; target: string; kind: PokeKind };

export type HpState = 'healthy' | 'bloodied' | 'critical' | 'down';

export interface PvWeather {
  id: WeatherId;
  name: string;
  icon: string;
  conSave: boolean;
}

export interface PvPc {
  id: string;
  name: string;
  cls: string;
  hp: number;
  maxHp: number;
  conditions: string[];
  inspiration: boolean;
  deathS: number;
  deathF: number;
  down: boolean;
}

export interface PvAlly {
  id: string;
  name: string;
  emoji: string;
  hpState: HpState;
  conditions: string[];
  /** PC this ally follows — TV nests them under that PC's card */
  linkedPcId: string | null;
  down: boolean;
  deathS: number;
  deathF: number;
}

export interface PvCombatant {
  id: string;
  /** Masked to "???" when hidden by the DM */
  name: string;
  emoji: string;
  friendly: boolean;          // PC or ally — gets exact HP on the TV
  hp: number | null;          // exact for friendlies, null for monsters
  maxHp: number | null;
  hpState: HpState;           // always present — the abstraction monsters get
  init: number | null;
  conditions: string[];
  active: boolean;            // it's this combatant's turn
  next: boolean;              // up next
  /** Death saves for a downed PC (from the party record); null otherwise */
  deathS: number | null;
  deathF: number | null;
}

export interface PvQuest {
  id: string;
  name: string;
  town: string;
  status: QuestStatus;        // only 'active' | 'escalating' ever appear
  mainHook: boolean;
}

export interface PvTravel {
  origin: string;
  dest: string;
  day: number;
  totalDays: number;
}

export interface PvResources {
  gold: number;
  rations: number;
  partySize: number;
}

export interface PlayerView {
  v: typeof PV_VERSION;
  mode: 'exploration' | 'combat';
  day: number;
  weather: PvWeather;
  location: string;
  travel: PvTravel | null;
  resources: PvResources;
  /** Concrete scene id — 'auto' is resolved on the phone before sending */
  sceneId: string;
  /** YouTube ambience video id ('' = no player) */
  youtubeId: string;
  /** true → player fills the scene slot; false → audio-only */
  mediaVisible: boolean;
  slotView: 'scene' | 'realm' | 'video';
  idleFull: boolean;
  poke: Poke;
  party: PvPc[];
  allies: PvAlly[];
  combat: { round: number; combatants: PvCombatant[] } | null;
  quests: PvQuest[];
  sentAt: number;             // epoch ms — lets the TV show staleness
}

// --- helpers ----------------------------------------------------------------

export function hpState(hp: number, maxHp: number): HpState {
  if (hp <= 0) return 'down';
  if (maxHp <= 0) return 'healthy';
  const r = hp / maxHp;
  if (r <= 0.25) return 'critical';
  if (r <= 0.5) return 'bloodied';
  return 'healthy';
}

function isFriendly(c: Combatant): boolean {
  return c.srcType === 'pc' || c.srcType === 'ally';
}

function projectCombatant(
  c: Combatant, idx: number, turn: number, count: number, hidden: Set<string>,
  party: AppState['party'], sidekicks: AppState['sidekicks'],
): PvCombatant {
  const friendly = isFriendly(c);
  const masked = !friendly && hidden.has(c.id);
  const pc = c.hp > 0 ? undefined
    : c.srcType === 'pc' ? party.find((p) => p.id === c.srcId)
    : c.srcType === 'ally' ? sidekicks.find((a) => a.id === c.srcId)
    : undefined;
  return {
    id: c.id,
    name: masked ? '???' : c.name,
    emoji: masked ? '❓' : c.emoji,
    friendly,
    hp: friendly ? c.hp : null,
    maxHp: friendly ? c.maxHp : null,
    hpState: hpState(c.hp, c.maxHp),
    init: c.init,
    conditions: c.conditions,
    active: idx === turn,
    next: count > 1 && idx === (turn + 1) % count,
    deathS: pc ? (pc.deathS ?? 0) : null,
    deathF: pc ? (pc.deathF ?? 0) : null,
  };
}

function deriveLocation(s: AppState): string {
  // Manual wins while set — the DM asked for the pen. Journey route
  // covers travel whenever the field is left blank.
  if (s.tv?.partyLocation?.trim()) return s.tv.partyLocation.trim();
  const j = s.travel.activeJourney;
  if (j) return `${j.origin} → ${j.dest}`;
  return 'Ten-Towns, Icewind Dale';
}

// --- the projection ----------------------------------------------------------

export function projectPlayerView(s: AppState): PlayerView {
  const wx = WEATHER[s.weather.current];
  const hidden = new Set(s.tv?.hiddenCombatantIds ?? []);
  const inCombat = s.combat.active && s.combat.combatants.length > 0;
  const j = s.travel.activeJourney;

  return {
    v: PV_VERSION,
    mode: inCombat ? 'combat' : 'exploration',
    day: s.weather.day,
    weather: { id: wx.id, name: wx.name, icon: wx.icon, conSave: wx.conSave },
    location: deriveLocation(s),
    travel: j ? { origin: j.origin, dest: j.dest, day: j.day, totalDays: j.totalDays } : null,
    resources: { gold: s.travel.gold ?? 0, rations: s.travel.rations, partySize: s.travel.partySize },
    sceneId: resolveScene(s.tv?.sceneId ?? 'auto', { journeying: !!j, weatherId: s.weather.current }).id,
    youtubeId: s.tv?.youtubeId ?? '',
    mediaVisible: (s.tv?.slotView ?? 'scene') === 'video',
    slotView: s.tv?.slotView ?? 'scene',
    idleFull: s.tv?.idleFull ?? false,
    poke: s.tv?.poke ?? { seq: 0, target: 'party', kind: 'wave' },

    party: s.party.map((p) => ({
      id: p.id, name: p.name, cls: p.cls,
      hp: p.hp, maxHp: p.maxHp,
      conditions: p.conditions,
      inspiration: p.inspiration,
      deathS: p.deathS, deathF: p.deathF,
      down: p.hp <= 0,
    })),

    allies: s.sidekicks.map((a) => ({
      id: a.id, name: a.name, emoji: a.emoji,
      hpState: hpState(a.hp, a.maxHp),
      conditions: a.conditions,
      linkedPcId: a.linkedPcId ?? null,
      down: a.hp <= 0,
      deathS: a.deathS ?? 0,
      deathF: a.deathF ?? 0,
    })),

    combat: inCombat
      ? {
          round: s.combat.round,
          combatants: s.combat.combatants.map((c, i) =>
            projectCombatant(c, i, s.combat.turn, s.combat.combatants.length, hidden, s.party, s.sidekicks)),
        }
      : null,

    quests: s.quests
      .filter((q) => q.status === 'active' || q.status === 'escalating')
      .map((q) => ({ id: q.id, name: q.name, town: q.town, status: q.status, mainHook: q.mainHook })),

    sentAt: Date.now(),
  };
}
