// ============================================================
// THE MAP — calibration, gazetteer, and overland travel math.
//
// Calibration measured from the printed scale bar on the 1353×954
// export of icewind-dale-region: the 0→20-mile bar spans native
// x 870 → 1153 = 284 px  →  20/284 ≈ 0.0704 miles per pixel.
// (Verified by tracing the bar as a continuous dark run; the
// earlier 295px/0.0678 reading mistook the "miles" text for the
// end tick.)
//
// Town pins were read from 3× grid-labeled crops (dot centers,
// ±3 px). Validation: with MILES_PER_DAY_NORMAL = 5.71 (median of
// straight-line miles ÷ table days over all 14 TOWN_DISTANCES
// pairs), every pair reconstructs its table days within ±1.
// ============================================================

import mapUrl from '../assets/map/icewind-dale.webp';

export const MAP_URL = mapUrl;

export const MAP_CAL = {
  imgW: 1353,
  imgH: 954,
  milesPerPx: 20 / 284,   // ≈ 0.0704 — measured, see header
};

export interface MapPlace {
  id: string;
  name: string;
  x: number;              // native map px (1353×954 space)
  y: number;
  kind: 'town' | 'landmark' | 'custom';
}

export const MAP_PLACES: MapPlace[] = [
  // towns — the dot, not the label
  { id: 'bremen',        name: 'Bremen',         x: 375, y: 505, kind: 'town' },
  { id: 'targos',        name: 'Targos',         x: 396, y: 515, kind: 'town' },
  { id: 'bryn_shander',  name: 'Bryn Shander',   x: 438, y: 545, kind: 'town' },
  { id: 'lonelywood',    name: 'Lonelywood',     x: 466, y: 414, kind: 'town' },
  { id: 'termalaine',    name: 'Termalaine',     x: 496, y: 437, kind: 'town' },
  { id: 'caer_konig',    name: 'Caer-Konig',     x: 674, y: 443, kind: 'town' },
  { id: 'caer_dineval',  name: 'Caer-Dineval',   x: 639, y: 491, kind: 'town' },
  { id: 'easthaven',     name: 'Easthaven',      x: 631, y: 567, kind: 'town' },
  { id: 'good_mead',     name: 'Good Mead',      x: 530, y: 598, kind: 'town' },
  { id: 'dougans_hole',  name: "Dougan's Hole",  x: 477, y: 625, kind: 'town' },
  // landmarks — feature centers / sensible anchors
  { id: 'sea_of_moving_ice', name: 'Sea of Moving Ice', x: 230, y: 240, kind: 'landmark' },
  { id: 'kelvins_cairn',     name: "Kelvin's Cairn",    x: 605, y: 385, kind: 'landmark' },
  { id: 'reghed_glacier',    name: 'Reghed Glacier',    x: 1220, y: 200, kind: 'landmark' },
  { id: 'ten_trail_pass',    name: 'Spine of the World (Ten Trail pass)', x: 368, y: 700, kind: 'landmark' },
  { id: 'the_redrun',        name: 'The Redrun',        x: 262, y: 740, kind: 'landmark' },
  { id: 'maer_dualdon',      name: 'Maer Dualdon',      x: 462, y: 428, kind: 'landmark' },
  { id: 'lac_dinneshere',    name: 'Lac Dinneshere',    x: 688, y: 515, kind: 'landmark' },
  { id: 'redwaters',         name: 'Redwaters',         x: 540, y: 640, kind: 'landmark' },
  { id: 'shaengarne_river',  name: 'Shaengarne River',  x: 255, y: 535, kind: 'landmark' },
  { id: 'dwarven_valley',    name: 'Dwarven Valley',    x: 585, y: 445, kind: 'landmark' },
];

/** Median of straight-line miles ÷ TOWN_DISTANCES days across all 14 pairs. */
export const MILES_PER_DAY_NORMAL = 5.71;

export type Terrain = 'road' | 'tundra' | 'mountain' | 'sea_ice';
export const TERRAIN_MULT: Record<Terrain, number> = {
  road: 1.0, tundra: 1.5, mountain: 2.0, sea_ice: 1.5,
};
export const TERRAIN_LABEL: Record<Terrain, string> = {
  road: '🛤 Road', tundra: '❄ Tundra', mountain: '⛰ Mountain', sea_ice: '🧊 Sea ice',
};

export function pxDistanceMiles(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y) * MAP_CAL.milesPerPx;
}

/** Overland estimate: max(1, ceil(miles / MPD × terrain × pace)). */
export function legDays(miles: number, terrain: Terrain, paceMult: number): number {
  return Math.max(1, Math.ceil((miles / MILES_PER_DAY_NORMAL) * TERRAIN_MULT[terrain] * paceMult));
}
