import { useState } from 'preact/hooks';
import { state, patch } from '../state/store';
import { SessionEntry, SessionStatus } from '../state/schema';
import { Sheet, ConfirmBtn, Field } from '../components/ui';
import { CREATURES } from '../data';
import { NpcRegistry, allNpcs, openNpc } from './npcs';
import { NpcLinkPicker } from './world';

function PhaseNote({ n, text }: { n: number; text: string }) {
  return (
    <p class="phase-note">
      <span class="star-mark">✦</span> {text} — arrives in Phase {n}
    </p>
  );
}

// ---------------------------------------------------------------- sessions

const SESSION_STATUSES: SessionStatus[] = ['idea', 'planned', 'complete'];

function SessionForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: SessionEntry }) {
  const blank: SessionEntry = existing ?? {
    id: '', title: '', status: 'idea', date: '',
    hook: '', plannedEncounters: '', npcIds: [], secrets: '', debrief: '',
  };
  const [f, setF] = useState(blank);
  const txt = (k: keyof SessionEntry) => (e: Event) => {
    const v = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
    setF((prev) => ({ ...prev, [k]: v }));
  };

  return (
    <Sheet open={open} title={existing ? 'Edit session' : 'New session'} onClose={onClose}>
      <Field label="Title"><input class="input" placeholder="S4 — The road to Easthaven" value={f.title} onInput={txt('title')} /></Field>
      <div class="field-row">
        <Field label="Date (optional)"><input class="input" placeholder="Jul 9" value={f.date} onInput={txt('date')} /></Field>
      </div>
      <div class="field-label">Status</div>
      <div class="chip-row" style={{ marginBottom: '12px' }}>
        {SESSION_STATUSES.map((s) => (
          <button class={`cond-chip${f.status === s ? ' on' : ''}`} onClick={() => setF((prev) => ({ ...prev, status: s }))}>{s}</button>
        ))}
      </div>

      <div class="field-label" style={{ color: 'var(--frost)' }}>— Prep —</div>
      <Field label="Hook / opening"><textarea class="input" rows={2} placeholder="The session opens with…" value={f.hook} onInput={txt('hook')} /></Field>
      <Field label="Planned encounters"><textarea class="input" rows={2} placeholder="Bandit ambush on the road; yeti tracks near the pass…" value={f.plannedEncounters} onInput={txt('plannedEncounters')} /></Field>
      <NpcLinkPicker linked={f.npcIds} onChange={(ids) => setF((prev) => ({ ...prev, npcIds: ids }))} />
      <Field label="Secrets & clues"><textarea class="input" rows={3} style={{ marginTop: '12px' }} placeholder="One secret per line — reveal when it lands naturally" value={f.secrets} onInput={txt('secrets')} /></Field>

      <div class="field-label" style={{ color: 'var(--frost)' }}>— Debrief —</div>
      <Field label="What happened"><textarea class="input" rows={4} placeholder="Filled in after the session…" value={f.debrief} onInput={txt('debrief')} /></Field>

      <button class="btn primary wide" disabled={!f.title.trim()} onClick={() => {
        if (existing) patch((d) => { const i = d.sessions.findIndex((x) => x.id === existing.id); if (i >= 0) d.sessions[i] = f; });
        else patch((d) => { d.sessions.push({ ...f, id: `s${d.seq++}` }); });
        onClose();
      }}>{existing ? 'Save session' : 'Create session'}</button>
    </Sheet>
  );
}

function SessionsPanel() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SessionEntry | null>(null);
  const sessions = state.value.sessions;
  const npcs = allNpcs();
  const rank: Record<SessionStatus, number> = { planned: 0, idea: 1, complete: 2 };
  const sorted = [...sessions].sort((a, b) => rank[a.status] - rank[b.status]);

  return (
    <>
      {sessions.length === 0 && (
        <div class="card"><p class="read">Every session starts as an idea. Prep the hook, the foes, the faces, the secrets — then capture what actually happened.</p></div>
      )}
      {sorted.map((s) => (
        <div class={`card session-card ${s.status}`}>
          <div class="unit-top" onClick={() => setEditing(s)}>
            <div class="unit-id">
              <div class="unit-name">{s.title}</div>
              <div class="unit-meta">{s.date || 'undated'}</div>
            </div>
            <span class={`standing s-${s.status}`}>{s.status}</span>
          </div>
          {s.hook && <p class="read arc-line"><strong>Hook:</strong> {s.hook}</p>}
          {s.npcIds.length > 0 && (
            <div class="chip-row" style={{ margin: '6px 0' }}>
              {s.npcIds.map((id) => {
                const n = npcs.find((x) => x.id === id);
                return n ? <button class="chip npc-chip" onClick={(e) => { e.stopPropagation(); openNpc(n.id); }}>{n.emoji} {n.name}</button> : null;
              })}
            </div>
          )}
          {s.status === 'complete' && s.debrief && <p class="read arc-line"><strong>Debrief:</strong> {s.debrief}</p>}
          <div class="row-actions">
            <ConfirmBtn label="Delete" confirmLabel="Delete?" class="mini ghost danger"
              onConfirm={() => patch((d) => { d.sessions = d.sessions.filter((x) => x.id !== s.id); })} />
          </div>
        </div>
      ))}
      <button class="btn primary wide" onClick={() => setCreating(true)}>+ New session</button>
      {creating && <SessionForm open onClose={() => setCreating(false)} />}
      {editing && <SessionForm open existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- progress

function ProgressPanel() {
  const chapters = state.value.chapters;
  return (
    <>
      {chapters.map((c, ci) => {
        const done = c.milestones.filter((m) => m.done).length;
        const complete = done === c.milestones.length;
        return (
          <div class={`card chapter ${complete ? 'complete' : ''}`}>
            <div class="unit-top">
              <span class={`ch-num${complete ? ' done' : ''}`}>{c.id}</span>
              <div class="unit-id">
                <div class="unit-name">{c.label}</div>
                <div class="unit-meta">Levels {c.levels} · {done}/{c.milestones.length} milestones</div>
              </div>
            </div>
            <div class="milestones">
              {c.milestones.map((m, mi) => (
                <button class={`milestone${m.done ? ' done' : ''}`}
                  onClick={() => patch((d) => { d.chapters[ci].milestones[mi].done = !d.chapters[ci].milestones[mi].done; })}>
                  <span class="ms-mark">{m.done ? '✦' : '○'}</span> {m.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- Session screen

export function SessionScreen() {
  const [sub, setSub] = useState<'sessions' | 'progress'>('sessions');
  const planned = state.value.sessions.filter((s) => s.status === 'planned').length;

  return (
    <div>
      <p class="screen-kicker">The Table</p>
      <h1 class="screen-title">Session</h1>

      <div class="sub-tabs">
        <button class={`sub-tab${sub === 'sessions' ? ' active' : ''}`} onClick={() => setSub('sessions')}>Sessions{planned ? ` (${planned} planned)` : ''}</button>
        <button class={`sub-tab${sub === 'progress' ? ' active' : ''}`} onClick={() => setSub('progress')}>Progress</button>
      </div>

      {sub === 'sessions' ? <SessionsPanel /> : <ProgressPanel />}
    </div>
  );
}

// ---------------------------------------------------------------- Compendium

export function CompendiumScreen() {
  const [sub, setSub] = useState<'npcs' | 'bestiary'>('npcs');

  return (
    <div>
      <p class="screen-kicker">Lore</p>
      <h1 class="screen-title">Compendium</h1>

      <div class="sub-tabs">
        <button class={`sub-tab${sub === 'npcs' ? ' active' : ''}`} onClick={() => setSub('npcs')}>NPCs</button>
        <button class={`sub-tab${sub === 'bestiary' ? ' active' : ''}`} onClick={() => setSub('bestiary')}>Bestiary</button>
      </div>

      {sub === 'npcs' && <NpcRegistry />}
      {sub === 'bestiary' && (
        <>
          <div class="card">
            <h3>{CREATURES.length} Rime creatures ready</h3>
            <p class="read">Full stat blocks live inside the combat tracker — expand any monster's row. Bandits and other 5e monsters now fetch their stat blocks automatically (cached for offline). The browsable bestiary and spell library arrive with Phase 5.</p>
          </div>
          <PhaseNote n={5} text="Browsable bestiary, spells, and equipment via the 5e API" />
        </>
      )}
    </div>
  );
}
