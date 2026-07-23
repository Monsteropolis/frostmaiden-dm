// ============================================================
// PLAYER CASTING SHEET (Wave 11, Part E) — one data model, two
// presentations. Every class resource is a POOL (a maximum, a used
// count, a recharge trigger) or a STAT (a single number the player
// types). Spell slots are just nine long-rest pools; rage, ki,
// action surge, channel divinity, sorcery points are pools too;
// the caster's spellcasting modifier and a misc adjustment are
// stats. Build it once and every class is covered.
//
//   Stat block (casters only) — Save DC / Spell Attack, with
//     proficiency derived from level and the modifier typed by hand
//     (there are no ability scores on the DM's sheet in v1).
//   Pools table — tap a slot to spend, tap again to return; Short /
//     Long rest recharge the right pools (Warlock pact magic is a
//     short-rest pool). Maxima auto-fill from the 5e API and are
//     never overwritten once the player edits one (max_overridden).
//
// Class and level come from the DM's sheet (PvPc) — one source of
// truth; the player never sets either.
// ============================================================

import { useEffect, useRef, useState } from 'preact/hooks';
import type { PvPc } from '../tv/projection';
import type { RealmSession, CharResource, Recharge } from '../backend/realm-client';
import { listCharacterResources, upsertResource, restResources } from '../backend/realm-client';
import { getClassLevel, ApiClassLevel } from '../lib/api';

const CASTER_CLASSES = ['wizard', 'sorcerer', 'bard', 'cleric', 'druid', 'paladin', 'ranger', 'warlock'];

function classSlug(cls: string): string {
  const low = cls.toLowerCase();
  for (const c of CASTER_CLASSES) if (low.includes(c)) return c;
  return (low.match(/[a-z]+/) ?? [''])[0];
}
const isCasterSlug = (slug: string) => CASTER_CLASSES.includes(slug);

/** Proficiency derives from level automatically (PHB): 2 + ⌊(L−1)/4⌋. */
const proficiencyFor = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

// The class_specific counts the 5e API exposes that read as spendable pools,
// with the recharge each one gets. (Superiority dice live under a subclass
// feature, not class_specific — a Battle Master overrides that max by hand.)
const CLASS_SPECIFIC_POOLS: Record<string, { key: string; label: string; recharge: Recharge }> = {
  rage_count:               { key: 'rage', label: 'Rage', recharge: 'long' },
  ki_points:                { key: 'ki', label: 'Ki', recharge: 'short' },
  action_surges:            { key: 'action_surge', label: 'Action Surge', recharge: 'short' },
  indomitable_uses:         { key: 'indomitable', label: 'Indomitable', recharge: 'long' },
  sorcery_points:           { key: 'sorcery_points', label: 'Sorcery Points', recharge: 'long' },
  channel_divinity_charges: { key: 'channel_divinity', label: 'Channel Divinity', recharge: 'short' },
};

const POOL_LABELS: Record<string, string> = {
  pact: 'Pact slots', rage: 'Rage', ki: 'Ki', action_surge: 'Action Surge',
  indomitable: 'Indomitable', sorcery_points: 'Sorcery Points',
  channel_divinity: 'Channel Divinity', superiority: 'Superiority Dice',
};
function poolLabel(key: string): string {
  if (key.startsWith('slot_')) return `Level ${key.slice(5)}`;
  return POOL_LABELS[key] ?? key.replace(/_/g, ' ');
}
const isSlotKey = (key: string) => key.startsWith('slot_') || key === 'pact';

interface ExpectedPool { key: string; max: number; recharge: Recharge }

/** The maxima the class/level implies, straight from the API level object. */
function expectedPools(slug: string, api: ApiClassLevel): ExpectedPool[] {
  const out: ExpectedPool[] = [];
  const sc = api.spellcasting ?? {};
  if (slug === 'warlock') {
    // Pact Magic: a single pool of slots that all recharge on a SHORT rest.
    const count = Number(sc.spell_slots_level_1 ?? 0);
    if (count > 0) out.push({ key: 'pact', max: count, recharge: 'short' });
  } else {
    for (let n = 1; n <= 9; n++) {
      const c = Number(sc[`spell_slots_level_${n}`] ?? 0);
      if (c > 0) out.push({ key: `slot_${n}`, max: c, recharge: 'long' });
    }
  }
  const cs = api.class_specific ?? {};
  for (const [apiKey, def] of Object.entries(CLASS_SPECIFIC_POOLS)) {
    const v = Number(cs[apiKey] ?? 0);
    if (v > 0) out.push({ key: def.key, max: v, recharge: def.recharge });
  }
  return out;
}

/** Pact-slot level, for the label ("Pact slots · Lv 3"). */
function pactSlotLevel(api: ApiClassLevel | null): number {
  return api ? Number(api.spellcasting?.slot_level ?? 0) : 0;
}

type RowMap = Record<string, CharResource>;
const poolK = (key: string) => `pool:${key}`;
const statK = (key: string) => `stat:${key}`;

export function CastingPanel({ session, pc }: { session: RealmSession; pc: PvPc | null }) {
  const [rows, setRows] = useState<RowMap | null>(null);
  const [api, setApi] = useState<ApiClassLevel | null | 'loading'>('loading');
  const [err, setErr] = useState('');
  const [confirmRest, setConfirmRest] = useState<Recharge | null>(null);
  const [editMax, setEditMax] = useState<string | null>(null);
  const filledRef = useRef(false);

  const slug = pc ? classSlug(pc.cls) : '';
  const level = pc?.level ?? 1;
  const caster = isCasterSlug(slug);

  // Load the player's own resource rows (their pools + stats).
  useEffect(() => {
    let alive = true;
    filledRef.current = false;
    listCharacterResources(session.token)
      .then((list) => {
        if (!alive) return;
        const map: RowMap = {};
        for (const r of list) map[r.kind === 'stat' ? statK(r.key) : poolK(r.key)] = r;
        setRows(map);
      })
      .catch((e) => { if (alive) { setErr(e instanceof Error ? e.message : String(e)); setRows({}); } });
    return () => { alive = false; };
  }, [session.token]);

  // Fetch the class/level definition (slot counts + class_specific), cached.
  useEffect(() => {
    let alive = true;
    setApi('loading');
    if (!slug) { setApi(null); return; }
    getClassLevel(slug, level).then((r) => { if (alive) setApi(r); });
    return () => { alive = false; };
  }, [slug, level]);

  // Auto-fill (E4): create missing pools and refresh maxima FROM the API, but
  // never touch a max the player has overridden. Runs once per load.
  useEffect(() => {
    if (filledRef.current) return;
    if (rows === null || api === 'loading') return;   // wait for both
    filledRef.current = true;
    if (!api) return;                                  // offline — keep what we have
    const next = { ...rows };
    const writes: Parameters<typeof upsertResource>[1][] = [];
    for (const e of expectedPools(slug, api)) {
      const k = poolK(e.key);
      const cur = next[k];
      if (!cur) {
        next[k] = { kind: 'pool', key: e.key, max: e.max, used: 0, recharge: e.recharge, value: 0, maxOverridden: false };
        writes.push({ kind: 'pool', key: e.key, max: e.max, recharge: e.recharge });
      } else if (!cur.maxOverridden && cur.max !== e.max) {
        next[k] = { ...cur, max: e.max };
        writes.push({ kind: 'pool', key: e.key, max: e.max });
      }
    }
    if (writes.length) {
      setRows(next);
      Promise.all(writes.map((w) => upsertResource(session.token, w)))
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    }
  }, [rows, api, slug]);

  if (!pc) {
    return <div class="realm-ability-empty">Sign in as your character to see your resources.</div>;
  }

  const prof = proficiencyFor(level);
  const patch = (key: string, kind: 'pool' | 'stat', changes: Partial<CharResource>) => {
    if (!rows) return;
    const k = kind === 'stat' ? statK(key) : poolK(key);
    const base: CharResource = rows[k] ?? { kind, key, max: 0, used: 0, recharge: 'long', value: 0, maxOverridden: false };
    const merged = { ...base, ...changes };
    setRows({ ...rows, [k]: merged });
    upsertResource(session.token, { kind, key, ...changes })
      .then(() => setErr(''))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };

  const spend = (p: CharResource) => { if (p.used < p.max) patch(p.key, 'pool', { used: p.used + 1 }); };
  const giveBack = (p: CharResource) => { if (p.used > 0) patch(p.key, 'pool', { used: p.used - 1 }); };
  const setMax = (p: CharResource, max: number) => {
    const m = Math.max(0, max);
    patch(p.key, 'pool', { max: m, used: Math.min(p.used, m), maxOverridden: true });
  };

  const pools = rows ? Object.values(rows).filter((r) => r.kind === 'pool') : [];
  const slotPools = pools.filter((p) => isSlotKey(p.key))
    .sort((a, b) => (a.key === 'pact' ? -1 : b.key === 'pact' ? 1 : Number(a.key.slice(5)) - Number(b.key.slice(5))));
  const classPools = pools.filter((p) => !isSlotKey(p.key)).sort((a, b) => a.key.localeCompare(b.key));

  const castingMod = rows?.[statK('casting_mod')]?.value ?? 0;
  const misc = rows?.[statK('misc')]?.value ?? 0;
  const saveDC = 8 + prof + castingMod + misc;
  const attack = prof + castingMod + misc;
  const withSign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  const doRest = (which: Recharge) => {
    if (!rows) return;
    // A long rest recharges everything; a short rest only short-rest pools.
    const affected = pools.filter((p) => which === 'long' || p.recharge === 'short');
    const next = { ...rows };
    for (const p of affected) next[poolK(p.key)] = { ...p, used: 0 };
    setRows(next);
    setConfirmRest(null);
    restResources(session.token, affected.map((p) => p.key))
      .then(() => setErr(''))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };

  const loading = rows === null || api === 'loading';
  const nothingToShow = !loading && !caster && pools.length === 0;

  return (
    <div class="realm-casting">
      <div class="realm-ability-head">
        <span class="realm-ability-who">🔮 {pc.name} · {pc.cls} {pc.level}</span>
      </div>

      {err && <div class="realm-login-error">{err}</div>}
      {api === null && !loading && (
        <p class="realm-journal-fine">Couldn't reach the class tables — connect once to cache them. You can still
          adjust any pools you already have.</p>
      )}
      {loading && <p class="realm-journal-fine">Loading your sheet…</p>}

      {/* Stat block — casters only. */}
      {!loading && caster && (
        <div class="realm-cast-statblock">
          <div class="realm-cast-stat big">
            <span class="realm-cast-stat-v">{saveDC}</span>
            <span class="realm-cast-stat-l">Spell Save DC</span>
          </div>
          <div class="realm-cast-stat big">
            <span class="realm-cast-stat-v">{withSign(attack)}</span>
            <span class="realm-cast-stat-l">Spell Attack</span>
          </div>
          <div class="realm-cast-inputs">
            <StatStepper label="Casting mod" value={castingMod} signed
              onDelta={(d) => patch('casting_mod', 'stat', { value: castingMod + d })} />
            <StatStepper label="Misc" value={misc} signed
              onDelta={(d) => patch('misc', 'stat', { value: misc + d })} />
            <div class="realm-cast-derive">Proficiency <b>{withSign(prof)}</b> · from level {level}</div>
          </div>
          <p class="realm-journal-fine">DC = 8 + proficiency + casting modifier + misc. Attack drops the 8. Type
            your own casting ability modifier — the DM's sheet has no ability scores in v1.</p>
        </div>
      )}

      {/* Pools. */}
      {!loading && slotPools.length > 0 && (
        <PoolSection title={slug === 'warlock' ? `Pact Magic${pactSlotLevel(api) ? ` · Lv ${pactSlotLevel(api)}` : ''}` : 'Spell slots'}
          pools={slotPools} editMax={editMax} setEditMax={setEditMax}
          onSpend={spend} onReturn={giveBack} onSetMax={setMax} />
      )}
      {!loading && classPools.length > 0 && (
        <PoolSection title="Class resources"
          pools={classPools} editMax={editMax} setEditMax={setEditMax}
          onSpend={spend} onReturn={giveBack} onSetMax={setMax} />
      )}

      {nothingToShow && (
        <div class="realm-ability-empty">
          <p><b>{pc.cls}</b> · Level {pc.level}</p>
          <p>This class has no spendable pools to track at this level — its power comes from features rather than
            a resource you count down. Ask your DM about what you've unlocked.</p>
        </div>
      )}

      {/* Rests — each behind a confirm. */}
      {!loading && (caster || pools.length > 0) && (
        <div class="realm-cast-rest">
          {confirmRest === 'short'
            ? <><span class="realm-cast-rest-q">Short rest?</span>
                <button class="realm-cast-rest-go" onClick={() => doRest('short')}>Yes, recharge</button>
                <button onClick={() => setConfirmRest(null)}>Cancel</button></>
            : confirmRest === 'long'
            ? <><span class="realm-cast-rest-q">Long rest?</span>
                <button class="realm-cast-rest-go" onClick={() => doRest('long')}>Yes, recharge all</button>
                <button onClick={() => setConfirmRest(null)}>Cancel</button></>
            : <><button onClick={() => setConfirmRest('short')}>☕ Short rest</button>
                <button onClick={() => setConfirmRest('long')}>🌙 Long rest</button></>}
        </div>
      )}
    </div>
  );
}

function PoolSection({ title, pools, editMax, setEditMax, onSpend, onReturn, onSetMax }: {
  title: string; pools: CharResource[];
  editMax: string | null; setEditMax: (k: string | null) => void;
  onSpend: (p: CharResource) => void; onReturn: (p: CharResource) => void; onSetMax: (p: CharResource, m: number) => void;
}) {
  return (
    <div class="realm-cast-pools">
      <div class="realm-spell-level">{title}</div>
      {pools.map((p) => {
        const remaining = Math.max(0, p.max - p.used);
        const editing = editMax === p.key;
        return (
          <div class="realm-cast-pool" key={p.key}>
            <div class="realm-cast-pool-head">
              <span class="realm-cast-pool-name">{poolLabel(p.key)}</span>
              <span class={`realm-cast-recharge ${p.recharge}`}>{p.recharge === 'short' ? 'short rest' : 'long rest'}</span>
              <button class="realm-cast-editmax" onClick={() => setEditMax(editing ? null : p.key)} aria-label="Edit maximum">
                {remaining}/{p.max}{p.maxOverridden ? ' ✎' : ''}
              </button>
            </div>
            {editing ? (
              <div class="realm-cast-maxedit">
                <span>Max</span>
                <button onClick={() => onSetMax(p, p.max - 1)} aria-label="Max minus one">−</button>
                <span class="realm-cast-maxedit-v">{p.max}</span>
                <button onClick={() => onSetMax(p, p.max + 1)} aria-label="Max plus one">＋</button>
                <button class="realm-cast-maxedit-done" onClick={() => setEditMax(null)}>Done</button>
              </div>
            ) : (
              <div class="realm-cast-pips">
                {Array.from({ length: Math.max(p.max, 0) }, (_, i) => {
                  const filled = i < remaining;
                  return (
                    <button
                      key={i}
                      class={`realm-cast-pip${filled ? ' on' : ''}`}
                      aria-label={filled ? 'Spend one' : 'Return one'}
                      onClick={() => (filled ? onSpend(p) : onReturn(p))}
                    />
                  );
                })}
                {p.max === 0 && <span class="realm-journal-fine">No uses — tap the count to set a maximum.</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatStepper({ label, value, onDelta, signed = false }: {
  label: string; value: number; onDelta: (d: number) => void; signed?: boolean;
}) {
  const show = signed ? (value >= 0 ? `+${value}` : `${value}`) : `${value}`;
  return (
    <div class="realm-cast-input">
      <span class="realm-cast-input-l">{label}</span>
      <div class="realm-cast-input-ctl">
        <button onClick={() => onDelta(-1)} aria-label={`${label} minus one`}>−</button>
        <span class="realm-cast-input-v">{show}</span>
        <button onClick={() => onDelta(1)} aria-label={`${label} plus one`}>＋</button>
      </div>
    </div>
  );
}
