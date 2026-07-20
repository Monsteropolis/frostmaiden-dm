// ============================================================
// TILE-SCENE THUMBNAILS — renders each TileScene to a 448×224 PNG
// for the DM scene picker, reusing the exact tile data in tiles.ts
// (so a thumbnail can never drift from what the stage draws). Run
// with `npm run thumbs` after editing a scene.
//
// The stage composites tiles in the browser; here we do the same
// blit on raw RGBA buffers with sharp: ground cells behind, then
// object runs painted back-to-front by base row (the same painter's
// order depthZ() gives them on the stage).
// ============================================================
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { TILE_SCENES, groundCells, objectRuns, type TileScene } from '../src/tv/tiles.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// tileset id → source PNG on disk (the bundled URL isn't a filesystem path)
const TS_FILE: Record<string, string> = {
  mana_winter: 'src/assets/tiles/mana/winter.png',
  mana_timber: 'src/assets/tiles/mana/timber.png',
  mana_cozy: 'src/assets/tiles/mana/furnishings.png',
  tiny_fire: 'src/assets/tiles/tiny/fire.png',
  caves_main: 'src/assets/tiles/caves/main.png',
  caves_deco: 'src/assets/tiles/caves/decorative.png',
};

const STAGE_W = 448, STAGE_H = 224, TILE = 16;   // Wave 9 C2: 448-wide canvas

interface Raw { data: Buffer; w: number; h: number }

async function loadRaw(path: string): Promise<Raw> {
  const { data, info } = await sharp(resolve(root, path))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** alpha-composite one 16×16 source tile onto the target at (dx,dy) */
function blit(dst: Raw, src: Raw, sx: number, sy: number, dx: number, dy: number): void {
  for (let y = 0; y < TILE; y++) {
    const ty = dy + y; if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < TILE; x++) {
      const tx = dx + x; if (tx < 0 || tx >= dst.w) continue;
      const si = ((sy + y) * src.w + (sx + x)) * 4;
      const a = src.data[si + 3]; if (a === 0) continue;
      const di = (ty * dst.w + tx) * 4;
      const ia = 255 - a;
      dst.data[di] = (src.data[si] * a + dst.data[di] * ia) / 255;
      dst.data[di + 1] = (src.data[si + 1] * a + dst.data[di + 1] * ia) / 255;
      dst.data[di + 2] = (src.data[si + 2] * a + dst.data[di + 2] * ia) / 255;
      dst.data[di + 3] = Math.min(255, a + (dst.data[di + 3] * ia) / 255);
    }
  }
}

async function render(scene: TileScene): Promise<void> {
  // opaque dark-sky backdrop, matching the app's --bg so voids read as dark
  const dst: Raw = { data: Buffer.alloc(STAGE_W * STAGE_H * 4), w: STAGE_W, h: STAGE_H };
  for (let i = 0; i < STAGE_W * STAGE_H; i++) {
    dst.data[i * 4] = 13; dst.data[i * 4 + 1] = 14; dst.data[i * 4 + 2] = 34; dst.data[i * 4 + 3] = 255;
  }
  const sheets = new Map<string, Raw>();
  const sheetFor = async (id: string) => {
    if (!sheets.has(id)) sheets.set(id, await loadRaw(TS_FILE[id]));
    return sheets.get(id)!;
  };

  for (const g of groundCells(scene)) {
    const src = await sheetFor(g.tileset.id);
    blit(dst, src, (g.tile % g.tileset.cols) * TILE, Math.floor(g.tile / g.tileset.cols) * TILE, g.col * TILE, g.row * TILE);
  }
  // object runs back-to-front by base row; the flat 384×216 art anchors bottom,
  // so a run's base row bottom-edge maps the same way the stage places it.
  const runs = objectRuns(scene).sort((a, b) => a.baseRow - b.baseRow);
  for (const run of runs) {
    const src = await sheetFor(run.tileset.id);
    run.tiles.forEach((t, j) => {
      const rowFromTop = run.baseRow - j;
      blit(dst, src, (t % run.tileset.cols) * TILE, Math.floor(t / run.tileset.cols) * TILE, run.col * TILE, rowFromTop * TILE);
    });
  }

  const out = resolve(root, `src/assets/tiles/thumbs/${scene.id}.png`);
  await sharp(dst.data, { raw: { width: STAGE_W, height: STAGE_H, channels: 4 } }).png().toFile(out);
  console.log(`  ✓ ${scene.id}.png`);
}

console.log('Rendering tile-scene thumbnails…');
for (const scene of TILE_SCENES) await render(scene);
console.log('Done.');
