// ============================================================
// TILED SCENES (Wave 6) — the stage becomes a composed place.
// A TileScene is pure data: a 28×14 grid of 16px tiles over the
// 448×224 canvas (Wave 9 C2 widened it from 24×14 / 384 — every
// scene re-composed to fill the extra four columns).
// Ground layers draw behind everything; object
// layers y-sort with the actors through the same depthZ() the
// ground plane already uses (realm-stage owns that math — this
// module only describes grids).
//
// Tile sizes MEASURED from the packs (Wave 6 intake):
//   Mana Seed RPG Starter Pack … 16px (winter/timber/furnishings)
//   RPGW_Caves_v2.1 …………………… 16px (walls are multi-tile composites)
//   Tiny Swords ………………………… 64px — wrong scale for this stage;
//     only a 16×16 campfire flame rides along (tiles/tiny/fire.png,
//     an exact-pixel crop of the app's own camp.png fire).
// No sheet used here has BOTH dimensions divisible by 28 (the
// corruption tripwire, as corrected in Wave 9 — the ×0.875 rescale
// family has both, one alone is a legitimate native size) — clean.
//
// One deliberate extension over the Wave 6 brief's sketch:
// TileLayer.tileset can override the scene default, because a
// composed place needs ground from one sheet and furniture from
// another, and repacking sheets into one PNG risks exactly the
// art corruption the tripwire exists to catch. Originals stay
// byte-identical under src/assets/tiles/<pack>/.
// ============================================================

import manaWinterUrl from '../assets/tiles/mana/winter.png';
import manaTimberUrl from '../assets/tiles/mana/timber.png';
import manaCozyUrl from '../assets/tiles/mana/furnishings.png';
import tinyFireUrl from '../assets/tiles/tiny/fire.png';
import cavesMainUrl from '../assets/tiles/caves/main.png';
import cavesDecoUrl from '../assets/tiles/caves/decorative.png';

export interface Tileset { id: string; src: string; tile: number; cols: number }

export interface TileLayer {
  /** ground draws behind all actors; object y-sorts with them */
  kind: 'ground' | 'object';
  /** row-major, length = gridW * gridH; null = empty */
  tiles: (number | null)[];
  /** per-layer tileset override (scene default when absent) */
  tileset?: string;
}

export interface TileScene {
  id: string;
  label: string;
  tileset: string;
  gridW: number;
  gridH: number;
  layers: TileLayer[];
  /** optional walkable-band override, in bottom-% of the 224px canvas */
  ground?: { top: number; bottom: number };
}

export const TILESETS: Tileset[] = [
  { id: 'mana_winter', src: manaWinterUrl, tile: 16, cols: 16 },   // 256×256
  { id: 'mana_timber', src: manaTimberUrl, tile: 16, cols: 16 },   // 256×128
  { id: 'mana_cozy',   src: manaCozyUrl,   tile: 16, cols: 15 },   // 240×80
  { id: 'tiny_fire',   src: tinyFireUrl,   tile: 16, cols: 1 },    // 16×16
  { id: 'caves_main',  src: cavesMainUrl,  tile: 16, cols: 102 },  // 1632×1536
  { id: 'caves_deco',  src: cavesDecoUrl,  tile: 16, cols: 26 },   // 416×960
];

const TS_BY_ID = new Map(TILESETS.map((t) => [t.id, t]));
export function tilesetById(id: string): Tileset | undefined {
  return TS_BY_ID.get(id);
}

// --- authoring helpers -------------------------------------------------------

const W = 28, H = 14;                       // 448×224 at 16px (Wave 9: was 24)
const blank = (): (number | null)[] => new Array<number | null>(W * H).fill(null);

/** tileset (col,row) → flat index */
const at = (cols: number) => (c: number, r: number) => r * cols + c;

/** Stamp a w×h block of consecutive tileset cells into a layer at (dx,dy).
 *  Cells falling outside the grid are dropped (lets composites hug an edge). */
function stamp(
  tiles: (number | null)[], cols: number,
  sc: number, sr: number, w: number, h: number, dx: number, dy: number,
): void {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = dx + x, gy = dy + y;
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
    tiles[gy * W + gx] = (sr + y) * cols + (sc + x);
  }
}

/** Deterministic scatter — same mulberry idiom the stage uses for poses. */
function seeded(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Fill every cell from a weighted variant list, seeded per cell. */
function fillGround(tiles: (number | null)[], variants: number[], seed: number): void {
  for (let i = 0; i < W * H; i++) {
    tiles[i] = variants[Math.floor(seeded(seed + i * 7) * variants.length)];
  }
}

const pct = (px: number) => (px / 224) * 100;
/** Feet resting on grid row r sit at the row's bottom edge. */
const rowBottomPx = (r: number) => (H - 1 - r) * 16;

// --- camp_winter — the default home scene -------------------------------------
// A snowy clearing: treeline across the back, an igloo shelter, the fire on a
// trampled dirt patch, supplies stacked to the right.

function buildCampWinter(): TileScene {
  const w = at(16);                          // mana_winter (16 cols)
  const ground = blank();
  // snow, mostly plain — the wisp variants stay rare so the field reads calm
  fillGround(ground, [
    w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1),
    w(0, 1), w(0, 1), w(0, 2), w(0, 3), w(0, 4), w(0, 5),
  ], 11);
  // trampled ground around the fire (the winter set's dark-earth blob)
  stamp(ground, 16, 1, 0, 3, 3, 12, 8);
  // scattered twigs/debris on the snow
  const decal = blank();
  decal[9 * W + 4] = w(0, 6); decal[7 * W + 22] = w(1, 6); decal[12 * W + 9] = w(2, 7);
  decal[11 * W + 18] = w(0, 7); decal[8 * W + 2] = w(0, 8); decal[12 * W + 24] = w(1, 9);
  decal[7 * W + 26] = w(4, 7);              // snowball pair at the right edge

  // objects — every column-run anchors at its base row and y-sorts with actors
  const trees = blank();
  stamp(trees, 16, 11, 0, 5, 7, -1, 0);     // treeline left (edge-clipped)
  stamp(trees, 16, 11, 0, 5, 7, 6, -1);     // tall center-back tree
  stamp(trees, 16, 11, 0, 5, 7, 17, 0);     // right tree
  stamp(trees, 16, 11, 0, 5, 7, 24, -2);    // far-right tree, mostly canopy

  const camp = blank();
  stamp(camp, 16, 3, 14, 2, 2, 4, 7);       // snow-shelter mound, mid-left
  stamp(camp, 16, 1, 8, 2, 1, 6, 6);        // snowy bush row by the shelter
  stamp(camp, 16, 4, 8, 1, 2, 2, 10);       // snow boulder front-left

  const fire = blank();
  fire[9 * W + 13] = 0;                     // the campfire (tiny_fire, single tile)

  const cozy = at(15);                      // mana_cozy props
  const props = blank();
  stamp(props, 15, 1, 3, 2, 2, 21, 8);      // barrel pile
  stamp(props, 15, 3, 3, 2, 2, 23, 9);      // grain sack
  props[9 * W + 20] = cozy(0, 3);           // jug by the barrels
  props[12 * W + 19] = cozy(0, 4);          // second jug, nearer

  return {
    id: 'camp_winter', label: 'Winter camp', tileset: 'mana_winter',
    gridW: W, gridH: H,
    layers: [
      { kind: 'ground', tiles: ground },
      { kind: 'ground', tiles: decal },
      { kind: 'object', tiles: trees },
      { kind: 'object', tiles: camp },
      { kind: 'object', tiles: fire, tileset: 'tiny_fire' },
      { kind: 'object', tiles: props, tileset: 'mana_cozy' },
    ],
    // walkable: from just under the treeline bases to the near edge
    ground: { top: pct(rowBottomPx(6) + 6), bottom: pct(4) },
  };
}

// --- town_tentowns — a Ten-Towns street ---------------------------------------
// Two timber buildings at different depths (the whole point: you can walk
// behind one and in front of the other), a packed-dirt street running off the
// bottom of the screen, fences and stacked goods filling the street out.

function buildTownTentowns(): TileScene {
  const w = at(16);
  const ground = blank();
  fillGround(ground, [
    w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1),
    w(0, 2), w(0, 4), w(0, 5),
  ], 29);
  // the street runs from building A's door off the bottom of the screen and
  // branches toward B — implied by trodden debris, framed by the fences
  const trod = [w(0, 6), w(1, 6), w(2, 6), w(3, 6), w(0, 7), w(2, 7)];
  const street = blank();
  for (let y = 6; y < H; y += 1) {
    const x = 12 + Math.floor(seeded(500 + y * 13) * 2);
    if (seeded(y * 71) < 0.75) street[y * W + x] = trod[Math.floor(seeded(600 + y * 17) * trod.length)];
  }
  for (let x = 15; x <= 22; x += 2) street[8 * W + x] = trod[Math.floor(seeded(700 + x * 23) * trod.length)];

  const timber = at(16);
  const buildings = blank();
  // Wave 7 (QA #11): the old 6×6 block off (8,2) had a HOLE at the roof ridge —
  // the apex tile lives in the LEFT gable house, not that block, so the roof read
  // as truncated. Both buildings now stamp the complete 4×6 gable house at (4,2),
  // whose peaked roof (ridge cap and all) renders whole; the only transparent
  // pixels are the sky triangles beside the eaves, which correctly show the scene.
  // A stays deep (base row 5), B nearer (base row 7) — the street still runs
  // BEHIND B, which is the depth-sort proof on screen.
  stamp(buildings, 16, 4, 2, 4, 6, 2, 0);    // building A (left, deep)
  stamp(buildings, 16, 4, 2, 4, 6, 20, 2);   // building B (right, nearer)

  const fences = blank();
  stamp(fences, 16, 12, 0, 4, 1, 4, 9);     // fence run left of the path, near
  stamp(fences, 16, 12, 0, 3, 1, 15, 6);    // short fence by the branch path
  fences[10 * W + 3] = timber(15, 2);       // post

  const winter = blank();
  stamp(winter, 16, 11, 0, 5, 7, 11, -3);   // one snowy tree towering mid-back
  winter[6 * W + 1] = w(1, 8);              // bush against building A
  stamp(winter, 16, 4, 8, 1, 2, 25, 11);    // snow boulder near the front

  const cozy = at(15);
  const goods = blank();
  stamp(goods, 15, 1, 3, 2, 2, 15, 10);     // barrels where the carts unload
  goods[11 * W + 24] = cozy(0, 3);          // jug by building B's door
  stamp(goods, 15, 3, 3, 2, 2, 5, 11);      // sacks by the near fence

  return {
    id: 'town_tentowns', label: 'Ten-Towns street', tileset: 'mana_winter',
    gridW: W, gridH: H,
    layers: [
      { kind: 'ground', tiles: ground },
      { kind: 'ground', tiles: street },
      { kind: 'object', tiles: buildings, tileset: 'mana_timber' },
      { kind: 'object', tiles: winter },
      { kind: 'object', tiles: fences, tileset: 'mana_timber' },
      { kind: 'object', tiles: goods, tileset: 'mana_cozy' },
    ],
    // the plaza is deep — walk right up to the doors
    ground: { top: pct(rowBottomPx(6) + 10), bottom: pct(4) },
  };
}

// --- cave_dark — RPGW caves ----------------------------------------------------
// Black rock overhead, lit rims where the torchlight catches, a floor of
// worn stone. Spires and crystals give the dark something to glitter with.

function buildCaveDark(): TileScene {
  const m = at(102);                         // caves_main
  const ground = blank();
  // floor: uniform worn-stone tiles from the dark interior of floor square 1
  fillGround(ground, [m(2, 56), m(4, 56), m(6, 56), m(2, 57), m(5, 57), m(4, 58), m(5, 55)], 43);
  // the north wall: black mass with a lit rocky rim. Outer edges kept at the
  // screen edges, interior filled from the slab's middle columns so the two
  // stamps don't show a seam. (The slab's own base row carried the source's
  // grass tufts — stopping at row 21 keeps the rim, loses the grass.)
  stamp(ground, 102, 0, 18, 12, 4, 0, 0);
  stamp(ground, 102, 1, 18, 11, 4, 12, 0);
  stamp(ground, 102, 1, 18, 4, 4, 23, 0);    // Wave 9: four more interior columns
  stamp(ground, 102, 11, 18, 1, 4, 27, 0);
  // the way out: an arched doorway punched through the wall, right of center
  stamp(ground, 102, 14, 19, 6, 5, 17, -1);

  const d = at(26);                          // caves_deco
  const rocks = blank();
  // spires melt into black at their bases, so they only stand where the base
  // rows land on the wall's darkness — columns against the ceiling shadow
  stamp(rocks, 26, 14, 16, 6, 8, -2, -4);    // huge black spire looming at left
  stamp(rocks, 26, 8, 18, 4, 6, 8, -2);      // twin spire against the back wall
  stamp(rocks, 26, 4, 21, 2, 3, 24, 1);      // small spire right of the door

  const glitter = blank();
  stamp(glitter, 26, 2, 38, 2, 2, 13, 7);    // blue crystal cluster
  glitter[10 * W + 6] = d(1, 37);            // lone blue shard
  stamp(glitter, 26, 12, 38, 2, 2, 21, 9);   // green crystal cluster
  glitter[12 * W + 11] = d(11, 41);          // green shard near the front
  glitter[6 * W + 3] = d(1, 37);             // shard glinting under the spire

  const rubble = blank();                    // ground decals — no sorting needed
  stamp(rubble, 26, 0, 46, 3, 2, 5, 6);
  stamp(rubble, 26, 10, 46, 3, 2, 19, 11);
  stamp(rubble, 26, 0, 46, 3, 2, 10, 10);
  rubble[8 * W + 2] = d(1, 50); rubble[11 * W + 16] = d(4, 51); rubble[6 * W + 13] = d(1, 50);

  return {
    id: 'cave_dark', label: 'Dark cave', tileset: 'caves_main',
    gridW: W, gridH: H,
    layers: [
      { kind: 'ground', tiles: ground },
      { kind: 'ground', tiles: rubble, tileset: 'caves_deco' },
      { kind: 'object', tiles: rocks, tileset: 'caves_deco' },
      { kind: 'object', tiles: glitter, tileset: 'caves_deco' },
    ],
    // walkable: below the wall's lit rim down to the near edge
    ground: { top: pct(rowBottomPx(5)), bottom: pct(4) },
  };
}

// --- town_market (Wave 7) — a Ten-Towns market square -------------------------
// Snow underfoot with a trodden lane; a gable shop at the back, two stall awnings
// at different depths with goods heaped beneath, a low stone well, a snowy tree.
function buildTownMarket(): TileScene {
  const w = at(16);
  const ground = blank();
  fillGround(ground, [
    w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 1), w(0, 2), w(0, 4),
  ], 37);
  // a trodden market lane down the middle, framed by the stalls
  const trod = [w(0, 6), w(1, 6), w(2, 6), w(3, 6), w(0, 7), w(2, 7)];
  const lane = blank();
  for (let y = 5; y < H; y++) {
    for (let x = 11; x <= 16; x++) {
      if (seeded(300 + x * 7 + y * 13) < 0.5) lane[y * W + x] = trod[Math.floor(seeded(x * 3 + y * 5) * trod.length)];
    }
  }

  const buildings = blank();
  stamp(buildings, 16, 4, 2, 4, 6, 1, 0);     // gable shop, deep back-left

  // stall awnings — a horizontal roof strip on the timber kit, two depths
  const stalls = blank();
  stamp(stalls, 16, 7, 4, 3, 1, 6, 6);        // awning A (deeper)
  stamp(stalls, 16, 7, 4, 3, 1, 19, 8);       // awning B (nearer)

  const winter = blank();
  stamp(winter, 16, 11, 0, 5, 7, 22, -2);     // snowy tree towering back-right
  stamp(winter, 16, 4, 8, 1, 2, 3, 11);       // snow boulder front-left

  // the well — a low snow-capped stone ring (winter stone-wall tiles)
  const well = blank();
  stamp(well, 16, 2, 10, 2, 1, 13, 6);        // capped top
  stamp(well, 16, 2, 11, 2, 1, 13, 7);        // stone body

  const cozy = at(15);
  const goods = blank();
  stamp(goods, 15, 2, 0, 3, 2, 5, 7);         // market table under awning A
  stamp(goods, 15, 1, 3, 2, 2, 19, 9);        // barrels under awning B
  stamp(goods, 15, 3, 3, 2, 2, 6, 11);        // sacks near the front
  goods[9 * W + 24] = cozy(6, 2); goods[9 * W + 25] = cozy(7, 2);   // crate/chest, right
  goods[12 * W + 17] = cozy(0, 3);            // a jug spilled on the lane

  return {
    id: 'town_market', label: 'Market square', tileset: 'mana_winter',
    gridW: W, gridH: H,
    layers: [
      { kind: 'ground', tiles: ground },
      { kind: 'ground', tiles: lane },
      { kind: 'object', tiles: buildings, tileset: 'mana_timber' },
      { kind: 'object', tiles: winter },
      { kind: 'object', tiles: stalls, tileset: 'mana_timber' },
      { kind: 'object', tiles: well },
      { kind: 'object', tiles: goods, tileset: 'mana_cozy' },
    ],
    ground: { top: pct(rowBottomPx(6) + 8), bottom: pct(4) },
  };
}

// --- frozen_lake (Wave 7) — the ice out past the shore -------------------------
// Snowy bank across the back, a wide pale-ice expanse with teal cracked patches,
// dead reeds at the waterline, a boulder and an ice-rock cairn out on the ice.
function buildFrozenLake(): TileScene {
  const w = at(16);
  const ground = blank();
  // the frozen surface: mostly pale grey ice, a few teal cracked-open patches
  fillGround(ground, [
    w(11, 15), w(11, 15), w(11, 15), w(11, 15), w(11, 15), w(12, 15), w(11, 15), w(12, 13),
  ], 71);
  // snowy shore across the back three rows
  for (let y = 0; y < 3; y++) for (let x = 0; x < W; x++) ground[y * W + x] = w(0, 1);

  // cracked-ice decals scattered mid-lake
  const cracks = blank();
  cracks[7 * W + 6] = w(12, 13); cracks[9 * W + 17] = w(13, 13);
  cracks[8 * W + 22] = w(12, 14); cracks[11 * W + 12] = w(13, 14);
  cracks[10 * W + 3] = w(12, 13); cracks[10 * W + 25] = w(12, 14);

  // shore life — a dead tree back-left and reeds along the waterline
  const shore = blank();
  stamp(shore, 16, 11, 0, 5, 7, 1, -2);       // snowy dead tree
  shore[3 * W + 8] = w(0, 8); shore[3 * W + 9] = w(0, 9);
  shore[3 * W + 18] = w(0, 9); shore[3 * W + 19] = w(0, 8);
  shore[3 * W + 25] = w(0, 8);

  const rocks = blank();
  stamp(rocks, 16, 4, 8, 1, 2, 6, 10);        // snow boulder on the ice
  stamp(rocks, 16, 1, 12, 2, 3, 24, 9);       // ice-rock cairn, near-right

  return {
    id: 'frozen_lake', label: 'Frozen lake', tileset: 'mana_winter',
    gridW: W, gridH: H,
    layers: [
      { kind: 'ground', tiles: ground },
      { kind: 'ground', tiles: cracks },
      { kind: 'object', tiles: shore },
      { kind: 'object', tiles: rocks },
    ],
    // walkable: from just past the reedy bank out to the near ice
    ground: { top: pct(rowBottomPx(4) + 4), bottom: pct(3) },
  };
}

// --- cave_deep (Wave 7) — a pillared hall over a chasm ------------------------
// The RPGW cave interior again, composed as a deeper place: a colonnade of stone
// spires marching back, rubble underfoot, and a black chasm cutting across the
// mid-floor (null ground cells = the void showing through).
function buildCaveDeep(): TileScene {
  const m = at(102);                          // caves_main
  const ground = blank();
  fillGround(ground, [m(2, 56), m(4, 56), m(6, 56), m(2, 57), m(5, 57), m(4, 58), m(5, 55)], 59);
  // the north wall (same black mass with a lit rim as cave_dark)
  stamp(ground, 102, 0, 18, 12, 4, 0, 0);
  stamp(ground, 102, 1, 18, 11, 4, 12, 0);
  stamp(ground, 102, 1, 18, 4, 4, 23, 0);     // Wave 9: four more interior columns
  stamp(ground, 102, 11, 18, 1, 4, 27, 0);
  // the chasm: a band of floor simply removed — the dark canvas beneath reads as
  // a drop. Kept to the mid-depth so actors mill on the near lip.
  for (let x = 5; x <= 22; x++) { ground[8 * W + x] = null; ground[9 * W + x] = null; }

  const d = at(26);                           // caves_deco
  const pillars = blank();
  // a colonnade — spires standing where their bases land on solid floor
  stamp(pillars, 26, 8, 18, 4, 6, 3, 0);      // back-left column
  stamp(pillars, 26, 8, 18, 4, 6, 21, 0);     // back-right column
  stamp(pillars, 26, 4, 21, 2, 3, 9, 5);      // near-left short pillar (lip of chasm)
  stamp(pillars, 26, 4, 21, 2, 3, 18, 5);     // near-right short pillar

  const glitter = blank();
  stamp(glitter, 26, 2, 38, 2, 2, 2, 11);     // blue crystal cluster, front-left
  stamp(glitter, 26, 12, 38, 2, 2, 24, 11);   // green crystal cluster, front-right
  glitter[10 * W + 14] = d(1, 37);            // lone shard on the near lip

  const rubble = blank();                     // ground decals along the chasm lip
  stamp(rubble, 26, 0, 46, 3, 2, 6, 10);
  stamp(rubble, 26, 10, 46, 3, 2, 18, 10);
  rubble[11 * W + 4] = d(1, 50); rubble[12 * W + 22] = d(4, 51); rubble[7 * W + 13] = d(1, 50);

  return {
    id: 'cave_deep', label: 'Deep hall', tileset: 'caves_main',
    gridW: W, gridH: H,
    layers: [
      { kind: 'ground', tiles: ground },
      { kind: 'ground', tiles: rubble, tileset: 'caves_deco' },
      { kind: 'object', tiles: pillars, tileset: 'caves_deco' },
      { kind: 'object', tiles: glitter, tileset: 'caves_deco' },
    ],
    ground: { top: pct(rowBottomPx(5)), bottom: pct(3) },
  };
}

export const TILE_SCENES: TileScene[] = [
  buildCampWinter(),
  buildTownTentowns(),
  buildCaveDark(),
  buildTownMarket(),
  buildFrozenLake(),
  buildCaveDeep(),
];

const SCENE_BY_ID = new Map(TILE_SCENES.map((s) => [s.id, s]));
export function tileSceneById(id: string): TileScene | undefined {
  return SCENE_BY_ID.get(id);
}

// --- renderer prep -------------------------------------------------------------
// Object layers become column-runs: vertically contiguous tiles in one column
// are one thing (a tree, a wall of a house) anchored at its lowest row. The
// whole run takes that base row's depth, which is what lets a roof occlude a
// PC standing behind the building instead of slicing them at the eaves.

export interface TileRun {
  col: number;
  baseRow: number;
  /** tile indices from baseRow upward (index 0 = the base tile) */
  tiles: number[];
  tileset: Tileset;
}

export interface GroundCell { col: number; row: number; tile: number; tileset: Tileset }

export function groundCells(scene: TileScene): GroundCell[] {
  const out: GroundCell[] = [];
  for (const layer of scene.layers) {
    if (layer.kind !== 'ground') continue;
    const ts = tilesetById(layer.tileset ?? scene.tileset)!;
    layer.tiles.forEach((t, i) => {
      if (t !== null) out.push({ col: i % scene.gridW, row: Math.floor(i / scene.gridW), tile: t, tileset: ts });
    });
  }
  return out;
}

export function objectRuns(scene: TileScene): TileRun[] {
  const out: TileRun[] = [];
  for (const layer of scene.layers) {
    if (layer.kind !== 'object') continue;
    const ts = tilesetById(layer.tileset ?? scene.tileset)!;
    for (let c = 0; c < scene.gridW; c++) {
      let run: number[] | null = null;
      for (let r = scene.gridH - 1; r >= 0; r--) {
        const t = layer.tiles[r * scene.gridW + c];
        if (t !== null) {
          if (!run) { run = []; out.push({ col: c, baseRow: r, tiles: run, tileset: ts }); }
          run.push(t);
        } else run = null;
      }
    }
  }
  return out;
}
