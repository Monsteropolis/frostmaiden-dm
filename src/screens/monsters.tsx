// Monsters — one place for stat panels, the custom monster builder,
// and the unified bestiary (Rime + custom + full 5e) used by the
// Lore tab, the combat Add sheet, and ally recruitment.

import { useState, useEffect } from 'preact/hooks';
import { state, patch } from '../state/store';
import { CustomMonster } from '../state/schema';
import { CREATURES, SeedCreature } from '../data';
import { Sheet, ConfirmBtn, Field, NumInput } from '../components/ui';
import { rollD20, rollDamage, showRoll } from '../lib/dice';
import { getMonstersWithCr, CrListItem } from '../lib/api';
import { SpritePicker } from '../components/SpritePicker';

export function abilityMod(score: unknown): number {
  return typeof score === 'number' ? Math.floor((score - 10) / 2) : 0;
}

export function parseAttack(desc: string): { bonus?: number; dmg?: string } {
  const bonus = /([+-]\d+)\s*to hit/i.exec(desc)?.[1];
  const dmg = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/i.exec(desc)?.[1];
  return { bonus: bonus ? parseInt(bonus, 10) : undefined, dmg: dmg?.replace(/\s/g, '') };
}

// ---------------------------------------------------------------- generic stat panel

export interface StatBlockLike {
  name: string;
  size?: string; type?: string; cr?: string | number;
  ac?: number; hp?: number; speed?: string;
  str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number;
  senses?: string; skills?: string;
  traits?: { n: string; d: string }[];
  actions?: { n: string; d: string }[];
  lore?: string;
}

export function StatPanel({ m }: { m: StatBlockLike }) {
  const name = m.name;
  return (
    <div class="stat-panel">
      <div class="stat-line">
        <span>{[m.size, m.type].filter(Boolean).join(' ')}{m.cr !== undefined ? ` · CR ${m.cr}` : ''}</span>
        <span>{m.ac !== undefined ? `AC ${m.ac}` : ''}{m.speed ? ` · ${m.speed}` : ''}</span>
      </div>
      <div class="score-row">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((k) => (
          <button class="score" onClick={() => rollD20(`${name} — ${k.toUpperCase()}`, abilityMod(m[k]))}>
            <span class="score-k">{k.toUpperCase()}</span>
            <span class="score-v">{m[k] ?? '—'}</span>
          </button>
        ))}
      </div>
      {(m.senses || m.skills) && <p class="stat-fine">{[m.senses, m.skills].filter(Boolean).join(' · ')}</p>}
      {(m.traits ?? []).map((t) => <p class="stat-trait"><strong>{t.n}.</strong> {t.d}</p>)}
      {(m.actions ?? []).map((a) => {
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

export function rimeAsStatBlock(c: SeedCreature): StatBlockLike {
  return c as unknown as StatBlockLike;
}

export function customMonsterById(id?: string): CustomMonster | undefined {
  return state.value.customMonsters.find((m) => m.id === id);
}

/** Sprite resolution for any monster-derived actor (mirrors npcSpriteFor):
 *  monsterOverrides[id] → CustomMonster.sprite → undefined (name-match /
 *  emoji token downstream). `id` is a Rime id, 5e API index, or custom id. */
export function monsterSpriteFor(id?: string): string | undefined {
  if (!id) return undefined;
  return state.value.monsterOverrides?.[id]
    ?? state.value.customMonsters.find((m) => m.id === id)?.sprite;
}

/** The picker every bestiary surface shares — one component, per the brief.
 *  Presets (Rime / 5e API) write the override map; custom monsters carry
 *  their own field. */
export function MonsterSpriteRow({ src, srcId }: { src: 'rime' | 'custom' | 'api'; srcId: string }) {
  const value = src === 'custom'
    ? state.value.monsterOverrides?.[srcId] ?? customMonsterById(srcId)?.sprite
    : state.value.monsterOverrides?.[srcId];
  const pick = (id?: string) => patch((d) => {
    if (src === 'custom') {
      const m = d.customMonsters.find((x) => x.id === srcId);
      if (m) m.sprite = id;
      delete d.monsterOverrides[srcId];   // the record is the truth for customs
    } else if (id) {
      d.monsterOverrides[srcId] = id;
    } else {
      delete d.monsterOverrides[srcId];
    }
  });
  return (
    <>
      <div class="field-label" style={{ marginTop: '10px' }}>Realm sprite — how it appears on the TV &amp; initiative</div>
      <SpritePicker value={value} onPick={pick} />
    </>
  );
}

// ---------------------------------------------------------------- custom monster builder

export function MonsterForm({ open, onClose, existing, onCreated }: {
  open: boolean; onClose: () => void; existing?: CustomMonster;
  onCreated?: (m: CustomMonster) => void;
}) {
  const blank: CustomMonster = existing ?? {
    id: '', name: '', emoji: '👾', size: 'Medium', type: 'humanoid', cr: '1',
    ac: 13, hp: 22, speed: '30 ft.', str: 12, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
    senses: '', traits: [], actions: [],
  };
  const [f, setF] = useState(blank);
  const txt = (k: keyof CustomMonster) => (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const setRow = (key: 'traits' | 'actions', i: number, field: 'n' | 'd', v: string) =>
    setF((prev) => ({ ...prev, [key]: prev[key].map((r, j) => (j === i ? { ...r, [field]: v } : r)) }));

  const rows = (key: 'traits' | 'actions', label: string, hint: string) => (
    <>
      <div class="field-label" style={{ marginTop: '8px' }}>{label}</div>
      {f[key].map((r, i) => (
        <div class="trait-edit">
          <input class="input" placeholder="Name" value={r.n} onInput={(e) => setRow(key, i, 'n', (e.target as HTMLInputElement).value)} />
          <button class="btn mini ghost danger" aria-label="Remove" onClick={() => setF((prev) => ({ ...prev, [key]: prev[key].filter((_, j) => j !== i) }))}>✕</button>
          <textarea class="input trait-desc" rows={2} placeholder={hint} value={r.d} onInput={(e) => setRow(key, i, 'd', (e.target as HTMLTextAreaElement).value)} />
        </div>
      ))}
      <button class="btn ghost mini" onClick={() => setF((prev) => ({ ...prev, [key]: [...prev[key], { n: '', d: '' }] }))}>+ {label.slice(0, -1)}</button>
    </>
  );

  return (
    <Sheet open={open} title={existing ? `Edit ${existing.name}` : 'New monster'} onClose={onClose}>
      <div class="field-row">
        <Field label="Emoji"><input class="input" style={{ width: '58px' }} value={f.emoji} onInput={txt('emoji')} /></Field>
        <Field label="Name"><input class="input" value={f.name} onInput={txt('name')} /></Field>
      </div>
      <div class="field-row">
        <Field label="Size"><input class="input" value={f.size} onInput={txt('size')} /></Field>
        <Field label="Type"><input class="input" value={f.type} onInput={txt('type')} /></Field>
        <Field label="CR"><input class="input" style={{ width: '64px' }} value={f.cr} onInput={txt('cr')} /></Field>
      </div>
      <div class="field-row">
        <Field label="AC"><NumInput value={f.ac} onInput={(n) => setF((p) => ({ ...p, ac: n }))} /></Field>
        <Field label="HP"><NumInput value={f.hp} min={1} onInput={(n) => setF((p) => ({ ...p, hp: n }))} /></Field>
        <Field label="Speed"><input class="input" value={f.speed} onInput={txt('speed')} /></Field>
      </div>
      <div class="score-edit">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((k) => (
          <Field label={k.toUpperCase()}>
            <NumInput value={f[k]} min={1} max={30} onInput={(n) => setF((p) => ({ ...p, [k]: n }))} />
          </Field>
        ))}
      </div>
      <Field label="Senses / skills (optional)"><input class="input" placeholder="darkvision 60 ft., passive Perception 12" value={f.senses} onInput={txt('senses')} /></Field>
      <div class="field-label">Realm sprite — how it appears on the TV &amp; initiative</div>
      <SpritePicker value={f.sprite} onPick={(id) => setF((p) => ({ ...p, sprite: id }))} />
      {rows('traits', 'Traits', 'Pack Tactics. The creature has advantage on…')}
      {rows('actions', 'Actions', 'Bite. Melee Weapon Attack: +4 to hit… Hit: 7 (1d8+2) piercing.')}
      <p class="stat-fine" style={{ margin: '10px 0 0' }}>Write actions like the book — "+X to hit" and "(XdY+Z)" become rollable buttons automatically.</p>

      <div class="form-gap" />
      <button class="btn primary wide" disabled={!f.name.trim()} onClick={() => {
        if (existing) {
          patch((d) => { const i = d.customMonsters.findIndex((x) => x.id === existing.id); if (i >= 0) d.customMonsters[i] = f; });
          onClose();
        } else {
          let created: CustomMonster | undefined;
          patch((d) => { created = { ...f, id: `cm${d.seq++}` }; d.customMonsters.push(created); });
          onClose();
          if (created && onCreated) onCreated(created);
        }
      }}>{existing ? 'Save changes' : 'Create monster'}</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- unified bestiary source

export interface BestiaryEntry {
  key: string;
  name: string;
  emoji: string;
  cr: number;          // numeric for filtering (rime cr strings parsed)
  crLabel: string;
  src: 'rime' | 'custom' | 'api';
  srcId: string;
  ac?: number;
  hp?: number;
}

function crToNumber(cr: unknown): number {
  const s = String(cr ?? '').trim();
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return b ? a / b : 0; }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function localBestiary(): BestiaryEntry[] {
  const rime: BestiaryEntry[] = CREATURES.map((c) => ({
    key: `rime:${c.id}`, name: String(c.name), emoji: String(c.emoji),
    cr: crToNumber(c.cr), crLabel: String(c.cr), src: 'rime', srcId: c.id,
    ac: Number(c.ac), hp: Number(c.hp),
  }));
  const custom: BestiaryEntry[] = state.value.customMonsters.map((m) => ({
    key: `custom:${m.id}`, name: m.name, emoji: m.emoji,
    cr: crToNumber(m.cr), crLabel: m.cr, src: 'custom', srcId: m.id,
    ac: m.ac, hp: m.hp,
  }));
  return [...rime, ...custom];
}

export function apiBestiary(list: CrListItem[]): BestiaryEntry[] {
  return list.map((m) => ({
    key: `api:${m.index}`, name: m.name, emoji: '👾',
    cr: m.cr, crLabel: m.cr === 0.125 ? '1/8' : m.cr === 0.25 ? '1/4' : m.cr === 0.5 ? '1/2' : String(m.cr),
    src: 'api', srcId: m.index,
  }));
}

export const CR_FILTERS: { label: string; test: (cr: number) => boolean }[] = [
  { label: 'CR 0–1', test: (c) => c <= 1 },
  { label: '2–4', test: (c) => c >= 2 && c <= 4 },
  { label: '5–8', test: (c) => c >= 5 && c <= 8 },
  { label: '9–12', test: (c) => c >= 9 && c <= 12 },
  { label: '13+', test: (c) => c >= 13 },
];

/** Hook: full bestiary with API monsters loaded/cached in the background. */
export function useBestiary() {
  const [api, setApi] = useState<CrListItem[] | null | 'loading'>('loading');
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let live = true;
    getMonstersWithCr((p) => live && setProgress(p)).then((r) => live && setApi(r));
    return () => { live = false; };
  }, []);
  const local = localBestiary();
  const all = (api && api !== 'loading' ? [...local, ...apiBestiary(api)] : [...local])
    .sort((a, b) => a.name.localeCompare(b.name)); // one list, one alphabet — Rime rides inline
  return { all, apiStatus: api, progress };
}

// A card used anywhere a bestiary entry needs an expandable stat block.
export function BestiaryCard({ e, action, onAction, ApiPanel }: {
  e: BestiaryEntry;
  action?: string;
  onAction?: (e: BestiaryEntry) => void;
  ApiPanel: (p: { index: string; name: string }) => preact.JSX.Element;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const rime = e.src === 'rime' ? CREATURES.find((c) => c.id === e.srcId) : undefined;
  const custom = e.src === 'custom' ? customMonsterById(e.srcId) : undefined;
  return (
    <div class="card unit">
      <div class="cr-grid" onClick={() => setOpen(!open)}>
        <span class="cr-badge">{e.crLabel}</span>
        <div class="cr-id">
          <div class="cr-name">{e.emoji} {e.name}{e.src === 'custom' && <span class="yours-mark"> ✦</span>}</div>
          <div class="unit-meta">{e.src === 'rime' ? 'Rime of the Frostmaiden' : e.src === 'custom' ? 'Your creation' : '5e Monster Manual'}</div>
        </div>
        {action && onAction && (
          <button class="btn mini" onClick={(ev) => { ev.stopPropagation(); onAction(e); }}>{action}</button>
        )}
      </div>
      {open && (
        <div class="unit-detail">
          {rime && String(rime.lore || '') && <p class="read" style={{ marginBottom: '8px' }}>{String(rime.lore)}</p>}
          {rime && <StatPanel m={rimeAsStatBlock(rime)} />}
          {custom && <StatPanel m={custom} />}
          {e.src === 'api' && <ApiPanel index={e.srcId} name={e.name} />}
          <MonsterSpriteRow src={e.src} srcId={e.srcId} />
          {custom && (
            <div class="row-actions">
              <button class="btn mini ghost" onClick={() => setEditing(true)}>Edit</button>
              <ConfirmBtn label="Delete" confirmLabel="Delete?" class="mini ghost danger"
                onConfirm={() => patch((d) => { d.customMonsters = d.customMonsters.filter((x) => x.id !== e.srcId); })} />
            </div>
          )}
        </div>
      )}
      {editing && custom && <MonsterForm open existing={custom} onClose={() => setEditing(false)} />}
    </div>
  );
}
