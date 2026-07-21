// ============================================================
// PROP CATALOG (Wave 10, Part H) — repo content, no backend.
// Decorative objects the DM (and, next brief, players) can place
// in a scene, sourced from the existing tilesets in
// src/assets/tiles/{caves,mana,tiny}. The pattern is ENC_TABLES:
// a typed static list, not a database.
//
// Each entry names a tileset (by id, from tv/tiles.ts TILESETS),
// the TOP-LEFT cell of a w×h block on that sheet, and a footprint
// in cells (reusing the Wave 5 obstacle concept so a placed prop
// blocks the drift plane like the tiled scenery already does). All
// cells here are lifted from the Wave 6 tile-scene author's own
// measured stamps — every one renders clean.
//
// A `glyph` is the emoji the prop falls back to if its tileset
// ever fails to load, and is what a text-only surface (a future
// list view) can show.
// ============================================================

import { tilesetById, Tileset } from '../tv/tiles';

export type PropCategory = 'furniture' | 'container' | 'plant' | 'light' | 'decor';

export interface PropDef {
  id: string;
  label: string;
  category: PropCategory;
  /** tileset id from tv/tiles.ts TILESETS */
  tileset: string;
  /** top-left cell of the block on that sheet */
  col: number;
  row: number;
  /** block size in cells (the footprint) */
  w: number;
  h: number;
  /** emoji fallback / list glyph */
  glyph: string;
}

export const PROP_CATEGORIES: { id: PropCategory; label: string }[] = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'container', label: 'Containers' },
  { id: 'plant', label: 'Plants' },
  { id: 'light', label: 'Lights' },
  { id: 'decor', label: 'Decor' },
];

// Cells verified against tv/tiles.ts (the winter/timber/cozy/caves stamps used
// to compose the shipped scenes). Nothing guessed.
export const PROP_CATALOG: PropDef[] = [
  // --- furniture -------------------------------------------------------------
  { id: 'table',        label: 'Market table', category: 'furniture', tileset: 'mana_cozy',   col: 2,  row: 0,  w: 3, h: 2, glyph: '🪵' },
  { id: 'crate',        label: 'Crate',        category: 'furniture', tileset: 'mana_cozy',   col: 6,  row: 2,  w: 1, h: 1, glyph: '📦' },
  { id: 'chest',        label: 'Chest',        category: 'furniture', tileset: 'mana_cozy',   col: 7,  row: 2,  w: 1, h: 1, glyph: '🧰' },
  { id: 'well',         label: 'Stone well',   category: 'furniture', tileset: 'mana_winter', col: 2,  row: 10, w: 2, h: 2, glyph: '🕳' },
  // --- containers ------------------------------------------------------------
  { id: 'barrels',      label: 'Barrel pile',  category: 'container', tileset: 'mana_cozy',   col: 1,  row: 3,  w: 2, h: 2, glyph: '🛢' },
  { id: 'sacks',        label: 'Grain sacks',  category: 'container', tileset: 'mana_cozy',   col: 3,  row: 3,  w: 2, h: 2, glyph: '💰' },
  { id: 'jug',          label: 'Clay jug',     category: 'container', tileset: 'mana_cozy',   col: 0,  row: 3,  w: 1, h: 1, glyph: '🏺' },
  // --- plants ----------------------------------------------------------------
  { id: 'bush',         label: 'Snowy bush',   category: 'plant',     tileset: 'mana_winter', col: 1,  row: 8,  w: 1, h: 1, glyph: '🌿' },
  { id: 'boulder',      label: 'Snow boulder', category: 'plant',     tileset: 'mana_winter', col: 4,  row: 8,  w: 1, h: 2, glyph: '🪨' },
  // --- lights ----------------------------------------------------------------
  { id: 'campfire',     label: 'Campfire',     category: 'light',     tileset: 'tiny_fire',   col: 0,  row: 0,  w: 1, h: 1, glyph: '🔥' },
  // --- decor (caves) ---------------------------------------------------------
  { id: 'crystal_blue', label: 'Blue crystals',  category: 'decor',   tileset: 'caves_deco',  col: 2,  row: 38, w: 2, h: 2, glyph: '🔷' },
  { id: 'crystal_green',label: 'Green crystals', category: 'decor',   tileset: 'caves_deco',  col: 12, row: 38, w: 2, h: 2, glyph: '💚' },
  { id: 'rubble',       label: 'Rubble',         category: 'decor',   tileset: 'caves_deco',  col: 0,  row: 46, w: 3, h: 2, glyph: '🪨' },
];

const BY_ID = new Map(PROP_CATALOG.map((p) => [p.id, p]));

/** Catalog lookup — also the discriminator that tells a placed catalog prop
 *  apart from a granted item on the wire: a projected inventory entry whose
 *  `emoji` resolves here is a prop, not something the party carries. */
export function propById(id?: string): PropDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** One tile cell's CSS background — mirrors tv/tiles.ts tileBgStyle so the
 *  stage and the DM picker draw props identically. */
export function propCellStyle(ts: Tileset, cell: number): Record<string, string> {
  return {
    backgroundImage: `url(${ts.src})`,
    backgroundPosition: `${-(cell % ts.cols) * 16}px ${-Math.floor(cell / ts.cols) * 16}px`,
    width: '16px', height: '16px',
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };
}

export interface PropCell { dx: number; dy: number; cell: number }

/** The tile cells that make up a prop, top-left origin. */
export function propCells(def: PropDef): { tileset: Tileset; cells: PropCell[] } | null {
  const ts = tilesetById(def.tileset);
  if (!ts) return null;
  const cells: PropCell[] = [];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      cells.push({ dx, dy, cell: (def.row + dy) * ts.cols + (def.col + dx) });
    }
  }
  return { tileset: ts, cells };
}
