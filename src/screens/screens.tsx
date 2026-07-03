import { useState, useEffect } from 'preact/hooks';
import { state, patch } from '../state/store';
import { SessionEntry, SessionStatus, Milestone, QuestStatus } from '../state/schema';
import { Sheet, ConfirmBtn, Field } from '../components/ui';
import { EQUIPMENT, MAGIC_ITEMS } from '../data';
import { NpcRegistry, allNpcs, openNpc } from './npcs';
import { NpcLinkPicker } from './world';
import { getApiList, getApiCategory, getApiDetail, ApiListItem, ApiDetail, ApiMonsterPanel, DetailBody } from '../lib/api';
import { useBestiary, BestiaryCard, MonsterForm, CR_FILTERS } from './monsters';

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

function MilestoneSheet({ ci, mi, onClose }: { ci: number; mi: number; onClose: () => void }) {
  const ch = state.value.chapters[ci];
  const m: Milestone | undefined = ch?.milestones[mi];
  if (!m) return null;
  const relatedQuests = state.value.quests.filter((q) => q.chapter === ch.id);
  const nextStatus: Record<QuestStatus, QuestStatus> = {
    dormant: 'active', active: 'escalating', escalating: 'resolved', resolved: 'dormant',
  };
  const upd = (fn: (mm: Milestone) => void) =>
    patch((d) => { const x = d.chapters[ci]?.milestones[mi]; if (x) fn(x); });

  return (
    <Sheet open title={`Ch${ch.id} · Milestone`} onClose={onClose}>
      <Field label="Milestone">
        <input class="input" value={m.label}
          onChange={(e) => upd((x) => { x.label = (e.target as HTMLInputElement).value; })} />
      </Field>
      <Field label="Notes — what this means at your table">
        <textarea class="input" rows={3} placeholder="Session refs, how it resolved, what changed…"
          value={m.notes ?? ''}
          onChange={(e) => upd((x) => { x.notes = (e.target as HTMLTextAreaElement).value; })} />
      </Field>

      {relatedQuests.length > 0 && (
        <div class="npc-block">
          <div class="field-label">Chapter {ch.id} quests — tap status to advance</div>
          {relatedQuests.map((q) => (
            <div class="ms-quest">
              <span class={`ms-quest-name${q.status === 'resolved' ? ' resolved' : ''}`}>{q.name}</span>
              <button class={`standing q-${q.status}`}
                style={{ background: 'none', cursor: 'pointer', minHeight: '34px', flexShrink: 0 }}
                onClick={() => patch((d) => { const x = d.quests.find((y) => y.id === q.id); if (x) x.status = nextStatus[x.status]; })}
              >{q.status}</button>
            </div>
          ))}
        </div>
      )}

      <div class="row-actions" style={{ justifyContent: 'space-between', marginTop: '14px' }}>
        <ConfirmBtn label="Delete milestone" confirmLabel="Delete?" class="mini ghost danger"
          onConfirm={() => { patch((d) => { d.chapters[ci].milestones.splice(mi, 1); }); onClose(); }} />
        <button class={`btn ${m.done ? '' : 'primary'}`}
          onClick={() => { upd((x) => { x.done = !x.done; }); }}>
          {m.done ? 'Reopen ○' : 'Complete ✦'}
        </button>
      </div>
    </Sheet>
  );
}

function ProgressPanel() {
  const chapters = state.value.chapters;
  const [openMs, setOpenMs] = useState<{ ci: number; mi: number } | null>(null);
  return (
    <>
      {chapters.map((c, ci) => {
        const done = c.milestones.filter((m) => m.done).length;
        const complete = done === c.milestones.length && c.milestones.length > 0;
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
                <div class="milestone-row">
                  <button class="ms-toggle" aria-label={m.done ? 'Reopen' : 'Complete'}
                    onClick={() => patch((d) => { d.chapters[ci].milestones[mi].done = !d.chapters[ci].milestones[mi].done; })}>
                    <span class="ms-mark">{m.done ? '✦' : '○'}</span>
                  </button>
                  <button class={`milestone${m.done ? ' done' : ''}`} onClick={() => setOpenMs({ ci, mi })}>
                    {m.label}{m.notes ? <span class="ms-has-notes"> ✎</span> : null}
                  </button>
                </div>
              ))}
              <button class="btn mini ghost" style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                onClick={() => {
                  patch((d) => { d.chapters[ci].milestones.push({ label: 'New milestone', done: false }); });
                  setOpenMs({ ci, mi: c.milestones.length });
                }}>+ Milestone</button>
            </div>
          </div>
        );
      })}
      {openMs && <MilestoneSheet ci={openMs.ci} mi={openMs.mi} onClose={() => setOpenMs(null)} />}
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

function BestiaryPanel() {
  const [q, setQ] = useState('');
  const [crF, setCrF] = useState<number | 'all'>('all');
  const [srcF, setSrcF] = useState<'all' | 'rime' | 'custom'>('all');
  const [building, setBuilding] = useState(false);
  const { all, apiStatus, progress } = useBestiary();

  const shown = all.filter((e) =>
    (!q.trim() || e.name.toLowerCase().includes(q.toLowerCase())) &&
    (crF === 'all' || CR_FILTERS[crF].test(e.cr)) &&
    (srcF === 'all' || e.src === srcF));

  return (
    <>
      <input class="input" placeholder="Search all monsters…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chip-row" style={{ margin: '10px 0 6px' }}>
        <button class={`cond-chip${crF === 'all' ? ' on' : ''}`} onClick={() => setCrF('all')}>Any CR</button>
        {CR_FILTERS.map((f, i) => (
          <button class={`cond-chip${crF === i ? ' on' : ''}`} onClick={() => setCrF(i)}>{f.label}</button>
        ))}
      </div>
      <div class="chip-row" style={{ marginBottom: '12px' }}>
        <button class={`cond-chip frosty${srcF === 'all' ? ' on' : ''}`} onClick={() => setSrcF('all')}>Everything</button>
        <button class={`cond-chip frosty${srcF === 'rime' ? ' on' : ''}`} onClick={() => setSrcF('rime')}>❄ Rime</button>
        <button class={`cond-chip frosty${srcF === 'custom' ? ' on' : ''}`} onClick={() => setSrcF('custom')}>✦ Yours</button>
      </div>
      {apiStatus === 'loading' && <p class="stat-fine">Downloading the 5e bestiary… {progress}% — one time, then it's yours offline.</p>}
      {apiStatus === null && <p class="stat-fine">The 5e library needs one online visit; Rime & custom monsters are always here.</p>}

      <button class="btn primary wide" style={{ margin: '4px 0 12px' }} onClick={() => setBuilding(true)}>+ New monster</button>
      {building && <MonsterForm open onClose={() => setBuilding(false)} />}

      {shown.map((e) => <BestiaryCard key={e.key} e={e} ApiPanel={ApiMonsterPanel} />)}
      {shown.length === 0 && <p class="phase-note">Nothing in the dark matches that.</p>}
    </>
  );
}

// ---------------------------------------------------------------- spells

function SpellsPanel() {
  const [list, setList] = useState<ApiListItem[] | null | 'loading'>('loading');
  const [q, setQ] = useState('');
  const [lvl, setLvl] = useState<number | 'all'>('all');
  const [openIdx, setOpenIdx] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiDetail | null | 'loading'>(null);

  useEffect(() => { let live = true; getApiList('spells').then((r) => live && setList(r)); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!openIdx) return;
    let live = true;
    setDetail('loading');
    getApiDetail('spells', openIdx).then((r) => live && setDetail(r));
    return () => { live = false; };
  }, [openIdx]);

  if (list === 'loading') return <p class="stat-fine">Loading the library…</p>;
  if (!list) return <div class="card"><p class="read">The spell library needs one online visit to download — after that it lives on your phone.</p></div>;

  const shown = list.filter((x) =>
    (!q.trim() || x.name.toLowerCase().includes(q.toLowerCase())) && (lvl === 'all' || x.level === lvl));
  const openItem = list.find((x) => x.index === openIdx);

  return (
    <>
      <input class="input" placeholder="Search spells…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chip-row" style={{ margin: '10px 0' }}>
        <button class={`cond-chip${lvl === 'all' ? ' on' : ''}`} onClick={() => setLvl('all')}>All</button>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button class={`cond-chip${lvl === n ? ' on' : ''}`} onClick={() => setLvl(n)}>{n === 0 ? 'C' : n}</button>
        ))}
      </div>
      <div class="ref-list">
        {shown.map((x) => (
          <button class="creature-add" onClick={() => setOpenIdx(x.index)}>
            <span>{x.name}</span>
            <span class="cr">{x.level === 0 ? 'cantrip' : `lvl ${x.level}`}</span>
          </button>
        ))}
        {shown.length === 0 && <p class="stat-fine" style={{ padding: '12px' }}>Nothing matches.</p>}
      </div>
      {openIdx && openItem && (
        <Sheet open title={openItem.name} onClose={() => { setOpenIdx(null); setDetail(null); }}>
          {detail === 'loading' ? <p class="stat-fine">Fetching…</p>
            : detail ? <DetailBody d={detail} />
            : <p class="stat-fine">Unavailable offline — open once with internet to cache it.</p>}
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------- items

type ItemMode = 'rime' | 'magic' | 'gear';
type CatListItem = ApiListItem & { magic?: boolean };

const MAGIC_CATS: [string, string][] = [
  ['wondrous-items', 'Wondrous'], ['potion', 'Potions'], ['ring', 'Rings'],
  ['scroll', 'Scrolls'], ['rod', 'Rods'], ['staff', 'Staffs'], ['wand', 'Wands'],
  ['weapon', 'Weapons'], ['armor', 'Armor'],
];
const GEAR_CATS: [string, string][] = [
  ['adventuring-gear', 'General goods'], ['weapon', 'Weapons'], ['armor', 'Armor'],
  ['tools', 'Tools'], ['mounts-and-vehicles', 'Mounts & vehicles'],
];

function ItemsPanel() {
  const [mode, setMode] = useState<ItemMode>('rime');
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [list, setList] = useState<CatListItem[] | null | 'loading'>(null);
  const [openRime, setOpenRime] = useState<string | null>(null);
  const [openApi, setOpenApi] = useState<{ kind: 'magic-items' | 'equipment'; index: string; name: string } | null>(null);
  const [detail, setDetail] = useState<ApiDetail | null | 'loading'>(null);

  useEffect(() => {
    if (mode === 'rime') { setList(null); return; }
    let live = true;
    setList('loading');
    const load = async () => {
      if (cat === 'all' && mode === 'magic') return getApiList('magic-items');
      if (cat === 'all' && mode === 'gear') return getApiList('equipment');
      const members = await getApiCategory(cat) as CatListItem[] | null;
      if (!members) return null;
      return members.filter((m) => (mode === 'magic' ? m.magic : !m.magic));
    };
    load().then((r) => live && setList(r));
    return () => { live = false; };
  }, [mode, cat]);

  useEffect(() => {
    if (!openApi) return;
    let live = true;
    setDetail('loading');
    getApiDetail(openApi.kind, openApi.index).then((r) => live && setDetail(r));
    return () => { live = false; };
  }, [openApi]);

  const rimeItems = [...(MAGIC_ITEMS as Record<string, unknown>[]), ...(EQUIPMENT as Record<string, unknown>[])];
  const open = rimeItems.find((i) => i.index === openRime);
  const cats = mode === 'magic' ? MAGIC_CATS : GEAR_CATS;
  const shown = Array.isArray(list)
    ? list.filter((x) => !q.trim() || x.name.toLowerCase().includes(q.toLowerCase()))
    : [];

  return (
    <>
      <div class="chip-row" style={{ marginBottom: '8px' }}>
        <button class={`cond-chip frosty${mode === 'rime' ? ' on' : ''}`} onClick={() => { setMode('rime'); }}>❄ Rime</button>
        <button class={`cond-chip frosty${mode === 'magic' ? ' on' : ''}`} onClick={() => { setMode('magic'); setCat('all'); }}>Magic items</button>
        <button class={`cond-chip frosty${mode === 'gear' ? ' on' : ''}`} onClick={() => { setMode('gear'); setCat('all'); }}>Shop goods</button>
      </div>

      {mode === 'rime' && (
        <div class="chip-row">
          {rimeItems.map((i) => (
            <button class="chip npc-chip" onClick={() => setOpenRime(String(i.index))}>✦ {String(i.name)}</button>
          ))}
        </div>
      )}

      {mode !== 'rime' && (
        <>
          <div class="chip-row" style={{ marginBottom: '10px' }}>
            <button class={`cond-chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>All</button>
            {cats.map(([idx, label]) => (
              <button class={`cond-chip${cat === idx ? ' on' : ''}`} onClick={() => setCat(idx)}>{label}</button>
            ))}
          </div>
          <input class="input" placeholder={mode === 'magic' ? 'Search magic items…' : 'Search goods…'} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          {list === 'loading' && <p class="stat-fine">Loading…</p>}
          {list === null && <p class="stat-fine">Needs one online visit to download this shelf.</p>}
          <div class="ref-list" style={{ marginTop: '10px' }}>
            {shown.map((x) => (
              <button class="creature-add" onClick={() => setOpenApi({ kind: x.magic || mode === 'magic' ? 'magic-items' : 'equipment', index: x.index, name: x.name })}>
                <span>{x.name}</span>
                {x.magic && mode === 'gear' ? <span class="cr">magic</span> : null}
              </button>
            ))}
            {Array.isArray(list) && shown.length === 0 && <p class="stat-fine" style={{ padding: '12px' }}>Nothing matches.</p>}
          </div>
        </>
      )}

      {open && (
        <Sheet open title={String(open.name)} onClose={() => setOpenRime(null)}>
          <div class="npc-statline">
            {(open.rarity as { name?: string } | undefined)?.name && <span>{String((open.rarity as { name: string }).name)}</span>}
            {(open.equipment_category as { name?: string } | undefined)?.name && <span>{String((open.equipment_category as { name: string }).name)}</span>}
            {(open.cost as { quantity?: number; unit?: string } | undefined)?.quantity !== undefined && <span>{String((open.cost as { quantity: number; unit: string }).quantity)} {String((open.cost as { quantity: number; unit: string }).unit)}</span>}
          </div>
          {((open.desc as string[]) ?? []).map((p) => <p class="read" style={{ margin: '8px 0' }}>{p}</p>)}
        </Sheet>
      )}
      {openApi && (
        <Sheet open title={openApi.name} onClose={() => { setOpenApi(null); setDetail(null); }}>
          {detail === 'loading' ? <p class="stat-fine">Fetching…</p>
            : detail ? <DetailBody d={detail} />
            : <p class="stat-fine">Unavailable offline — open once with internet to cache it.</p>}
        </Sheet>
      )}
    </>
  );
}

export function CompendiumScreen() {
  const [sub, setSub] = useState<'npcs' | 'bestiary' | 'spells' | 'items'>('npcs');

  return (
    <div>
      <p class="screen-kicker">Lore</p>
      <h1 class="screen-title">Compendium</h1>

      <div class="sub-tabs scroll">
        <button class={`sub-tab${sub === 'npcs' ? ' active' : ''}`} onClick={() => setSub('npcs')}>NPCs</button>
        <button class={`sub-tab${sub === 'bestiary' ? ' active' : ''}`} onClick={() => setSub('bestiary')}>Bestiary</button>
        <button class={`sub-tab${sub === 'spells' ? ' active' : ''}`} onClick={() => setSub('spells')}>Spells</button>
        <button class={`sub-tab${sub === 'items' ? ' active' : ''}`} onClick={() => setSub('items')}>Items</button>
      </div>

      {sub === 'npcs' && <NpcRegistry />}
      {sub === 'bestiary' && <BestiaryPanel />}
      {sub === 'spells' && <SpellsPanel />}
      {sub === 'items' && <ItemsPanel />}
    </div>
  );
}
