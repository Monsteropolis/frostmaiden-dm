// ============================================================
// Seed data facade. rime-data.js is the carried-forward module
// content (NPCs, creatures, quests, towns…). This file gives it
// types so the rest of the app never touches untyped exports.
// ============================================================

// @ts-ignore — legacy JS module, typed here at the boundary
import * as raw from './rime-data.js';

export interface SeedNpc {
  id: string;
  name: string;
  emoji: string;
  role: string;
  town: string;
  location?: string;
  tags: string[];
  race?: string;
  alignment?: string;
  faction?: string;
  cr?: string;
  ac?: number;
  hp?: number;
  personality?: string;
  voice?: string;
  wants?: string;
  fears?: string;
  quests?: string[];
  secrets?: string[];
  appearance?: string;
  inventory?: { item: string; price: string; note: string }[];
  statblockRef?: string;
}

export interface SeedQuest {
  id?: string;
  name: string;
  chapter?: number | string | null;
  town?: string;
  trigger?: string;
  development?: string;
  mainHook?: boolean;
  linkedNpcs?: string;
  [k: string]: unknown;
}

export interface SeedTown {
  name: string;
  [k: string]: unknown;
}

export interface SeedCreature {
  id: string;
  name: string;
  [k: string]: unknown;
}

export const NPCS = raw.BUILTIN_NPCS as SeedNpc[];
export const CREATURES = raw.RIME_CREATURES as SeedCreature[];
export const ENC_TABLES = raw.ENC_TABLES as unknown[];
export const ENCOUNTERS = raw.RIME_ENCOUNTERS as unknown[];
export const TOWN_DISTANCES = raw.TOWN_DISTANCES as unknown[];
export const EQUIPMENT = raw.RIME_EQUIPMENT as unknown[];
export const MAGIC_ITEMS = raw.RIME_MAGIC_ITEMS as unknown[];
export const TOWNS = raw.TEN_TOWNS_INFO as SeedTown[];
export const MODULE_QUESTS = raw.FROSTMAIDEN_MODULE_QUESTS as SeedQuest[];
