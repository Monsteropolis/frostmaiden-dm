// Dice — parsing, rolling, and a global roll toast.
import { signal } from '@preact/signals';

export function d(sides: number) {
  return 1 + Math.floor(Math.random() * sides);
}

/** Parse "3", "1d4", "2d6+1" → rolled total (min 1). */
export function rollCount(expr: string): number {
  const m = /^\s*(\d+)?\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) {
    const n = parseInt(expr, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;
  let total = mod;
  for (let i = 0; i < count; i++) total += d(sides);
  return Math.max(1, total);
}

/** Roll damage like "2d6+3" → { total, detail } */
export function rollDamage(expr: string): { total: number; detail: string } {
  const m = /^\s*(\d+)?\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) return { total: parseInt(expr, 10) || 0, detail: expr };
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(d(sides));
  const total = rolls.reduce((a, b) => a + b, 0) + mod;
  return { total, detail: `[${rolls.join(', ')}]${mod ? (mod > 0 ? ` + ${mod}` : ` − ${-mod}`) : ''}` };
}

// --- Roll toast ---------------------------------------------------------------

export interface RollResult { title: string; total: number; detail: string; crit?: 'hit' | 'miss'; }

export const lastRoll = signal<RollResult | null>(null);
let toastTimer: number | undefined;

export function showRoll(r: RollResult) {
  lastRoll.value = r;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (lastRoll.value = null), 3200);
}

export function rollD20(title: string, mod: number) {
  const raw = d(20);
  showRoll({
    title,
    total: raw + mod,
    detail: `d20 [${raw}]${mod ? (mod > 0 ? ` + ${mod}` : ` − ${-mod}`) : ''}`,
    crit: raw === 20 ? 'hit' : raw === 1 ? 'miss' : undefined,
  });
  return raw + mod;
}
