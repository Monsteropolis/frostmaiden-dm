// ============================================================
// TILED SCENES (Wave 6) — the stage becomes a composed place.
// A TileScene is pure data: a 24×14 grid of 16px tiles over the
// 384×224 canvas. Ground layers draw behind everything; object
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
// No sheet used here has a dimension divisible by 28 (the
// corruption tripwire) — all clean.
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

const W = 24, H = 14;                       // 384×224 at 16px
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
  stamp(ground, 16, 1, 0, 3, 3, 11, 8);
  // scattered twigs/debris on the snow
  const decal = blank();
  decal[9 * W + 4] = w(0, 6); decal[7 * W + 19] = w(1, 6); decal[12 * W + 9] = w(2, 7);
  decal[11 * W + 16] = w(0, 7); decal[8 * W + 2] = w(0, 8); decal[12 * W + 20] = w(1, 9);
  decal[7 * W + 22] = w(4, 7);              // snowball pair at the right edge

  // objects — every column-run anchors at its base row and y-sorts with actors
  const trees = blank();
  stamp(trees, 16, 11, 0, 5, 7, -1, 0);     // treeline left (edge-clipped)
  stamp(trees, 16, 11, 0, 5, 7, 5, -1);     // tall center-back tree
  stamp(trees, 16, 11, 0, 5, 7, 15, 0);     // right tree
  stamp(trees, 16, 11, 0, 5, 7, 20, -2);    // far-right tree, mostly canopy

  const camp = blank();
  stamp(camp, 16, 3, 14, 2, 2, 4, 7);       // snow-shelter mound, mid-left
  stamp(camp, 16, 1, 8, 2, 1, 6, 6);        // snowy bush row by the shelter
  stamp(camp, 16, 4, 8, 1, 2, 2, 10);       // snow boulder front-left

  const fire = blank();
  fire[9 * W + 12] = 0;                     // the campfire (tiny_fire, single tile)

  const cozy = at(15);                      // mana_cozy props
  const props = blank();
  stamp(props, 15, 1, 3, 2, 2, 18, 8);      // barrel pile
  stamp(props, 15, 3, 3, 2, 2, 20, 9);      // grain sack
  props[9 * W + 17] = cozy(0, 3);           // jug by the barrels
  props[12 * W + 16] = cozy(0, 4);          // second jug, nearer

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
    const x = 10 + Math.floor(seeded(500 + y * 13) * 2);
    if (seeded(y * 71) < 0.75) street[y * W + x] = trod[Math.floor(seeded(600 + y * 17) * trod.length)];
  }
  for (let x = 13; x <= 18; x += 2) street[8 * W + x] = trod[Math.floor(seeded(700 + x * 23) * trod.length)];

  const timber = at(16);
  const buildings = blank();
  // building A (left, deep): the full 6×6 timber house — roof, gabled window,
  // door at its right side. Base row 5 — actors never get behind this one.
  stamp(buildings, 16, 8, 2, 6, 6, 2, 0);
  // building B (right, nearer): same kit shifted down — base row 7, so the
  // street runs BEHIND it. This is the depth-sort proof on screen.
  stamp(buildings, 16, 8, 2, 6, 6, 16, 2);
  // chimney on A
  stamp(buildings, 16, 1, 0, 3, 3, 2, -1);

  const fences = blank();
  stamp(fences, 16, 12, 0, 4, 1, 4, 9);     // fence run left of the path, near
  stamp(fences, 16, 12, 0, 3, 1, 13, 6);    // short fence by the branch path
  fences[10 * W + 3] = timber(15, 2);       // post

  const winter = blank();
  stamp(winter, 16, 11, 0, 5, 7, 9, -3);    // one snowy tree towering mid-back
  winter[6 * W + 1] = w(1, 8);              // bush against building A
  stamp(winter, 16, 4, 8, 1, 2, 21, 11);    // snow boulder near the front

  const cozy = at(15);
  const goods = blank();
  stamp(goods, 15, 1, 3, 2, 2, 13, 10);     // barrels where the carts unload
  goods[11 * W + 20] = cozy(0, 3);          // jug by building B's door
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
  stamp(ground, 102, 11, 18, 1, 4, 23, 0);
  // the way out: an arched doorway punched through the wall, right of center
  stamp(ground, 102, 14, 19, 6, 5, 15, -1);

  const d = at(26);                          // caves_deco
  const rocks = blank();
  // spires melt into black at their bases, so they only stand where the base
  // rows land on the wall's darkness — columns against the ceiling shadow
  stamp(rocks, 26, 14, 16, 6, 8, -2, -4);    // huge black spire looming at left
  stamp(rocks, 26, 8, 18, 4, 6, 8, -2);      // twin spire against the back wall
  stamp(rocks, 26, 4, 21, 2, 3, 21, 1);      // small spire right of the door

  const glitter = blank();
  stamp(glitter, 26, 2, 38, 2, 2, 12, 7);    // blue crystal cluster
  glitter[10 * W + 6] = d(1, 37);            // lone blue shard
  stamp(glitter, 26, 12, 38, 2, 2, 18, 9);   // green crystal cluster
  glitter[12 * W + 10] = d(11, 41);          // green shard near the front
  glitter[6 * W + 3] = d(1, 37);             // shard glinting under the spire

  const rubble = blank();                    // ground decals — no sorting needed
  stamp(rubble, 26, 0, 46, 3, 2, 5, 6);
  stamp(rubble, 26, 10, 46, 3, 2, 16, 11);
  stamp(rubble, 26, 0, 46, 3, 2, 9, 10);
  rubble[8 * W + 2] = d(1, 50); rubble[11 * W + 14] = d(4, 51); rubble[6 * W + 12] = d(1, 50);

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

export const TILE_SCENES: TileScene[] = [
  buildCampWinter(),
  buildTownTentowns(),
  buildCaveDark(),
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
