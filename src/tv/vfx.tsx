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

const SNOW_COUNT: Record<string, number> = {
  clear: 0, overcast: 8, light_snow: 26, heavy_snow: 55,
  blizzard: 90, magical_storm: 70,
};

// Winks of magic — pixel stars that flare rarely at fated spots.
const WINKS = Array.from({ length: 9 }, () => ({
  left: 4 + rand() * 92,
  top: 4 + rand() * 88,
  period: 11 + rand() * 17,        // seconds between flares
  delay: rand() * 23,
  frost: rand() < 0.65,            // frost-cyan or silver
}));

export function TvBackdrop({ weatherId }: { weatherId: string }) {
  const flakes = FLAKE_POOL.slice(0, SNOW_COUNT[weatherId] ?? 20);
  return (
    <div class="tvfx" aria-hidden="true">
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
            animationDuration: `${f.duration}s, ${f.sway}s`,
            animationDelay: `-${f.delay}s, -${f.delay}s`,
            '--drift': `${f.drift}px`,
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
