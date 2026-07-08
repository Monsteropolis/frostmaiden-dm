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

import { useEffect, useState } from 'preact/hooks';
import { PlayerView, PvPc, PvAlly, HpState } from './projection';
import { sceneById, resolveScene, SCENES, TvScene } from './scenes';
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

// --- positions: actors spread across the stage, walkers drift -------------------
function homeX(i: number, n: number): number {
  return 12 + (76 / Math.max(1, n - 1 || 1)) * i;            // % across the stage
}

interface ActorRender {
  key: string; x: number; row: number; pose: Pose; frame: number;
  name: string; hp: number; maxHp: number; hpState: string; bubble: string | null;
}

export function IdleStage({ v, full = false, pokeActive = null }: {
  v: PlayerView;
  full?: boolean;
  pokeActive?: { pcId: string; kind: 'wave' | 'cheer' } | null;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 700);
    return () => clearInterval(iv);
  }, []);

  // backdrop: the chosen scene if it's pixel art, else the auto pixel mood —
  // the diorama never letterboxes over a book scan.
  const chosen = sceneById(v.sceneId);
  const scene: TvScene = chosen && chosen.cat === 'pixel'
    ? chosen
    : resolveScene('auto', { journeying: !!v.travel, weatherId: v.weather.id }) ?? SCENES[0];

  const anyDown = v.party.some((p) => p.down);
  const ctx = {
    sceneCat: scene.cat, sceneId: scene.id, weatherId: v.weather.id, anyDown,
    lowFood: v.resources.rations < v.resources.partySize,
    richGold: v.resources.gold >= 500,
    wrath: v.weather.id === 'aurils_wrath',
  };

  const behaviorTick = Math.floor(tick / 6);                  // new decisions every ~4s
  const actors: ActorRender[] = v.party.map((p, i) => {
    let pose = pickPose(p, i, behaviorTick, ctx);
    if (pokeActive && !p.down && (pokeActive.pcId === '' || pokeActive.pcId === p.id)) {
      pose = pokeActive.kind === 'cheer' ? 'cheer' : 'wave';
    }
    const frames = POSE_FRAMES[pose];
    const drift = pose === 'walk' ? ((behaviorTick + i) % 2 ? 7 : -7) : 0;
    return {
      key: p.id,
      x: homeX(i, v.party.length) + drift,
      row: archetypeRow(p.cls),
      pose,
      frame: frames[tick % frames.length],
      name: p.name, hp: p.hp, maxHp: p.maxHp, hpState: pcHpState(p),
      bubble: pickBubble(p, i, tick, ctx, pose),
    };
  });

  // familiars hover near their person, hopping between two offsets
  const critters = v.allies.map((a: PvAlly, i) => {
    const owner = actors.find((ac) => ac.key === a.linkedPcId);
    const base = owner ? owner.x : 90 - i * 8;
    const hop = (tick + i) % 6 < 3 ? -6 : 6;
    return { key: a.id, x: base + hop, frame: (tick + i) % 2, down: a.down, name: a.name };
  });

  // cameo: a location-appropriate silhouette drifts by on a slow clock
  const CAMEO_BY_CAT: Record<string, number> = { pixel: 0, location: 0 };
  const cameoIdx = scene.id === 'cave' || scene.id === 'forge' ? 1
    : scene.id === 'road' || scene.id === 'peak' || scene.id === 'lake' ? 2
    : CAMEO_BY_CAT[scene.cat] ?? 0;
  const cameoOn = tick % 90 >= 20 && tick % 90 < 50;          // ~20s pass every ~63s

  return (
    <div class={`tv-idle-stage${full ? ' full' : ''}`}>
      <img src={scene.url} alt="" class="tv-idle-bg" />
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
      {critters.map((c) => !c.down && (
        <span
          key={c.key}
          class="tv-idle-critter"
          title={c.name}
          style={{
            backgroundImage: `url(${critterUrl})`,
            backgroundPosition: `${-((c.frame + 2) % 4) * 12}px 0`,
            left: `${c.x}%`,
          }}
        />
      ))}
      {actors.map((a) => (
        <div key={a.key} class={`tv-idle-actor pose-${a.pose} hp-${a.hpState}`} style={{ left: `${a.x}%` }}>
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
    </div>
  );
}
