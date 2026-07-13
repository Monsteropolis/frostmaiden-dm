// ============================================================
// ACTOR SPRITES — descriptors for the sheet-based actors, all
// values MEASURED from the originals in sprites-src.zip (see the
// Wave 3 intake table). No JS animation loop: the CSS runs frames
// with steps(); the 700ms Realm tick only chooses poses.
//
// Deviations from the Wave 3 brief's sketch, forced by measured
// truth (the packs differ from the ones the brief anticipated):
//  - `scale`: these packs are mini characters (~10–21 px content)
//    centered in large padded frames (96/100 px). At the brief's
//    "native 1×" they'd be half the size of a 2×-scaled legacy
//    atlas actor, so descriptor actors carry their own integer
//    scale (2 here) — same goal, one coherent game.
//  - `footPad`: measured empty pixels between the feet and the
//    frame's bottom edge, so the stage can sit feet on the snow
//    line instead of floating the frame.
//  - `row`: the wildlife pack is a 4-column grid sheet, not
//    per-anim strips; `row` selects the strip inside the sheet.
// ============================================================

// Tiny RPG Character Pack (100×100 frames, per-anim strips)
import soldierIdle from '../assets/actors/soldier/Soldier_Idle.png';
import soldierWalk from '../assets/actors/soldier/Soldier_Walk.png';
import soldierHurt from '../assets/actors/soldier/Soldier_Hurt.png';
import soldierDeath from '../assets/actors/soldier/Soldier_Death.png';
import soldierAttack from '../assets/actors/soldier/Soldier_Attack01.png';
import orcIdle from '../assets/actors/orc/Orc_Idle.png';
import orcWalk from '../assets/actors/orc/Orc_Walk.png';
import orcHurt from '../assets/actors/orc/Orc_Hurt.png';
import orcDeath from '../assets/actors/orc/Orc_Death.png';
import orcAttack from '../assets/actors/orc/Orc_Attack01.png';
// Free Characters pack (96×96 frames, per-anim strips)
import knightIdle from '../assets/actors/knight/Human_Soldier_Sword_Shield_Idle-Sheet.png';
import knightWalk from '../assets/actors/knight/Human_Soldier_Sword_Shield_Walk-Sheet.png';
import knightHurt from '../assets/actors/knight/Human_Soldier_Sword_Shield_Hurt-Sheet.png';
import knightDeath from '../assets/actors/knight/Human_Soldier_Sword_Shield_Death-Sheet.png';
import knightAttack from '../assets/actors/knight/Human_Soldier_Sword_Shield_Attack1-Sheet.png';
import slimeIdle from '../assets/actors/slime/Monster_Slime_Idle-Sheet.png';
import slimeWalk from '../assets/actors/slime/Monster_Slime_Walk-Sheet.png';
import slimeHurt from '../assets/actors/slime/Monster_Slime_Hurt-Sheet.png';
import slimeDeath from '../assets/actors/slime/Monster_Slime_Death-Sheet.png';
import slimeAttack from '../assets/actors/slime/Monster_Slime_Attack1-Sheet.png';
// Retro RPG Wildlife (grid sheets, 4 columns; wolf 16×16, bear 24×24)
import wolfSheet from '../assets/actors/wolf/Wolf.png';
import bearSheet from '../assets/actors/bear/Bear.png';

export interface ActorAnim {
  file: string;
  frames: number;
  fps: number;
  layout: 'h' | 'v';
  /** grid sheets: which row of the sheet this strip lives on (h layout) */
  row?: number;
  /** play once and hold the last frame (death) */
  once?: boolean;
}

export interface ActorSprite {
  id: string;
  label: string;
  frameW: number;
  frameH: number;
  /** measured character height inside the frame */
  contentH: number;
  /** measured empty px between the feet and the frame's bottom edge */
  footPad: number;
  /** integer draw scale on the 384×216 stage (these packs: 2) */
  scale: number;
  anims: Partial<Record<'idle' | 'walk' | 'hurt' | 'death' | 'attack' | 'run' | 'jump', ActorAnim>>;
  /** monsters: combatant srcId/name matching */
  matches?: (RegExp | string)[];
}

export const ACTOR_SPRITES: ActorSprite[] = [
  {
    id: 'soldier', label: 'Soldier', frameW: 100, frameH: 100, contentH: 21, footPad: 40, scale: 2,
    anims: {
      idle:   { file: soldierIdle,   frames: 6, fps: 8,  layout: 'h' },
      walk:   { file: soldierWalk,   frames: 8, fps: 10, layout: 'h' },
      hurt:   { file: soldierHurt,   frames: 4, fps: 10, layout: 'h' },
      death:  { file: soldierDeath,  frames: 4, fps: 8,  layout: 'h', once: true },
      attack: { file: soldierAttack, frames: 6, fps: 10, layout: 'h' },
    },
  },
  {
    id: 'orc', label: 'Orc', frameW: 100, frameH: 100, contentH: 15, footPad: 43, scale: 2,
    matches: [/orc/i],
    anims: {
      idle:   { file: orcIdle,   frames: 6, fps: 8,  layout: 'h' },
      walk:   { file: orcWalk,   frames: 8, fps: 10, layout: 'h' },
      hurt:   { file: orcHurt,   frames: 4, fps: 10, layout: 'h' },
      death:  { file: orcDeath,  frames: 4, fps: 8,  layout: 'h', once: true },
      attack: { file: orcAttack, frames: 6, fps: 10, layout: 'h' },
    },
  },
  {
    id: 'knight', label: 'Knight', frameW: 96, frameH: 96, contentH: 19, footPad: 38, scale: 2,
    anims: {
      idle:   { file: knightIdle,   frames: 6,  fps: 8,  layout: 'h' },
      walk:   { file: knightWalk,   frames: 8,  fps: 10, layout: 'h' },
      hurt:   { file: knightHurt,   frames: 4,  fps: 10, layout: 'h' },
      death:  { file: knightDeath,  frames: 10, fps: 8,  layout: 'h', once: true },
      attack: { file: knightAttack, frames: 8,  fps: 10, layout: 'h' },
    },
  },
  {
    id: 'slime', label: 'Slime', frameW: 96, frameH: 96, contentH: 11, footPad: 39, scale: 2,
    matches: [/slime/i],
    anims: {
      idle:   { file: slimeIdle,   frames: 6,  fps: 8,  layout: 'h' },
      walk:   { file: slimeWalk,   frames: 8,  fps: 10, layout: 'h' },
      hurt:   { file: slimeHurt,   frames: 4,  fps: 10, layout: 'h' },
      death:  { file: slimeDeath,  frames: 10, fps: 8,  layout: 'h', once: true },
      attack: { file: slimeAttack, frames: 8,  fps: 10, layout: 'h' },
    },
  },
  {
    id: 'wolf', label: 'Wolf', frameW: 16, frameH: 16, contentH: 10, footPad: 2, scale: 2,
    matches: [/wolf/i],
    anims: {
      idle:  { file: wolfSheet, frames: 4, fps: 4, layout: 'h', row: 0 },
      walk:  { file: wolfSheet, frames: 4, fps: 8, layout: 'h', row: 0 },
      death: { file: wolfSheet, frames: 4, fps: 6, layout: 'h', row: 13, once: true },
    },
  },
  {
    id: 'bear', label: 'Bear', frameW: 24, frameH: 24, contentH: 15, footPad: 3, scale: 2,
    matches: [/bear/i],   // polar bears, cave bears…
    anims: {
      idle:  { file: bearSheet, frames: 4, fps: 4, layout: 'h', row: 0 },
      walk:  { file: bearSheet, frames: 4, fps: 8, layout: 'h', row: 0 },
      death: { file: bearSheet, frames: 4, fps: 6, layout: 'h', row: 13, once: true },
    },
  },
];

const BY_ID = new Map(ACTOR_SPRITES.map((a) => [a.id, a]));
export function actorSpriteById(id?: string): ActorSprite | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Foe matching: first descriptor whose `matches` hits the combatant's srcId or name. */
export function actorSpriteForFoe(srcId: string | undefined, name: string): ActorSprite | undefined {
  for (const a of ACTOR_SPRITES) {
    if (!a.matches) continue;
    for (const m of a.matches) {
      const re = typeof m === 'string' ? new RegExp(m, 'i') : m;
      if ((srcId && re.test(srcId)) || re.test(name)) return a;
    }
  }
  return undefined;
}

/** Pose → anim with the Wave 3 fallback chain. Returns the anim + which key was used. */
export function animForPose(a: ActorSprite, pose: string): { key: string; anim: ActorAnim } | null {
  const pick = (...keys: (keyof ActorSprite['anims'])[]) => {
    for (const k of keys) { const an = a.anims[k]; if (an) return { key: k as string, anim: an }; }
    return null;
  };
  switch (pose) {
    case 'walk': return pick('walk', 'run', 'idle');
    case 'down': return pick('death', 'hurt', 'idle');
    case 'cheer': case 'wave': return pick('idle');          // CSS emotes ride on top
    case 'sit': case 'sleep': case 'shiver': return pick('idle');  // art gap — falls back
    default: return pick('idle');
  }
}
