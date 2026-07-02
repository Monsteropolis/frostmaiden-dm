// Souls against the cosmic dark. Deterministic (seeded) so the
// sky is the same every session — your table's constellation.

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1489); // the year the Rime began, naturally

const STARS = Array.from({ length: 56 }, (_, i) => ({
  left: rand() * 100,
  top: rand() * 100,
  size: rand() < 0.15 ? 2.5 : rand() < 0.5 ? 1.5 : 1,
  opacity: 0.25 + rand() * 0.55,
  twinkle: i % 9 === 0,
  delay: rand() * 5,
}));

export function Starfield() {
  return (
    <div class="starfield" aria-hidden="true">
      {STARS.map((s) => (
        <span
          class={`star${s.twinkle ? ' tw' : ''}`}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: s.opacity,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
