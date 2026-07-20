import { useState, useRef, useEffect } from 'preact/hooks';
import { state, patch } from '../state/store';
import { PC, Ally, OwnedItem, CONDITIONS, AllyAttack, SidekickClass } from '../state/schema';
import { useBestiary, BestiaryEntry, MonsterForm, StatPanel, customMonsterById, rimeAsStatBlock, abilityMod, monsterSpriteFor } from './monsters';
import { resolveStageScene, stageGroundBand, groundBottomPct, depthScale, depthZ } from '../tv/realm-stage';
import { ApiMonsterPanel, getApiMonster } from '../lib/api';
import { CREATURES } from '../data';
import { allNpcs, openNpc, npcSpriteFor } from './npcs';
import { Sheet, ConfirmBtn, Field, NumInput, CondEditor, Stepper } from '../components/ui';
import { rollD20, rollDamage, showRoll } from '../lib/dice';
import { SpritePicker } from '../components/SpritePicker';
import {
  pushRealmRoster, setRealmPassword, ensureDmToken, listAllJournal,
  RealmUnreachableError, REALM_CAMPAIGN_NAME, type JournalEntry,
} from '../backend/realm-client';

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

// ---------------------------------------------------------------- items

/** Wave 5 — "we take the dragon head!" The placement sheet: the 448×224 stage
 *  as a picker. Tap a spot, drag to adjust; the emoji previews at the exact
 *  depth-scale it will have in the world, over the exact backdrop the stage
 *  draws right now. DM-authored (Canonical) — players rearranging camp is a
 *  later wave. */
function PlacementSheet({ item, onClose }: { item: OwnedItem; onClose: () => void }) {
  const [pos, setPos] = useState(item.display ?? { x: 50, y: 0.7 });
  const dragging = useRef(false);
  const s = state.value;
  const scene = resolveStageScene(s.tv.sceneId ?? 'auto', {
    journeying: !!s.travel.activeJourney, weatherId: s.weather.current,
  });
  // tiled scenes carry a deeper walkable band — the sheet mirrors the stage
  const band = stageGroundBand(scene.id);
  const others = s.inventory.filter((it) => it.id !== item.id && it.display);

  const posFrom = (e: PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100));
    const bottomPct = ((r.bottom - e.clientY) / r.height) * 100;
    const y = Math.max(0, Math.min(1, (band.top - bottomPct) / (band.top - band.bottom || 1)));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 100) / 100 };
  };
  const commit = (p: { x: number; y: number }) =>
    patch((d) => { const it = d.inventory.find((x) => x.id === item.id); if (it) it.display = p; });

  return (
    <Sheet open title={`${item.emoji} ${item.name} — display in camp`} onClose={onClose}>
      <p class="stat-fine" style={{ marginTop: 0 }}>
        Tap the snow to place it; drag to adjust. Lower on the screen = nearer —
        the party can stand in front of it or behind it.
      </p>
      <div
        class="place-stage"
        style={{ backgroundImage: `url(${scene.url})` }}
        onPointerDown={(e) => {
          dragging.current = true;
          const p = posFrom(e, e.currentTarget as HTMLElement); setPos(p); commit(p);
          // capture keeps the drag alive when the finger wanders off the stage;
          // it must never be able to kill the tap itself
          try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* fine */ }
        }}
        onPointerMove={(e) => { if (dragging.current) setPos(posFrom(e, e.currentTarget as HTMLElement)); }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          const p = posFrom(e, e.currentTarget as HTMLElement); setPos(p); commit(p);
        }}
      >
        <div class="place-band" style={{ height: `${band.top}%` }} />
        {others.map((it) => (
          <span key={it.id} class="place-ghost" style={{
            left: `${it.display!.x}%`, bottom: `${groundBottomPct(it.display!.y, band)}%`,
            zIndex: depthZ(it.display!.y), scale: String(depthScale(it.display!.y)),
          }}>{it.emoji}</span>
        ))}
        <span class="place-item" style={{
          left: `${pos.x}%`, bottom: `${groundBottomPct(pos.y, band)}%`,
          zIndex: depthZ(pos.y), scale: String(depthScale(pos.y)),
        }}>{item.emoji}</span>
      </div>
      <div class="row-actions" style={{ marginTop: '12px' }}>
        {item.display && (
          <button class="btn ghost danger" onClick={() => {
            patch((d) => { const it = d.inventory.find((x) => x.id === item.id); if (it) delete it.display; });
            onClose();
          }}>Remove from display</button>
        )}
        <button class="btn primary" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

/** One owner's item rows (stash = null): qty stepper, ⋯ (move/edit/remove),
 *  and a quick-add row for improvised loot. Granting = revealing: everything
 *  here reaches the Realm (except DM notes, which never leave the phone). */
export function ItemRows({ ownerId }: { ownerId: string | null }) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [add, setAdd] = useState({ name: '', emoji: '🎁' });
  const items = state.value.inventory.filter((it) => it.ownerId === ownerId);
  const upd = (id: string, fn: (it: OwnedItem) => void) =>
    patch((d) => { const it = d.inventory.find((x) => x.id === id); if (it) fn(it); });

  return (
    <div class="item-rows">
      {items.map((it) => (
        <div class="item-row-wrap" key={it.id}>
          <div class="item-row">
            <span class="item-emoji">{it.emoji}</span>
            <span class="item-name">{it.name}{it.display && <span title="On display in camp"> 🏕</span>}</span>
            <Stepper label="" value={it.qty}
              onDelta={(dl) => upd(it.id, (x) => { x.qty = Math.max(1, x.qty + dl); })} />
            <button class="btn mini ghost" aria-label="Item actions"
              onClick={() => setMenuFor(menuFor === it.id ? null : it.id)}>⋯</button>
          </div>
          {menuFor === it.id && (
            <div class="item-menu">
              <button class="btn mini" style={{ flexBasis: '100%' }}
                onClick={() => { setPlacing(it.id); setMenuFor(null); }}>
                🏕 {it.display ? 'Move in camp' : 'Display in camp'} ▸
              </button>
              <label class="field-label" style={{ margin: 0 }}>Move to</label>
              <select class="input" value={it.ownerId ?? ''}
                onChange={(e) => { const v = (e.target as HTMLSelectElement).value; upd(it.id, (x) => { x.ownerId = v || null; }); setMenuFor(null); }}>
                <option value="">🎒 Party stash</option>
                {state.value.party.map((p) => <option value={p.id}>{p.name}</option>)}
              </select>
              <input class="input" value={it.name} aria-label="Item name"
                onInput={(e) => upd(it.id, (x) => { x.name = (e.target as HTMLInputElement).value; })} />
              <input class="input" style={{ width: '58px' }} value={it.emoji} aria-label="Item emoji"
                onInput={(e) => upd(it.id, (x) => { x.emoji = (e.target as HTMLInputElement).value; })} />
              <ConfirmBtn label="Remove" confirmLabel="Remove?" class="mini ghost danger"
                onConfirm={() => { patch((d) => { d.inventory = d.inventory.filter((x) => x.id !== it.id); }); setMenuFor(null); }} />
            </div>
          )}
          {placing === it.id && (() => {
            const live = state.value.inventory.find((x) => x.id === it.id);
            return live ? <PlacementSheet item={live} onClose={() => setPlacing(null)} /> : null;
          })()}
        </div>
      ))}
      <div class="item-add">
        <input class="input" style={{ width: '52px' }} value={add.emoji} aria-label="New item emoji"
          onInput={(e) => { const v = (e.target as HTMLInputElement).value; setAdd((p) => ({ ...p, emoji: v })); }} />
        <input class="input" style={{ flex: 1 }} placeholder="Improvised loot…" value={add.name}
          onInput={(e) => { const v = (e.target as HTMLInputElement).value; setAdd((p) => ({ ...p, name: v })); }} />
        <button class="btn mini" disabled={!add.name.trim()} onClick={() => {
          patch((d) => { d.inventory.push({ id: `it${d.seq++}`, name: add.name.trim(), emoji: add.emoji || '🎁', qty: 1, ownerId }); });
          setAdd({ name: '', emoji: '🎁' });
        }}>+ Add</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- PC card

function PcCard({ pc }: { pc: PC }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const mod = (n: number, d: PC) => patch((s) => {
    const p = s.party.find((x) => x.id === d.id); if (!p) return;
    const before = p.hp;
    p.hp = Math.max(0, Math.min(p.maxHp, p.hp + n));
    if (p.hp > 0) { p.deathS = 0; p.deathF = 0; }
    // A hit is its own trigger — the Realm flinches the struck hero, no button.
    if (p.hp < before) s.tv.poke = { seq: (s.tv.poke?.seq ?? 0) + 1, target: p.id, kind: 'flinch' };
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
            <button
              class="inspo wave-btn"
              aria-label={`Make ${pc.name} wave on the TV`}
              title="Wave on the TV"
              onClick={(e) => { e.stopPropagation(); patch((s) => { s.tv.poke = { seq: (s.tv.poke?.seq ?? 0) + 1, target: pc.id, kind: 'wave' }; }); }}
            >👋</button>
          </div>
          <div class="unit-meta">{pc.race} {pc.cls} {pc.level} <span class="sep">·</span> AC {pc.ac} <span class="sep">·</span> PP {pc.pp} <span class="sep">·</span> <span title={pc.realmGated ? 'Realm login: password-gated' : 'Realm login: open — anyone with the Realm code'}>{pc.realmGated ? '🔒' : '🔓'}</span></div>
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

          <CondEditor
            current={pc.conditions}
            onToggle={(c) => patch((s) => {
              const p = s.party.find((x) => x.id === pc.id); if (!p) return;
              p.conditions = p.conditions.includes(c) ? p.conditions.filter((x) => x !== c) : [...p.conditions, c];
            })}
          />

          <div class="field-label" style={{ marginTop: '10px' }}>Items</div>
          <ItemRows ownerId={pc.id} />

          <label class="field" style={{ marginTop: '10px' }}>
            <span class="field-label">Notes (DM only)</span>
            <textarea
              class="input"
              rows={2}
              placeholder="Private — stays on your phone, never sent to players."
              value={pc.notes}
              onInput={(e) => patch((s) => { const p = s.party.find((x) => x.id === pc.id); if (p) p.notes = (e.target as HTMLTextAreaElement).value; })}
            />
          </label>

          <div class="row-actions">
            <button class="btn ghost" onClick={() => setEditing(true)}>Edit</button>
            <ConfirmBtn label="Remove" confirmLabel="Remove?" class="ghost danger"
              onConfirm={() => patch((s) => { s.party = s.party.filter((x) => x.id !== pc.id); })} />
          </div>
        </div>
      )}

      {editing && <PcForm key={`edit-${pc.id}`} open onClose={() => setEditing(false)} existing={pc} />}
    </div>
  );
}

// ---------------------------------------------------------------- PC form

function PcForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: PC }) {
  const blank: PC = existing ?? {
    id: '', name: '', cls: '', level: 1, race: '', hp: 10, maxHp: 10,
    ac: 12, pp: 10, initMod: 0, conditions: [], inspiration: false, deathS: 0, deathF: 0, notes: '',
  };
  const [f, setF] = useState<PC>(blank);
  const set = (k: keyof PC, v: unknown) => setF((prev) => ({ ...prev, [k]: v } as PC));

  return (
    <Sheet open={open} title={existing ? `Edit ${existing.name}` : 'Add character'} onClose={onClose}>
      <Field label="Name"><input class="input" value={f.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} /></Field>
      <div class="field-row">
        <Field label="Class"><input class="input" value={f.cls} onInput={(e) => set('cls', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="Level"><NumInput value={f.level} min={1} max={20} onInput={(n) => set('level', n)} /></Field>
      </div>
      <Field label="Race / lineage"><input class="input" value={f.race} onInput={(e) => set('race', (e.target as HTMLInputElement).value)} /></Field>
      <div class="field-label">Realm sprite — how they appear on the TV &amp; Realm</div>
      <SpritePicker value={f.sprite} surface="hero" onPick={(id) => set('sprite', id)} />
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
      {/* Realm password lives BELOW the save button and only in edit mode:
          it talks to the backend on its own schedule (Set/Clear buttons),
          and keeping it last preserves the sheet's input order for
          everything above (see tests/session-sim.mts index probes). */}
      {existing && <RealmPasswordField pc={existing} />}
    </Sheet>
  );
}

/** Brief 2 — the DM decides, per character, whether Realm login needs a
 *  password. Anything goes, blank means ungated. The password is HASHED ON
 *  THIS DEVICE before it leaves; only the hash travels, into a column the
 *  API can never read back (Brief 1's column privilege). */
function RealmPasswordField({ pc }: { pc: PC }) {
  const [pw, setPw] = useState('');
  const [st, setSt] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const apply = async (password: string) => {
    setSt('busy'); setMsg('');
    try {
      const s = state.value;
      // Roster first, so every party member exists in the login picker even
      // if the DM never touches their password.
      await pushRealmRoster(s.realm, REALM_CAMPAIGN_NAME,
        s.party.map((p) => ({ id: p.id, name: p.name })));
      const gated = await setRealmPassword(s.realm, REALM_CAMPAIGN_NAME,
        { id: pc.id, name: pc.name }, password);
      patch((d) => { const p = d.party.find((x) => x.id === pc.id); if (p) p.realmGated = gated; });
      setPw('');
      setSt('done');
      setMsg(gated
        ? '🔒 Password set — this character now needs it to log in.'
        : '🔓 Password cleared — anyone with the Realm code can pick them.');
    } catch (e) {
      setSt('error');
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const gated = !!state.value.party.find((x) => x.id === pc.id)?.realmGated;
  return (
    <div class="field" style={{ marginTop: '14px' }}>
      <span class="field-label">
        Realm password {gated ? '🔒 gated' : '🔓 open'}
      </span>
      <div class="realm-pass-row">
        <input
          class="input"
          type="text"
          placeholder={gated ? 'New password (replaces the old one)' : 'A word or phrase — anything goes'}
          value={pw}
          onInput={(e) => setPw((e.target as HTMLInputElement).value)}
        />
        <button class="btn" disabled={st === 'busy' || !pw} onClick={() => apply(pw)}>
          {st === 'busy' ? '…' : 'Set'}
        </button>
        {gated && (
          <button class="btn ghost" disabled={st === 'busy'} onClick={() => apply('')}>Clear</button>
        )}
      </div>
      {msg && (
        <p class="stat-fine" style={st === 'error' ? { color: 'var(--thread)' } : undefined}>{msg}</p>
      )}
      <p class="stat-fine">
        Blank = open: anyone with the Realm code can play {pc.name}. With a password,
        they must type it to log in. It's scrambled on this phone before it's sent —
        nobody, including you, can ever read it back.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Ally card

function AllyCard({ ally }: { ally: Ally }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const mod = (n: number) => patch((s) => {
    const a = s.sidekicks.find((x) => x.id === ally.id); if (!a) return;
    a.hp = Math.max(0, Math.min(a.maxHp, a.hp + n));
    if (a.hp > 0) { a.deathS = 0; a.deathF = 0; }
  });

  return (
    <div class={`card unit ${ally.hp <= 0 ? 'dying' : ''}`}>
      <div class="unit-top" onClick={() => setOpen(!open)}>
        <span class="entity-emoji">{ally.emoji}</span>
        <div class="unit-id">
          <div class="unit-name">{ally.name}</div>
          <div class="unit-meta">
            {ally.sidekickClass ?? ally.kind}{ally.level ? ` · L${ally.level}` : ''} <span class="sep">·</span> AC {ally.ac}
            {ally.linkedPcId && (() => { const p = state.value.party.find((x) => x.id === ally.linkedPcId); return p ? <> <span class="sep">·</span> ✦ {p.name}'s</> : null; })()}
            {ally.location ? <><span class="sep">·</span> {ally.location}</> : null}
          </div>
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
            <button class="btn" onClick={() => patch((s) => { const a = s.sidekicks.find((x) => x.id === ally.id); if (a) { a.hp = a.maxHp; a.deathS = 0; a.deathF = 0; } })}>Full</button>
          </div>

          {ally.hp <= 0 && (
            <div class="death-saves">
              <span class="ds-label">Death saves</span>
              {(['deathS', 'deathF'] as const).map((k) => (
                <div class="ds-row">
                  <span>{k === 'deathS' ? 'Saves' : 'Fails'}</span>
                  {[1, 2, 3].map((i) => (
                    <button
                      class={`ds-pip ${k === 'deathF' ? 'fail' : ''}${(ally[k] ?? 0) >= i ? ' on' : ''}`}
                      aria-label={`${k === 'deathS' ? 'Success' : 'Failure'} ${i}`}
                      onClick={() => patch((s) => { const a = s.sidekicks.find((x) => x.id === ally.id); if (a) a[k] = (a[k] ?? 0) >= i ? i - 1 : i; })}
                    >{k === 'deathS' ? '✦' : '✕'}</button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {!ally.srcType && (
            <div class="score-row">
              {(Object.entries(ally.scores) as [string, number][]).map(([k, v]) => (
                <button class="score" onClick={() => rollD20(`${ally.name} — ${k.toUpperCase()}`, Math.floor((v - 10) / 2))}>
                  <span class="score-k">{k.toUpperCase()}</span>
                  <span class="score-v">{v}</span>
                </button>
              ))}
            </div>
          )}
          {ally.srcType === 'monster' && (() => { const c = CREATURES.find((x) => x.id === ally.srcId); return c ? <StatPanel m={rimeAsStatBlock(c)} /> : null; })()}
          {ally.srcType === 'custommon' && customMonsterById(ally.srcId) && <StatPanel m={customMonsterById(ally.srcId)!} />}
          {ally.srcType === 'api' && ally.srcId && <ApiMonsterPanel index={ally.srcId} name={ally.name} />}
          {ally.srcType === 'npc' && ally.srcId && (
            <button class="btn mini ghost" style={{ margin: '8px 0' }} onClick={() => openNpc(ally.srcId!)}>Open NPC sheet →</button>
          )}

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

          <CondEditor current={ally.conditions} onToggle={(c) => patch((s) => {
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

      {editing && <AllyForm key={`edit-${ally.id}`} open onClose={() => setEditing(false)} existing={ally} />}
    </div>
  );
}

// ---------------------------------------------------------------- Ally form

const SIDEKICK_CLASSES: SidekickClass[] = ['Warrior', 'Expert', 'Spellcaster'];

function AllyForm({ open, onClose, existing, category = 'sidekick' }: { open: boolean; onClose: () => void; existing?: Ally; category?: 'sidekick' | 'ally' }) {
  const blank: Ally = existing ?? {
    id: '', name: '', emoji: '🐺', kind: '', category, level: 1, hp: 11, maxHp: 11, ac: 13, initMod: 2,
    scores: { str: 12, dex: 14, con: 12, int: 3, wis: 12, cha: 6 },
    attacks: [], conditions: [], deathS: 0, deathF: 0, location: '', notes: '',
    // Tasha's sidekicks are someone's companion by nature; recruited allies wander.
    follow: category === 'sidekick' ? 'pc' : 'party',
  };
  const [f, setF] = useState<Ally>(blank);
  const set = (k: keyof Ally, v: unknown) => setF((prev) => ({ ...prev, [k]: v } as Ally));
  const setAtk = (i: number, k: keyof AllyAttack, v: unknown) =>
    setF((prev) => ({ ...prev, attacks: prev.attacks.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));

  return (
    <Sheet open={open} title={existing ? `Edit ${existing.name}` : 'Add ally'} onClose={onClose}>
      <div class="field-row">
        <Field label="Emoji"><input class="input" style={{ width: '64px' }} value={f.emoji} onInput={(e) => set('emoji', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="Name"><input class="input" value={f.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} /></Field>
      </div>
      <div class="field-row">
        <Field label="Kind (e.g. Wolf, Goliath scout)"><input class="input" value={f.kind} onInput={(e) => set('kind', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="Level"><NumInput value={f.level} min={0} onInput={(n) => set('level', n)} /></Field>
      </div>
      <div class="field-label">Realm sprite — how they appear on the TV &amp; Realm</div>
      <SpritePicker value={f.sprite} surface="beast" onPick={(id) => set('sprite', id)} />
      {(f.category ?? 'sidekick') === 'sidekick' && (
        <>
          <div class="field-label">Sidekick class (Tasha's)</div>
          <div class="chip-row" style={{ marginBottom: '12px' }}>
            {SIDEKICK_CLASSES.map((c) => (
              <button class={`cond-chip${f.sidekickClass === c ? ' on' : ''}`} onClick={() => setF((prev) => ({ ...prev, sidekickClass: prev.sidekickClass === c ? undefined : c }))}>{c}</button>
            ))}
          </div>
        </>
      )}
      <div class="field-label">Follows — how they roam on the Realm</div>
      <div class="chip-row" style={{ marginBottom: '12px' }}>
        {([['pc', 'A character'], ['party', 'The whole party'], ['free', 'Roams free']] as const).map(([mode, label]) => (
          <button
            key={mode}
            class={`cond-chip${(f.follow ?? (f.linkedPcId ? 'pc' : 'party')) === mode ? ' on' : ''}`}
            onClick={() => setF((prev) => ({ ...prev, follow: mode }))}
          >{label}</button>
        ))}
      </div>
      {(f.follow ?? (f.linkedPcId ? 'pc' : 'party')) === 'pc' && (
        <Field label="Linked to (whose companion)">
          <select class="input" value={f.linkedPcId ?? ''}
            onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setF((prev) => ({ ...prev, linkedPcId: v || undefined })); }}>
            <option value="">— pick a character —</option>
            {state.value.party.map((p) => <option value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}
      <div class="field-row">
        <Field label="Max HP"><NumInput value={f.maxHp} min={1} onInput={(n) => set('maxHp', n)} /></Field>
        <Field label="AC"><NumInput value={f.ac} onInput={(n) => set('ac', n)} /></Field>
        <Field label="Init mod"><NumInput value={f.initMod} onInput={(n) => set('initMod', n)} /></Field>
      </div>
      <div class="score-edit">
        {(Object.keys(f.scores) as (keyof Ally['scores'])[]).map((k) => (
          <Field label={k.toUpperCase()}>
            <NumInput value={f.scores[k]} min={1} max={30} onInput={(n) => setF((prev) => ({ ...prev, scores: { ...prev.scores, [k]: n } }))} />
          </Field>
        ))}
      </div>

      <div class="field-label" style={{ marginTop: '6px' }}>Attacks</div>
      {f.attacks.map((a, i) => (
        <div class="attack-edit">
          <input class="input" placeholder="Name" value={a.name} onInput={(e) => setAtk(i, 'name', (e.target as HTMLInputElement).value)} />
          <NumInput w="64px" value={a.bonus} onInput={(n) => setAtk(i, 'bonus', n)} />
          <input class="input" style={{ width: '86px' }} placeholder="1d6+2" value={a.damage} onInput={(e) => setAtk(i, 'damage', (e.target as HTMLInputElement).value)} />
          <button class="btn mini ghost danger" aria-label="Remove attack" onClick={() => setF((prev) => ({ ...prev, attacks: prev.attacks.filter((_, j) => j !== i) }))}>✕</button>
        </div>
      ))}
      <button class="btn ghost" onClick={() => setF((prev) => ({ ...prev, attacks: [...prev.attacks, { name: '', bonus: 4, damage: '1d6+2' }] }))}>+ Attack</button>

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


// ---------------------------------------------------------------- ally recruitment

function RecruitAllySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { all: bestiary, apiStatus, progress } = useBestiary();

  const recruit = (a: Partial<Ally> & { name: string; emoji: string; maxHp: number; ac: number }) =>
    patch((d) => {
      d.sidekicks.push({
        id: `sk${d.seq++}`, kind: a.kind ?? '', category: 'ally', level: a.level ?? 0,
        hp: a.maxHp, maxHp: a.maxHp, ac: a.ac, initMod: a.initMod ?? 0,
        scores: a.scores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        attacks: [], conditions: [], deathS: 0, deathF: 0, location: '', notes: '',
        name: a.name, emoji: a.emoji, srcType: a.srcType, srcId: a.srcId,
        sprite: a.sprite, follow: 'party',
      });
    });

  const fromBestiary = async (e: BestiaryEntry) => {
    // Monster sprites (Wave 5) bake in at recruitment, the npcSpriteFor pattern.
    const sprite = monsterSpriteFor(e.srcId);
    if (e.src === 'rime') {
      const c = CREATURES.find((x) => x.id === e.srcId)!;
      recruit({ name: String(c.name), emoji: String(c.emoji), maxHp: Number(c.hp), ac: Number(c.ac), initMod: abilityMod(c.dex), srcType: 'monster', srcId: e.srcId, kind: String(c.type), sprite });
    } else if (e.src === 'custom') {
      const m = customMonsterById(e.srcId)!;
      recruit({ name: m.name, emoji: m.emoji, maxHp: m.hp, ac: m.ac, initMod: abilityMod(m.dex), srcType: 'custommon', srcId: e.srcId, kind: m.type, sprite });
    } else {
      setBusy(e.key);
      const d = await getApiMonster(e.srcId);
      setBusy(null);
      const hp = d?.hit_points ?? 10;
      const ac = Array.isArray(d?.armor_class) ? d!.armor_class[0]?.value ?? 12 : (d?.armor_class as number | undefined) ?? 12;
      recruit({ name: e.name, emoji: '👾', maxHp: hp, ac, initMod: abilityMod(d?.dexterity), srcType: 'api', srcId: e.srcId, kind: String(d?.type ?? ''), sprite });
    }
    onClose();
  };

  const npcs = allNpcs();
  const matches = (q.trim()
    ? bestiary.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : bestiary.filter((e) => e.src !== 'api')).slice(0, 50);
  const npcMatches = q.trim() ? npcs.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())) : npcs.slice(0, 8);

  return (
    <Sheet open={open} title="Recruit an ally" onClose={onClose}>
      <input class="input" placeholder="Search monsters & NPCs…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {apiStatus === 'loading' && <p class="stat-fine">Downloading the 5e bestiary… {progress}%</p>}

      <div class="field-label" style={{ marginTop: '10px' }}>NPCs</div>
      <div class="chip-row" style={{ marginBottom: '10px' }}>
        {npcMatches.map((n) => (
          <button class="chip npc-chip" onClick={() => {
            const s = n.seed;
            recruit({ name: n.name, emoji: n.emoji, maxHp: s?.hp ?? 10, ac: s?.ac ?? 12, srcType: 'npc', srcId: n.id, kind: n.role, sprite: npcSpriteFor(n.id) });
            onClose();
          }}>{n.emoji} {n.name}</button>
        ))}
      </div>

      <div class="field-label">Monsters</div>
      <div class="creature-list">
        {matches.map((e) => (
          <button class="creature-add" disabled={busy === e.key} onClick={() => fromBestiary(e)}>
            <span>{e.emoji} {e.name}{e.src === 'custom' ? ' ✦' : ''}</span>
            <span class="cr">{busy === e.key ? 'adding…' : `CR ${e.crLabel}`}</span>
          </button>
        ))}
      </div>
      <button class="btn ghost" style={{ marginTop: '10px' }} onClick={() => setBuilding(true)}>+ Build a stat block</button>
      {building && <MonsterForm open onClose={() => setBuilding(false)} onCreated={(m) => {
        recruit({ name: m.name, emoji: m.emoji, maxHp: m.hp, ac: m.ac, initMod: abilityMod(m.dex), srcType: 'custommon', srcId: m.id, kind: m.type, sprite: m.sprite });
        onClose();
      }} />}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Screen

// ---------------------------------------------------------------- journals

/** Brief 3 — the DM's journal view: every entry across the party, private
 *  and shared alike (Ben's decision: the DM sees everything). Read-only on
 *  purpose — the words belong to the players; RLS wouldn't let a DM token
 *  edit them anyway. Data comes through the same per-session DM token as
 *  the roster sync: no privileged path exists in this app. */
function DmJournals() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [setup, setSetup] = useState(false);

  const load = async () => {
    setBusy(true); setErr('');
    try {
      const token = await ensureDmToken(state.value.realm, REALM_CAMPAIGN_NAME);
      setEntries(await listAllJournal(token));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSetup(e instanceof RealmUnreachableError);
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  const nameOf = (id: string) => state.value.party.find((p) => p.id === id)?.name ?? id;
  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  // listAllJournal orders by author, then newest first — group on that.
  const groups: { authorId: string; items: JournalEntry[] }[] = [];
  for (const e of entries ?? []) {
    const g = groups[groups.length - 1];
    if (g && g.authorId === e.authorId) g.items.push(e);
    else groups.push({ authorId: e.authorId, items: [e] });
  }

  return (
    <>
      {err && (
        <div class="card">
          <p class="stat-fine" style={{ color: 'var(--thread)', margin: 0 }}>
            <strong>⚠ Couldn't load the journals{setup ? ' — Realm server unreachable' : ''}.</strong> {err}
          </p>
          {setup && (
            <p class="stat-fine" style={{ margin: '4px 0 0' }}>
              Same fix as the Sync button on the Session tab: the <code>realm-login</code> function
              and migrations are one-time dashboard steps — see <strong>REALM_SETUP.md</strong>.
            </p>
          )}
          <button class="btn" style={{ marginTop: '8px' }} disabled={busy} onClick={load}>
            {busy ? 'Loading…' : 'Try again'}
          </button>
        </div>
      )}
      {!err && entries === null && (
        <div class="card"><p class="read">Fetching every journal from the Realm…</p></div>
      )}
      {!err && entries?.length === 0 && (
        <div class="card"><p class="read">No entries yet. Once players sign into the Realm and start writing, everything — private and shared — appears here.</p></div>
      )}
      {groups.map((g) => (
        <div class="card" key={g.authorId}>
          <h3>📓 {nameOf(g.authorId)} <span class="stat-fine">({g.items.length})</span></h3>
          {g.items.map((entry) => (
            <div key={entry.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', cursor: 'pointer' }}
                onClick={() => setOpenId(openId === entry.id ? null : entry.id)}>
                <strong style={{ flex: 1 }}>{entry.title || 'Untitled'}</strong>
                <span class="cond-tag">{entry.isShared ? '✦ shared' : '🔒 private'}</span>
                <span class="stat-fine">{when(entry.updatedAt)}</span>
              </div>
              {openId === entry.id && (
                <p class="read" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{entry.body}</p>
              )}
            </div>
          ))}
        </div>
      ))}
      {!err && entries !== null && (
        <div class="supply-row" style={{ gap: '8px' }}>
          <button class="btn" disabled={busy} onClick={load}>{busy ? 'Refreshing…' : '↻ Refresh'}</button>
          <p class="stat-fine" style={{ margin: 0 }}>Read-only — the words belong to the players. 🔒 private entries are visible to you alone.</p>
        </div>
      )}
    </>
  );
}

export function PartyScreen() {
  const [sub, setSub] = useState<'pcs' | 'sidekicks' | 'allies' | 'journals'>('pcs');
  const [adding, setAdding] = useState(false);
  const [recruiting, setRecruiting] = useState(false);
  const { party, sidekicks } = state.value;
  const sk = sidekicks.filter((a) => (a.category ?? 'sidekick') === 'sidekick');
  const allies = sidekicks.filter((a) => a.category === 'ally');

  return (
    <div>
      <p class="screen-kicker">The Heroes</p>
      <h1 class="screen-title">Party</h1>

      <div class="card party-loc-card">
        <label class="field-label" style={{ margin: 0 }}>Party is at</label>
        <input
          class="input"
          placeholder="Ten-Towns, Icewind Dale"
          value={state.value.tv.partyLocation}
          onInput={(e) => patch((d) => { d.tv.partyLocation = (e.target as HTMLInputElement).value; })}
        />
        <p class="stat-fine" style={{ margin: '4px 0 0' }}>Shown top-left on the TV. While set, it overrides the journey route; clear it to let travel take over.</p>
      </div>

      <div class="card">
        <h3>🎒 Party stash</h3>
        <ItemRows ownerId={null} />
      </div>

      <div class="sub-tabs">
        <button class={`sub-tab${sub === 'pcs' ? ' active' : ''}`} onClick={() => setSub('pcs')}>Characters ({party.length})</button>
        <button class={`sub-tab${sub === 'sidekicks' ? ' active' : ''}`} onClick={() => setSub('sidekicks')}>Sidekicks ({sk.length})</button>
        <button class={`sub-tab${sub === 'allies' ? ' active' : ''}`} onClick={() => setSub('allies')}>Allies ({allies.length})</button>
        <button class={`sub-tab${sub === 'journals' ? ' active' : ''}`} onClick={() => setSub('journals')}>Journals</button>
      </div>

      {sub === 'pcs' && (
        <>
          {party.length === 0 && (
            <div class="card"><p class="read">The souls who walk into the endless winter will be recorded here.</p></div>
          )}
          {party.map((pc) => <PcCard key={pc.id} pc={pc} />)}
          <button class="btn primary wide" onClick={() => setAdding(true)}>+ Add character</button>
          {adding && <PcForm key="add-pc" open onClose={() => setAdding(false)} />}
        </>
      )}

      {sub === 'sidekicks' && (
        <>
          {sk.length === 0 && (
            <div class="card"><p class="read">Tasha's sidekicks — Warriors, Experts, and Spellcasters who level alongside a hero.</p></div>
          )}
          {sk.map((a) => <AllyCard key={a.id} ally={a} />)}
          <button class="btn primary wide" onClick={() => setAdding(true)}>+ Add sidekick</button>
          {adding && <AllyForm key="add-sk" open category="sidekick" onClose={() => setAdding(false)} />}
        </>
      )}

      {sub === 'allies' && (
        <>
          {allies.length === 0 && (
            <div class="card"><p class="read">Recruited creatures and friendly faces — pull any stat block from the bestiary or an NPC into the party's corner.</p></div>
          )}
          {allies.map((a) => <AllyCard key={a.id} ally={a} />)}
          <button class="btn primary wide" onClick={() => setRecruiting(true)}>+ Recruit ally</button>
          {recruiting && <RecruitAllySheet open onClose={() => setRecruiting(false)} />}
        </>
      )}

      {sub === 'journals' && <DmJournals />}
    </div>
  );
}
