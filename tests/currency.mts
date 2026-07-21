// ============================================================
// CURRENCY TESTS (Wave 10, Part E) — the coin borrow math.
// subtractCoins() must break higher denominations down to pay a
// smaller one, refuse when the total is short, and never touch
// coins it doesn't need to. Run in `npm run build` alongside the
// seam test so a broken purse fails the deploy.
// ============================================================
import { Coins } from '../src/state/schema.ts';
import {
  subtractCoins, addCoins, toCopper, fromCopper, formatCoins, zeroCoins,
} from '../src/lib/currency.ts';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
}
const C = (pp: number, gp: number, sp: number, cp: number): Coins => ({ pp, gp, sp, cp });
const eq = (a: Coins, b: Coins) => a.pp === b.pp && a.gp === b.gp && a.sp === b.sp && a.cp === b.cp;
const show = (c: Coins) => `{pp:${c.pp} gp:${c.gp} sp:${c.sp} cp:${c.cp}}`;

// ---- worth conversions -----------------------------------------------------
check('toCopper — 1pp = 1000cp', toCopper(C(1, 0, 0, 0)) === 1000);
check('toCopper — mixed purse', toCopper(C(1, 2, 3, 4)) === 1234);
check('fromCopper — 1234 → 1pp 2gp 3sp 4cp', eq(fromCopper(1234), C(1, 2, 3, 4)));
check('fromCopper — 0 → empty', eq(fromCopper(0), zeroCoins()));

// ---- the brief's canonical single borrow -----------------------------------
{
  const r = subtractCoins(C(0, 0, 1, 0), C(0, 0, 0, 7));   // 7cp from 1sp
  check('single borrow — 7cp from {sp:1} → {cp:3}, ok', r.ok && eq(r.coins, C(0, 0, 0, 3)), show(r.coins));
}

// ---- multi-level borrow: pay copper holding only platinum ------------------
{
  const r = subtractCoins(C(1, 0, 0, 0), C(0, 0, 0, 5));   // 5cp from 1pp
  check('multi-level borrow — 5cp from {pp:1} → {gp:9,sp:9,cp:5}, ok',
    r.ok && eq(r.coins, C(0, 9, 9, 5)), show(r.coins));
}
{
  const r = subtractCoins(C(2, 0, 0, 0), C(0, 0, 3, 4));   // 34cp from 2pp (=2000)
  check('multi-level borrow — 34cp from {pp:2} → {pp:1,gp:9,sp:6,cp:6}, ok',
    r.ok && eq(r.coins, C(1, 9, 6, 6)), show(r.coins));
}

// ---- coins fine enough to pay stay unbroken --------------------------------
{
  const r = subtractCoins(C(1, 0, 0, 5), C(0, 0, 0, 3));   // 3cp from {pp:1,cp:5}
  check('no needless break — 3cp from {pp:1,cp:5} → {pp:1,cp:2}, platinum intact',
    r.ok && eq(r.coins, C(1, 0, 0, 2)), show(r.coins));
}

// ---- insufficient funds refuse, purse untouched ----------------------------
{
  const before = C(0, 0, 0, 6);
  const r = subtractCoins(before, C(0, 0, 0, 7));          // 7cp from 6cp
  check('insufficient — refuses and leaves the purse untouched',
    !r.ok && eq(r.coins, before) && r.short === 1, `short=${r.short} ${show(r.coins)}`);
}
{
  const before = C(0, 1, 0, 0);
  const r = subtractCoins(before, C(1, 0, 0, 0));          // 1pp from 1gp
  check('insufficient across denominations — refuses',
    !r.ok && eq(r.coins, before) && r.short === 900, `short=${r.short}`);
}

// ---- exact payment empties the purse ---------------------------------------
{
  const r = subtractCoins(C(0, 1, 0, 0), C(0, 0, 10, 0));  // 10sp from 1gp
  check('exact — 10sp from {gp:1} → empty', r.ok && eq(r.coins, zeroCoins()), show(r.coins));
}

// ---- add + format ----------------------------------------------------------
check('addCoins — sums each denomination', eq(addCoins(C(1, 1, 1, 1), { gp: 2, cp: 3 }), C(1, 3, 1, 4)));
check('formatCoins — omits zeros, biggest first', formatCoins(C(1, 0, 3, 0)) === '1pp 3sp');
check('formatCoins — empty purse reads 0', formatCoins(zeroCoins()) === '0');

// ---- result ----------------------------------------------------------------
console.log(`\nCurrency tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) { console.error('🚨 Coin math is wrong — refusing to build.'); process.exit(1); }
process.exit(0);
