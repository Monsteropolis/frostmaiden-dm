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
import { propById, propCells, propCellStyle, PropDef } from '../data/props';
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

/** Whole-purse worth in gold — the diorama's "flush" cue (Wave 10). */
function coinsToGold(c: { pp: number; gp: number; sp: number; cp: number }): number {
  return c.pp * 10 + c.gp + c.sp / 10 + c.cp / 100;
}

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

// --- the wander state machine (Wave 10 A3) ---------------------------------------
// Replaces the old continuous micro-drift (which never crossed the walk
// threshold for pc-mode familiars, so the cat never animated). The timeline is
// a seeded chain of fixed-length segments; each segment is either a WALK (a
// fresh destination a meaningful distance away) or a PAUSE (hold the last
// destination — "stop and look around"). Consecutive pauses lengthen the dwell,
// so it reads as wander → stop → wander. Position is a pure function of the
// tick, so the caller derives walk-vs-idle from posAt(t) vs posAt(t−2) exactly
// as the party/foe code already does — movement drives the pose, never a roll.
const WANDER_SEG = 4;             // render-ticks per segment (~2.8s at 700ms/tick)
const WANDER_WALK_CHANCE = 0.55;  // a segment sets a new destination vs. holding

function wanderTarget(id: string, tick: number, bx: [number, number], by: [number, number]): Pos {
  const h = hashStr(id);
  const seg = Math.floor(Math.max(0, tick) / WANDER_SEG);
  const isWalk = (k: number) => seeded(h + k * 1013904223 + 7) < WANDER_WALK_CHANCE;
  // the walk segment that owns the current dwell (bounded lookback — a run of
  // pauses is short in expectation; fall back to the seeded home point).
  let owner = seg;
  for (let hops = 0; hops < 8 && owner > 0 && !isWalk(owner); hops++) owner--;
  const rx = seeded(h + owner * 2654435761 + 11);
  const ry = seeded(h + owner * 40503 + 23);
  return { x: bx[0] + (bx[1] - bx[0]) * rx, y: by[0] + (by[1] - by[0]) * ry };
}

// A bubble that's pure glyph (no letters) is an EMOTE — 😈 taunt, 🍖❗ hunger,
//💰💤❄️ — and floats with no box (QA #10). Lettered chatter ('arrrg') keeps its
// speech box for legibility.
const isEmote = (s: string) => !/[a-z]/i.test(s);

// --- soft obstacles (Wave 7): placed things block the drift plane ----------------
// A footprint is the ground cell(s) a placed object occupies. Actors don't
// NAVIGATE — this just keeps a seeded drift target from landing on an occupied
// cell: if a target falls inside a footprint, it's pushed out along the shallower
// axis (one deterministic pass, no per-frame physics). Enough to read as "the
// rock is in the way" — the bear steers around it instead of walking through.
interface Obstacle { x: number; y: number; rx: number; ry: number }
const OBS_PAD_X = 1.5;    // extra % breathing room around a footprint in x
const OBS_PAD_Y = 0.05;   // …and in depth

/** Nudge (x,y) out of any footprint it lands in. Single separation pass. */
function steerAround(x: number, y: number, obs: Obstacle[]): Pos {
  let ax = x, ay = y;
  for (const o of obs) {
    const ex = o.rx + OBS_PAD_X, ey = o.ry + OBS_PAD_Y;
    const dx = ax - o.x, dy = ay - o.y;
    const penX = ex - Math.abs(dx), penY = ey - Math.abs(dy);
    if (penX > 0 && penY > 0) {                 // overlapping the footprint
      // resolve along whichever axis is least dug-in (normalized), so the actor
      // slides past the side of the object rather than teleporting over it
      if (penX / ex <= penY / ey) ax = o.x + (dx < 0 ? -ex : ex);
      else ay = o.y + (dy < 0 ? -ey : ey);
    }
  }
  return { x: ax, y: clamp01(ay) };
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
  pose: Pose;                // Wave 8: foes drift + walk, not just idle (QA #8/#9)
  sprite?: ActorSprite;      // matched descriptor; undefined = emoji token
}

// --- the stage canvas: fixed 448×224 logical px, integer-scaled to fit -----------
// 224 = 14 rows of 16px tiles (216 fit no tile grid). Wave 9 C2 widened 384→448:
// 28 cols of 16px (448 is also 14 cols of 32px — both tile grids stay exact).
// A 16:9 screen was starving the width, and players need room to roam. 448 won
// over 512 because the common display is a 1080p TV: 448 lands 4× (1792×896)
// inside it, while 512 at 4× (2048) would overflow and drop the stage to a
// SMALLER 3×. Flat art keeps its 384×216 bottom-anchored center — its ground
// pixel line unmoved — with mirrored copies extending into the 32px gutters.

export const STAGE_W = 448;
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
  // background-size scales the WHOLE native sheet by s (aspect preserved off the
  // sized axis), so positions below index the native grid. The QA #2 frost-guardian
  // bug lived here: the old code sized to frames*frameW, which for a 6-frame idle on
  // a 16-column sheet squished the entire 3072px sheet into 1152px — so a slice of
  // every column bled through one frame box. sheetW carries the true sheet width.
  const sheetW = (anim.sheetW ?? anim.frames * a.frameW) * s;
  const vLen = anim.frames * a.frameH * s;
  const dx = (a.footOffsetX ?? 0) * s;   // re-center off-center art (e.g. the bringer)
  return {
    width: `${a.frameW * s}px`,
    height: `${a.frameH * s}px`,
    backgroundImage: `url(${anim.file})`,
    backgroundSize: anim.layout === 'h' ? `${sheetW}px auto` : `auto ${vLen}px`,
    backgroundPositionY: anim.layout === 'h' ? `${-(anim.row ?? 0) * a.frameH * s}px` : '0px',
    transform: dx ? `translateX(${dx}px)` : undefined,
    '--realm-to': `${-loopFrames * a.frameW * s}px`,
    animation: anim.frames > 1
      ? `realmSpriteRun ${dur}s steps(${loopFrames}) ${anim.once ? '1 forwards' : 'infinite'}`
      : 'none',
  } as Record<string, string | undefined>;
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
  // A2: the wrapper carries the perspective scale (depthScale) and any per-sprite
  // zoom, and the label is a child — so it would inherit both and render at a
  // different size for a zoomed or nearer actor. Counter-scale the label by the
  // inverse so every name is the same size regardless of sprite scale or depth.
  const wrapperScale = depthScale(y) * (sprite.zoom ?? 1);
  const labelScale = 1 / wrapperScale;
  return (
    <div
      key={flinch ? `flinch-${pokeSeq}` : undefined}
      class={`realm-sprite-actor hp-${hpState}${flinch ? ' flinch' : ''}${active ? ' active-turn' : ''}${next ? ' next-turn' : ''}${pose === 'down' ? ' pose-down' : ''}${emote}`}
      style={{
        left: `${x}%`,
        width: `${sprite.frameW * s}px`,
        ...groundStyle(y, band),
        // per-sprite zoom (the vomaat demon's 1.5×) multiplies into the SAME
        // wrapper scale depthScale uses — one GPU transform, no resampling
        ...(sprite.zoom ? { scale: String(depthScale(y) * sprite.zoom) } : {}),
        bottom: `calc(${groundBottomPct(y, band)}% - ${sprite.footPad * s}px)`,
      }}
    >
      {(active || next) && <span class="tv-turn-mark" style={{ bottom: `${(sprite.footPad + sprite.contentH) * s + 4}px` }}>▼</span>}
      {bubble && <span class={`tv-idle-bubble realm-bubble${isEmote(bubble) ? ' emote' : ''}`} style={{ bottom: `${(sprite.footPad + sprite.contentH) * s + 2}px` }}>{bubble}</span>}
      {hpState !== 'healthy' && pose !== 'down' && typeof hp === 'number' && typeof maxHp === 'number' && (
        <span class="tv-idle-minihp realm-minihp" style={{ bottom: `${(sprite.footPad + sprite.contentH) * s + 2}px` }}>
          <span style={{ width: `${Math.max(4, (hp / Math.max(1, maxHp)) * 100)}%` }} />
        </span>
      )}
      <span class="realm-sprite" style={spriteAnimStyle(sprite, picked.anim)} />
      {/* label sits below the foot line: the sprite's in-flow height is frameH·s,
          feet are footPad·s above its bottom, so (frameH−footPad)·s is the foot
          line from the top; +2px is a purely visual gap (QA #3). The counter-
          scale (A2) is anchored at top-center so the name stays centered and
          renders at a constant size no matter the sprite's zoom or depth. */}
      <span
        class="realm-sprite-name"
        style={{
          top: `${(sprite.frameH - sprite.footPad) * s + 2}px`,
          transform: `translateX(-50%) scale(${labelScale})`,
          transformOrigin: 'top center',
        }}
      >{name}</span>
    </div>
  );
}

/** Does this poke reach the given PC? 'party'/'everyone' hit all PCs; a pcId hits one. */
function pokeHitsPc(poke: PokeActive | null, pcId: string): boolean {
  if (!poke) return false;
  return poke.target === 'party' || poke.target === 'everyone' || poke.target === pcId;
}

/** A catalog prop's tile block (Wave 10 H). Exported so the DM placement picker
 *  previews props exactly as the stage draws them. `scale` is an integer draw
 *  multiplier for the picker thumbnail; the stage uses 1 and lets the wrapper's
 *  depthScale do the perspective. */
export function PropSprite({ def, scale = 1 }: { def: PropDef; scale?: number }) {
  const cells = propCells(def);
  if (!cells) return <span>{def.glyph}</span>;
  return (
    <span
      class="realm-prop"
      style={{ position: 'relative', display: 'block', width: `${def.w * 16 * scale}px`, height: `${def.h * 16 * scale}px` }}
    >
      {cells.cells.map((c, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${c.dx * 16 * scale}px`, top: `${c.dy * 16 * scale}px`,
            transform: scale !== 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
            ...propCellStyle(cells.tileset, c.cell),
          }}
        />
      ))}
    </span>
  );
}

/** A placed prop on the ground plane — positioned + depth-sorted like a trophy,
 *  its feet on the ground line. It never moves and names itself on hover. */
function PropObject({ def, x, y, band }: { def: PropDef; x: number; y: number; band: GroundBand }) {
  return (
    <div
      class="realm-prop-obj"
      tabIndex={0}
      title={def.label}
      style={{
        left: `${x}%`,
        width: `${def.w * 16}px`,
        ...groundStyle(y, band),
      }}
    >
      <PropSprite def={def} />
    </div>
  );
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
    // props ride the inventory wire but are furniture, not loot — no item-get joy
    const inv = (v.inventory ?? []).filter((it) => !propById(it.emoji));
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

  // Soft obstacles (Wave 7): every tiled object's base cell + any displayed
  // trophy becomes a footprint on the drift plane. Derived wholly from data the
  // stage already has — no new projection path crosses the seam.
  const CELL_RX = ((16 / STAGE_W) * 100) / 2;
  const obstacles: Obstacle[] = [];
  if (tiled) {
    for (const run of objectRuns(tiled)) {
      obstacles.push({
        x: ((run.col * 16 + 8) / STAGE_W) * 100,
        y: rowDepthY(run.baseRow, tiled, band),
        rx: CELL_RX, ry: 0.03,
      });
    }
  }
  for (const it of v.inventory ?? []) {
    if (!it.display) continue;
    // A placed catalog prop (Wave 10 H) rides the inventory wire-format with its
    // catalog id as the appearance token; it blocks with its true footprint,
    // resolved stage-side from the catalog (no extra seam path). A granted
    // trophy keeps the Wave 5 single-cell footprint.
    const prop = propById(it.emoji);
    obstacles.push(prop
      ? { x: it.display.x, y: it.display.y, rx: CELL_RX * prop.w, ry: 0.03 * prop.h }
      : { x: it.display.x, y: it.display.y, rx: CELL_RX, ry: 0.03 });
  }

  const anyDown = v.party.some((p) => p.down);
  // A published snapshot.json can lag the code (it's Ben's hand-published
  // artifact), so read resources tolerantly: accept the Wave 10 coin/rations
  // shape OR an older flat gold/rations number. The logged-out view must never
  // white-screen on a stale snapshot.
  const res = v.resources as unknown as {
    coins?: { pp: number; gp: number; sp: number; cp: number }; gold?: number;
    rations?: { party: number; pet: number } | number; partySize: number;
  };
  const goldWorth = res.coins ? coinsToGold(res.coins) : (typeof res.gold === 'number' ? res.gold : 0);
  const partyRations = typeof res.rations === 'object' ? res.rations.party
    : (typeof res.rations === 'number' ? res.rations : 0);
  const ctx = {
    sceneCat: scene.cat, sceneId: scene.id, weatherId: v.weather.id, anyDown,
    lowFood: partyRations < res.partySize,
    // Wave 10: "flush" now reads the whole purse in gold (500gp+ still the bar).
    richGold: goldWorth >= 500,
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
    const active = inCombat && !!activePcName && p.name === activePcName;
    // Wave 10 A3: pickPose decides the STATIONARY poses (sleep/sit/shiver/down)
    // and those hold their spot; an idle soul instead runs the wander state
    // machine, and its walk cycle plays only while actually moving. Position is
    // a pure function of the tick, so "am I moving?" is posAt(tick) vs
    // posAt(tick−2) — two ticks because the CSS left transition runs 1.4s.
    const rooted = pose === 'sleep' || pose === 'sit' || pose === 'shiver' || pose === 'down'
      || pose === 'cheer' || pose === 'wave';
    const home = homePos(p.id, i, v.party.length);
    const posAt = (t: number): Pos => {
      if (inCombat) {
        const pos = combatPos(p.id, i, v.party.length, 8, 42);
        const rawY = active ? Math.min(1, pos.y + 0.15) : pos.y;   // active steps forward
        return steerAround(pos.x, rawY, obstacles);
      }
      if (rooted) return steerAround(home.x, home.y, obstacles);
      const tgt = wanderTarget(p.id, t, [Math.max(6, home.x - 9), Math.min(94, home.x + 9)], [0.18, 0.9]);
      return steerAround(tgt.x, tgt.y, obstacles);
    };
    const st = posAt(tick);
    const prev = posAt(tick - 2);
    const moving = Math.abs(st.x - prev.x) > 0.5 || Math.abs(st.y - prev.y) > 0.02;
    if (moving && (pose === 'idle' || pose === 'walk')) pose = 'walk';
    else if (pose === 'walk') pose = 'idle';   // a standing character stands still
    const frames = POSE_FRAMES[pose];
    return {
      key: p.id,
      x: st.x,
      y: st.y,
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
    // Foes don't just stand there (QA #8/#9): a downed foe lies, the active foe
    // steps toward the viewer, and an idle foe runs the same wander state
    // machine as the party (Wave 10 A3) within its half of the field. The walk
    // anim plays only while the position is actually changing.
    const home = combatPos(c.id, i, foeCombatants.length, 58, 92);
    const posAt = (t: number): Pos => {
      if (down) return steerAround(home.x, home.y, obstacles);
      if (c.active) return steerAround(home.x, Math.min(1, home.y + 0.15), obstacles);
      const tgt = wanderTarget(c.id, t, [Math.max(52, home.x - 8), Math.min(96, home.x + 8)], [0.15, 0.88]);
      return steerAround(tgt.x, tgt.y, obstacles);
    };
    const st = posAt(tick);
    const prev = posAt(tick - 2);
    const moving = Math.abs(st.x - prev.x) > 0.5 || Math.abs(st.y - prev.y) > 0.02;
    const pose: Pose = down ? 'down' : moving ? 'walk' : 'idle';
    return {
      key: c.id,
      x: st.x,
      y: st.y,
      emoji: c.emoji, name: c.name, hpState: c.hpState, down,
      active: c.active, next: c.next, bubble, pose,
      // Wave 5 resolution order: the appearance token (a descriptor id the DM
      // assigned, riding the emoji path) → descriptor `matches` on the projected
      // name → emoji token. A DM-masked "???" foe carries '❓' and can never
      // match either way — the mask holds.
      sprite: actorSpriteById(c.emoji) ?? actorSpriteForFoe(undefined, c.name),
    };
  });

  // Allies roam by mode, and since Wave 10 A3 all three modes run the SAME
  // wander state machine the party uses — so the walk cycle plays only while the
  // familiar is actually moving (the old pc-mode hover hardcoded moving=false,
  // which is why the cat never animated). Each mode just picks the bounds:
  //   pc    — a patch around the linked PC (the classic familiar)
  //   party — the party's x-range
  //   free  — the whole ground plane
  const pcXs = actors.map((ac) => ac.x);
  const partyLo = pcXs.length ? Math.max(6, Math.min(...pcXs) - 6) : 30;
  const partyHi = pcXs.length ? Math.min(94, Math.max(...pcXs) + 6) : 70;
  const allyActors = v.allies.map((a: PvAlly) => {
    const sprite = actorSpriteById(a.sprite);
    const mode = a.linkedPcId === 'free' ? 'free' : a.linkedPcId ? 'pc' : 'party';
    const owner = mode === 'pc' ? actors.find((ac) => ac.key === a.linkedPcId) : undefined;
    const bounds: { bx: [number, number]; by: [number, number] } =
      mode === 'pc'
        ? (() => { const b = owner ? owner.x : 84; return { bx: [Math.max(6, b - 11), Math.min(94, b + 11)] as [number, number], by: [0.2, 0.85] as [number, number] }; })()
        : mode === 'party'
          ? { bx: [partyLo, partyHi], by: [0.2, 0.85] }
          : { bx: [8, 92], by: [0.05, 0.95] };
    const posAt = (t: number): Pos => {
      if (a.down) return steerAround(bounds.bx[0], bounds.by[1], obstacles);
      const tgt = wanderTarget(a.id, t, bounds.bx, bounds.by);
      return steerAround(tgt.x, tgt.y, obstacles);
    };
    const st = posAt(tick);
    const prev = posAt(tick - 2);
    const moving = Math.abs(st.x - prev.x) > 0.5 || Math.abs(st.y - prev.y) > 0.02;
    return {
      key: a.id, x: st.x, y: st.y, sprite, mode, down: a.down, name: a.name, hpState: a.hpState,
      pose: a.down ? 'down' : moving ? 'walk' : 'idle',
      frame: tick % 2,
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
          : (
            // flat art (128×72 at 3× or 384×216 native) stays a 384-wide
            // bottom-anchored center — never stretched — and mirrored copies
            // extend the scenery seamlessly into the wider canvas' gutters
            <div class="tv-idle-bg-wrap">
              <img src={scene.url} alt="" class="tv-idle-bg-side left" />
              <img src={scene.url} alt="" class="tv-idle-bg" />
              <img src={scene.url} alt="" class="tv-idle-bg-side right" />
            </div>
          )}
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
        {/* camp objects — trophies the DM put on display AND catalog props the
            DM placed (Wave 10 H). Furniture, not actors: they never move, they
            y-sort with everyone else. A prop draws its tileset block; a granted
            trophy draws its emoji. Both derive from the same inventory path. */}
        {(v.inventory ?? []).filter((it) => it.display).map((it) => {
          const prop = propById(it.emoji);
          return prop
            ? <PropObject key={`obj-${it.id}`} def={prop} x={it.display!.x} y={it.display!.y} band={band} />
            : (
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
            );
        })}
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
            {a.bubble && <span class={`tv-idle-bubble${isEmote(a.bubble) ? ' emote' : ''}`}>{a.bubble}</span>}
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
            {/* A2: counter the wrapper's depthScale so the name is a constant
                size at any depth (0.5 keeps the pre-scaled 18px at ~9px). */}
            <span class="tv-idle-name" style={{ transform: `translateX(-50%) scale(${0.5 / depthScale(a.y)})` }}>{a.name}</span>
          </div>
        ))}
        {foes.map((f) => f.sprite ? (
          <SpriteActor
            key={f.key}
            sprite={f.sprite} pose={f.pose} name={f.name}
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
            {f.bubble && <span class={`tv-idle-bubble${isEmote(f.bubble) ? ' emote' : ''}`}>{f.bubble}</span>}
            <span class="tv-foe-emoji">{f.down ? '💀' : f.emoji}</span>
            <span class="tv-foe-name">{f.name}</span>
          </div>
        ))}
        {inCombat && <span class="tv-realm-round">Round {v.combat!.round}</span>}
      </div>
    </div>
  );
}
