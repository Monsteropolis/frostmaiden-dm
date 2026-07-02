// ============================================================
// State schema — versioned from day one.
// Bump SCHEMA_VERSION and add a step in migrations.ts whenever
// the shape changes. Never mutate old saves silently.
// ============================================================

export const SCHEMA_VERSION = 1;
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
}

export interface AllyAttack { name: string; bonus: number; damage: string; }

export interface Ally {
  id: string;
  name: string;
  emoji: string;
  kind: string;       // e.g. "Expert sidekick", "Wolf companion"
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  initMod: number;
  scores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  attacks: AllyAttack[];
  conditions: string[];
  location: string;
  notes: string;
}

export type CombatantSrc = 'pc' | 'ally' | 'monster' | 'custom' | 'api';

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

// --- Root state --------------------------------------------------------------

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
  sessions: unknown[];
  quests: unknown[];
  arcs: Arc[];
  encounterPresets: EncounterPreset[];
  combat: { active: boolean; round: number; turn: number; combatants: Combatant[] };
  travel: { activeJourney: unknown | null; log: unknown[] };
  towns: Record<string, TownStatus>;

  // NPC system — first-class from the start
  npcOverrides: Record<string, NpcOverride>;
  customNpcs: CustomNpc[];

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
    arcs: [],
    encounterPresets: [],
    combat: { active: false, round: 0, turn: 0, combatants: [] },
    travel: { activeJourney: null, log: [] },
    towns: {},
    npcOverrides: {},
    customNpcs: [],
    seq: 1,
  };
}
