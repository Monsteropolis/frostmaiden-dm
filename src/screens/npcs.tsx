// NPCs — the first-class feature. One registry over seeded module
// NPCs + custom ones; standing/last-seen editable in three taps.

import { useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { state, patch } from '../state/store';
import { CustomNpc, Standing, AllyAttack } from '../state/schema';
import { NPCS, SeedNpc } from '../data';
import { Sheet, ConfirmBtn, Field, NumInput } from '../components/ui';
import { rollD20, rollDamage, showRoll } from '../lib/dice';
import { NpcFace } from '../lib/portraits';

/** Global NPC popup — call openNpc(id) from any screen. */
export const npcPopupId = signal<string | null>(null);
export const openNpc = (id: string) => { npcPopupId.value = id; };

export const STANDINGS: Standing[] = ['neutral', 'friendly', 'allied', 'hostile', 'dead'];
export const STANDING_LABEL: Record<Standing, string> = {
  neutral: 'Neutral', friendly: 'Friendly', allied: 'Allied', hostile: 'Hostile', dead: 'Dead',
};

/** A unified view over seeded + custom NPCs. */
export interface NpcView {
  id: string;
  name: string;
  emoji: string;
  role: string;
  town: string;
  custom: boolean;
  seed?: SeedNpc;
  data?: CustomNpc;
}

export function allNpcs(): NpcView[] {
  const seeded: NpcView[] = NPCS.map((n) => ({
    id: n.id, name: n.name, emoji: n.emoji, role: n.role, town: n.town, custom: false, seed: n,
  }));
  const custom: NpcView[] = state.value.customNpcs.map((n) => ({
    id: n.id, name: n.name, emoji: n.emoji, role: n.role, town: n.town, custom: true, data: n,
  }));
  return [...seeded, ...custom];
}

export function npcStanding(id: string): Standing {
  return (state.value.npcOverrides[id]?.standing ?? 'neutral') as Standing;
}

// (portrait chips for built-in NPCs live in lib/portraits.tsx)

// ---------------------------------------------------------------- quick update

function QuickUpdate({ npc, open, onClose }: { npc: NpcView; open: boolean; onClose: () => void }) {
  const ov = state.value.npcOverrides[npc.id] ?? {};
  const [seen, setSeen] = useState(ov.lastSeen ?? '');
  return (
    <Sheet open={open} title={`${npc.emoji} ${npc.name}`} onClose={onClose}>
      <div class="field-label">Standing</div>
      <div class="standing-picker">
        {STANDINGS.map((s) => (
          <button
            class={`standing pick ${s}${npcStanding(npc.id) === s ? ' current' : ''}`}
            onClick={() => {
              patch((d) => { d.npcOverrides[npc.id] = { ...d.npcOverrides[npc.id], standing: s }; });
              onClose();
            }}
          >{STANDING_LABEL[s]}</button>
        ))}
      </div>
      <Field label="Last seen (optional context)">
        <input class="input" placeholder="S3 — warned the party about Sephek" value={seen}
          onInput={(e) => setSeen((e.target as HTMLInputElement).value)}
          onChange={() => patch((d) => { d.npcOverrides[npc.id] = { ...d.npcOverrides[npc.id], lastSeen: seen }; })} />
      </Field>
      <button class="btn wide" onClick={() => {
        patch((d) => { d.npcOverrides[npc.id] = { ...d.npcOverrides[npc.id], lastSeen: seen }; });
        onClose();
      }}>Done</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- detail sheet

function ReadBlock({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <div class="npc-block">
      <div class="field-label">{label}</div>
      <p class="read">{text}</p>
    </div>
  );
}

function NpcDetail({ npc, open, onClose, onEdit }: { npc: NpcView; open: boolean; onClose: () => void; onEdit?: () => void }) {
  const s = npc.seed;
  const c = npc.data;
  const ov = state.value.npcOverrides[npc.id] ?? {};
  const arcs = state.value.arcs.filter((a) => a.linkedNpcIds.includes(npc.id));
  const hooks = s?.quests ?? [];
  const [notes, setNotes] = useState(ov.notes ?? '');

  return (
    <Sheet open={open} title={`${npc.emoji} ${npc.name}`} onClose={onClose}>
      <div class="npc-head">
        <div class="npc-head-id">
          <span class="npc-portrait-wrap lg"><NpcFace id={npc.id} emoji={npc.emoji} /></span>
          <div>
            <span class={`standing ${npcStanding(npc.id)}`}>{STANDING_LABEL[npcStanding(npc.id)]}</span>
            <span class="unit-meta">{npc.role} · {npc.town}{s?.location ? ` — ${s.location}` : ''}</span>
          </div>
        </div>
        {ov.lastSeen && <p class="npc-lastseen">✦ Last seen: {ov.lastSeen}</p>}
      </div>

      {s && (
        <div class="npc-statline">
          {s.race && <span>{s.race}</span>}
          {s.faction && <span>{s.faction}</span>}
          {s.ac != null && <span>AC {s.ac}</span>}
          {s.hp != null && <span>{s.hp} hp</span>}
        </div>
      )}
      {c && (c.ac || c.hp || c.race) && (
        <div class="npc-statline">
          {c.race && <span>{c.race}</span>}
          {c.ac ? <span>AC {c.ac}</span> : null}
          {c.hp ? <span>{c.hp} hp</span> : null}
        </div>
      )}
      {(c?.attacks?.length ?? 0) > 0 && (
        <div class="attack-list">
          {c!.attacks!.map((a) => (
            <div class="attack-row">
              <span class="attack-name">{a.name}</span>
              <button class="btn mini" onClick={() => rollD20(`${a.name} — attack`, a.bonus)}>d20{a.bonus >= 0 ? '+' : ''}{a.bonus}</button>
              <button class="btn mini" onClick={() => { const r = rollDamage(a.damage); showRoll({ title: `${a.name} — damage`, total: r.total, detail: r.detail }); }}>{a.damage}</button>
            </div>
          ))}
        </div>
      )}

      <ReadBlock label="Personality" text={s?.personality ?? c?.personality} />
      <ReadBlock label="Voice" text={s?.voice ?? c?.voice} />
      <ReadBlock label="Wants" text={s?.wants ?? c?.wants} />
      <ReadBlock label="Fears" text={s?.fears ?? c?.fears} />
      <ReadBlock label="Appearance" text={s?.appearance ?? c?.appearance} />

      {(s?.secrets?.length ?? 0) > 0 && (
        <div class="npc-block secret">
          <div class="field-label">✦ Secrets (DM only)</div>
          {s!.secrets!.map((x) => <p class="read">{x}</p>)}
        </div>
      )}

      {(hooks.length > 0 || arcs.length > 0) && (
        <div class="npc-block">
          <div class="field-label">Threads</div>
          {arcs.map((a) => (
            <p class="thread-link"><span class={`arc-dot ${a.status}`} /> {a.name} <span class="unit-meta">— {a.status}</span></p>
          ))}
          {hooks.map((q) => <p class="thread-link"><span class="arc-dot hook" /> {q}</p>)}
        </div>
      )}

      {(s?.inventory?.length ?? 0) > 0 && (
        <div class="npc-block">
          <div class="field-label">Inventory</div>
          {s!.inventory!.map((it) => (
            <p class="thread-link">{it.item} <span class="unit-meta">— {it.price}{it.note ? ` · ${it.note}` : ''}</span></p>
          ))}
        </div>
      )}

      <Field label="Your notes">
        <textarea class="input" rows={3} value={notes}
          onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
          onChange={() => patch((d) => { d.npcOverrides[npc.id] = { ...d.npcOverrides[npc.id], notes }; })} />
      </Field>

      <div class="row-actions" style={{ justifyContent: npc.custom ? 'space-between' : 'flex-end' }}>
        {npc.custom && onEdit && <button class="btn ghost" onClick={onEdit}>Edit</button>}
        {npc.custom && (
          <ConfirmBtn label="Delete NPC" confirmLabel="Delete?" class="ghost danger"
            onConfirm={() => { patch((d) => { d.customNpcs = d.customNpcs.filter((x) => x.id !== npc.id); }); onClose(); }} />
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- custom form

export function NpcForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: CustomNpc }) {
  const blank: CustomNpc = existing ?? {
    id: '', name: '', emoji: '🧑', role: '', town: '', race: '',
    personality: '', voice: '', wants: '', fears: '', appearance: '', notes: '',
  };
  const [f, setF] = useState(blank);
  const set = (k: keyof CustomNpc) => (e: Event) => { const v = (e.target as HTMLInputElement).value; setF((prev) => ({ ...prev, [k]: v })); };

  return (
    <Sheet open={open} title={existing ? `Edit ${existing.name}` : 'New NPC'} onClose={onClose}>
      <div class="field-row">
        <Field label="Emoji"><input class="input" style={{ width: '58px' }} value={f.emoji} onInput={set('emoji')} /></Field>
        <Field label="Name"><input class="input" value={f.name} onInput={set('name')} /></Field>
      </div>
      <div class="field-row">
        <Field label="Role"><input class="input" placeholder="Tavern keeper" value={f.role} onInput={set('role')} /></Field>
        <Field label="Town"><input class="input" value={f.town} onInput={set('town')} /></Field>
      </div>
      <Field label="Race / lineage"><input class="input" value={f.race} onInput={set('race')} /></Field>
      <Field label="Personality"><textarea class="input" rows={2} value={f.personality} onInput={set('personality')} /></Field>
      <Field label="Voice"><input class="input" placeholder="Gravelly, never finishes a sentence…" value={f.voice} onInput={set('voice')} /></Field>
      <div class="field-row">
        <Field label="Wants"><input class="input" value={f.wants} onInput={set('wants')} /></Field>
        <Field label="Fears"><input class="input" value={f.fears} onInput={set('fears')} /></Field>
      </div>
      <Field label="Appearance"><input class="input" value={f.appearance} onInput={set('appearance')} /></Field>
      <div class="field-row">
        <Field label="AC (optional)"><NumInput value={f.ac ?? 0} onInput={(n) => setF((prev) => ({ ...prev, ac: n || undefined }))} /></Field>
        <Field label="HP (optional)"><NumInput value={f.hp ?? 0} onInput={(n) => setF((prev) => ({ ...prev, hp: n || undefined }))} /></Field>
      </div>
      <div class="field-label">Attacks</div>
      {(f.attacks ?? []).map((a, i) => (
        <div class="attack-edit">
          <input class="input" placeholder="Name" value={a.name}
            onInput={(e) => { const v = (e.target as HTMLInputElement).value; setF((prev) => ({ ...prev, attacks: prev.attacks!.map((x, j) => j === i ? { ...x, name: v } : x) })); }} />
          <NumInput w="64px" value={a.bonus}
            onInput={(n) => setF((prev) => ({ ...prev, attacks: prev.attacks!.map((x, j) => j === i ? { ...x, bonus: n } : x) }))} />
          <input class="input" style={{ width: '86px' }} placeholder="1d6+2" value={a.damage}
            onInput={(e) => { const v = (e.target as HTMLInputElement).value; setF((prev) => ({ ...prev, attacks: prev.attacks!.map((x, j) => j === i ? { ...x, damage: v } : x) })); }} />
          <button class="btn mini ghost danger" aria-label="Remove attack"
            onClick={() => setF((prev) => ({ ...prev, attacks: prev.attacks!.filter((_, j) => j !== i) }))}>✕</button>
        </div>
      ))}
      <button class="btn ghost" onClick={() => setF((prev) => ({ ...prev, attacks: [...(prev.attacks ?? []), { name: '', bonus: 4, damage: '1d6+2' } as AllyAttack] }))}>+ Attack</button>
      <Field label="Notes"><textarea class="input" rows={2} value={f.notes} onInput={set('notes')} /></Field>
      <button class="btn primary wide" disabled={!f.name.trim()} onClick={() => {
        if (existing) {
          patch((d) => { const i = d.customNpcs.findIndex((x) => x.id === existing.id); if (i >= 0) d.customNpcs[i] = f; });
        } else {
          patch((d) => { d.customNpcs.push({ ...f, id: `npc${d.seq++}` }); });
        }
        onClose();
      }}>{existing ? 'Save changes' : 'Create NPC'}</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- registry

export function NpcRegistry() {
  const [q, setQ] = useState('');
  const [town, setTown] = useState('all');
  const [quickId, setQuickId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomNpc | null>(null);

  const npcs = allNpcs();
  const towns = [...new Set(npcs.map((n) => n.town).filter(Boolean))].sort();
  const shown = npcs.filter((n) =>
    (town === 'all' || n.town === town) &&
    (!q.trim() || `${n.name} ${n.role}`.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <>
      <input class="input" placeholder="Search NPCs…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chip-row" style={{ margin: '10px 0 14px' }}>
        <button class={`cond-chip${town === 'all' ? ' on' : ''}`} onClick={() => setTown('all')}>All</button>
        {towns.map((t) => <button class={`cond-chip${town === t ? ' on' : ''}`} onClick={() => setTown(t)}>{t}</button>)}
      </div>

      {shown.map((n) => {
        const ov = state.value.npcOverrides[n.id];
        return (
          <div class="entity-row npc" onClick={() => openNpc(n.id)}>
            <NpcFace id={n.id} emoji={n.emoji} />
            <div class="unit-id">
              <div class="entity-name">{n.name}{n.custom && <span class="yours-mark"> ✦</span>}</div>
              <div class="entity-meta">{n.role}{n.town ? <><span class="sep">·</span>{n.town}</> : null}</div>
              {ov?.lastSeen && <div class="npc-lastseen">✦ {ov.lastSeen}</div>}
            </div>
            <button
              class={`standing ${npcStanding(n.id)}`}
              style={{ background: 'none', cursor: 'pointer', minHeight: '34px' }}
              aria-label={`${n.name} standing: ${STANDING_LABEL[npcStanding(n.id)]}. Tap to update.`}
              onClick={(e) => { e.stopPropagation(); setQuickId(n.id); }}
            >{STANDING_LABEL[npcStanding(n.id)]}</button>
          </div>
        );
      })}

      <button class="btn primary wide" onClick={() => setCreating(true)}>+ New NPC</button>

      {shown.map((n) => (
        <>
          {quickId === n.id && <QuickUpdate npc={n} open onClose={() => setQuickId(null)} />}
        </>
      ))}
      {creating && <NpcForm open onClose={() => setCreating(false)} />}
      {editing && <NpcForm open existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}


/** Mounted once in App — the persistent NPC popup any screen can open. */
export function NpcPopup() {
  const [editing, setEditing] = useState<CustomNpc | null>(null);
  const id = npcPopupId.value;
  if (editing) return <NpcForm open existing={editing} onClose={() => setEditing(null)} />;
  if (!id) return null;
  const npc = allNpcs().find((n) => n.id === id);
  if (!npc) return null;
  return (
    <NpcDetail npc={npc} open onClose={() => (npcPopupId.value = null)}
      onEdit={npc.custom ? () => { npcPopupId.value = null; setEditing(npc.data!); } : undefined} />
  );
}
