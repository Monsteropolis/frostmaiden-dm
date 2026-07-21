// ============================================================
// COINS — the party purse math (Wave 10, Part E).
// Standard 5e denominations and rates:
//   1pp = 10gp   1gp = 10sp   1sp = 10cp
// A coin value is just a count in each denomination; the single
// source of truth is its worth in COPPER. Subtraction borrows
// down automatically (break a platinum into gold, a gold into
// silver…) by working in copper and re-denominating the change.
// Pure functions — unit-tested by tests/currency.mts.
// ============================================================

import { Coins } from '../state/schema';

export const DENOMS = ['pp', 'gp', 'sp', 'cp'] as const;
export type Denom = (typeof DENOMS)[number];

/** Copper value of one of each denomination. */
export const COPPER_PER: Record<Denom, number> = { pp: 1000, gp: 100, sp: 10, cp: 1 };

export const zeroCoins = (): Coins => ({ pp: 0, gp: 0, sp: 0, cp: 0 });

/** Total worth of a purse, in copper. */
export function toCopper(c: Coins): number {
  return c.pp * 1000 + c.gp * 100 + c.sp * 10 + c.cp;
}

/** Re-denominate a copper total into the fewest coins (greedy top-down). This
 *  is the natural result of "borrowing": any change left after a payment is
 *  expressed as whole platinum first, then gold, then silver, then copper. */
export function fromCopper(total: number): Coins {
  let n = Math.max(0, Math.floor(total));
  const pp = Math.floor(n / 1000); n -= pp * 1000;
  const gp = Math.floor(n / 100);  n -= gp * 100;
  const sp = Math.floor(n / 10);   n -= sp * 10;
  return { pp, gp, sp, cp: n };
}

/** Add coins (each denomination summed — no re-denomination, since gaining
 *  coins never forces a break). */
export function addCoins(a: Coins, b: Partial<Coins>): Coins {
  return {
    pp: a.pp + (b.pp ?? 0),
    gp: a.gp + (b.gp ?? 0),
    sp: a.sp + (b.sp ?? 0),
    cp: a.cp + (b.cp ?? 0),
  };
}

/** Nudge a single denomination by delta, never below zero in that denomination
 *  (the Supplies steppers use this — the DM edits each pile directly). */
export function stepCoin(c: Coins, denom: Denom, delta: number): Coins {
  return { ...c, [denom]: Math.max(0, c[denom] + delta) };
}

export interface SubtractResult {
  /** false = the party cannot afford it; `coins` is then unchanged. */
  ok: boolean;
  coins: Coins;
  /** copper short by, when !ok (0 when ok). */
  short: number;
}

/** Spend `cost` from `have`, borrowing across denominations. Insufficient total
 *  funds REFUSE (ok:false, purse untouched) rather than going negative. On
 *  success the remaining copper is re-denominated, which is exactly the borrow:
 *  paying 7cp from {sp:1} leaves {cp:3}; paying 5cp from {pp:1} leaves
 *  {gp:9,sp:9,cp:5}. Coins already fine enough to pay stay unbroken (paying 3cp
 *  from {pp:1,cp:5} leaves {pp:1,cp:2} — the platinum is not touched). */
export function subtractCoins(have: Coins, cost: Coins): SubtractResult {
  const haveCp = toCopper(have);
  const costCp = toCopper(cost);
  if (costCp > haveCp) return { ok: false, coins: have, short: costCp - haveCp };
  return { ok: true, coins: fromCopper(haveCp - costCp), short: 0 };
}

/** A compact readout, biggest denomination first, zeros omitted. Empty purse
 *  renders as "0". Used by the TV footer and the coin chip. */
export function formatCoins(c: Coins): string {
  const parts = DENOMS.filter((d) => c[d] > 0).map((d) => `${c[d]}${d}`);
  return parts.length ? parts.join(' ') : '0';
}
