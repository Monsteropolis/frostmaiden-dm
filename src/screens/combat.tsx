import { useState } from 'preact/hooks';
import { state, patch } from '../state/store';
import { Combatant, PresetCombatant, Difficulty, EncounterPreset } from '../state/schema';
import { Sheet, ConfirmBtn, Field, NumInput, CondEditor } from '../components/ui';
import { d, rollCount, rollD20, rollDamage, showRoll } from '../lib/dice';
import { CREATURES, ENCOUNTERS, ENC_TABLES, SeedCreature } from '../data';
import { ApiMonsterPanel, getApiMonster } from '../lib/api';
import { useBestiary, BestiaryEntry, MonsterForm, StatPanel, customMonsterById } from './monsters';
import { HpBar } from './party';

// ---------------------------------------------------------------- helpers

let idCounter = 0;
const cid = () => `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function creatureById(id?: string): SeedCreature | undefined {
  return CREATURES.find((c) => c.id === id);
}

function abilityMod(score: unknown): number {
  return typeof score === 'number' ? Math.floor((score - 10) / 2) : 0;
}

/** Resolve preset combatant refs (with dice counts) into tracker combatants. */
function resolvePreset(list: PresetCombatant[]): Combatant[] {
  const out: Combatant[] = [];
  for (const ref of list) {
    const creature = ref.srcType === 'monster' ? creatureById(ref.srcId) : undefined;
    const name = (creature?.name as string) ?? ref.name ?? 'Creature';
    const emoji = (creature?.emoji as string) ?? ref.emoji ?? '👾';
    const hp = (creature?.hp as number) ?? ref.hp ?? 10;
    const ac = (creature?.ac as number) ?? ref.ac ?? 12;
    const initMod = creature ? abilityMod(creature.dex) : 0;
    const n = rollCount(ref.count || '1');
    for (let i = 0; i < n; i++) {
      out.push({
        id: cid(),
        name: n > 1 ? `${name} ${i + 1}` : name,
        emoji, hp, maxHp: hp, ac,
        init: null, initMod, conditions: [],
        srcType: ref.srcType === 'monster' ? 'monster' : ref.srcType === 'api' ? 'api' : 'custom',
        srcId: ref.srcId,
      });
    }
  }
  return out;
}

function sortCombatants(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => (b.init ?? -99) - (a.init ?? -99));
}

// HP changes sync back to the linked PC/ally so Party stays truthful.
function applyHp(id: string, delta: number | 'set' | 'full', setVal = 0) {
  patch((s) => {
    const c = s.combat.combatants.find((x) => x.id === id); if (!c) return;
    c.hp = delta === 'full' ? c.maxHp
      : delta === 'set' ? Math.max(0, Math.min(c.maxHp, setVal))
      : Math.max(0, Math.min(c.maxHp, c.hp + delta));
    if (c.srcType === 'pc' && c.srcId) {
      const p = s.party.find((x) => x.id === c.srcId);
      if (p) { p.hp = Math.max(0, Math.min(p.maxHp, c.hp)); if (p.hp > 0) { p.deathS = 0; p.deathF = 0; } }
    }
    if (c.srcType === 'ally' && c.srcId) {
      const a = s.sidekicks.find((x) => x.id === c.srcId);
      if (a) a.hp = Math.max(0, Math.min(a.maxHp, c.hp));
    }
  });
}

// ---------------------------------------------------------------- stat panel

function parseAttack(desc: string): { bonus?: number; dmg?: string } {
  const bonus = /([+-]\d+)\s*to hit/i.exec(desc)?.[1];
  const dmg = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/i.exec(desc)?.[1];
  return { bonus: bonus ? parseInt(bonus, 10) : undefined, dmg: dmg?.replace(/\s/g, '') };
}

export function MonsterPanel({ srcId, name }: { srcId?: string; name: string }) {
  const m = creatureById(srcId);
  if (!m) return null;
  const traits = (m.traits ?? []) as { n: string; d: string }[];
  const actions = (m.actions ?? []) as { n: string; d: string }[];
  return (
    <div class="stat-panel">
      <div class="stat-line">
        <span>{String(m.size)} {String(m.type)} · CR {String(m.cr)}</span>
        <span>{String(m.speed)}</span>
      </div>
      <div class="score-row">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((k) => (
          <button class="score" onClick={() => rollD20(`${name} — ${k.toUpperCase()}`, abilityMod(m[k]))}>
            <span class="score-k">{k.toUpperCase()}</span>
            <span class="score-v">{String(m[k])}</span>
          </button>
        ))}
      </div>
      {String(m.senses || '') && <p class="stat-fine">{String(m.senses)}{m.skills ? ` · ${String(m.skills)}` : ''}</p>}
      {traits.map((t) => <p class="stat-trait"><strong>{t.n}.</strong> {t.d}</p>)}
      {actions.map((a) => {
        const atk = parseAttack(a.d);
        return (
          <div class="stat-action">
            <p class="stat-trait"><strong>{a.n}.</strong> {a.d}</p>
            {(atk.bonus !== undefined || atk.dmg) && (
              <div class="attack-row">
                {atk.bonus !== undefined && <button class="btn mini" onClick={() => rollD20(`${name} — ${a.n}`, atk.bonus!)}>d20{atk.bonus >= 0 ? '+' : ''}{atk.bonus}</button>}
                {atk.dmg && <button class="btn mini" onClick={() => { const r = rollDamage(atk.dmg!); showRoll({ title: `${a.n} — damage`, total: r.total, detail: r.detail }); }}>{atk.dmg}</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- tracker row

// Death saves in the tracker — they live on the party record (srcId),
// so marks made here appear on the Party tab and the TV instantly.
function DeathPipsInline({ pcId }: { pcId?: string }) {
  const pc = state.value.party.find((p) => p.id === pcId);
  if (!pc) return null;
  return (
    <span class="ds-inline">
      {' · '}
      {[0, 1, 2].map((i) => <span class={`ds ${i < pc.deathS ? 'ok' : ''}`}>✦</span>)}
      <span class="ds-sep">/</span>
      {[0, 1, 2].map((i) => <span class={`ds ${i < pc.deathF ? 'bad' : ''}`}>✕</span>)}
    </span>
  );
}

function DeathSavesEditor({ pcId }: { pcId?: string }) {
  const pc = state.value.party.find((p) => p.id === pcId);
  if (!pc) return null;
  const set = (k: 'deathS' | 'deathF', n: number) => patch((s) => {
    const p = s.party.find((x) => x.id === pcId); if (!p) return;
    p[k] = p[k] === n ? n - 1 : n; // tap the same pip to untick it
  });
  return (
    <div class="death-saves-row">
      {(['deathS', 'deathF'] as const).map((k) => (
        <div class="ds-group">
          <span class="field-label" style={{ margin: 0 }}>{k === 'deathS' ? 'Saves' : 'Fails'}</span>
          {[1, 2, 3].map((n) => (
            <button
              class={`ds-pip ${k === 'deathF' ? 'fail' : ''} ${pc[k] >= n ? 'on' : ''}`}
              aria-label={`${k === 'deathS' ? 'Success' : 'Failure'} ${n}`}
              onClick={() => set(k, n)}
            >{k === 'deathS' ? '✦' : '✕'}</button>
          ))}
        </div>
      ))}
    </div>
  );
}

function CombatRow({ c, active }: { c: Combatant; active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div class={`card unit combat-row ${active ? 'turn' : ''} ${c.hp <= 0 ? 'dying' : ''}`}
         id={`cb-${c.id}`}>
      <div class="cr-grid" onClick={() => setOpen(!open)}>
        <NumInput w="44px" value={c.init ?? 0}
          onInput={(n) => patch((s) => { const x = s.combat.combatants.find((y) => y.id === c.id); if (x) x.init = n; })} />
        <div class="cr-id">
          <div class="cr-name">{c.emoji} {c.name}</div>
          <div class="unit-meta">
            AC {c.ac}{c.conditions.length ? ` · ${c.conditions.join(', ')}` : ''}
            {c.srcType === 'pc' && c.hp <= 0 && <DeathPipsInline pcId={c.srcId} />}
          </div>
        </div>
        <div class="hp-ctl" onClick={(e) => e.stopPropagation()}>
          <button class="hp-btn" onClick={() => applyHp(c.id, -1)} aria-label="Damage 1">−</button>
          <HpBar hp={c.hp} max={c.maxHp} />
          <button class="hp-btn" onClick={() => applyHp(c.id, +1)} aria-label="Heal 1">+</button>
        </div>
      </div>

      {open && (
        <div class="unit-detail">
          <div class="hp-quick">
            <button class="btn" onClick={() => applyHp(c.id, -5)}>−5</button>
            <button class="btn" onClick={() => applyHp(c.id, +5)}>+5</button>
            <NumInput w="76px" value={c.hp} onInput={(n) => applyHp(c.id, 'set', n)} />
            <button class="btn" onClick={() => applyHp(c.id, 'full')}>Full</button>
          </div>
          {c.srcType === 'pc' && c.hp <= 0 && <DeathSavesEditor pcId={c.srcId} />}
          <CondEditor current={c.conditions} onToggle={(cond) => patch((s) => {
            const x = s.combat.combatants.find((y) => y.id === c.id); if (!x) return;
            x.conditions = x.conditions.includes(cond) ? x.conditions.filter((z) => z !== cond) : [...x.conditions, cond];
          })} />
          {c.srcType === 'monster' && <MonsterPanel srcId={c.srcId} name={c.name} />}
          {c.srcType === 'api' && c.srcId && <ApiMonsterPanel index={c.srcId} name={c.name} />}
          {c.srcType === 'custommon' && customMonsterById(c.srcId) && <StatPanel m={customMonsterById(c.srcId)!} />}
          <div class="row-actions">
            {c.srcType !== 'pc' && c.srcType !== 'ally' && (() => {
              const hidden = state.value.tv.hiddenCombatantIds.includes(c.id);
              return (
                <button class={`btn ghost tv-hide-btn ${hidden ? 'on' : ''}`}
                  onClick={() => patch((s) => {
                    const list = s.tv.hiddenCombatantIds;
                    const i = list.indexOf(c.id);
                    if (i >= 0) list.splice(i, 1); else list.push(c.id);
                  })}>
                  {hidden ? '👁 Reveal on TV' : '🖵 Hide on TV'}
                </button>
              );
            })()}
            <ConfirmBtn label="Remove" confirmLabel="Remove?" class="ghost danger"
              onConfirm={() => patch((s) => {
                const i = s.combat.combatants.findIndex((x) => x.id === c.id);
                if (i >= 0) { s.combat.combatants.splice(i, 1); if (s.combat.turn >= s.combat.combatants.length) s.combat.turn = 0; }
              })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- add sheet

function AddCombatants({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState({ name: '', emoji: '👾', hp: 10, ac: 12, count: '1' });
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { all: bestiary, apiStatus: bApi, progress: bProgress } = useBestiary();
  const s = state.value;
  const inTracker = new Set(s.combat.combatants.map((c) => `${c.srcType}:${c.srcId}`));

  const pushMon = (name: string, emoji: string, hp: number, ac: number, initMod: number, srcType: 'monster' | 'api' | 'custommon', srcId: string) =>
    patch((d) => {
      const count = d.combat.combatants.filter((x) => x.srcId === srcId).length;
      d.combat.combatants.push({ id: cid(), name: count ? `${name} ${count + 1}` : name, emoji, hp, maxHp: hp, ac, init: null, initMod, conditions: [], srcType, srcId });
    });

  const addFromBestiary = async (e: BestiaryEntry) => {
    if (e.src === 'rime') {
      const c = creatureById(e.srcId)!;
      pushMon(String(c.name), String(c.emoji), Number(c.hp), Number(c.ac), abilityMod(c.dex), 'monster', e.srcId);
    } else if (e.src === 'custom') {
      const m = customMonsterById(e.srcId)!;
      pushMon(m.name, m.emoji, m.hp, m.ac, abilityMod(m.dex), 'custommon', e.srcId);
    } else {
      setBusy(e.key);
      const d = await getApiMonster(e.srcId);
      setBusy(null);
      const hp = d?.hit_points ?? 10;
      const ac = Array.isArray(d?.armor_class) ? d!.armor_class[0]?.value ?? 12 : (d?.armor_class as number | undefined) ?? 12;
      pushMon(e.name, '👾', hp, ac, abilityMod(d?.dexterity), 'api', e.srcId);
    }
  };

  const addPc = (pcId?: string) => patch((d) => {
    for (const p of d.party) {
      if (pcId && p.id !== pcId) continue;
      if (inTracker.has(`pc:${p.id}`)) continue;
      d.combat.combatants.push({ id: cid(), name: p.name, emoji: '🛡️', hp: p.hp, maxHp: p.maxHp, ac: p.ac, init: null, initMod: p.initMod, conditions: [...p.conditions], srcType: 'pc', srcId: p.id });
    }
  });

  const matches = (q.trim()
    ? bestiary.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : bestiary.filter((e) => e.src !== 'api')).slice(0, 60);

  return (
    <Sheet open={open} title="Add combatants" onClose={onClose}>
      {s.party.length > 0 && (
        <>
          <div class="field-label">Party</div>
          <div class="chip-row" style={{ marginBottom: '14px' }}>
            <button class="btn" onClick={() => addPc()}>All ({s.party.length})</button>
            {s.party.map((p) => (
              <button class="btn ghost" disabled={inTracker.has(`pc:${p.id}`)} onClick={() => addPc(p.id)}>{p.name}</button>
            ))}
          </div>
        </>
      )}

      {s.sidekicks.length > 0 && (
        <>
          <div class="field-label">Allies</div>
          <div class="chip-row" style={{ marginBottom: '14px' }}>
            {s.sidekicks.map((a) => (
              <button class="btn ghost" disabled={inTracker.has(`ally:${a.id}`)} onClick={() => patch((d) => {
                d.combat.combatants.push({ id: cid(), name: a.name, emoji: a.emoji, hp: a.hp, maxHp: a.maxHp, ac: a.ac, init: null, initMod: a.initMod, conditions: [...a.conditions], srcType: 'ally', srcId: a.id });
              })}>{a.emoji} {a.name}</button>
            ))}
          </div>
        </>
      )}

      <div class="field-label">Bestiary — Rime, yours, and the full 5e library</div>
      <input class="input" placeholder="Search all monsters…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {bApi === 'loading' && <p class="stat-fine">Downloading the 5e bestiary… {bProgress}% (one time)</p>}
      {bApi === null && <p class="stat-fine">5e library needs one online visit — Rime & custom monsters below.</p>}
      <div class="creature-list">
        {matches.map((e) => (
          <button class="creature-add" disabled={busy === e.key} onClick={() => addFromBestiary(e)}>
            <span>{e.emoji} {e.name}{e.src === 'custom' ? ' ✦' : ''}</span>
            <span class="cr">{busy === e.key ? 'adding…' : `CR ${e.crLabel}${e.hp ? ` · ${e.hp} hp` : ''}`}</span>
          </button>
        ))}
        {matches.length === 0 && <p class="stat-fine" style={{ padding: '12px' }}>Nothing matches.</p>}
      </div>
      <button class="btn ghost" style={{ marginTop: '8px' }} onClick={() => setBuilding(true)}>+ New monster (full stat block)</button>
      {building && <MonsterForm open onClose={() => setBuilding(false)} onCreated={(m) => {
        patch((d) => { d.combat.combatants.push({ id: cid(), name: m.name, emoji: m.emoji, hp: m.hp, maxHp: m.hp, ac: m.ac, init: null, initMod: abilityMod(m.dex), conditions: [], srcType: 'custommon', srcId: m.id }); });
      }} />}

      <div class="field-label" style={{ marginTop: '14px' }}>Quick custom</div>
      <div class="field-row">
        <Field label="Emoji"><input class="input" style={{ width: '58px' }} value={custom.emoji} onInput={(e) => (() => { const v = (e.target as HTMLInputElement).value; setCustom((prev) => ({ ...prev, emoji: v })); })()} /></Field>
        <Field label="Name"><input class="input" value={custom.name} onInput={(e) => (() => { const v = (e.target as HTMLInputElement).value; setCustom((prev) => ({ ...prev, name: v })); })()} /></Field>
      </div>
      <div class="field-row">
        <Field label="HP"><NumInput value={custom.hp} min={1} onInput={(n) => setCustom((prev) => ({ ...prev, hp: n }))} /></Field>
        <Field label="AC"><NumInput value={custom.ac} onInput={(n) => setCustom((prev) => ({ ...prev, ac: n }))} /></Field>
        <Field label="Count (3 or 1d4)"><input class="input" value={custom.count} onInput={(e) => (() => { const v = (e.target as HTMLInputElement).value; setCustom((prev) => ({ ...prev, count: v })); })()} /></Field>
      </div>
      <button class="btn wide" disabled={!custom.name.trim()} onClick={() => {
        const n = rollCount(custom.count);
        patch((d) => {
          for (let i = 0; i < n; i++) d.combat.combatants.push({ id: cid(), name: n > 1 ? `${custom.name} ${i + 1}` : custom.name, emoji: custom.emoji, hp: custom.hp, maxHp: custom.hp, ac: custom.ac, init: null, initMod: 0, conditions: [], srcType: 'custom' });
        });
        setCustom((prev) => ({ ...prev, name: '' }));
      }}>Add custom</button>

      <button class="btn primary wide" style={{ marginTop: '10px' }} onClick={onClose}>Done</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- tracker

function Tracker() {
  const [adding, setAdding] = useState(false);
  const cb = state.value.combat;
  const sorted = sortCombatants(cb.combatants);
  const activeId = cb.active && sorted.length ? sorted[cb.turn % sorted.length]?.id : null;

  const rollInit = () => patch((s) => {
    for (const c of s.combat.combatants) {
      // Roll for everything the DM controls (players roll their own).
      // Exclusion, not inclusion — an earlier bug listed 'monster'|'custom'
      // and silently skipped 'api' and 'custommon' enemies.
      if (c.srcType !== 'pc' && c.srcType !== 'ally') c.init = d(20) + c.initMod;
    }
  });

  const nextTurn = () => {
    patch((s) => {
      const n = s.combat.combatants.length; if (!n) return;
      if (!s.combat.active) { s.combat.active = true; s.combat.round = 1; s.combat.turn = 0; return; }
      s.combat.turn++;
      if (s.combat.turn >= n) { s.combat.turn = 0; s.combat.round++; }
    });
    // keep the active combatant in view
    requestAnimationFrame(() => {
      const cbState = state.value.combat;
      const s2 = sortCombatants(cbState.combatants);
      const id = s2[cbState.turn % Math.max(1, s2.length)]?.id;
      if (id) document.getElementById(`cb-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const active = sorted.find((c) => c.id === activeId);

  return (
    <>
      {cb.combatants.length === 0 ? (
        <>
          <div class="card">
            <p class="read">No one has drawn steel yet. Add the party and whatever the Dale sends against them.</p>
          </div>
          <button class="btn primary wide" onClick={() => setAdding(true)}>+ Add combatants</button>
        </>
      ) : (
        <>
          {/* Sticky command bar — next turn is reachable from anywhere in the list */}
          <div class="combat-toolbar sticky">
            {cb.active
              ? <span class="round-chip">R{cb.round}</span>
              : <span class="round-chip idle">Ready</span>}
            {cb.active && active && <span class="turn-now">{active.emoji} {active.name}</span>}
            <button class="btn mini next-mini" onClick={nextTurn}>{cb.active ? 'Next ▸' : 'Begin ▸'}</button>
            <button class="btn mini ghost" onClick={() => setAdding(true)}>+ Add</button>
            <button class="btn mini ghost" onClick={rollInit}>🎲 Init</button>
            <ConfirmBtn label="End" confirmLabel="End?" class="mini ghost danger"
              onConfirm={() => patch((s) => { s.combat = { active: false, round: 0, turn: 0, combatants: [] }; })} />
          </div>
          {sorted.map((c) => <CombatRow key={c.id} c={c} active={c.id === activeId} />)}
          <div class="combat-pad" />
          <div class="turn-bar">
            {cb.active && <span class="round-chip">R{cb.round}</span>}
            <button class="btn primary turn-btn" onClick={nextTurn}>
              {cb.active ? 'Next turn ✦' : 'Begin combat'}
            </button>
          </div>
        </>
      )}

      {adding && <AddCombatants open onClose={() => setAdding(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- encounters

const DIFF_ORDER: Difficulty[] = ['trivial', 'easy', 'medium', 'hard', 'deadly'];

function seedPresets(): EncounterPreset[] {
  return (ENCOUNTERS as Record<string, unknown>[]).map((e) => ({
    id: String(e.id),
    name: String(e.name),
    type: (e.type === 'combat' ? 'combat' : 'noncombat'),
    category: String(e.category ?? 'general'),
    difficulty: (DIFF_ORDER.includes(e.difficulty as Difficulty) ? e.difficulty : 'medium') as Difficulty,
    desc: String(e.desc ?? ''),
    combatants: (e.combatants ?? []) as PresetCombatant[],
    custom: false,
  }));
}

function inRange(roll: number, range: string): boolean {
  const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(range.trim());
  if (!m) return false;
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  return roll >= lo && roll <= hi;
}

function EncounterTables({ goTracker }: { goTracker: () => void }) {
  const [results, setResults] = useState<Record<number, { roll: number; row: Record<string, unknown> } | null>>({});
  const tables = ENC_TABLES as Record<string, unknown>[];

  return (
    <>
      {tables.map((t, ti) => {
        const die = parseInt(String(t.die).replace(/\D/g, ''), 10) || 20;
        const res = results[ti];
        return (
          <div class="card">
            <h3>{String(t.name)} <span class="die-tag">{String(t.die)}</span></h3>
            <p class="read" style={{ fontSize: '13px' }}>{String(t.trigger)}</p>
            <div class="row-actions" style={{ marginTop: '10px' }}>
              <button class="btn" onClick={() => {
                const roll = d(die);
                const row = (t.rows as Record<string, unknown>[]).find((r) => inRange(roll, String(r.range)));
                setResults({ ...results, [ti]: row ? { roll, row } : null });
              }}>Roll {String(t.die)}</button>
            </div>
            {res && (
              <div class={`table-result${res.row.type === 'combat' ? ' combat' : ''}`}>
                <span class="tr-roll">{res.roll}</span>
                <div>
                  <div class="tr-text">{String(res.row.text)}</div>
                  {String(res.row.note || '') && <div class="tr-note">{String(res.row.note)}</div>}
                  {Array.isArray(res.row.combatants) && (res.row.combatants as PresetCombatant[]).length > 0 && (
                    <button class="btn mini primary" style={{ marginTop: '8px' }} onClick={() => {
                      const cs = resolvePreset(res.row.combatants as PresetCombatant[]);
                      patch((s) => { s.combat.combatants.push(...cs); });
                      goTracker();
                    }}>Send to tracker →</button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function PresetForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: EncounterPreset }) {
  const [f, setF] = useState<EncounterPreset>(existing ?? {
    id: '', name: '', type: 'combat', category: 'travel', difficulty: 'medium', desc: '', combatants: [], custom: true,
  });
  const setC = (i: number, k: keyof PresetCombatant, v: unknown) =>
    setF((prev) => ({ ...prev, combatants: prev.combatants.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  return (
    <Sheet open={open} title={existing ? (existing.custom ? `Edit ${existing.name}` : `Copy of ${existing.name}`) : 'New encounter'} onClose={onClose}>
      <Field label="Name"><input class="input" value={f.name} onInput={(e) => (() => { const v = (e.target as HTMLInputElement).value; setF((prev) => ({ ...prev, name: v })); })()} /></Field>
      <div class="field-row">
        <Field label="Category"><input class="input" value={f.category} onInput={(e) => (() => { const v = (e.target as HTMLInputElement).value; setF((prev) => ({ ...prev, category: v })); })()} /></Field>
        <Field label="Difficulty">
          <select class="input" value={f.difficulty} onChange={(e) => (() => { const v = (e.target as HTMLSelectElement).value as Difficulty; setF((prev) => ({ ...prev, difficulty: v })); })()}>
            {DIFF_ORDER.map((x) => <option value={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description"><textarea class="input" rows={6} value={f.desc} onInput={(e) => (() => { const v = (e.target as HTMLTextAreaElement).value; setF((prev) => ({ ...prev, desc: v })); })()} /></Field>

      <div class="field-label">Combatants</div>
      {f.combatants.map((c, i) => (
        <div class="attack-edit">
          <input class="input" style={{ width: '52px' }} placeholder="👾" value={c.emoji ?? ''} onInput={(e) => setC(i, 'emoji', (e.target as HTMLInputElement).value)} />
          <input class="input" placeholder="Name" value={c.name ?? ''} onInput={(e) => setC(i, 'name', (e.target as HTMLInputElement).value)} />
          <NumInput w="60px" value={c.hp ?? 10} onInput={(n) => setC(i, 'hp', n)} />
          <NumInput w="56px" value={c.ac ?? 12} onInput={(n) => setC(i, 'ac', n)} />
          <input class="input" style={{ width: '58px' }} placeholder="1d4" value={c.count} onInput={(e) => setC(i, 'count', (e.target as HTMLInputElement).value)} />
          <button class="btn mini ghost danger" onClick={() => setF((prev) => ({ ...prev, combatants: prev.combatants.filter((_, j) => j !== i) }))}>✕</button>
        </div>
      ))}
      <button class="btn ghost" onClick={() => setF((prev) => ({ ...prev, combatants: [...prev.combatants, { srcType: 'custom', count: '1', emoji: '👾', name: '', hp: 10, ac: 12 }] }))}>+ Combatant</button>

      <div class="form-gap" />
      <button class="btn primary wide" disabled={!f.name.trim()} onClick={() => {
        if (existing && existing.custom) {
          patch((s) => { const i = s.encounterPresets.findIndex((x) => x.id === existing.id); if (i >= 0) s.encounterPresets[i] = f; });
        } else {
          patch((s) => { s.encounterPresets.push({ ...f, id: `ep${s.seq++}`, custom: true }); });
        }
        onClose();
      }}>{existing?.custom ? 'Save changes' : 'Save encounter'}</button>
    </Sheet>
  );
}

function Encounters({ goTracker }: { goTracker: () => void }) {
  const [diff, setDiff] = useState<Difficulty | 'all'>('all');
  const [cat, setCat] = useState<string>('all');
  const [view, setView] = useState<'presets' | 'tables'>('presets');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EncounterPreset | null>(null);

  const all = [...seedPresets(), ...state.value.encounterPresets];
  const cats = [...new Set(all.map((e) => e.category))].sort();
  const shown = all.filter((e) =>
    (diff === 'all' || e.difficulty === diff) &&
    (cat === 'all' || e.category === cat));

  return (
    <>
      <div class="sub-tabs minor">
        <button class={`sub-tab${view === 'presets' ? ' active' : ''}`} onClick={() => setView('presets')}>Encounters ({all.length})</button>
        <button class={`sub-tab${view === 'tables' ? ' active' : ''}`} onClick={() => setView('tables')}>Roll tables</button>
      </div>

      {view === 'tables' && <EncounterTables goTracker={goTracker} />}

      {view === 'presets' && (
        <>
          <button class="btn primary wide" style={{ marginBottom: '12px' }} onClick={() => setCreating(true)}>+ New encounter</button>
          <div class="chip-row" style={{ marginBottom: '8px' }}>
            <button class={`cond-chip${diff === 'all' ? ' on' : ''}`} onClick={() => setDiff('all')}>All</button>
            {DIFF_ORDER.map((x) => (
              <button class={`cond-chip${diff === x ? ' on' : ''}`} onClick={() => setDiff(x)}>{x}</button>
            ))}
          </div>
          <div class="chip-row" style={{ marginBottom: '12px' }}>
            <button class={`cond-chip frosty${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>Anywhere</button>
            {cats.map((x) => (
              <button class={`cond-chip frosty${cat === x ? ' on' : ''}`} onClick={() => setCat(x)}>{x}</button>
            ))}
          </div>

          {shown.map((e) => (
            <div class="card">
              <h3>{e.name}</h3>
              <div class="chip-row" style={{ margin: '4px 0 8px' }}>
                <span class={`diff-tag ${e.difficulty}`}>{e.difficulty}</span>
                <span class="chip mini-chip">{e.category}</span>
                {e.type === 'noncombat' && <span class="chip mini-chip">non-combat</span>}
                {e.custom && <span class="chip mini-chip">✦ yours</span>}
              </div>
              {e.desc && <p class="read" style={{ fontSize: '13.5px' }}>{e.desc}</p>}
              {e.combatants.length > 0 && (
                <>
                  <p class="stat-fine" style={{ margin: '8px 0' }}>
                    {e.combatants.map((c) => `${c.count}× ${c.name ?? creatureById(c.srcId)?.name ?? '?'}`).join(' · ')}
                  </p>
                  <button class="btn mini primary" onClick={() => {
                    const cs = resolvePreset(e.combatants);
                    patch((s) => { s.combat.combatants.push(...cs); });
                    goTracker();
                  }}>Load into tracker →</button>
                </>
              )}
              {e.custom && (
                <div class="row-actions">
                  <button class="btn mini ghost" onClick={() => setEditing(e)}>Edit</button>
                  <ConfirmBtn label="Delete" confirmLabel="Delete?" class="mini ghost danger"
                    onConfirm={() => patch((s) => { s.encounterPresets = s.encounterPresets.filter((x) => x.id !== e.id); })} />
                </div>
              )}
            </div>
          ))}

          {creating && <PresetForm key="new" open onClose={() => setCreating(false)} />}
          {editing && <PresetForm key={editing.id} open existing={editing} onClose={() => setEditing(null)} />}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- screen

export function CombatScreen() {
  const [sub, setSub] = useState<'tracker' | 'encounters'>('tracker');
  const n = state.value.combat.combatants.length;

  return (
    <div>
      <p class="screen-kicker">Initiative</p>
      <h1 class="screen-title">Combat</h1>

      <div class="sub-tabs">
        <button class={`sub-tab${sub === 'tracker' ? ' active' : ''}`} onClick={() => setSub('tracker')}>Tracker{n ? ` (${n})` : ''}</button>
        <button class={`sub-tab${sub === 'encounters' ? ' active' : ''}`} onClick={() => setSub('encounters')}>Encounters</button>
      </div>

      {sub === 'tracker' ? <Tracker /> : <Encounters goTracker={() => setSub('tracker')} />}
    </div>
  );
}
