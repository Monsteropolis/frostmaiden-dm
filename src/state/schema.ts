// ============================================================
// State schema — versioned from day one.
// Bump SCHEMA_VERSION and add a step in migrations.ts whenever
// the shape changes. Never mutate old saves silently.
// ============================================================

export const SCHEMA_VERSION = 8;
export const STORAGE_KEY = 'fmdm_state_v1';

// --- Weather ---------------------------------------------------------------

export type WeatherId =
  | 'clear'
  | 'overcast'
  | 'light_snow'
  | 'heavy_snow'
  | 'blizzard'
  | 'aurils_wrath';

export interface WeatherDef {
  id: WeatherId;
  name: string;
  icon: string;
  /** Frostmaiden extreme-cold / storm rules force CON saves */
  conSave: boolean;
  conSaveNote?: string;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear:        { id: 'clear',        name: 'Clear skies',   icon: '✦', conSave: false },
  overcast:     { id: 'overcast',     name: 'Overcast',      icon: '☁', conSave: false },
  light_snow:   { id: 'light_snow',   name: 'Light snow',    icon: '❄', conSave: false },
  heavy_snow:   { id: 'heavy_snow',   name: 'Heavy snow',    icon: '❄', conSave: true,
                  conSaveNote: 'DC 10 CON each hour of travel or gain exhaustion (extreme cold)' },
  blizzard:     { id: 'blizzard',     name: 'Blizzard',      icon: '🌨', conSave: true,
                  conSaveNote: 'DC 10 CON each hour exposed; visibility 30 ft, ranged attacks disadvantage' },
  aurils_wrath: { id: 'aurils_wrath', name: "Auril's Wrath", icon: '🌀', conSave: true,
                  conSaveNote: 'DC 15 CON each hour exposed — supernatural cold' },
};

// --- Entities (Phase 1 carries the shapes core to later phases) -------------

export type Standing = 'neutral' | 'friendly' | 'hostile' | 'allied' | 'dead';

export interface NpcOverride {
  standing?: Standing;
  lastSeen?: string;   // free-text context, e.g. "S3 — warned party about Sephek"
  notes?: string;
}

export interface WeatherLogEntry {
  day: number;
  weather: WeatherId;
  note?: string;
}

// --- Phase 2: table entities -------------------------------------------------

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
  'Prone', 'Restrained', 'Stunned', 'Unconscious',
] as const;

export interface PC {
  id: string;
  name: string;
  cls: string;        // class/subclass, free text
  level: number;
  race: string;
  hp: number;
  maxHp: number;
  ac: number;
  pp: number;         // passive perception
  initMod: number;
  conditions: string[];
  inspiration: boolean;
  deathS: number;     // death save successes (0–3)
  deathF: number;     // failures (0–3)
  notes: string;      // DM-only scratch — NEVER projected to players (see seam tests)
  /** Actor sprite descriptor id (data/actor-sprites.ts); undefined = classic atlas. */
  sprite?: string;
}

export interface AllyAttack { name: string; bonus: number; damage: string; }

export type AllyCategory = 'sidekick' | 'ally';
export type SidekickClass = 'Warrior' | 'Expert' | 'Spellcaster';

export interface Ally {
  id: string;
  name: string;
  emoji: string;
  kind: string;       // e.g. "Expert sidekick", "Wolf companion"
  category?: AllyCategory;      // sidekick (Tasha's) vs recruited ally
  linkedPcId?: string;          // sidekick: which PC they follow
  sidekickClass?: SidekickClass;
  srcType?: 'monster' | 'api' | 'npc' | 'custommon';  // ally: statblock source
  srcId?: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  initMod: number;
  scores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  attacks: AllyAttack[];
  conditions: string[];
  /** Death saves — allies fall like anyone else in the Dale */
  deathS: number;
  deathF: number;
  location: string;
  notes: string;
  /** Actor sprite descriptor id (data/actor-sprites.ts); undefined = critter/emoji. */
  sprite?: string;
}

export type CombatantSrc = 'pc' | 'ally' | 'monster' | 'custom' | 'api' | 'custommon';

export interface Combatant {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
  ac: number;
  init: number | null;
  initMod: number;
  conditions: string[];
  srcType: CombatantSrc;
  srcId?: string;     // links back to PC/Ally/creature for live sync & stat sheets
}

export interface PresetCombatant {
  srcType: CombatantSrc;
  srcId?: string;
  count: string;      // "3" or "1d4"
  name?: string;
  emoji?: string;
  hp?: number;
  ac?: number;
}

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';

export interface EncounterPreset {
  id: string;
  name: string;
  type: 'combat' | 'noncombat';
  category: string;   // travel / town / dungeon / social / hazard…
  difficulty: Difficulty;
  desc: string;
  combatants: PresetCombatant[];
  custom: boolean;    // user-created vs seeded
}

// --- Phase 3: NPCs, arcs, towns ------------------------------------------------

export interface CustomNpc {
  id: string;
  name: string;
  emoji: string;
  role: string;
  town: string;
  race: string;
  personality: string;
  voice: string;
  wants: string;
  fears: string;
  appearance: string;
  notes: string;
  ac?: number;
  hp?: number;
  attacks?: AllyAttack[];
}

export type ArcStatus = 'dormant' | 'active' | 'escalating' | 'resolved';

export interface Arc {
  id: string;
  name: string;
  status: ArcStatus;
  lastDev: string;       // last development
  nextTrigger: string;   // next escalation trigger
  linkedNpcIds: string[];
  notes: string;
}

export type TownStanding = 'unknown' | 'neutral' | 'friendly' | 'hostile' | 'allied';

export interface TownStatus {
  visited: boolean;
  standing: TownStanding;
  activeQuest: string;
  sidekickRecruited: boolean;
  notes: string;
}

export function defaultTownStatus(): TownStatus {
  return { visited: false, standing: 'unknown', activeQuest: '', sidekickRecruited: false, notes: '' };
}

// --- Custom monsters (user-built stat blocks) ----------------------------------

export interface CustomMonster {
  id: string;
  name: string;
  emoji: string;
  size: string;
  type: string;
  cr: string;
  ac: number;
  hp: number;
  speed: string;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  senses: string;
  traits: { n: string; d: string }[];
  actions: { n: string; d: string }[];
}

// --- Phase 4: sessions, quests, travel ----------------------------------------

export type QuestStatus = 'dormant' | 'active' | 'escalating' | 'resolved';

export interface Quest {
  id: string;
  name: string;
  status: QuestStatus;
  town: string;
  chapter: number | null;
  mainHook: boolean;
  trigger: string;
  development: string;
  notes: string;
  custom: boolean;
}

export type SessionStatus = 'idea' | 'planned' | 'complete';

export interface SessionEntry {
  id: string;
  title: string;
  status: SessionStatus;
  date: string;
  hook: string;
  plannedEncounters: string;
  npcIds: string[];
  secrets: string;
  debrief: string;
}

export interface Milestone {
  label: string;
  done: boolean;              // manual beats only; linked beats derive done from the quest
  notes?: string;
  /** When set, this beat's done state is derived from quest.status === 'resolved'
   *  (never stored, so it can't drift) and the manual toggle is disabled. */
  questId?: string | null;
}

export interface Chapter {
  id: number;
  label: string;
  levels: string;
  milestones: Milestone[];
  done: boolean;              // manual "Complete chapter" flag
}

/** A DM-dropped pin on the region map (native 1353×954 px coords). */
export interface MapPin { id: string; name: string; x: number; y: number; kind: 'custom' }

export type Pace = 'cautious' | 'normal' | 'dogsled';

export interface Journey {
  origin: string;
  dest: string;
  pace: Pace;
  day: number;        // current day of journey (1-based)
  totalDays: number;
}

export interface TravelLogEntry { day: number; text: string; }

// --- Root state --------------------------------------------------------------

// --- TV player view (projection settings live in DM state) --------------------

export interface TvSettings {
  /** Last room code paired with, so reconnect is one tap */
  lastRoomCode: string;
  /** Combatant IDs whose names show as "???" on the TV */
  hiddenCombatantIds: string[];
  /** Manual "party is at…" shown on the TV when no journey is active */
  partyLocation: string;
  /** Pixel-art scene shown on the TV. 'auto' derives from weather/journey. */
  sceneId: string;
  /** YouTube video id for the TV's ambience player ('' = off) */
  youtubeId: string;
  /** true → the player occupies the scene slot; false → audio-only in the background */
  mediaVisible: boolean;
  /** what fills the TV's scene slot: art, the Realm diorama, or the video */
  slotView: 'scene' | 'realm' | 'video';
  /** Realm diorama takes over the whole exploration screen */
  idleFull: boolean;
  /** one-shot reaction: bump seq to fire. */
  poke: Poke;
}

/** Realm reaction kinds. wave/cheer/taunt map to poses; flinch is CSS-only. */
export type PokeKind = 'wave' | 'cheer' | 'flinch' | 'taunt';

/** A one-shot "Moment" fired at the Realm. Bump `seq` to trigger.
 *  `target`: 'party' (all PCs) · 'foes' (non-friendly combatants) ·
 *  'everyone' · or a single pcId. */
export interface Poke { seq: number; target: string; kind: PokeKind }

export interface AppState {
  version: number;
  createdAt: string;

  weather: {
    current: WeatherId;
    day: number;                 // campaign day counter
    log: WeatherLogEntry[];
  };

  // Collections land in later phases; shaped now so migrations stay simple.
  party: PC[];
  sidekicks: Ally[];
  sessions: SessionEntry[];
  quests: Quest[];
  questsSeeded: boolean;
  chapters: Chapter[];
  arcs: Arc[];
  encounterPresets: EncounterPreset[];
  combat: { active: boolean; round: number; turn: number; combatants: Combatant[] };
  travel: { activeJourney: Journey | null; log: TravelLogEntry[]; rations: number; partySize: number; gold: number };
  towns: Record<string, TownStatus>;
  /** The DM's own map pins (kind 'custom'). Seeded places live in data/map.ts.
   *  DM-only — never projected. */
  mapPins: MapPin[];

  // NPC system — first-class from the start
  npcOverrides: Record<string, NpcOverride>;
  customNpcs: CustomNpc[];
  customMonsters: CustomMonster[];

  tv: TvSettings;

  seq: number; // monotonic id counter for user-created entities
}

export function defaultState(): AppState {
  return {
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    weather: { current: 'light_snow', day: 1, log: [{ day: 1, weather: 'light_snow' }] },
    party: [],
    sidekicks: [],
    sessions: [],
    quests: [],
    questsSeeded: false,
    chapters: defaultChapters(),
    arcs: [],
    encounterPresets: [],
    combat: { active: false, round: 0, turn: 0, combatants: [] },
    travel: { activeJourney: null, log: [], rations: 10, partySize: 4, gold: 0 },
    towns: {},
    mapPins: [],
    npcOverrides: {},
    customNpcs: [],
    customMonsters: [],
    tv: { lastRoomCode: '', hiddenCombatantIds: [], partyLocation: '', sceneId: 'auto', youtubeId: '', mediaVisible: false, slotView: 'scene', idleFull: false, poke: { seq: 0, target: 'party', kind: 'wave' } },
    seq: 1,
  };
}


// Module chapters with DM-facing milestones (editable checkmarks).
export function defaultChapters(): Chapter[] {
  const c = (id: number, label: string, levels: string, ms: string[]): Chapter =>
    ({ id, label, levels, done: false, milestones: ms.map((label) => ({ label, done: false })) });
  return [
    // Ch1's two named beats (Cold-Hearted Killer, Nature Spirits) are linked to
    // their quests by name in normalize() — their labels equal the quest names.
    c(1, 'Ten-Towns', '1–4', [
      'Party arrives in Icewind Dale',
      'Cold-Hearted Killer',
      'Nature Spirits',
    ]),
    c(2, 'Icewind Dale', '4–6', [
      'A Ten-Towns crisis draws the party into the wilds',
      'Duergar plot uncovered',
      'Key wilderness site explored (Cairn / Lonelywood / Sea of Moving Ice…)',
    ]),
    c(3, 'Sunblight', '5–6', [
      'Party learns the fortress location',
      'Xardorok Sunblight confronted',
      'The chardalyn dragon is unleashed',
    ]),
    c(4, 'Destruction\u2019s Light', '6–7', [
      'The dragon\u2019s rampage across Ten-Towns',
      'The dragon is destroyed',
      'The Dale reckons with the aftermath',
    ]),
    c(5, 'Auril\u2019s Abode', '7–8', [
      'The party reaches the Island of Solstice',
      'Grimskalle\u2019s tests passed',
      'Auril confronted (or evaded)',
    ]),
    c(6, 'Caves of Hunger', '8–9', [
      'Descent beneath the glacier',
      'The caves crossed alive',
    ]),
    c(7, 'Doom of Ythryn', '9–12', [
      'The Necropolis entered',
      'The Rite of the Arcane Octad unraveled',
      'The mythallar\u2019s fate decided — the endless winter ends?',
    ]),
  ];
}

// Weighted random pool for the weather roll.
export const WEATHER_POOL: WeatherId[] = [
  'clear', 'clear',
  'overcast', 'overcast', 'overcast',
  'light_snow', 'light_snow', 'light_snow', 'light_snow',
  'heavy_snow', 'heavy_snow', 'heavy_snow',
  'blizzard', 'blizzard',
  'aurils_wrath',
];
