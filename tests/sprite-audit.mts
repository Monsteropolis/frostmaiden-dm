// ============================================================
// SPRITE AUDIT (Wave 9 B2) — every descriptor in ACTOR_SPRITES
// checked against the actual pixels of its PNGs. The descriptor
// table claims to be "measured truth"; this test makes that claim
// falsifiable, forever:
//   1. sheet width ÷ frameW is exact — and equals the declared
//      frames (or the declared sheetW) with no remainder;
//   2. sheet height is frameH (× rows, where `row` is used);
//   3. contentH / footPad match the measured alpha bounding box
//      of idle frame 0 (footOffsetX likewise, ±1px);
//   4. no declared frame is entirely empty pixels.
// Plus the corrected corruption tripwire: the ×0.875 design-review
// rescale produced sheets with BOTH dimensions divisible by 28
// (56×56, 616×112, …). Both — one dimension alone is a legitimate
// native size (the 0x72 heroes are 16×28; the demon attack strip
// is 700×100). Any sheet matching the two-dimension family is
// poisoned and fails the audit.
//
// Run: npm run test:sprites   (wired into CI beside the seam tests)
// ============================================================
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ACTOR_SPRITES } from '../src/data/actor-sprites.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// vite-node serves assets as /src/... URLs; on disk that's the repo path
const diskPath = (url: string) => resolve(root, decodeURIComponent(url).replace(/^\//, ''));

interface Raw { data: Buffer; w: number; h: number }
const cache = new Map<string, Raw>();
async function loadRaw(url: string): Promise<Raw | null> {
  if (cache.has(url)) return cache.get(url)!;
  const p = diskPath(url);
  if (!existsSync(p)) return null;
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw = { data, w: info.width, h: info.height };
  cache.set(url, raw);
  return raw;
}

/** Alpha bounding box of one frame; null = the frame is entirely empty. */
function frameBBox(img: Raw, fx: number, fy: number, fw: number, fh: number) {
  let minX = fw, minY = fh, maxX = -1, maxY = -1;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const a = img.data[((fy + y) * img.w + (fx + x)) * 4 + 3];
      if (a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxY < 0 ? null : { minX, minY, maxX, maxY };
}

interface Finding { sprite: string; anim: string; problem: string }
const findings: Finding[] = [];
const flag = (sprite: string, anim: string, problem: string) =>
  findings.push({ sprite, anim, problem });

let checkedAnims = 0;
let checkedFrames = 0;

for (const a of ACTOR_SPRITES) {
  for (const [key, anim] of Object.entries(a.anims)) {
    if (!anim) continue;
    checkedAnims++;
    const img = await loadRaw(anim.file);
    if (!img) { flag(a.id, key, `file missing on disk (${anim.file})`); continue; }

    // corrected ÷28 tripwire: BOTH dims divisible by 28 = the rescale family
    if (img.w % 28 === 0 && img.h % 28 === 0) {
      flag(a.id, key, `corruption tripwire: ${img.w}×${img.h} — both dims ÷28 (the ×0.875 rescale family)`);
    }

    if (anim.layout !== 'h') { flag(a.id, key, `unaudited layout '${anim.layout}'`); continue; }

    // 1 — width: exact, no remainder
    const expectW = anim.sheetW ?? anim.frames * a.frameW;
    if (img.w !== expectW) {
      flag(a.id, key, `sheet width ${img.w} ≠ expected ${expectW} (${anim.sheetW ? `declared sheetW` : `${anim.frames} frames × ${a.frameW}px`})`);
      continue;   // frame slicing below would measure garbage
    }
    if (img.w % a.frameW !== 0) flag(a.id, key, `sheet width ${img.w} not divisible by frameW ${a.frameW}`);
    if (anim.sheetW && anim.frames * a.frameW > anim.sheetW) {
      flag(a.id, key, `${anim.frames} frames × ${a.frameW}px overruns declared sheetW ${anim.sheetW}`);
    }

    // 2 — height: frameH, × rows where `row` selects a strip
    const row = anim.row ?? 0;
    if (anim.row !== undefined) {
      if (img.h % a.frameH !== 0) flag(a.id, key, `sheet height ${img.h} not divisible by frameH ${a.frameH}`);
      if (img.h < (row + 1) * a.frameH) flag(a.id, key, `row ${row} needs height ≥ ${(row + 1) * a.frameH}, sheet is ${img.h}`);
    } else if (img.h !== a.frameH) {
      flag(a.id, key, `sheet height ${img.h} ≠ frameH ${a.frameH}`);
    }
    if (img.h < (row + 1) * a.frameH) continue;   // can't slice frames safely

    // 4 — no declared frame entirely empty
    for (let f = 0; f < anim.frames; f++) {
      checkedFrames++;
      const bb = frameBBox(img, f * a.frameW, row * a.frameH, a.frameW, a.frameH);
      if (!bb) flag(a.id, key, `frame ${f} is entirely empty`);

      // 3 — content box vs descriptor, on idle frame 0 (the measured frame)
      if (key === 'idle' && f === 0 && bb) {
        const contentH = bb.maxY - bb.minY + 1;
        const footPad = a.frameH - 1 - bb.maxY;
        if (contentH !== a.contentH) flag(a.id, key, `contentH ${a.contentH} ≠ measured ${contentH}`);
        if (footPad !== a.footPad) flag(a.id, key, `footPad ${a.footPad} ≠ measured ${footPad}`);
        const wantOff = Math.round(a.frameW / 2 - (bb.minX + bb.maxX + 1) / 2);
        const haveOff = a.footOffsetX ?? 0;
        if (Math.abs(wantOff - haveOff) > 1) {
          flag(a.id, key, `footOffsetX ${haveOff} ≠ measured ${wantOff} (content x[${bb.minX}..${bb.maxX}] in ${a.frameW}px frame)`);
        }
      }
    }
  }
}

console.log(`\nSprite audit: ${ACTOR_SPRITES.length} descriptors, ${checkedAnims} anims, ${checkedFrames} frames measured.`);
if (findings.length) {
  console.log(`\n✗ ${findings.length} mismatch${findings.length > 1 ? 'es' : ''}:\n`);
  console.log('  sprite               anim    problem');
  console.log('  ─────────────────────────────────────────────────────────');
  for (const f of findings) {
    console.log(`  ${f.sprite.padEnd(20)} ${f.anim.padEnd(7)} ${f.problem}`);
  }
  process.exit(1);
}
console.log('✓ every descriptor matches its pixels — zero mismatches.');
process.exit(0);
