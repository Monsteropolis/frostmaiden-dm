import { useState } from 'preact/hooks';
import { state, patch } from '../state/store';
import { WEATHER, WeatherId, Arc, ArcStatus, TownStanding, defaultTownStatus } from '../state/schema';
import { TOWNS, MODULE_QUESTS } from '../data';
import { Sheet, ConfirmBtn, Field } from '../components/ui';
import { allNpcs } from './npcs';

// ---------------------------------------------------------------- weather

function WeatherPanel() {
  const wx = state.value.weather;
  const order: WeatherId[] = ['clear', 'overcast', 'light_snow', 'heavy_snow', 'blizzard', 'aurils_wrath'];

  return (
    <>
      <div class="card">
        <h3>Current conditions — Day {wx.day}</h3>
        <div class="chip-row" style={{ marginTop: '10px' }}>
          {order.map((id) => (
            <button
              class="btn"
              style={wx.current === id ? { borderColor: 'var(--frost)', color: 'var(--frost)' } : {}}
              onClick={() => patch((d) => {
                if (d.weather.current === id) return;
                d.weather.current = id;
                d.weather.log.push({ day: d.weather.day, weather: id });
              })}
            >{WEATHER[id].icon} {WEATHER[id].name}</button>
          ))}
        </div>
        {WEATHER[wx.current].conSaveNote && (
          <p class="read" style={{ marginTop: '10px', color: 'var(--thread)' }}>{WEATHER[wx.current].conSaveNote}</p>
        )}
        <div class="row-actions">
          <button class="btn" onClick={() => patch((d) => {
            d.weather.day++;
            d.weather.log.push({ day: d.weather.day, weather: d.weather.current });
          })}>New day →</button>
        </div>
      </div>

      <div class="card">
        <h3>Weather log</h3>
        {[...state.value.weather.log].reverse().slice(0, 12).map((e) => (
          <div class="seed-line">
            <span class="n" style={{ fontSize: '14px' }}>D{e.day}</span>
            <span class="lbl">{WEATHER[e.weather].icon} {WEATHER[e.weather].name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- towns

const TOWN_STANDINGS: TownStanding[] = ['unknown', 'neutral', 'friendly', 'allied', 'hostile'];

function TownCard({ town }: { town: (typeof TOWNS)[number] }) {
  const [open, setOpen] = useState(false);
  const st = state.value.towns[town.name] ?? defaultTownStatus();
  const upd = (fn: (t: ReturnType<typeof defaultTownStatus>) => void) =>
    patch((d) => {
      if (!d.towns[town.name]) d.towns[town.name] = defaultTownStatus();
      fn(d.towns[town.name]);
    });
  const locations = (town.locations ?? []) as { name: string; desc: string; npcs?: string[] }[];
  const quests = MODULE_QUESTS.filter((q) => q.town === town.name);
  const flakes = Number(town.snowflakes) || 0;

  return (
    <div class={`card town ${st.visited ? 'visited' : ''}`}>
      <div class="unit-top" onClick={() => setOpen(!open)}>
        <div class="unit-id">
          <div class="unit-name">
            {town.name}
            <span class="flakes">{'❄'.repeat(flakes)}</span>
          </div>
          <div class="unit-meta">
            {String(town.population)} <span class="sep">·</span> Speaker: {String(town.speaker)}
            {st.sidekickRecruited && <> <span class="sep">·</span> ✦ sidekick</>}
          </div>
          {st.activeQuest && <div class="npc-lastseen">✦ {st.activeQuest}</div>}
        </div>
        <span class={`standing ${st.standing === 'unknown' ? '' : st.standing}`}
          style={!st.visited ? { opacity: 0.55 } : {}}>
          {st.visited ? st.standing : 'unvisited'}
        </span>
      </div>

      {open && (
        <div class="unit-detail">
          <p class="read">{String(town.summary)}</p>

          <div class="chip-row" style={{ margin: '12px 0' }}>
            <button class={`cond-chip${st.visited ? ' on' : ''}`} onClick={() => upd((t) => { t.visited = !t.visited; })}>
              {st.visited ? '✦ Visited' : 'Mark visited'}
            </button>
            <button class={`cond-chip${st.sidekickRecruited ? ' on' : ''}`} onClick={() => upd((t) => { t.sidekickRecruited = !t.sidekickRecruited; })}>
              Sidekick recruited
            </button>
          </div>

          <div class="field-label">Party standing</div>
          <div class="chip-row" style={{ marginBottom: '12px' }}>
            {TOWN_STANDINGS.map((s) => (
              <button class={`cond-chip${st.standing === s ? ' on' : ''}`} onClick={() => upd((t) => { t.standing = s; })}>{s}</button>
            ))}
          </div>

          <Field label="Active quest here">
            <input class="input" value={st.activeQuest} onChange={(e) => upd((t) => { t.activeQuest = (e.target as HTMLInputElement).value; })} />
          </Field>

          {quests.length > 0 && (
            <div class="npc-block">
              <div class="field-label">Module quests ({quests.length})</div>
              {quests.map((q) => (
                <p class="thread-link"><span class={`arc-dot ${q.mainHook ? 'active' : 'hook'}`} /> {q.name.replace(`${town.name}: `, '')}</p>
              ))}
            </div>
          )}

          {locations.length > 0 && (
            <div class="npc-block">
              <div class="field-label">Key locations</div>
              {locations.map((l) => (
                <details class="loc">
                  <summary>{l.name}</summary>
                  <p class="read" style={{ fontSize: '13px' }}>{l.desc}</p>
                  {(l.npcs?.length ?? 0) > 0 && <p class="stat-fine">NPCs: {l.npcs!.join(', ')}</p>}
                </details>
              ))}
            </div>
          )}

          <Field label="Notes">
            <textarea class="input" rows={2} value={st.notes} onChange={(e) => upd((t) => { t.notes = (e.target as HTMLTextAreaElement).value; })} />
          </Field>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- arcs

const ARC_STATUSES: ArcStatus[] = ['dormant', 'active', 'escalating', 'resolved'];

function ArcForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: Arc }) {
  const blank: Arc = existing ?? { id: '', name: '', status: 'active', lastDev: '', nextTrigger: '', linkedNpcIds: [], notes: '' };
  const [f, setF] = useState(blank);
  const npcs = allNpcs();

  return (
    <Sheet open={open} title={existing ? `Edit arc` : 'New arc'} onClose={onClose}>
      <Field label="Name"><input class="input" placeholder="The Zhentarim tighten their grip" value={f.name} onInput={(e) => (() => { const v = (e.target as HTMLInputElement).value; setF((prev) => ({ ...prev, name: v })); })()} /></Field>
      <div class="field-label">Status</div>
      <div class="chip-row" style={{ marginBottom: '12px' }}>
        {ARC_STATUSES.map((s) => (
          <button class={`cond-chip${f.status === s ? ' on' : ''}`} onClick={() => setF((prev) => ({ ...prev, status: s }))}>{s}</button>
        ))}
      </div>
      <Field label="Last development"><textarea class="input" rows={2} value={f.lastDev} onInput={(e) => (() => { const v = (e.target as HTMLTextAreaElement).value; setF((prev) => ({ ...prev, lastDev: v })); })()} /></Field>
      <Field label="Next escalation trigger"><textarea class="input" rows={2} placeholder="If the party ignores Easthaven for 3 more days…" value={f.nextTrigger} onInput={(e) => (() => { const v = (e.target as HTMLTextAreaElement).value; setF((prev) => ({ ...prev, nextTrigger: v })); })()} /></Field>

      <div class="field-label">Linked NPCs</div>
      <div class="chip-row" style={{ marginBottom: '12px', maxHeight: '160px', overflowY: 'auto' }}>
        {npcs.map((n) => (
          <button class={`cond-chip${f.linkedNpcIds.includes(n.id) ? ' on' : ''}`}
            onClick={() => setF((prev) => ({
              ...prev,
              linkedNpcIds: prev.linkedNpcIds.includes(n.id)
                ? prev.linkedNpcIds.filter((x) => x !== n.id)
                : [...prev.linkedNpcIds, n.id],
            }))}>{n.emoji} {n.name}</button>
        ))}
      </div>

      <Field label="Notes"><textarea class="input" rows={2} value={f.notes} onInput={(e) => (() => { const v = (e.target as HTMLTextAreaElement).value; setF((prev) => ({ ...prev, notes: v })); })()} /></Field>

      <button class="btn primary wide" disabled={!f.name.trim()} onClick={() => {
        if (existing) patch((d) => { const i = d.arcs.findIndex((x) => x.id === existing.id); if (i >= 0) d.arcs[i] = f; });
        else patch((d) => { d.arcs.push({ ...f, id: `arc${d.seq++}` }); });
        onClose();
      }}>{existing ? 'Save changes' : 'Create arc'}</button>
    </Sheet>
  );
}

function ArcsPanel() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Arc | null>(null);
  const arcs = state.value.arcs;
  const npcs = allNpcs();
  const rank: Record<ArcStatus, number> = { escalating: 0, active: 1, dormant: 2, resolved: 3 };
  const sorted = [...arcs].sort((a, b) => rank[a.status] - rank[b.status]);

  return (
    <>
      {arcs.length === 0 && (
        <div class="card"><p class="read">Narrative threads — who is moving against whom, and what happens if the party looks away.</p></div>
      )}
      {sorted.map((a) => (
        <div class={`card arc-card ${a.status}`}>
          <div class="unit-top" onClick={() => setEditing(a)}>
            <span class={`arc-dot big ${a.status}`} />
            <div class="unit-id">
              <div class="unit-name">{a.name}</div>
              <div class="unit-meta">{a.status}{a.linkedNpcIds.length ? <> <span class="sep">·</span> {a.linkedNpcIds.map((id) => npcs.find((n) => n.id === id)?.emoji ?? '').join(' ')}</> : null}</div>
            </div>
          </div>
          {a.lastDev && <p class="read arc-line"><strong>Last:</strong> {a.lastDev}</p>}
          {a.nextTrigger && a.status !== 'resolved' && (
            <p class={`read arc-line${a.status === 'escalating' ? ' hot' : ''}`}><strong>Next:</strong> {a.nextTrigger}</p>
          )}
          <div class="row-actions">
            <ConfirmBtn label="Delete" confirmLabel="Delete?" class="mini ghost danger"
              onConfirm={() => patch((d) => { d.arcs = d.arcs.filter((x) => x.id !== a.id); })} />
          </div>
        </div>
      ))}
      <button class="btn primary wide" onClick={() => setCreating(true)}>+ New arc</button>
      {creating && <ArcForm open onClose={() => setCreating(false)} />}
      {editing && <ArcForm open existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- screen

export function WorldScreen() {
  const [sub, setSub] = useState<'towns' | 'arcs' | 'weather'>('towns');
  const visited = Object.values(state.value.towns).filter((t) => t.visited).length;

  return (
    <div>
      <p class="screen-kicker">Icewind Dale</p>
      <h1 class="screen-title">World</h1>

      <div class="sub-tabs">
        <button class={`sub-tab${sub === 'towns' ? ' active' : ''}`} onClick={() => setSub('towns')}>Towns ({visited}/{TOWNS.length})</button>
        <button class={`sub-tab${sub === 'arcs' ? ' active' : ''}`} onClick={() => setSub('arcs')}>Arcs ({state.value.arcs.length})</button>
        <button class={`sub-tab${sub === 'weather' ? ' active' : ''}`} onClick={() => setSub('weather')}>Weather</button>
      </div>

      {sub === 'weather' && <WeatherPanel />}
      {sub === 'towns' && TOWNS.map((t) => <TownCard key={t.name} town={t} />)}
      {sub === 'arcs' && <ArcsPanel />}
    </div>
  );
}
