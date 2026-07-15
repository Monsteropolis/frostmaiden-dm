// ============================================================
// ACTOR SPRITES — descriptors for the sheet-based actors, all
// values MEASURED from the originals in sprites-src.zip (see the
// Wave 3 intake table). No JS animation loop: the CSS runs frames
// with steps(); the 700ms Realm tick only chooses poses.
//
// Deviations from the Wave 3 brief's sketch, forced by measured
// truth (the packs differ from the ones the brief anticipated):
//  - `scale`: these packs are mini characters (~10–21 px content)
//    centered in large padded frames (96/100 px). Wave 5 sets the
//    whole game to 1× — characters read ~10% of stage height, so
//    the 384×216 world feels roomy enough to hold a ground plane.
//    (Legacy atlas actors and critters drop to 1× with them —
//    one coherent sprite generation, same rule as Wave 3.)
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
// Wave 6 bosses: Frost Guardian (192×128 frames, one sheet, 5 anim rows) and
// Bringer of Death (140×93 frames; the pack's composite sheet wraps anims
// across rows, so per-anim strips were assembled 1:1 from its frames)
import frostGuardianSheet from '../assets/actors/frost-guardian/sheet.png';
import bringerIdle from '../assets/actors/bringer/idle.png';
import bringerWalk from '../assets/actors/bringer/walk.png';
import bringerHurt from '../assets/actors/bringer/hurt.png';
import bringerDeath from '../assets/actors/bringer/death.png';
// Wave 7 — finishing the library. All measured, none guessed:
//  - cat: FREE_Cat 2D Pixel Art, 64px per-anim strips (Chillitita's familiar).
//  - ice zombie: the 0x72 dungeon pack's 16×16 4-frame idle, assembled 1:1 into
//    a horizontal strip (the frames ship as individual PNGs).
//  - demon / blood monster: Tiny RPG Pack 02, 100px per-anim strips, the exact
//    format of the Wave 3 soldier/orc. (Demon's Attack sheets are 700px = ÷28,
//    so the corruption tripwire rejects them — and 'attack' is never a rendered
//    Realm pose anyway, so no loss.)
//  - goblin / skeleton / ogre: 0x72 dungeon monsters, idle+run assembled from
//    individual frames. The pack's playable HEROES (knight/elf/dwarf/wizard/
//    lizard) are all 16×28 → the ÷28 tripwire refuses them, as designed.
import catIdle from '../assets/actors/cat/idle.png';
import catWalk from '../assets/actors/cat/walk.png';
import catRun from '../assets/actors/cat/run.png';
import catHurt from '../assets/actors/cat/hurt.png';
import iceZombieIdle from '../assets/actors/ice-zombie/idle.png';
import demonIdle from '../assets/actors/demon/idle.png';
import demonWalk from '../assets/actors/demon/walk.png';
import demonHurt from '../assets/actors/demon/hurt.png';
import demonDeath from '../assets/actors/demon/death.png';
import bloodIdle from '../assets/actors/blood-monster/idle.png';
import bloodWalk from '../assets/actors/blood-monster/walk.png';
import bloodHurt from '../assets/actors/blood-monster/hurt.png';
import bloodDeath from '../assets/actors/blood-monster/death.png';
import goblinIdle from '../assets/actors/goblin/idle.png';
import goblinWalk from '../assets/actors/goblin/walk.png';
import skeletonIdle from '../assets/actors/skeleton/idle.png';
import skeletonWalk from '../assets/actors/skeleton/walk.png';
import ogreIdle from '../assets/actors/ogre/idle.png';
import ogreWalk from '../assets/actors/ogre/walk.png';

// Lively NPCs v3.1 — 50 single-anim idle strips (32 or 34 px square frames),
// globbed so the descriptor table below stays the source of measured truth.
const LIVELY_SHEETS = import.meta.glob<string>(
  '../assets/actors/lively/*/*.png',
  { eager: true, import: 'default' },
);

export type ActorCategory = 'hero' | 'npc' | 'monster' | 'beast' | 'boss';

export interface ActorAnim {
  file: string;
  frames: number;
  fps: number;
  layout: 'h' | 'v';
  /** grid sheets: which row of the sheet this strip lives on (h layout) */
  row?: number;
  /** native sheet width in px, when the sheet is WIDER than this anim's own
   *  strip (a shared multi-anim sheet like the frost guardian's 16-column one).
   *  Defaults to frames*frameW. Load-bearing: background-size scales the whole
   *  sheet by this, so a 6-frame idle on a 16-wide sheet still shows ONE frame. */
  sheetW?: number;
  /** play once and hold the last frame (death) */
  once?: boolean;
}

export interface ActorSprite {
  id: string;
  label: string;
  /** picker tab (Wave 6) — hero/npc/monster/beast/boss */
  category: ActorCategory;
  frameW: number;
  frameH: number;
  /** measured character height inside the frame */
  contentH: number;
  /** measured empty px between the feet and the frame's bottom edge */
  footPad: number;
  /** measured px the content sits off horizontal-center in its frame (assembled
   *  strips can land off-center); +right / −left. Applied to the sprite art so
   *  the character stands centered on its ground position. Default 0. */
  footOffsetX?: number;
  /** integer draw scale on the stage (Wave 5: 1 — the world is roomy) */
  scale: number;
  anims: Partial<Record<'idle' | 'walk' | 'hurt' | 'death' | 'attack' | 'run' | 'jump', ActorAnim>>;
  /** monsters: combatant srcId/name matching */
  matches?: (RegExp | string)[];
}

// --- Lively NPCs: one measured row per sheet ------------------------------------
// [stem, frames, frame px, contentH, footPad] — all from the Wave 6 intake scan.
type LivelyRow = [string, number, number, number, number];
const LIVELY: Record<string, LivelyRow[]> = {
  medieval: [
    ['adventurer_01', 5, 34, 30, 1], ['adventurer_02', 5, 34, 28, 2], ['adventurer_03', 4, 32, 32, 0],
    ['adventurer_04', 4, 32, 31, 0], ['adventurer_05', 4, 32, 27, 0], ['barkeep', 5, 34, 31, 1],
    ['barmaid', 5, 34, 32, 1], ['beggar', 5, 34, 18, 3], ['blacksmith', 5, 34, 30, 1],
    ['captain', 4, 32, 30, 0], ['dog', 4, 32, 21, 0], ['dwarf', 4, 32, 27, 0],
    ['elder', 4, 32, 24, 0], ['fairy', 4, 32, 19, 5], ['farmer_01', 5, 32, 24, 2],
    ['farmer_02', 5, 32, 27, 0], ['guard', 4, 32, 31, 0], ['jester', 5, 34, 28, 3],
    ['king', 5, 34, 32, 1], ['merchant', 5, 32, 30, 0], ['mermaid', 4, 32, 24, 3],
    ['minstrel', 5, 34, 30, 2], ['priestess', 5, 32, 29, 0], ['princess', 4, 32, 25, 0],
    ['seer', 6, 34, 28, 2], ['shady_guy', 5, 34, 30, 2], ['stranger', 4, 32, 28, 0],
    ['villager_01', 5, 34, 27, 2], ['villager_02', 5, 34, 29, 2], ['witch', 5, 34, 32, 1],
  ],
  elementals: [
    ['crystal_mauler', 4, 32, 23, 1], ['fire_knight', 4, 32, 29, 1], ['ground_monk', 4, 32, 28, 1],
    ['leaf_ranger', 4, 32, 27, 1], ['metal_bladekeeper', 4, 32, 28, 1], ['water_priestess', 4, 32, 29, 1],
    ['wind_hashashin', 4, 32, 28, 1],
  ],
  steampunk: [
    ['aristocrat_01', 4, 32, 31, 1], ['aristocrat_02', 4, 32, 30, 1], ['bartender', 4, 32, 31, 1],
    ['engineer_01', 4, 32, 25, 3], ['engineer_02', 4, 32, 24, 3], ['gunslinger', 5, 32, 31, 1],
    ['masked_man', 4, 32, 30, 1], ['masked_woman', 4, 32, 30, 1], ['steambot_01', 4, 32, 31, 1],
    ['steambot_02', 4, 32, 30, 1], ['steambot_03', 5, 32, 29, 1], ['trader', 4, 32, 29, 1],
  ],
};
// per-sheet exceptions to the folder default category / foe matching
const LIVELY_CATEGORY: Record<string, ActorCategory> = { dog: 'beast' };
const LIVELY_MATCHES: Record<string, (RegExp | string)[]> = {
  dog: [/\bdog\b|mastiff/i],
  witch: [/\bhag\b/i],           // Maud Chiselbone and her sisters
};

const label = (stem: string) =>
  stem.replace(/_0?(\d+)$/, ' $1').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function livelySprites(): ActorSprite[] {
  const out: ActorSprite[] = [];
  for (const [folder, rows] of Object.entries(LIVELY)) {
    const defaultCat: ActorCategory = folder === 'elementals' ? 'hero' : 'npc';
    for (const [stem, frames, frame, contentH, footPad] of rows) {
      const file = LIVELY_SHEETS[`../assets/actors/lively/${folder}/${stem}.png`];
      if (!file) continue;   // sheet missing from the build — never a broken tile
      out.push({
        id: `lively_${stem}`, label: label(stem),
        category: LIVELY_CATEGORY[stem] ?? defaultCat,
        frameW: frame, frameH: frame, contentH, footPad, scale: 1,
        matches: LIVELY_MATCHES[stem],
        anims: { idle: { file, frames, fps: 5, layout: 'h' } },
      });
    }
  }
  return out;
}

export const ACTOR_SPRITES: ActorSprite[] = [
  {
    id: 'soldier', label: 'Soldier', category: 'hero', frameW: 100, frameH: 100, contentH: 21, footPad: 40, scale: 1,
    anims: {
      idle:   { file: soldierIdle,   frames: 6, fps: 8,  layout: 'h' },
      walk:   { file: soldierWalk,   frames: 8, fps: 10, layout: 'h' },
      hurt:   { file: soldierHurt,   frames: 4, fps: 10, layout: 'h' },
      death:  { file: soldierDeath,  frames: 4, fps: 8,  layout: 'h', once: true },
      attack: { file: soldierAttack, frames: 6, fps: 10, layout: 'h' },
    },
  },
  {
    id: 'orc', label: 'Orc', category: 'monster', frameW: 100, frameH: 100, contentH: 15, footPad: 43, scale: 1,
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
    id: 'knight', label: 'Knight', category: 'hero', frameW: 96, frameH: 96, contentH: 19, footPad: 38, scale: 1,
    anims: {
      idle:   { file: knightIdle,   frames: 6,  fps: 8,  layout: 'h' },
      walk:   { file: knightWalk,   frames: 8,  fps: 10, layout: 'h' },
      hurt:   { file: knightHurt,   frames: 4,  fps: 10, layout: 'h' },
      death:  { file: knightDeath,  frames: 10, fps: 8,  layout: 'h', once: true },
      attack: { file: knightAttack, frames: 8,  fps: 10, layout: 'h' },
    },
  },
  {
    id: 'slime', label: 'Slime', category: 'monster', frameW: 96, frameH: 96, contentH: 11, footPad: 39, scale: 1,
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
    // footPad re-measured in Wave 6 after the stray shadow-bar row was cleared
    id: 'wolf', label: 'Wolf', category: 'beast', frameW: 16, frameH: 16, contentH: 10, footPad: 3, scale: 1,
    matches: [/wolf/i],
    anims: {
      idle:  { file: wolfSheet, frames: 4, fps: 4, layout: 'h', row: 0 },
      walk:  { file: wolfSheet, frames: 4, fps: 8, layout: 'h', row: 0 },
      death: { file: wolfSheet, frames: 4, fps: 6, layout: 'h', row: 13, once: true },
    },
  },
  {
    id: 'bear', label: 'Bear', category: 'beast', frameW: 24, frameH: 24, contentH: 15, footPad: 3, scale: 1,
    matches: [/bear/i],   // polar bears, cave bears…
    anims: {
      idle:  { file: bearSheet, frames: 4, fps: 4, layout: 'h', row: 0 },
      walk:  { file: bearSheet, frames: 4, fps: 8, layout: 'h', row: 0 },
      death: { file: bearSheet, frames: 4, fps: 6, layout: 'h', row: 13, once: true },
    },
  },
  // --- Wave 6 bosses -------------------------------------------------------------
  {
    // one 3072×640 sheet, 192×128 frames; anim rows measured: idle 6 / walk 10 /
    // attack 14 / hurt 7 / death 16. Content 92px tall — a boss towers on purpose.
    id: 'frost_guardian', label: 'Frost Guardian', category: 'boss',
    frameW: 192, frameH: 128, contentH: 92, footPad: 18, scale: 1,
    matches: [/frost ?guardian/i, /ice ?golem/i, /snow ?golem/i, /coldlight/i],
    // one shared 3072×640 sheet (16 cols × 5 rows) — every anim carries sheetW so
    // background-size scales the whole sheet, not just its own frames' worth.
    anims: {
      idle:   { file: frostGuardianSheet, frames: 6,  fps: 6,  layout: 'h', row: 0, sheetW: 3072 },
      walk:   { file: frostGuardianSheet, frames: 10, fps: 8,  layout: 'h', row: 1, sheetW: 3072 },
      attack: { file: frostGuardianSheet, frames: 14, fps: 10, layout: 'h', row: 2, sheetW: 3072 },
      hurt:   { file: frostGuardianSheet, frames: 7,  fps: 10, layout: 'h', row: 3, sheetW: 3072 },
      death:  { file: frostGuardianSheet, frames: 16, fps: 8,  layout: 'h', row: 4, sheetW: 3072, once: true },
    },
  },
  {
    // Wave 7 re-measure (QA #9): the assembled strips carry the figure in the
    // RIGHT third of the 140px frame — content spans x[81:128], center 104.5 vs
    // the frame's 70. footOffsetX shifts the art 35px left so it stands centered.
    // contentH corrected 54→56 (content spans y[36:92]); footPad 1 was right.
    id: 'bringer_of_death', label: 'Bringer of Death', category: 'boss',
    frameW: 140, frameH: 93, contentH: 56, footPad: 1, footOffsetX: -35, scale: 1,
    matches: [/bringer/i, /reaper/i, /wraith/i, /spect(er|re)/i],
    anims: {
      idle:  { file: bringerIdle,  frames: 8,  fps: 8,  layout: 'h' },
      walk:  { file: bringerWalk,  frames: 8,  fps: 10, layout: 'h' },
      hurt:  { file: bringerHurt,  frames: 3,  fps: 10, layout: 'h' },
      death: { file: bringerDeath, frames: 10, fps: 8,  layout: 'h', once: true },
    },
  },
  // --- Wave 7 additions: the rest of the usable art ------------------------------
  {
    // Chillitita's cat (Ben asked twice). 64px frames; content 28px tall centered
    // with 16px of foot padding. 'run' rides the walk fallback; 'hurt' → down.
    id: 'cat', label: 'Cat', category: 'beast',
    frameW: 64, frameH: 64, contentH: 28, footPad: 16, scale: 1,
    matches: [/\bcat\b/i, /feline/i, /kitt(en|y)/i, /familiar/i],
    anims: {
      idle: { file: catIdle, frames: 10, fps: 5,  layout: 'h' },
      walk: { file: catWalk, frames: 15, fps: 8,  layout: 'h' },
      run:  { file: catRun,  frames: 10, fps: 10, layout: 'h' },
      hurt: { file: catHurt, frames: 5,  fps: 10, layout: 'h' },
    },
  },
  {
    // 16×16 4-frame idle assembled from the dungeon pack's individual frames.
    id: 'ice_zombie', label: 'Ice Zombie', category: 'monster',
    frameW: 16, frameH: 16, contentH: 16, footPad: 0, scale: 1,
    matches: [/ice.?zombie/i, /frozen (dead|corpse|undead|zombie)/i, /zombie/i],
    anims: { idle: { file: iceZombieIdle, frames: 4, fps: 4, layout: 'h' } },
  },
  {
    id: 'demon', label: 'Demon', category: 'monster',
    frameW: 100, frameH: 100, contentH: 21, footPad: 41, scale: 1,
    matches: [/demon/i, /devil/i, /fiend/i, /quasit/i, /imp\b/i],
    anims: {
      idle:  { file: demonIdle,  frames: 6, fps: 8,  layout: 'h' },
      walk:  { file: demonWalk,  frames: 8, fps: 10, layout: 'h' },
      hurt:  { file: demonHurt,  frames: 4, fps: 10, layout: 'h' },
      death: { file: demonDeath, frames: 4, fps: 8,  layout: 'h', once: true },
    },
  },
  {
    id: 'blood_monster', label: 'Blood Monster', category: 'monster',
    frameW: 100, frameH: 100, contentH: 16, footPad: 42, scale: 1,
    matches: [/blood (monster|ooze|slime|fiend)/i, /red ooze/i],
    anims: {
      idle:  { file: bloodIdle,  frames: 6, fps: 8,  layout: 'h' },
      walk:  { file: bloodWalk,  frames: 8, fps: 10, layout: 'h' },
      hurt:  { file: bloodHurt,  frames: 4, fps: 10, layout: 'h' },
      death: { file: bloodDeath, frames: 4, fps: 8,  layout: 'h', once: true },
    },
  },
  {
    id: 'goblin', label: 'Goblin', category: 'monster',
    frameW: 16, frameH: 16, contentH: 12, footPad: 0, scale: 1,
    matches: [/goblin/i],
    anims: {
      idle: { file: goblinIdle, frames: 4, fps: 4, layout: 'h' },
      walk: { file: goblinWalk, frames: 4, fps: 8, layout: 'h' },
    },
  },
  {
    id: 'skeleton', label: 'Skeleton', category: 'monster',
    frameW: 16, frameH: 16, contentH: 16, footPad: 0, scale: 1,
    matches: [/skelet(on)?/i],
    anims: {
      idle: { file: skeletonIdle, frames: 4, fps: 4, layout: 'h' },
      walk: { file: skeletonWalk, frames: 4, fps: 8, layout: 'h' },
    },
  },
  {
    id: 'ogre', label: 'Ogre', category: 'monster',
    frameW: 32, frameH: 36, contentH: 26, footPad: 0, scale: 1,
    matches: [/ogre/i, /verbeeg/i, /\bbrute\b/i],
    anims: {
      idle: { file: ogreIdle, frames: 4, fps: 4, layout: 'h' },
      walk: { file: ogreWalk, frames: 4, fps: 8, layout: 'h' },
    },
  },
  // --- Lively NPCs (Wave 6): 50 idle-strip townsfolk, elementals, steampunk ------
  ...livelySprites(),
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
