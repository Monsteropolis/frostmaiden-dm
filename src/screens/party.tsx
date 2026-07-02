import { useState } from 'preact/hooks';
import { state, patch } from '../state/store';
import { PC, Ally, CONDITIONS, AllyAttack } from '../state/schema';
import { Sheet, ConfirmBtn, Field, NumInput } from '../components/ui';
import { rollD20, rollDamage, showRoll } from '../lib/dice';

// ---------------------------------------------------------------- helpers

function nextId(prefix: string): string {
  let id = '';
  patch((d) => { id = `${prefix}${d.seq++}`; });
  return id;
}

export function hpTone(hp: number, max: number): string {
  if (hp <= 0) return 'down';
  const r = hp / Math.max(1, max);
  return r <= 0.25 ? 'crit' : r <= 0.5 ? 'low' : 'ok';
}

export function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  return (
    <div class={`hp-bar ${hpTone(hp, max)}`}>
      <div class="hp-fill" style={{ width: `${pct}%` }} />
      <span class="hp-num">{hp} / {max}</span>
    </div>
  );
}

export function ConditionGrid({ current, onToggle }: { current: string[]; onToggle: (c: string) => void }) {
  return (
    <div class="cond-grid">
      {CONDITIONS.map((c) => (
        <button
          class={`cond-chip${current.includes(c) ? ' on' : ''}`}
          onClick={() => onToggle(c)}
        >{c}</button>
      ))}
    </div>
  );
}

function CondSummary({ conditions }: { conditions: string[] }) {
  if (!conditions.length) return null;
  return (
    <div class="cond-summary">
      {conditions.map((c) => <span class="cond-tag">{c}</span>)}
    </div>
  );
}

// ---------------------------------------------------------------- PC card

function PcCard({ pc }: { pc: PC }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const mod = (n: number, d: PC) => patch((s) => {
    const p = s.party.find((x) => x.id === d.id); if (!p) return;
    p.hp = Math.max(0, Math.min(p.maxHp, p.hp + n));
    if (p.hp > 0) { p.deathS = 0; p.deathF = 0; }
  });

  return (
    <div class={`card unit ${pc.hp <= 0 ? 'dying' : ''}`}>
      <div class="unit-top" onClick={() => setOpen(!open)}>
        <span class="unit-sigil">{pc.name.slice(0, 1)}</span>
        <div class="unit-id">
          <div class="unit-name">
            {pc.name}
            <button
              class={`inspo${pc.inspiration ? ' on' : ''}`}
              aria-label={`Inspiration ${pc.inspiration ? 'on' : 'off'}`}
              onClick={(e) => { e.stopPropagation(); patch((s) => { const p = s.party.find((x) => x.id === pc.id); if (p) p.inspiration = !p.inspiration; }); }}
            >✦</button>
          </div>
          <div class="unit-meta">{pc.race} {pc.cls} {pc.level} <span class="sep">·</span> AC {pc.ac} <span class="sep">·</span> PP {pc.pp}</div>
          <CondSummary conditions={pc.conditions} />
        </div>
        <div class="hp-ctl" onClick={(e) => e.stopPropagation()}>
          <button class="hp-btn" onClick={() => mod(-1, pc)} aria-label="Damage 1">−</button>
          <HpBar hp={pc.hp} max={pc.maxHp} />
          <button class="hp-btn" onClick={() => mod(+1, pc)} aria-label="Heal 1">+</button>
        </div>
      </div>

      {open && (
        <div class="unit-detail">
          <div class="hp-quick">
            <button class="btn" onClick={() => mod(-5, pc)}>−5</button>
            <button class="btn" onClick={() => mod(+5, pc)}>+5</button>
            <NumInput w="76px" value={pc.hp} onInput={(n) => patch((s) => { const p = s.party.find((x) => x.id === pc.id); if (p) p.hp = Math.max(0, Math.min(p.maxHp, n)); })} />
            <button class="btn" onClick={() => patch((s) => { const p = s.party.find((x) => x.id === pc.id); if (p) { p.hp = p.maxHp; p.deathS = 0; p.deathF = 0; } })}>Full</button>
          </div>

          {pc.hp <= 0 && (
            <div class="death-saves">
              <span class="ds-label">Death saves</span>
              {(['deathS', 'deathF'] as const).map((k) => (
                <div class="ds-row">
                  <span>{k === 'deathS' ? 'Saves' : 'Fails'}</span>
                  {[1, 2, 3].map((i) => (
                    <button
                      class={`ds-pip ${k === 'deathF' ? 'fail' : ''}${pc[k] >= i ? ' on' : ''}`}
                      aria-label={`${k === 'deathS' ? 'Success' : 'Failure'} ${i}`}
                      onClick={() => patch((s) => { const p = s.party.find((x) => x.id === pc.id); if (p) p[k] = p[k] >= i ? i - 1 : i; })}
                    >{k === 'deathS' ? '✦' : '✕'}</button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <ConditionGrid
            current={pc.conditions}
            onToggle={(c) => patch((s) => {
              const p = s.party.find((x) => x.id === pc.id); if (!p) return;
              p.conditions = p.conditions.includes(c) ? p.conditions.filter((x) => x !== c) : [...p.conditions, c];
            })}
          />

          <div class="row-actions">
            <button class="btn ghost" onClick={() => setEditing(true)}>Edit</button>
            <ConfirmBtn label="Remove" confirmLabel="Remove?" class="ghost danger"
              onConfirm={() => patch((s) => { s.party = s.party.filter((x) => x.id !== pc.id); })} />
          </div>
        </div>
      )}

      <PcForm open={editing} onClose={() => setEditing(false)} existing={pc} />
    </div>
  );
}

// ---------------------------------------------------------------- PC form

function PcForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: PC }) {
  const blank: PC = existing ?? {
    id: '', name: '', cls: '', level: 1, race: '', hp: 10, maxHp: 10,
    ac: 12, pp: 10, initMod: 0, conditions: [], inspiration: false, deathS: 0, deathF: 0,
  };
  const [f, setF] = useState<PC>(blank);
  const set = (k: keyof PC, v: unknown) => setF({ ...f, [k]: v } as PC);

  return (
    <Sheet open={open} title={existing ? `Edit ${existing.name}` : 'Add character'} onClose={onClose}>
      <Field label="Name"><input class="input" value={f.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} /></Field>
      <div class="field-row">
        <Field label="Class"><input class="input" value={f.cls} onInput={(e) => set('cls', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="Level"><NumInput value={f.level} min={1} max={20} onInput={(n) => set('level', n)} /></Field>
      </div>
      <Field label="Race / lineage"><input class="input" value={f.race} onInput={(e) => set('race', (e.target as HTMLInputElement).value)} /></Field>
      <div class="field-row">
        <Field label="Max HP"><NumInput value={f.maxHp} min={1} onInput={(n) => set('maxHp', n)} /></Field>
        <Field label="AC"><NumInput value={f.ac} onInput={(n) => set('ac', n)} /></Field>
      </div>
      <div class="field-row">
        <Field label="Passive Perception"><NumInput value={f.pp} onInput={(n) => set('pp', n)} /></Field>
        <Field label="Init mod"><NumInput value={f.initMod} onInput={(n) => set('initMod', n)} /></Field>
      </div>
      <button class="btn primary wide" disabled={!f.name.trim()} onClick={() => {
        if (existing) {
          patch((s) => { const i = s.party.findIndex((x) => x.id === existing.id); if (i >= 0) s.party[i] = { ...f, hp: Math.min(f.hp, f.maxHp) }; });
        } else {
          const id = nextId('pc');
          patch((s) => { s.party.push({ ...f, id, hp: f.maxHp }); });
        }
        onClose();
      }}>{existing ? 'Save changes' : 'Add to party'}</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Ally card

function AllyCard({ ally }: { ally: Ally }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const mod = (n: number) => patch((s) => {
    const a = s.sidekicks.find((x) => x.id === ally.id); if (!a) return;
    a.hp = Math.max(0, Math.min(a.maxHp, a.hp + n));
  });

  return (
    <div class={`card unit ${ally.hp <= 0 ? 'dying' : ''}`}>
      <div class="unit-top" onClick={() => setOpen(!open)}>
        <span class="entity-emoji">{ally.emoji}</span>
        <div class="unit-id">
          <div class="unit-name">{ally.name}</div>
          <div class="unit-meta">{ally.kind} {ally.level ? `· L${ally.level}` : ''} <span class="sep">·</span> AC {ally.ac}{ally.location ? <><span class="sep">·</span> {ally.location}</> : null}</div>
          <CondSummary conditions={ally.conditions} />
        </div>
        <div class="hp-ctl" onClick={(e) => e.stopPropagation()}>
          <button class="hp-btn" onClick={() => mod(-1)} aria-label="Damage 1">−</button>
          <HpBar hp={ally.hp} max={ally.maxHp} />
          <button class="hp-btn" onClick={() => mod(+1)} aria-label="Heal 1">+</button>
        </div>
      </div>

      {open && (
        <div class="unit-detail">
          <div class="hp-quick">
            <button class="btn" onClick={() => mod(-5)}>−5</button>
            <button class="btn" onClick={() => mod(+5)}>+5</button>
            <button class="btn" onClick={() => patch((s) => { const a = s.sidekicks.find((x) => x.id === ally.id); if (a) a.hp = a.maxHp; })}>Full</button>
          </div>

          <div class="score-row">
            {(Object.entries(ally.scores) as [string, number][]).map(([k, v]) => (
              <button class="score" onClick={() => rollD20(`${ally.name} — ${k.toUpperCase()}`, Math.floor((v - 10) / 2))}>
                <span class="score-k">{k.toUpperCase()}</span>
                <span class="score-v">{v}</span>
              </button>
            ))}
          </div>

          {ally.attacks.length > 0 && (
            <div class="attack-list">
              {ally.attacks.map((a) => (
                <div class="attack-row">
                  <span class="attack-name">{a.name}</span>
                  <button class="btn mini" onClick={() => rollD20(`${a.name} — attack`, a.bonus)}>d20{a.bonus >= 0 ? '+' : ''}{a.bonus}</button>
                  <button class="btn mini" onClick={() => { const r = rollDamage(a.damage); showRoll({ title: `${a.name} — damage`, total: r.total, detail: r.detail }); }}>{a.damage}</button>
                </div>
              ))}
            </div>
          )}

          <ConditionGrid current={ally.conditions} onToggle={(c) => patch((s) => {
            const a = s.sidekicks.find((x) => x.id === ally.id); if (!a) return;
            a.conditions = a.conditions.includes(c) ? a.conditions.filter((x) => x !== c) : [...a.conditions, c];
          })} />

          {ally.notes && <p class="read" style={{ marginTop: '10px' }}>{ally.notes}</p>}

          <div class="row-actions">
            <button class="btn ghost" onClick={() => setEditing(true)}>Edit</button>
            <ConfirmBtn label="Remove" confirmLabel="Remove?" class="ghost danger"
              onConfirm={() => patch((s) => { s.sidekicks = s.sidekicks.filter((x) => x.id !== ally.id); })} />
          </div>
        </div>
      )}

      <AllyForm open={editing} onClose={() => setEditing(false)} existing={ally} />
    </div>
  );
}

// ---------------------------------------------------------------- Ally form

function AllyForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: Ally }) {
  const blank: Ally = existing ?? {
    id: '', name: '', emoji: '🐺', kind: '', level: 1, hp: 11, maxHp: 11, ac: 13, initMod: 2,
    scores: { str: 12, dex: 14, con: 12, int: 3, wis: 12, cha: 6 },
    attacks: [], conditions: [], location: '', notes: '',
  };
  const [f, setF] = useState<Ally>(blank);
  const set = (k: keyof Ally, v: unknown) => setF({ ...f, [k]: v } as Ally);
  const setAtk = (i: number, k: keyof AllyAttack, v: unknown) => {
    const attacks = f.attacks.map((a, j) => (j === i ? { ...a, [k]: v } : a));
    setF({ ...f, attacks });
  };

  return (
    <Sheet open={open} title={existing ? `Edit ${existing.name}` : 'Add ally'} onClose={onClose}>
      <div class="field-row">
        <Field label="Emoji"><input class="input" style={{ width: '64px' }} value={f.emoji} onInput={(e) => set('emoji', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="Name"><input class="input" value={f.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} /></Field>
      </div>
      <div class="field-row">
        <Field label="Kind (e.g. Wolf, Expert sidekick)"><input class="input" value={f.kind} onInput={(e) => set('kind', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="Level"><NumInput value={f.level} min={0} onInput={(n) => set('level', n)} /></Field>
      </div>
      <div class="field-row">
        <Field label="Max HP"><NumInput value={f.maxHp} min={1} onInput={(n) => set('maxHp', n)} /></Field>
        <Field label="AC"><NumInput value={f.ac} onInput={(n) => set('ac', n)} /></Field>
        <Field label="Init mod"><NumInput value={f.initMod} onInput={(n) => set('initMod', n)} /></Field>
      </div>
      <div class="score-edit">
        {(Object.keys(f.scores) as (keyof Ally['scores'])[]).map((k) => (
          <Field label={k.toUpperCase()}>
            <NumInput value={f.scores[k]} min={1} max={30} onInput={(n) => set('scores', { ...f.scores, [k]: n })} />
          </Field>
        ))}
      </div>

      <div class="field-label" style={{ marginTop: '6px' }}>Attacks</div>
      {f.attacks.map((a, i) => (
        <div class="attack-edit">
          <input class="input" placeholder="Name" value={a.name} onInput={(e) => setAtk(i, 'name', (e.target as HTMLInputElement).value)} />
          <NumInput w="64px" value={a.bonus} onInput={(n) => setAtk(i, 'bonus', n)} />
          <input class="input" style={{ width: '86px' }} placeholder="1d6+2" value={a.damage} onInput={(e) => setAtk(i, 'damage', (e.target as HTMLInputElement).value)} />
          <button class="btn mini ghost danger" aria-label="Remove attack" onClick={() => setF({ ...f, attacks: f.attacks.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button class="btn ghost" onClick={() => setF({ ...f, attacks: [...f.attacks, { name: '', bonus: 4, damage: '1d6+2' }] })}>+ Attack</button>

      <Field label="Location"><input class="input" value={f.location} onInput={(e) => set('location', (e.target as HTMLInputElement).value)} /></Field>
      <Field label="Notes"><textarea class="input" rows={3} value={f.notes} onInput={(e) => set('notes', (e.target as HTMLTextAreaElement).value)} /></Field>

      <button class="btn primary wide" disabled={!f.name.trim()} onClick={() => {
        if (existing) {
          patch((s) => { const i = s.sidekicks.findIndex((x) => x.id === existing.id); if (i >= 0) s.sidekicks[i] = { ...f, hp: Math.min(f.hp, f.maxHp) }; });
        } else {
          const id = nextId('sk');
          patch((s) => { s.sidekicks.push({ ...f, id, hp: f.maxHp }); });
        }
        onClose();
      }}>{existing ? 'Save changes' : 'Add ally'}</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Screen

export function PartyScreen() {
  const [sub, setSub] = useState<'pcs' | 'allies'>('pcs');
  const [adding, setAdding] = useState(false);
  const { party, sidekicks } = state.value;

  return (
    <div>
      <p class="screen-kicker">The Heroes</p>
      <h1 class="screen-title">Party</h1>

      <div class="sub-tabs">
        <button class={`sub-tab${sub === 'pcs' ? ' active' : ''}`} onClick={() => setSub('pcs')}>Characters ({party.length})</button>
        <button class={`sub-tab${sub === 'allies' ? ' active' : ''}`} onClick={() => setSub('allies')}>Allies ({sidekicks.length})</button>
      </div>

      {sub === 'pcs' && (
        <>
          {party.length === 0 && (
            <div class="card"><p class="read">The souls who walk into the endless winter will be recorded here.</p></div>
          )}
          {party.map((pc) => <PcCard key={pc.id} pc={pc} />)}
          <button class="btn primary wide" onClick={() => setAdding(true)}>+ Add character</button>
          {adding && <PcForm open={adding} onClose={() => setAdding(false)} />}
        </>
      )}

      {sub === 'allies' && (
        <>
          {sidekicks.length === 0 && (
            <div class="card"><p class="read">Sidekicks, mounts, and hirelings — every friend the Dale allows.</p></div>
          )}
          {sidekicks.map((a) => <AllyCard key={a.id} ally={a} />)}
          <button class="btn primary wide" onClick={() => setAdding(true)}>+ Add ally</button>
          {adding && <AllyForm open={adding} onClose={() => setAdding(false)} />}
        </>
      )}
    </div>
  );
}
