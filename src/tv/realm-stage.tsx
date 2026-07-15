// ============================================================
// IDLE STAGE — the tamagotchi diorama. The party mills about in
// front of the current pixel scene, and everything they do is a
// read of real campaign state:
//   pose     ← hp/conditions/down (hurt PCs favor sitting; down
//              PCs lie in the snow and the others hover close)
//   activity ← scene category (tavern = sitting & drinking,
//              camp = one sleeper + fire-watchers, road = walking)
//   weather  ← blizzard/heavy snow force a shivering huddle;
//              clear nights earn a stargazer
//   bubbles  ← low rations (🍖❗), flush gold (💰), sleep (💤),
//              worry near a downed friend (😟)
//   familiars← wander near their linked PC (linkedPcId)
//   pokes    ← DM-fired one-shots: wave 👋 or party cheer 🎉
//   cameos   ← a location-appropriate silhouette drifts past
// Deterministic per tick: all randomness is seeded from pc ids +
// tick counter, so the same state renders the same first frame
// (which is also what makes it testable).
// ============================================================

import { useEffect, useRef, useState } from 'preact/hooks';
import { PlayerView, PvPc, PvAlly, PvCombatant, HpState, PokeActive } from './projection';
import { sceneById, resolveScene, SCENES, TvScene } from './scenes';
import { TileScene, tileSceneById, groundCells, objectRuns } from './tiles';
import { ActorSprite, ActorAnim, actorSpriteById, actorSpriteForFoe, animForPose } from '../data/actor-sprites';
import actorsUrl from '../assets/idle/idle_actors.png';
import critterUrl from '../assets/idle/idle_critter.png';
import cameosUrl from '../assets/idle/idle_cameos.png';

// --- archetypes: PC class string → atlas row -----------------------------------
// atlas rows: warrior, mage, rogue, cleric, ranger, barbarian
const ARCH_MATCH: [RegExp, number][] = [
  [/wizard|sorcer|mage|warlock|artific/i, 1],
  [/rogue|thief|assassin|bard/i, 2],
  [/cleric|priest|paladin|monk|druid/i, 3],
  [/ranger|hunter|scout/i, 4],
  [/barbar|berserk/i, 5],
];
export function archetypeRow(cls: string): number {
  for (const [re, row] of ARCH_MATCH) if (re.test(cls)) return row;
  return 0; // warrior default — fighters and everyone else
}

// atlas frame columns per pose
const POSE_FRAMES: Record<string, number[]> = {
  idle: [0, 1], walk: [2, 3], sit: [4], sleep: [5],
  shiver: [6, 7], down: [8], cheer: [9, 10], wave: [11, 12],
};
export type Pose = keyof typeof POSE_FRAMES;

function pcHpState(p: PvPc): HpState {
  const pct = p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 0;
  return p.hp <= 0 ? 'down' : pct <= 25 ? 'critical' : pct <= 50 ? 'bloodied' : 'healthy';
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seeded(seed: number): number {
  // one squeeze of mulberry — enough for a weighted pick
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// --- behavior: what is this soul doing right now? -------------------------------
// Deterministic given (pc, view context, tick). Forced states first,
// then a seeded pick from the scene's activity table.
export function pickPose(
  pc: PvPc, i: number, tick: number,
  ctx: { sceneCat: string; sceneId: string; weatherId: string; anyDown: boolean },
): Pose {
  if (pc.down) return 'down';
  if (ctx.weatherId === 'blizzard' || ctx.weatherId === 'heavy_snow') return 'shiver';
  const r = seeded(hashStr(pc.id) + tick * 97 + i);
  const st = pcHpState(pc);
  const hurt = st === 'critical' || st === 'bloodied';
  if (ctx.anyDown) return r < 0.5 ? 'idle' : 'sit';          // worried vigil
  if (ctx.sceneId === 'tavern') return r < 0.65 ? 'sit' : 'idle';
  if (ctx.sceneId === 'camp') {
    if (i === 0) return 'sleep';                              // someone always sleeps at camp
    return r < 0.5 ? 'sit' : 'idle';
  }
  if (ctx.sceneCat === 'map' || ctx.sceneId === 'road') return r < (hurt ? 0.3 : 0.6) ? 'walk' : 'idle';
  if (hurt) return r < 0.6 ? 'sit' : 'idle';                  // hurt souls rest
  if (ctx.weatherId === 'clear' && i === 1) return 'sit';     // the stargazer
  return r < 0.35 ? 'walk' : 'idle';
}

// bubbles: little emoji thoughts. One at a time per actor, rotating on ticks.
export function pickBubble(
  pc: PvPc, i: number, tick: number,
  ctx: { lowFood: boolean; richGold: boolean; anyDown: boolean; wrath: boolean; sceneId: string },
  pose: Pose,
): string | null {
  if (pose === 'sleep') return '💤';
  const slot = (tick + i * 3) % 12;                           // sparse — most ticks silent
  if (slot !== 0) return null;
  const r = seeded(hashStr(pc.id) + tick * 31);
  if (ctx.anyDown && !pc.down) return '😟';
  if (ctx.lowFood && r < 0.6) return '🍖❗';
  if (ctx.wrath && r < 0.5) return '❄️';
  if (ctx.richGold && r < 0.4) return '💰';
  if (pc.inspiration && r < 0.5) return '✦';
  if (ctx.sceneId === 'tavern' && r < 0.6) return '🍺';
  return null;
}

// --- the ground plane (Wave 5, re-measured for the 224 canvas in Wave 6) ---------
// The walkable snow is a band on the stage canvas. `y` is depth: 0 = the far
// edge (treeline / back of camp), 1 = the near edge (foreground). Wave 5
// measured the band as 16% of the 216 canvas (34.56px); the Wave 6 canvas is
// 224 tall with flat art anchored to the bottom, so the same PIXEL line is
// kept — nothing jumps — by re-expressing it as a % of 224. Tiled scenes
// carry their own band (deeper — you can walk up to a building's door).
export const GROUND_TOP = (16 * 216) / 224;   // bottom-% at y = 0 (≈15.43)
export const GROUND_BOT = 0;                  // bottom-% at y = 1

export interface GroundBand { top: number; bottom: number }
const DEFAULT_BAND: GroundBand = { top: GROUND_TOP, bottom: GROUND_BOT };

/** The walkable band for a resolved scene — tiled scenes may override it. */
export function stageGroundBand(sceneId: string): GroundBand {
  return tileSceneById(sceneId)?.ground ?? DEFAULT_BAND;
}

const clamp01 = (y: number) => Math.max(0, Math.min(1, y));
/** Screen mapping: depth y → CSS bottom-% on the stage canvas. */
export function groundBottomPct(y: number, band: GroundBand = DEFAULT_BAND): number {
  return band.top + (band.bottom - band.top) * clamp01(y);
}
/** Painter's algorithm: higher y draws later, therefore in front. */
export function depthZ(y: number): number {
  return Math.round(clamp01(y) * 1000);
}
/** Perspective cue — subtle by decree. Applied via CSS scale (GPU-composited,
 *  pixel art stays crisp); never by resampling the sprite's pixel dimensions. */
export function depthScale(y: number): number {
  return 0.85 + 0.15 * clamp01(y);
}
/** The three depth styles every grounded thing shares. */
function groundStyle(y: number, band: GroundBand = DEFAULT_BAND): Record<string, string | number> {
  return { bottom: `${groundBottomPct(y, band)}%`, zIndex: depthZ(y), scale: String(depthScale(y)) };
}

// --- positions: actors scatter across the plane, walkers drift --------------------
interface Pos { x: number; y: number }

// Camp: a loose cluster — lanes in x for spacing, seeded scatter in x and y.
function homePos(id: string, i: number, n: number): Pos {
  const lane = 12 + (76 / Math.max(1, n - 1 || 1)) * i;      // % across the stage
  return {
    x: lane + (seeded(hashStr(id)) - 0.5) * 10,
    y: 0.2 + 0.6 * seeded(hashStr(id) + 53),
  };
}
// Combat: party left-ish, foes right-ish — but both scatter in depth instead of
// forming two ranks. This is what un-stacks the name labels.
function combatPos(id: string, i: number, n: number, lo: number, hi: number): Pos {
  return {
    x: lo + ((hi - lo) / Math.max(1, n - 1 || 1)) * i + (i % 2 ? 3 : -3),
    y: 0.15 + 0.7 * seeded(hashStr(id) + 97),
  };
}

// Foe chatter — sparse and deterministic, same seeded feel as party bubbles.
const FOE_BUBBLES = ['arrrg', 'grr', '!', '⚔️', '😤'];
function pickFoeBubble(id: string, tick: number): string | null {
  if ((hashStr(id) + tick) % 14 !== 0) return null;
  return FOE_BUBBLES[(hashStr(id) + Math.floor(tick / 3)) % FOE_BUBBLES.length];
}

interface ActorRender {
  key: string; x: number; y: number; row: number; pose: Pose; frame: number;
  name: string; hp: number; maxHp: number; hpState: string; bubble: string | null;
  flinch: boolean; active: boolean; next: boolean;
  sprite?: ActorSprite;      // descriptor-backed actor; undefined = classic atlas
}

interface FoeRender {
  key: string; x: number; y: number; emoji: string; name: string; hpState: HpState;
  down: boolean; active: boolean; next: boolean; bubble: string | null;
  sprite?: ActorSprite;      // matched descriptor; undefined = emoji token
}

// --- the stage canvas: fixed 384×224 logical px, integer-scaled to fit -----------
// 224 = 14 rows of 16px tiles (216 fit no tile grid). Flat 384×216 art anchors
// to the bottom; the 8px surplus reads as sky above the scene.

export const STAGE_W = 384;
export const STAGE_H = 224;

/** The backdrop the stage will actually draw: the chosen scene if it's pixel
 *  art, else the auto pixel mood. Exported so the trophy placement sheet
 *  previews the very same background. */
export function resolveStageScene(sceneId: string, ctx: { journeying: boolean; weatherId: string }): TvScene {
  const chosen = sceneById(sceneId);
  return chosen && chosen.cat === 'pixel' ? chosen : resolveScene('auto', ctx) ?? SCENES[0];
}

function useStageScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setK(Math.max(1, Math.floor(Math.min(r.width / STAGE_W, r.height / STAGE_H))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, k };
}

// --- tiled backdrop (Wave 6) -------------------------------------------------------
// Ground cells are plain divs behind everything. Object layers arrive as
// column-runs (a tree, one wall of a house) anchored at their base row; each
// run maps its base line into the walkable band and takes depthZ(y) — the
// SAME painter's sort the actors use, which is what lets a PC walk behind a
// building and in front of a crate. No second sorting system.

/** Base row → depth y in the scene's own band (unclamped; depthZ clamps). */
function rowDepthY(baseRow: number, ts: TileScene, band: GroundBand): number {
  const bottomPx = (ts.gridH - 1 - baseRow) * 16;
  const bottomPct = (bottomPx / STAGE_H) * 100;
  return (band.top - bottomPct) / (band.top - band.bottom || 1);
}

function tileBgStyle(tile: number, ts: { src: string; cols: number }): Record<string, string> {
  return {
    backgroundImage: `url(${ts.src})`,
    backgroundPosition: `${-(tile % ts.cols) * 16}px ${-Math.floor(tile / ts.cols) * 16}px`,
  };
}

function TiledBackdrop({ scene, band }: { scene: TileScene; band: GroundBand }) {
  return (
    <>
      <div class="tv-tile-ground">
        {groundCells(scene).map((g, i) => (
          <span
            key={`g${i}`}
            class="tv-tile"
            style={{ left: `${g.col * 16}px`, top: `${g.row * 16}px`, ...tileBgStyle(g.tile, g.tileset) }}
          />
        ))}
      </div>
      {objectRuns(scene).map((run, i) => (
        <div
          key={`r${i}`}
          class="tv-tile-run"
          style={{
            left: `${run.col * 16}px`,
            bottom: `${(scene.gridH - 1 - run.baseRow) * 16}px`,
            zIndex: depthZ(rowDepthY(run.baseRow, scene, band)),
          }}
        >
          {run.tiles.map((t, j) => (
            <span key={j} class="tv-tile" style={{ left: '0', bottom: `${j * 16}px`, ...tileBgStyle(t, run.tileset) }} />
          ))}
        </div>
      ))}
    </>
  );
}

// --- descriptor-backed actor: CSS steps() runs the frames, not JS -----------------

function spriteAnimStyle(a: ActorSprite, anim: ActorAnim) {
  const s = a.scale;
  const loopFrames = anim.once ? Math.max(1, anim.frames - 1) : anim.frames;
  const dur = loopFrames / anim.fps;
  // sheet is drawn pre-scaled via background-size, so positions are scaled px too
  const sheetLen = anim.frames * (anim.layout === 'h' ? a.frameW : a.frameH) * s;
  return {
    width: `${a.frameW * s}px`,
    height: `${a.frameH * s}px`,
    backgroundImage: `url(${anim.file})`,
    backgroundSize: anim.layout === 'h' ? `${sheetLen}px auto` : `auto ${sheetLen}px`,
    backgroundPositionY: anim.layout === 'h' ? `${-(anim.row ?? 0) * a.frameH * s}px` : '0px',
    '--realm-to': `${-loopFrames * a.frameW * s}px`,
    animation: anim.frames > 1
      ? `realmSpriteRun ${dur}s steps(${loopFrames}) ${anim.once ? '1 forwards' : 'infinite'}`
      : 'none',
  } as Record<string, string>;
}

function SpriteActor({ sprite, pose, name, hp, maxHp, hpState, bubble, flinch, active, next, x, y, pokeSeq, band = DEFAULT_BAND }: {
  sprite: ActorSprite; pose: string; name: string;
  hp?: number; maxHp?: number; hpState: string;
  bubble: string | null; flinch: boolean; active: boolean; next: boolean;
  x: number; y: number; pokeSeq: number; band?: GroundBand;
}) {
  const picked = animForPose(sprite, pose);
  if (!picked) return null;
  const s = sprite.scale;
  const emote = pose === 'cheer' ? ' emote-cheer' : pose === 'wave' ? ' emote-wave' : '';
  return (
    <div
      key={flinch ? `flinch-${pokeSeq}` : undefined}
      class={`realm-sprite-actor hp-${hpState}${flinch ? ' flinch' : ''}${active ? ' active-turn' : ''}${next ? ' next-turn' : ''}${pose === 'down' ? ' pose-down' : ''}${emote}`}
      style={{
        left: `${x}%`,
        width: `${sprite.frameW * s}px`,
        ...groundStyle(y, band),
        bottom: `calc(${groundBottomPct(y, band)}% - ${sprite.footPad * s}px)`,
      }}
    >
      {(active || next) && <span class="tv-turn-mark" style={{ bottom: `${(sprite.footPad + sprite.contentH) * s + 4}px` }}>▼</span>}
      {bubble && <span class="tv-idle-bubble realm-bubble" style={{ bottom: `${(sprite.footPad + sprite.contentH) * s + 2}px` }}>{bubble}</span>}
      {hpState !== 'healthy' && pose !== 'down' && typeof hp === 'number' && typeof maxHp === 'number' && (
        <span class="tv-idle-minihp realm-minihp" style={{ bottom: `${(sprite.footPad + sprite.contentH) * s + 2}px` }}>
          <span style={{ width: `${Math.max(4, (hp / Math.max(1, maxHp)) * 100)}%` }} />
        </span>
      )}
      <span class="realm-sprite" style={spriteAnimStyle(sprite, picked.anim)} />
      <span class="realm-sprite-name" style={{ bottom: `${Math.max(0, sprite.footPad * s - 12)}px` }}>{name}</span>
    </div>
  );
}

/** Does this poke reach the given PC? 'party'/'everyone' hit all PCs; a pcId hits one. */
function pokeHitsPc(poke: PokeActive | null, pcId: string): boolean {
  if (!poke) return false;
  return poke.target === 'party' || poke.target === 'everyone' || poke.target === pcId;
}

export function RealmStage({ v, full = false, pokeActive = null }: {
  v: PlayerView;
  full?: boolean;
  pokeActive?: PokeActive | null;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 700);
    return () => clearInterval(iv);
  }, []);

  // The item-get moment: Expressive state derived from successive views, like
  // poses. A newly-appeared inventory id makes its owner (stash grant: the
  // whole party) cheer with the item's emoji for ~2 ticks. Nothing persists —
  // a published snapshot is a photograph and correctly does not replay this.
  const prevInvIds = useRef<Set<string> | null>(null);
  const [itemJoy, setItemJoy] = useState<{ until: number; byOwner: Record<string, string> } | null>(null);
  useEffect(() => {
    const inv = v.inventory ?? [];
    const ids = new Set(inv.map((it) => it.id));
    if (prevInvIds.current) {
      const fresh = inv.filter((it) => !prevInvIds.current!.has(it.id));
      if (fresh.length) {
        const byOwner: Record<string, string> = {};
        for (const it of fresh) byOwner[it.ownerId ?? '*party*'] = it.emoji;
        setItemJoy({ until: Date.now() + 1500, byOwner });
      }
    }
    prevInvIds.current = ids;
  }, [v.inventory]);
  const joyFor = (pcId: string): string | null => {
    if (!itemJoy || Date.now() > itemJoy.until) return null;
    return itemJoy.byOwner[pcId] ?? itemJoy.byOwner['*party*'] ?? null;
  };

  // backdrop: the chosen scene if it's pixel art, else the auto pixel mood —
  // the diorama never letterboxes over a book scan.
  const scene = resolveStageScene(v.sceneId, { journeying: !!v.travel, weatherId: v.weather.id });
  // tiled scenes draw live from tile data and may carry their own ground band
  const tiled = tileSceneById(scene.id);
  const band = tiled?.ground ?? { top: GROUND_TOP, bottom: GROUND_BOT };

  const anyDown = v.party.some((p) => p.down);
  const ctx = {
    sceneCat: scene.cat, sceneId: scene.id, weatherId: v.weather.id, anyDown,
    lowFood: v.resources.rations < v.resources.partySize,
    richGold: v.resources.gold >= 500,
    wrath: v.weather.id === 'aurils_wrath',
  };

  // Combat turns the diorama into ambience for the fight: party mills in the
  // left half, foes are emoji tokens on the right. Not a VTT — just mood.
  const inCombat = v.mode === 'combat' && !!v.combat;
  const combatants: PvCombatant[] = inCombat ? v.combat!.combatants : [];
  const foeCombatants = combatants.filter((c) => !c.friendly);
  const activeCb = combatants.find((c) => c.active) ?? null;
  const nextCb = combatants.find((c) => c.next) ?? null;
  const activePcName = activeCb?.friendly ? activeCb.name : null;   // match party actors by name
  const nextPcName = nextCb?.friendly ? nextCb.name : null;

  const behaviorTick = Math.floor(tick / 6);                  // new decisions every ~4s
  const actors: ActorRender[] = v.party.map((p, i) => {
    let pose = pickPose(p, i, behaviorTick, ctx);
    let flinch = false;
    let joyBubble: string | null = null;
    if (pokeActive && !p.down && pokeHitsPc(pokeActive, p.id)) {
      if (pokeActive.kind === 'flinch') flinch = true;        // CSS shake, keeps its pose
      else pose = pokeActive.kind === 'cheer' || pokeActive.kind === 'taunt' ? 'cheer' : 'wave';
    }
    if (!p.down) {
      const joy = joyFor(p.id);
      if (joy) { pose = 'cheer'; joyBubble = joy; }           // item-get: cheer + the loot
    }
    const frames = POSE_FRAMES[pose];
    const drift = pose === 'walk' ? ((behaviorTick + i) % 2 ? 7 : -7) : 0;
    const pos = inCombat ? combatPos(p.id, i, v.party.length, 8, 42) : homePos(p.id, i, v.party.length);
    const active = inCombat && !!activePcName && p.name === activePcName;
    return {
      key: p.id,
      x: pos.x + drift,
      // the active combatant steps toward the viewer instead of hopping a rank
      y: active ? Math.min(1, pos.y + 0.15) : pos.y,
      row: archetypeRow(p.cls),
      pose,
      frame: frames[tick % frames.length],
      name: p.name, hp: p.hp, maxHp: p.maxHp, hpState: pcHpState(p),
      bubble: joyBubble ?? pickBubble(p, i, tick, ctx, pose),
      flinch,
      active,
      next: inCombat && !!nextPcName && p.name === nextPcName,
      sprite: actorSpriteById(p.sprite),
    };
  });

  // Foes: sprites where the DM assigned or the name matches, else emoji tokens
  // tinted by health, chattering now and then.
  const foes: FoeRender[] = foeCombatants.map((c, i) => {
    const down = c.hpState === 'down';
    let bubble = down ? null : pickFoeBubble(c.id, tick);
    if (!down && pokeActive && (pokeActive.target === 'foes' || pokeActive.target === 'everyone')
      && (pokeActive.kind === 'taunt' || pokeActive.kind === 'cheer')) {
      bubble = pokeActive.kind === 'taunt' ? '😈' : '🎉';
    }
    const pos = combatPos(c.id, i, foeCombatants.length, 58, 92);
    return {
      key: c.id,
      x: pos.x,
      y: c.active ? Math.min(1, pos.y + 0.15) : pos.y,
      emoji: c.emoji, name: c.name, hpState: c.hpState, down,
      active: c.active, next: c.next, bubble,
      // Wave 5 resolution order: the appearance token (a descriptor id the DM
      // assigned, riding the emoji path) → descriptor `matches` on the projected
      // name → emoji token. A DM-masked "???" foe carries '❓' and can never
      // match either way — the mask holds.
      sprite: actorSpriteById(c.emoji) ?? actorSpriteForFoe(undefined, c.name),
    };
  });

  // Allies roam by mode (all seeded/deterministic — same idiom as poses),
  // and since Wave 5 they roam the plane: x AND y.
  //   pc    — hover near the linked PC, small hop (the classic familiar)
  //   party — wander the party's x-range, slow triangle drift, wider swing
  //   free  — genuinely wanders the whole ground plane
  const tri = (x: number) => Math.abs(((x % 2) + 2) % 2 - 1);   // 0→1→0 triangle wave
  const pcXs = actors.map((ac) => ac.x);
  const partyLo = pcXs.length ? Math.max(6, Math.min(...pcXs) - 6) : 30;
  const partyHi = pcXs.length ? Math.min(94, Math.max(...pcXs) + 6) : 70;
  const allyActors = v.allies.map((a: PvAlly, i) => {
    const sprite = actorSpriteById(a.sprite);
    const mode = a.linkedPcId === 'free' ? 'free' : a.linkedPcId ? 'pc' : 'party';
    const phase = (hashStr(a.id) % 97) / 11;
    let x: number, y: number;
    if (mode === 'pc') {
      const owner = actors.find((ac) => ac.key === a.linkedPcId);
      const base = owner ? owner.x : 90 - i * 8;
      x = base + ((tick + i) % 6 < 3 ? -6 : 6);
      // sit a half-step nearer than the owner, alternating sides of them in depth
      y = clamp01((owner ? owner.y : 0.5) + (hashStr(a.id) % 2 ? 0.08 : -0.08));
    } else if (mode === 'party') {
      x = partyLo + (partyHi - partyLo) * tri(phase + tick / 26);
      y = 0.2 + 0.6 * tri(phase * 1.7 + tick / 33);
    } else {
      x = 8 + 84 * tri(phase + tick / 40);                      // slow full-stage sweep
      y = 0.05 + 0.9 * tri(phase * 1.3 + tick / 29);            // …and the full depth
    }
    // roamers walk while their drift is steep; hoverers just idle
    const moving = mode !== 'pc' && tick % 8 < 5;
    return {
      key: a.id, x, y, sprite, mode, down: a.down, name: a.name, hpState: a.hpState,
      pose: a.down ? 'down' : moving ? 'walk' : 'idle',
      frame: (tick + i) % 2,
    };
  });
  const critters = allyActors.filter((c) => !c.sprite);         // descriptor-less → 12px critter

  // cameo: a location-appropriate silhouette drifts by on a slow clock
  const CAMEO_BY_CAT: Record<string, number> = { pixel: 0, location: 0 };
  const cameoIdx = scene.id === 'cave' || scene.id === 'forge' ? 1
    : scene.id === 'road' || scene.id === 'peak' || scene.id === 'lake' ? 2
    : CAMEO_BY_CAT[scene.cat] ?? 0;
  const cameoOn = tick % 90 >= 20 && tick % 90 < 50;          // ~20s pass every ~63s

  const { ref: vpRef, k } = useStageScale();
  const pokeSeq = pokeActive?.seq ?? 0;

  return (
    <div class={`tv-idle-stage tv-realm-viewport${full ? ' full' : ''}`} ref={vpRef}>
      <div class="tv-realm-canvas" style={{ width: `${STAGE_W}px`, height: `${STAGE_H}px`, transform: `scale(${k})` }}>
        {tiled
          ? <TiledBackdrop scene={tiled} band={band} />
          : <img src={scene.url} alt="" class="tv-idle-bg" />}
        {cameoOn && (
          <span
            class="tv-idle-cameo"
            style={{
              backgroundImage: `url(${cameosUrl})`,
              backgroundPosition: `${-cameoIdx * 20}px 0`,
              left: `${((tick % 90) - 20) * (100 / 30)}%`,
            }}
          />
        )}
        {/* camp objects — trophies the DM put on display. Furniture, not actors:
            they never move, they y-sort with everyone else, and a tap/hover
            names them. */}
        {(v.inventory ?? []).filter((it) => it.display).map((it) => (
          <div
            key={`obj-${it.id}`}
            class="realm-object"
            tabIndex={0}
            title={it.name}
            style={{ left: `${it.display!.x}%`, ...groundStyle(it.display!.y, band) }}
          >
            <span class="realm-object-emoji">{it.emoji}</span>
            <span class="realm-object-label">{it.name}</span>
          </div>
        ))}
        {allyActors.map((c) => c.sprite && (
          <SpriteActor
            key={c.key}
            sprite={c.sprite} pose={c.pose} name={c.name}
            hpState={c.hpState}
            bubble={null} flinch={false} active={false} next={false}
            x={c.x} y={c.y} pokeSeq={pokeSeq} band={band}
          />
        ))}
        {critters.map((c) => !c.down && (
          <span
            key={c.key}
            class="tv-idle-critter"
            title={c.name}
            style={{
              backgroundImage: `url(${critterUrl})`,
              backgroundPosition: `${-((c.frame + 2) % 4) * 12}px 0`,
              left: `${c.x}%`,
              ...groundStyle(c.y, band),
            }}
          />
        ))}
        {actors.map((a) => a.sprite ? (
          <SpriteActor
            key={a.key}
            sprite={a.sprite} pose={a.pose} name={a.name}
            hp={a.hp} maxHp={a.maxHp} hpState={a.hpState}
            bubble={a.bubble} flinch={a.flinch} active={a.active} next={a.next}
            x={a.x} y={a.y} pokeSeq={pokeSeq} band={band}
          />
        ) : (
          <div
            key={a.flinch ? `${a.key}-flinch-${pokeSeq}` : a.key}
            class={`tv-idle-actor pose-${a.pose} hp-${a.hpState}${a.flinch ? ' flinch' : ''}${a.active ? ' active-turn' : ''}${a.next ? ' next-turn' : ''}`}
            style={{ left: `${a.x}%`, ...groundStyle(a.y, band) }}
          >
            {(a.active || a.next) && <span class="tv-turn-mark">▼</span>}
            {a.bubble && <span class="tv-idle-bubble">{a.bubble}</span>}
            {a.hpState !== 'healthy' && a.pose !== 'down' && (
              <span class="tv-idle-minihp"><span style={{ width: `${Math.max(4, (a.hp / Math.max(1, a.maxHp)) * 100)}%` }} /></span>
            )}
            <span
              class="tv-idle-sprite"
              style={{
                backgroundImage: `url(${actorsUrl})`,
                backgroundPosition: `${-a.frame * 16}px ${-a.row * 24}px`,
              }}
            />
            <span class="tv-idle-name">{a.name}</span>
          </div>
        ))}
        {foes.map((f) => f.sprite ? (
          <SpriteActor
            key={f.key}
            sprite={f.sprite} pose={f.down ? 'down' : 'idle'} name={f.name}
            hpState={f.hpState}
            bubble={f.bubble} flinch={false} active={f.active} next={f.next}
            x={f.x} y={f.y} pokeSeq={pokeSeq} band={band}
          />
        ) : (
          <div
            key={f.key}
            class={`tv-foe-token hp-${f.hpState}${f.down ? ' down' : ''}${f.active ? ' active-turn' : ''}${f.next ? ' next-turn' : ''}`}
            style={{ left: `${f.x}%`, ...groundStyle(f.y, band) }}
            title={f.name}
          >
            {(f.active || f.next) && <span class="tv-turn-mark">▼</span>}
            {f.bubble && <span class="tv-idle-bubble">{f.bubble}</span>}
            <span class="tv-foe-emoji">{f.down ? '💀' : f.emoji}</span>
            <span class="tv-foe-name">{f.name}</span>
          </div>
        ))}
        {inCombat && <span class="tv-realm-round">Round {v.combat!.round}</span>}
      </div>
    </div>
  );
}
