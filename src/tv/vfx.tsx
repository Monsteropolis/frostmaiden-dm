// ============================================================
// TV BACKDROP VFX — the cosmic dark behind everything.
// Same soul as the phone app's Starfield: stars are little fates,
// tiny in the greatness of it all; snow rides one steady wind;
// the aurora breathes; and now and then a wink of magic —
// a pixel star that flares and is gone.
// Deterministic (same seed family as the app) so the sky is the
// same every session. Snow density reacts to the weather id.
// Everything honors prefers-reduced-motion via tv.css.
// ============================================================

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1489); // the year the Rime began — same sky as the phone

const STARS = Array.from({ length: 110 }, (_, i) => ({
  left: rand() * 100,
  top: rand() * 100,
  size: rand() < 0.12 ? 4 : rand() < 0.5 ? 3 : 2,   // chunky pixels for the couch
  opacity: 0.2 + rand() * 0.5,
  twinkle: i % 8 === 0,
  delay: rand() * 6,
}));

// Snow tiers by weather — the storm decides how many flakes fly.
const FLAKE_POOL = Array.from({ length: 90 }, (_, i) => ({
  left: rand() * 100,
  size: rand() < 0.3 ? 4 : 3,                        // square pixel flakes
  duration: 7 + rand() * 9,
  delay: rand() * 14,
  drift: 40 + rand() * 180,
  sway: 2.5 + rand() * 3,
  opacity: 0.25 + rand() * 0.5,
  gust: i % 5 === 0,
}));

// The storm decides everything: how many flakes, how fast they fall,
// whether clouds crowd the sky, whether Auril's magic rides the wind.
const WX: Record<string, { flakes: number; speed: number; clouds: number; motes: number; streaks: number; sparkles: number }> = {
  clear:         { flakes: 4,  speed: 1.6,  clouds: 0, motes: 0,  streaks: 0,  sparkles: 0 },  // a few lazy flakes, open sky
  overcast:      { flakes: 8,  speed: 1.2,  clouds: 6, motes: 0,  streaks: 0,  sparkles: 0 },  // a lid of cloud, aurora smothered
  light_snow:    { flakes: 26, speed: 1,    clouds: 1, motes: 0,  streaks: 0,  sparkles: 0 },
  heavy_snow:    { flakes: 60, speed: 0.75, clouds: 3, motes: 0,  streaks: 0,  sparkles: 0 },
  blizzard:      { flakes: 90, speed: 0.4,  clouds: 4, motes: 0,  streaks: 14, sparkles: 0 },  // driven sideways, wind streaks
  magical_storm: { flakes: 55, speed: 0.7,  clouds: 2, motes: 14, streaks: 6,  sparkles: 10 }, // Auril's wrath: motes + sparkles
};

// wind streaks — long diagonal slashes tearing across a blizzard
const STREAK_POOL = Array.from({ length: 14 }, () => ({
  top: rand() * 100,
  duration: 0.9 + rand() * 1.4,
  delay: rand() * 3,
  width: 60 + rand() * 90,
  opacity: 0.14 + rand() * 0.2,
}));

// Auril's sparkles — four-point pixel stars that pop, spin the light, and die
const SPARKLE_POOL = Array.from({ length: 10 }, (_, i) => ({
  left: 3 + rand() * 94,
  top: 5 + rand() * 82,
  period: 3.5 + rand() * 4.5,
  delay: rand() * 8,
  big: i % 3 === 0,
}));

// drifting pixel clouds for overcast skies — deterministic like everything else
const CLOUD_POOL = Array.from({ length: 6 }, (_, i) => ({
  top: 3 + rand() * 22,
  width: 220 + rand() * 260,
  duration: 90 + rand() * 80,
  delay: rand() * 120,
  opacity: 0.10 + rand() * 0.10,
  flip: i % 2 === 1,
}));

// motes of Auril's magic — thread-garnet and frost sparks spiraling down
const MOTE_POOL = Array.from({ length: 14 }, (_, i) => ({
  left: rand() * 100,
  duration: 9 + rand() * 8,
  delay: rand() * 12,
  sway: 1.2 + rand() * 1.6,
  thread: i % 3 === 0,             // every third burns garnet; the rest frost-violet
}));

// Winks of magic — pixel stars that flare rarely at fated spots.
const WINKS = Array.from({ length: 9 }, () => ({
  left: 4 + rand() * 92,
  top: 4 + rand() * 88,
  period: 11 + rand() * 17,        // seconds between flares
  delay: rand() * 23,
  frost: rand() < 0.65,            // frost-cyan or silver
}));

export function TvBackdrop({ weatherId }: { weatherId: string }) {
  const wx = WX[weatherId] ?? WX.light_snow;
  const flakes = FLAKE_POOL.slice(0, wx.flakes);
  const clouds = CLOUD_POOL.slice(0, wx.clouds);
  const motes = MOTE_POOL.slice(0, wx.motes);
  const streaks = STREAK_POOL.slice(0, wx.streaks);
  const sparkles = SPARKLE_POOL.slice(0, wx.sparkles);
  return (
    <div class={`tvfx wx-${weatherId}`} aria-hidden="true">
      {clouds.map((c) => (
        <span
          class={`tvfx-cloud${c.flip ? ' flip' : ''}`}
          style={{
            top: `${c.top}%`, width: `${c.width}px`,
            opacity: c.opacity,
            animationDuration: `${c.duration}s`,
            animationDelay: `-${c.delay}s`,
          }}
        />
      ))}
      {STARS.map((s) => (
        <span
          class={`tvfx-star${s.twinkle ? ' tw' : ''}`}
          style={{
            left: `${s.left}%`, top: `${s.top}%`,
            width: `${s.size}px`, height: `${s.size}px`,
            opacity: s.opacity, animationDelay: `${s.delay}s`,
          }}
        />
      ))}
      <div class="tvfx-aurora" />
      {flakes.map((f) => (
        <span
          class={`tvfx-flake${f.gust ? ' gust' : ''}`}
          style={{
            left: `${f.left}%`, width: `${f.size}px`, height: `${f.size}px`,
            opacity: f.opacity,
            animationDuration: `${f.duration * wx.speed}s, ${f.sway * wx.speed}s`,
            animationDelay: `-${f.delay}s, -${f.delay}s`,
            '--drift': `${f.drift * (wx.speed < 0.7 ? 1.8 : 1)}px`,
          }}
        />
      ))}
      {streaks.map((st) => (
        <span
          class="tvfx-streak"
          style={{
            top: `${st.top}%`, width: `${st.width}px`,
            opacity: st.opacity,
            animationDuration: `${st.duration}s`,
            animationDelay: `-${st.delay}s`,
          }}
        />
      ))}
      {sparkles.map((sp) => (
        <span
          class={`tvfx-sparkle${sp.big ? ' big' : ''}`}
          style={{
            left: `${sp.left}%`, top: `${sp.top}%`,
            animationDuration: `${sp.period}s`,
            animationDelay: `${sp.delay}s`,
          }}
        />
      ))}
      {motes.map((m) => (
        <span
          class={`tvfx-mote${m.thread ? ' thread' : ''}`}
          style={{
            left: `${m.left}%`,
            animationDuration: `${m.duration}s, ${m.sway}s, 0.7s`,
            animationDelay: `-${m.delay}s, -${m.delay}s, ${m.delay % 0.7}s`,
          }}
        />
      ))}
      {WINKS.map((w) => (
        <span
          class={`tvfx-wink${w.frost ? '' : ' silver'}`}
          style={{
            left: `${w.left}%`, top: `${w.top}%`,
            animationDuration: `${w.period}s`,
            animationDelay: `${w.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
