import { useState } from 'preact/hooks';
import { state, patch } from '../state/store';
import {
  WEATHER, WEATHER_POOL, WeatherId, Arc, ArcStatus, TownStanding, defaultTownStatus,
  Quest, QuestStatus, Pace, Journey,
} from '../state/schema';
import { TOWNS, TOWN_DISTANCES } from '../data';
import { Sheet, ConfirmBtn, Field, NumInput } from '../components/ui';
import { allNpcs, openNpc } from './npcs';

// ---------------------------------------------------------------- weather

function WeatherPanel() {
  const wx = state.value.weather;
  const order: WeatherId[] = ['clear', 'overcast', 'light_snow', 'heavy_snow', 'blizzard', 'aurils_wrath'];
  const setWeather = (id: WeatherId) => patch((d) => {
    if (d.weather.current === id) return;
    d.weather.current = id;
    d.weather.log.push({ day: d.weather.day, weather: id });
  });

  return (
    <>
      <div class="card">
        <h3>Current conditions</h3>
        <div class="chip-row" style={{ marginTop: '10px' }}>
          {order.map((id) => (
            <button
              class="btn"
              style={wx.current === id ? { borderColor: 'var(--frost)', color: 'var(--frost)' } : {}}
              onClick={() => setWeather(id)}
            >{WEATHER[id].icon} {WEATHER[id].name}</button>
          ))}
        </div>
        {WEATHER[wx.current].conSaveNote && (
          <p class="read" style={{ marginTop: '10px', color: 'var(--thread)' }}>{WEATHER[wx.current].conSaveNote}</p>
        )}
        <div class="day-controls">
          <button class="btn" onClick={() => setWeather(WEATHER_POOL[Math.floor(Math.random() * WEATHER_POOL.length)])}>
            🎲 Roll weather
          </button>
          <span class="day-edit">
            <span class="field-label" style={{ margin: 0 }}>Day</span>
            <NumInput w="72px" value={wx.day} min={1}
              onInput={(n) => patch((d) => { d.weather.day = Math.max(1, n); })} />
          </span>
          <button class="btn" onClick={() => patch((d) => {
            d.weather.day++;
            d.weather.log.push({ day: d.weather.day, weather: d.weather.current });
          })}>New day →</button>
        </div>
      </div>

      <div class="card">
        <h3>Weather log</h3>
        {[...state.value.weather.log].reverse().slice(0, 14).map((e) => (
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
  const quests = state.value.quests.filter((q) => q.town === town.name);
  const npcsHere = allNpcs().filter((n) => n.town === town.name);
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

          {npcsHere.length > 0 && (
            <div class="npc-block">
              <div class="field-label">NPCs here</div>
              <div class="chip-row">
                {npcsHere.map((n) => (
                  <button class="chip npc-chip" onClick={() => openNpc(n.id)}>{n.emoji} {n.name}</button>
                ))}
              </div>
            </div>
          )}

          {quests.length > 0 && (
            <div class="npc-block">
              <div class="field-label">Quests ({quests.length})</div>
              {quests.map((q) => (
                <p class="thread-link"><span class={`arc-dot ${q.status === 'dormant' ? 'hook' : q.status}`} /> {q.name.replace(`${town.name}: `, '')}</p>
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

// ---------------------------------------------------------------- NPC link picker (shared)

export function NpcLinkPicker({ linked, onChange }: { linked: string[]; onChange: (ids: string[]) => void }) {
  const npcs = allNpcs();
  const unlinked = npcs.filter((n) => !linked.includes(n.id));
  return (
    <>
      <div class="field-label">Linked NPCs</div>
      {linked.length > 0 && (
        <div class="chip-row" style={{ marginBottom: '8px' }}>
          {linked.map((id) => {
            const n = npcs.find((x) => x.id === id);
            if (!n) return null;
            return (
              <span class="chip npc-chip linked">
                <button class="npc-chip-open" onClick={() => openNpc(n.id)}>{n.emoji} {n.name}</button>
                <button class="npc-chip-x" aria-label={`Unlink ${n.name}`}
                  onClick={() => onChange(linked.filter((x) => x !== id))}>✕</button>
              </span>
            );
          })}
        </div>
      )}
      <select class="input" value=""
        onChange={(e) => {
          const id = (e.target as HTMLSelectElement).value;
          if (id) onChange([...linked, id]);
          (e.target as HTMLSelectElement).value = '';
        }}>
        <option value="">+ Link an NPC…</option>
        {unlinked.map((n) => <option value={n.id}>{n.emoji} {n.name} — {n.town || n.role}</option>)}
      </select>
    </>
  );
}

// ---------------------------------------------------------------- arcs

const ARC_STATUSES: ArcStatus[] = ['dormant', 'active', 'escalating', 'resolved'];

function ArcForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: Arc }) {
  const blank: Arc = existing ?? { id: '', name: '', status: 'active', lastDev: '', nextTrigger: '', linkedNpcIds: [], notes: '' };
  const [f, setF] = useState(blank);

  return (
    <Sheet open={open} title={existing ? 'Edit arc' : 'New arc'} onClose={onClose}>
      <Field label="Name"><input class="input" placeholder="The Zhentarim tighten their grip" value={f.name} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setF((prev) => ({ ...prev, name: v })); }} /></Field>
      <div class="field-label">Status</div>
      <div class="chip-row" style={{ marginBottom: '12px' }}>
        {ARC_STATUSES.map((s) => (
          <button class={`cond-chip${f.status === s ? ' on' : ''}`} onClick={() => setF((prev) => ({ ...prev, status: s }))}>{s}</button>
        ))}
      </div>
      <Field label="Last development"><textarea class="input" rows={2} value={f.lastDev} onInput={(e) => { const v = (e.target as HTMLTextAreaElement).value; setF((prev) => ({ ...prev, lastDev: v })); }} /></Field>
      <Field label="Next escalation trigger"><textarea class="input" rows={2} placeholder="If the party ignores Easthaven for 3 more days…" value={f.nextTrigger} onInput={(e) => { const v = (e.target as HTMLTextAreaElement).value; setF((prev) => ({ ...prev, nextTrigger: v })); }} /></Field>

      <NpcLinkPicker linked={f.linkedNpcIds} onChange={(ids) => setF((prev) => ({ ...prev, linkedNpcIds: ids }))} />

      <Field label="Notes"><textarea class="input" rows={2} style={{ marginTop: '12px' }} value={f.notes} onInput={(e) => { const v = (e.target as HTMLTextAreaElement).value; setF((prev) => ({ ...prev, notes: v })); }} /></Field>

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
              <div class="unit-meta">{a.status}</div>
            </div>
          </div>
          {a.linkedNpcIds.length > 0 && (
            <div class="chip-row" style={{ margin: '6px 0' }}>
              {a.linkedNpcIds.map((id) => {
                const n = npcs.find((x) => x.id === id);
                return n ? <button class="chip npc-chip" onClick={() => openNpc(n.id)}>{n.emoji} {n.name}</button> : null;
              })}
            </div>
          )}
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

// ---------------------------------------------------------------- quests

const QUEST_STATUSES: QuestStatus[] = ['dormant', 'active', 'escalating', 'resolved'];
const nextQuestStatus: Record<QuestStatus, QuestStatus> = {
  dormant: 'active', active: 'escalating', escalating: 'resolved', resolved: 'dormant',
};

function QuestCard({ q }: { q: Quest }) {
  const [open, setOpen] = useState(false);
  return (
    <div class={`card quest ${q.status}`}>
      <div class="unit-top" onClick={() => setOpen(!open)}>
        <div class="unit-id">
          <div class="unit-name">{q.mainHook && <span class="yours-mark">✦ </span>}{q.name}</div>
          <div class="unit-meta">{q.town || '—'}{q.chapter ? <> <span class="sep">·</span> Ch{q.chapter}</> : null}</div>
        </div>
        <button class={`standing q-${q.status}`}
          style={{ background: 'none', cursor: 'pointer', minHeight: '34px' }}
          aria-label={`Status ${q.status}. Tap to advance.`}
          onClick={(e) => { e.stopPropagation(); patch((d) => { const x = d.quests.find((y) => y.id === q.id); if (x) x.status = nextQuestStatus[x.status]; }); }}
        >{q.status}</button>
      </div>
      {open && (
        <div class="unit-detail">
          {q.trigger && <p class="read arc-line"><strong>Trigger:</strong> {q.trigger}</p>}
          {q.development && <p class="read arc-line"><strong>Development:</strong> {q.development}</p>}
          <Field label="Notes">
            <textarea class="input" rows={2} value={q.notes}
              onChange={(e) => patch((d) => { const x = d.quests.find((y) => y.id === q.id); if (x) x.notes = (e.target as HTMLTextAreaElement).value; })} />
          </Field>
          {q.custom && (
            <div class="row-actions">
              <ConfirmBtn label="Delete" confirmLabel="Delete?" class="mini ghost danger"
                onConfirm={() => patch((d) => { d.quests = d.quests.filter((x) => x.id !== q.id); })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestsPanel() {
  const [status, setStatus] = useState<QuestStatus | 'all'>('all');
  const [town, setTown] = useState('all');
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: '', town: '' });
  const quests = state.value.quests;
  const towns = [...new Set(quests.map((q) => q.town).filter(Boolean))].sort();
  const rank: Record<QuestStatus, number> = { escalating: 0, active: 1, dormant: 2, resolved: 3 };
  const shown = quests
    .filter((q) => (status === 'all' || q.status === status) && (town === 'all' || q.town === town))
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.chapter ?? 99) - (b.chapter ?? 99));

  return (
    <>
      <div class="chip-row" style={{ marginBottom: '8px' }}>
        <button class={`cond-chip${status === 'all' ? ' on' : ''}`} onClick={() => setStatus('all')}>All</button>
        {QUEST_STATUSES.map((s) => (
          <button class={`cond-chip${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      <select class="input" style={{ marginBottom: '12px' }} value={town}
        onChange={(e) => setTown((e.target as HTMLSelectElement).value)}>
        <option value="all">All towns</option>
        {towns.map((t) => <option value={t}>{t}</option>)}
      </select>

      {shown.map((q) => <QuestCard key={q.id} q={q} />)}

      {!creating ? (
        <button class="btn primary wide" onClick={() => setCreating(true)}>+ Custom quest</button>
      ) : (
        <div class="card">
          <Field label="Quest name"><input class="input" value={f.name} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setF((p) => ({ ...p, name: v })); }} /></Field>
          <Field label="Town (optional)"><input class="input" value={f.town} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setF((p) => ({ ...p, town: v })); }} /></Field>
          <div class="row-actions">
            <button class="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button class="btn primary" disabled={!f.name.trim()} onClick={() => {
              patch((d) => { d.quests.push({ id: `q${d.seq++}`, name: f.name, status: 'active', town: f.town, chapter: null, mainHook: false, trigger: '', development: '', notes: '', custom: true }); });
              setF({ name: '', town: '' }); setCreating(false);
            }}>Add quest</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- travel

const PACES: { id: Pace; label: string; mult: number; note: string }[] = [
  { id: 'cautious', label: 'Cautious', mult: 1.5, note: 'slower, harder to ambush' },
  { id: 'normal', label: 'Normal', mult: 1, note: 'standard pace' },
  { id: 'dogsled', label: 'Dogsled', mult: 0.5, note: 'fast, needs dogs & open snow' },
];

function journeyDays(origin: string, dest: string, pace: Pace): number | null {
  const d = (TOWN_DISTANCES as { from: string; to: string; days: number }[])
    .find((x) => (x.from === origin && x.to === dest) || (x.from === dest && x.to === origin));
  if (!d) return null;
  const mult = PACES.find((p) => p.id === pace)!.mult;
  return Math.max(1, Math.ceil(d.days * mult));
}

function TravelPanel() {
  const townNames = TOWNS.map((t) => t.name);
  const [origin, setOrigin] = useState(townNames[0]);
  const [dest, setDest] = useState(townNames[1]);
  const [pace, setPace] = useState<Pace>('normal');
  const j = state.value.travel.activeJourney;
  const wx = state.value.weather;
  const est = journeyDays(origin, dest, pace);

  const advance = () => patch((d) => {
    const jj = d.travel.activeJourney; if (!jj) return;
    d.weather.day++;
    d.weather.log.push({ day: d.weather.day, weather: d.weather.current });
    d.travel.log.push({ day: d.weather.day, text: `${jj.origin} → ${jj.dest}: day ${jj.day} of ${jj.totalDays} — ${WEATHER[d.weather.current].name}` });
    if (jj.day >= jj.totalDays) {
      d.travel.log.push({ day: d.weather.day, text: `Arrived at ${jj.dest}` });
      if (!d.towns[jj.dest]) d.towns[jj.dest] = defaultTownStatus();
      d.towns[jj.dest].visited = true;
      d.travel.activeJourney = null;
    } else {
      jj.day++;
    }
  });

  return (
    <>
      {j ? (
        <div class="card journey">
          <h3>{j.origin} → {j.dest}</h3>
          <div class="journey-bar">
            <div class="journey-fill" style={{ width: `${Math.round(((j.day - 1) / j.totalDays) * 100)}%` }} />
          </div>
          <p class="read" style={{ margin: '8px 0' }}>
            Day {j.day} of {j.totalDays} · {PACES.find((p) => p.id === j.pace)!.label} pace · {WEATHER[wx.current].icon} {WEATHER[wx.current].name}
          </p>
          <div class="row-actions" style={{ justifyContent: 'space-between' }}>
            <ConfirmBtn label="Abandon" confirmLabel="Abandon?" class="mini ghost danger"
              onConfirm={() => patch((d) => { d.travel.activeJourney = null; })} />
            <button class="btn primary" onClick={advance}>
              {j.day >= j.totalDays ? `Arrive at ${j.dest} ✦` : 'Travel a day →'}
            </button>
          </div>
        </div>
      ) : (
        <div class="card">
          <h3>Plan a journey</h3>
          <div class="field-row" style={{ marginTop: '10px' }}>
            <Field label="From">
              <select class="input" value={origin} onChange={(e) => setOrigin((e.target as HTMLSelectElement).value)}>
                {townNames.map((t) => <option value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="To">
              <select class="input" value={dest} onChange={(e) => setDest((e.target as HTMLSelectElement).value)}>
                {townNames.filter((t) => t !== origin).map((t) => <option value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div class="field-label">Pace</div>
          <div class="chip-row" style={{ marginBottom: '12px' }}>
            {PACES.map((p) => (
              <button class={`cond-chip${pace === p.id ? ' on' : ''}`} onClick={() => setPace(p.id)} title={p.note}>{p.label}</button>
            ))}
          </div>
          <p class="read" style={{ marginBottom: '10px' }}>
            {est !== null
              ? `Estimated ${est} day${est > 1 ? 's' : ''} on the trail.`
              : 'No mapped route — travel via a connected town, or log it manually.'}
          </p>
          <button class="btn primary wide" disabled={est === null} onClick={() => {
            const total = est!;
            patch((d) => {
              d.travel.activeJourney = { origin, dest, pace, day: 1, totalDays: total } as Journey;
              d.travel.log.push({ day: d.weather.day, text: `Departed ${origin} for ${dest} (${total} day${total > 1 ? 's' : ''})` });
            });
          }}>Set out ✦</button>
        </div>
      )}

      {state.value.travel.log.length > 0 && (
        <div class="card">
          <h3>Travel log</h3>
          {[...state.value.travel.log].reverse().slice(0, 14).map((e) => (
            <div class="seed-line">
              <span class="n" style={{ fontSize: '14px' }}>D{e.day}</span>
              <span class="lbl">{e.text}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- screen

export function WorldScreen() {
  const [sub, setSub] = useState<'towns' | 'quests' | 'arcs' | 'travel' | 'weather'>('towns');
  const visited = Object.values(state.value.towns).filter((t) => t.visited).length;
  const activeQuests = state.value.quests.filter((q) => q.status === 'active' || q.status === 'escalating').length;

  return (
    <div>
      <p class="screen-kicker">Icewind Dale</p>
      <h1 class="screen-title">World</h1>

      <div class="sub-tabs scroll">
        <button class={`sub-tab${sub === 'towns' ? ' active' : ''}`} onClick={() => setSub('towns')}>Towns ({visited}/{TOWNS.length})</button>
        <button class={`sub-tab${sub === 'quests' ? ' active' : ''}`} onClick={() => setSub('quests')}>Quests ({activeQuests})</button>
        <button class={`sub-tab${sub === 'arcs' ? ' active' : ''}`} onClick={() => setSub('arcs')}>Arcs ({state.value.arcs.length})</button>
        <button class={`sub-tab${sub === 'travel' ? ' active' : ''}`} onClick={() => setSub('travel')}>Travel</button>
        <button class={`sub-tab${sub === 'weather' ? ' active' : ''}`} onClick={() => setSub('weather')}>Weather</button>
      </div>

      {sub === 'weather' && <WeatherPanel />}
      {sub === 'towns' && TOWNS.map((t) => <TownCard key={t.name} town={t} />)}
      {sub === 'quests' && <QuestsPanel />}
      {sub === 'arcs' && <ArcsPanel />}
      {sub === 'travel' && <TravelPanel />}
    </div>
  );
}
