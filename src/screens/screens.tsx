import { useState, useEffect, useRef } from 'preact/hooks';
import { state, patch, replaceState } from '../state/store';
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

  // QA #3 — Ben writes a lot. The boxes start tall, resize vertically, and the
  // dragged height sticks per session per field (saved with the session).
  const noteHeight = (k: string) => (e: Event) => {
    const h = Math.round((e.currentTarget as HTMLTextAreaElement).offsetHeight);
    setF((prev) => (prev.uiHeights?.[k] === h ? prev
      : { ...prev, uiHeights: { ...prev.uiHeights, [k]: h } }));
  };
  // plain function (not a component) so the textarea never remounts mid-typing
  const noteArea = (k: 'hook' | 'plannedEncounters' | 'secrets' | 'debrief', rows: number, placeholder: string) => (
    <textarea
      class="input session-note"
      rows={rows}
      placeholder={placeholder}
      value={f[k]}
      style={f.uiHeights?.[k] ? { height: `${f.uiHeights[k]}px` } : undefined}
      onInput={txt(k)}
      onPointerUp={noteHeight(k)}
    />
  );

  return (
    <Sheet open={open} center title={existing ? 'Edit session' : 'New session'} onClose={onClose}>
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
      <Field label="Hook / opening">{noteArea('hook', 4, 'The session opens with…')}</Field>
      <Field label="Planned encounters">{noteArea('plannedEncounters', 4, 'Bandit ambush on the road; yeti tracks near the pass…')}</Field>
      <NpcLinkPicker linked={f.npcIds} onChange={(ids) => setF((prev) => ({ ...prev, npcIds: ids }))} />
      <div style={{ marginTop: '12px' }}>
        <Field label="Secrets & clues">{noteArea('secrets', 6, 'One secret per line — reveal when it lands naturally')}</Field>
      </div>

      <div class="field-label" style={{ color: 'var(--frost)' }}>— Debrief —</div>
      <Field label="What happened">{noteArea('debrief', 8, 'Filled in after the session…')}</Field>

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

const NEXT_QUEST_STATUS: Record<QuestStatus, QuestStatus> = {
  dormant: 'active', active: 'escalating', escalating: 'resolved', resolved: 'dormant',
};

/** The quest a beat is linked to (if any). */
function beatQuest(m: Milestone) {
  return m.questId ? state.value.quests.find((x) => x.id === m.questId) : undefined;
}
/** Derived for linked beats (quest resolved), manual otherwise — never stored. */
function beatDone(m: Milestone): boolean {
  return m.questId ? beatQuest(m)?.status === 'resolved' : m.done;
}

function MilestoneSheet({ ci, mi, onClose }: { ci: number; mi: number; onClose: () => void }) {
  const ch = state.value.chapters[ci];
  const m: Milestone | undefined = ch?.milestones[mi];
  if (!m) return null;
  const chapterQuests = state.value.quests.filter((q) => q.chapter === ch.id);
  const upd = (fn: (mm: Milestone) => void) =>
    patch((d) => { const x = d.chapters[ci]?.milestones[mi]; if (x) fn(x); });

  return (
    <Sheet open title={`Ch${ch.id} · Beat`} onClose={onClose}>
      <Field label="Beat">
        <input class="input" value={m.label}
          onChange={(e) => upd((x) => { x.label = (e.target as HTMLInputElement).value; })} />
      </Field>
      <div class="field-label note-label">Notes — what this means at your table
        {(m.notes ?? '').trim() && (
          <ConfirmBtn label="🗑 Clear" confirmLabel="Clear note?" class="mini ghost danger note-clear"
            onConfirm={() => upd((x) => { x.notes = ''; })} />
        )}
      </div>
      <textarea class="input" rows={3} placeholder="Session refs, how it resolved, what changed…"
        value={m.notes ?? ''}
        onChange={(e) => upd((x) => { x.notes = (e.target as HTMLTextAreaElement).value; })} />
      <Field label="Link to quest — auto-completes this beat when the quest resolves">
        <select class="input" value={m.questId ?? ''}
          onChange={(e) => { const v = (e.target as HTMLSelectElement).value; upd((x) => { x.questId = v || null; }); }}>
          <option value="">— not linked (manual toggle) —</option>
          {chapterQuests.map((q) => <option value={q.id}>{q.name}</option>)}
        </select>
      </Field>

      <div class="row-actions" style={{ justifyContent: 'space-between', marginTop: '14px' }}>
        <ConfirmBtn label="Delete beat" confirmLabel="Delete?" class="mini ghost danger"
          onConfirm={() => { patch((d) => { d.chapters[ci].milestones.splice(mi, 1); }); onClose(); }} />
        {!m.questId && (
          <button class={`btn ${m.done ? '' : 'primary'}`}
            onClick={() => { upd((x) => { x.done = !x.done; }); }}>
            {m.done ? 'Reopen ○' : 'Complete ✦'}
          </button>
        )}
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
        const beatsDone = c.milestones.filter(beatDone).length;
        const allBeats = c.milestones.length > 0 && beatsDone === c.milestones.length;
        const chapterQuests = state.value.quests.filter((q) => q.chapter === c.id);
        return (
          <div class={`card chapter ${c.done ? 'complete' : ''}`}>
            <div class="unit-top">
              <span class={`ch-num${c.done ? ' done' : ''}`}>{c.id}</span>
              <div class="unit-id">
                <div class="unit-name">{c.label}</div>
                <div class="unit-meta">Levels {c.levels} · {beatsDone}/{c.milestones.length} beats</div>
              </div>
            </div>

            {/* 1 — beats: manual toggle, or a derived ✓ for quest-linked ones */}
            <div class="milestones">
              {c.milestones.map((m, mi) => {
                const linked = !!m.questId;
                const done = beatDone(m);
                const q = beatQuest(m);
                return (
                  <div class="milestone-row">
                    <button class="ms-toggle" disabled={linked}
                      aria-label={done ? 'Reopen' : 'Complete'}
                      onClick={() => { if (!linked) patch((d) => { const x = d.chapters[ci].milestones[mi]; x.done = !x.done; }); }}>
                      <span class="ms-mark">{done ? '✦' : '○'}</span>
                    </button>
                    <button class={`milestone${done ? ' done' : ''}`} onClick={() => setOpenMs({ ci, mi })}>
                      {m.label}
                      {linked && <span class="ms-link"> 🔗 {q?.name ?? 'quest'}</span>}
                      {m.notes ? <span class="ms-has-notes"> ✎</span> : null}
                    </button>
                    {/* Wave 8 (QA #4): a linked beat's quest is now actionable right
                        here — tap the badge to advance it (dormant→active→…→resolved),
                        the same control the chapter-quest checklist carries. The label
                        button still opens the beat editor. */}
                    {linked && q && (
                      <button class={`standing q-${q.status}`}
                        style={{ background: 'none', cursor: 'pointer', minHeight: '34px', flexShrink: 0 }}
                        aria-label={`Quest ${q.name} — advance status`}
                        onClick={(e) => { e.stopPropagation(); patch((d) => { const x = d.quests.find((y) => y.id === q.id); if (x) x.status = NEXT_QUEST_STATUS[x.status]; }); }}
                      >{q.status}</button>
                    )}
                  </div>
                );
              })}
              <button class="btn mini ghost" style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                onClick={() => {
                  patch((d) => { d.chapters[ci].milestones.push({ label: 'New beat', done: false }); });
                  setOpenMs({ ci, mi: c.milestones.length });
                }}>+ Beat</button>
            </div>

            {/* 2 — chapter quests: the derived checklist, tap status to advance */}
            {chapterQuests.length > 0 && (
              <div class="chapter-quests">
                <div class="field-label">Chapter quests</div>
                {chapterQuests.map((q) => (
                  <div class="ms-quest">
                    <span class={`ms-quest-name${q.status === 'resolved' ? ' resolved' : ''}`}>
                      {q.status === 'resolved' ? '✓ ' : ''}{q.name}
                    </span>
                    <button class={`standing q-${q.status}`}
                      style={{ background: 'none', cursor: 'pointer', minHeight: '34px', flexShrink: 0 }}
                      onClick={() => patch((d) => { const x = d.quests.find((y) => y.id === q.id); if (x) x.status = NEXT_QUEST_STATUS[x.status]; })}
                    >{q.status}</button>
                  </div>
                ))}
              </div>
            )}

            {/* 3 — manual chapter completion; glows once every beat is done */}
            <button class={`btn wide complete-chapter${allBeats && !c.done ? ' ready' : ''}`}
              onClick={() => patch((d) => { d.chapters[ci].done = !d.chapters[ci].done; })}>
              {c.done ? 'Chapter complete ✦ — reopen' : 'Complete chapter ✦'}
            </button>
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

      <CampaignSaveCard />
    </div>
  );
}

// The campaign lives only in this browser's localStorage — a save file is
// the escape hatch: back it up, move devices, or recover from a cleared cache.
function CampaignSaveCard() {
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportSave = () => {
    const blob = new Blob([JSON.stringify(state.value, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `frostmaiden-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pickFile = (e: Event) => {
    setErr(''); setPending(null);
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        const raw = JSON.parse(txt) as Record<string, unknown>;
        if (!Array.isArray(raw.party) || !raw.tv || typeof raw.version !== 'number') {
          setErr('That file doesn\u2019t look like a Frostmaiden save.'); return;
        }
        setPending(raw);
      } catch { setErr('Couldn\u2019t read that file as JSON.'); }
    });
  };

  const pendingSummary = pending
    ? `v${pending.version} · ${(pending.party as unknown[]).length} PCs · ${(pending.sessions as unknown[] | undefined)?.length ?? 0} sessions · day ${(pending.weather as { day?: number } | undefined)?.day ?? '?'}`
    : '';

  return (
    <div class="card" style={{ marginTop: '18px' }}>
      <h3>Campaign save file</h3>
      <p class="stat-fine">Everything — party, quests, NPCs, combat, TV settings — as one JSON file. Loading a save replaces the current campaign.</p>
      <div class="chip-row" style={{ marginTop: '8px', alignItems: 'center' }}>
        <button class="btn" onClick={exportSave}>⬇ Export save</button>
        <button class="btn ghost" onClick={() => fileRef.current?.click()}>⬆ Load save…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={pickFile} />
      </div>
      {err && <p class="stat-fine" style={{ color: 'var(--thread)' }}>{err}</p>}
      {pending && (
        <div class="chip-row" style={{ marginTop: '10px', alignItems: 'center' }}>
          <span class="stat-fine" style={{ margin: 0 }}>{pendingSummary}</span>
          <ConfirmBtn label="Overwrite current campaign" confirmLabel="Really overwrite?" class="danger"
            onConfirm={() => { replaceState(pending); setPending(null); if (fileRef.current) fileRef.current.value = ''; }} />
          <button class="btn ghost" onClick={() => { setPending(null); if (fileRef.current) fileRef.current.value = ''; }}>Cancel</button>
        </div>
      )}
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

type ItemMode = 'all' | 'rime' | 'magic' | 'gear';
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

// Rime items keep an emoji next to their name in the master list.
// Seed data has none (rime-data.js is read-only), so they live here.
const RIME_ITEM_EMOJI: Record<string, string> = {
  'snowshoes-rime': '🥾', 'crampons-rime': '🧗', 'cold-weather-clothing': '🧥',
  'dogsled-rime': '🛷', 'axe-beak-mount': '🦤', 'ice-fishing-tackle': '🎣',
  'psi-crystal': '🔮', 'professor-orb': '🧿', 'scroll-tarrasque': '📜',
  'cauldron-of-plenty': '🍲', 'lantern-of-tracking': '🏮', 'scroll-of-comet': '☄️',
  'ythryn-mythallar': '💠', 'shield-guardian-amulet': '🧿', 'chardalyn-item': '🖤',
};

function ItemsPanel() {
  const [mode, setMode] = useState<ItemMode>('all');
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
      if (mode === 'all') {
        // the master shelf: both API lists merged (Rime items join client-side)
        const [magic, gear] = await Promise.all([getApiList('magic-items'), getApiList('equipment')]);
        if (!magic && !gear) return null;
        return [
          ...(magic ?? []).map((m) => ({ ...m, magic: true })),
          ...(gear ?? []),
        ];
      }
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

  // Give ▸ — granting copies into the party inventory; the catalog is a menu,
  // nothing decrements. Emoji by category (best-effort for API rows), editable after.
  const [giveFor, setGiveFor] = useState<string | null>(null);
  const itemEmojiFor = (name: string, category?: string, magic?: boolean): string => {
    const c = (category ?? '').toLowerCase(), n = name.toLowerCase();
    if (c.includes('potion') || /potion|elixir|philter/.test(n)) return '🧪';
    if (c.includes('scroll') || /scroll/.test(n)) return '📜';
    if (c.includes('ring') || c.includes('wondrous') || /ring of/.test(n)) return '💍';
    if (c.includes('weapon') || /sword|axe|bow|dagger|mace|spear|hammer|blade/.test(n)) return '⚔️';
    if (c.includes('armor') || c.includes('shield') || /armor|shield|mail|plate/.test(n)) return '🛡️';
    if (magic) return '💍';
    return '🎒';
  };
  const grant = (row: Row, ownerId: string | null) => {
    const rime = row.rime ? rimeItems.find((i) => `rime:${i.index}` === row.key) : undefined;
    const category = rime ? (rime.equipment_category as { name?: string } | undefined)?.name : undefined;
    const emoji = row.rime ? (row.emoji ?? '✦') : itemEmojiFor(row.name, category, row.magic);
    patch((d) => {
      d.inventory.push({
        id: `it${d.seq++}`, name: row.name, emoji, qty: 1, ownerId,
        srcIndex: row.key.replace(/^(rime|api):/, ''),
      });
    });
    setGiveFor(null);
  };

  // One master list: Rime items are rows like everything else, emoji intact,
  // interleaved alphabetically — not a separate pile floating on top.
  type Row = { key: string; name: string; emoji?: string; rime?: boolean; magic?: boolean; api?: CatListItem };
  const rimeRows: Row[] = (mode === 'all' || mode === 'rime')
    ? rimeItems
        .filter((i) => !q.trim() || String(i.name).toLowerCase().includes(q.toLowerCase()))
        .map((i) => ({ key: `rime:${i.index}`, name: String(i.name), emoji: RIME_ITEM_EMOJI[String(i.index)] ?? '✦', rime: true }))
    : [];
  const apiRows: Row[] = (mode !== 'rime' && Array.isArray(list))
    ? list
        .filter((x) => !q.trim() || x.name.toLowerCase().includes(q.toLowerCase()))
        .map((x) => ({ key: `api:${x.index}`, name: x.name, magic: x.magic, api: x }))
    : [];
  const rows = [...rimeRows, ...apiRows].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div class="chip-row" style={{ marginBottom: '8px' }}>
        <button class={`cond-chip${mode === 'all' ? ' on' : ''}`} onClick={() => { setMode('all'); setCat('all'); }}>All items</button>
        <button class={`cond-chip frosty${mode === 'rime' ? ' on' : ''}`} onClick={() => { setMode('rime'); }}>❄ Rime</button>
        <button class={`cond-chip frosty${mode === 'magic' ? ' on' : ''}`} onClick={() => { setMode('magic'); setCat('all'); }}>Magic items</button>
        <button class={`cond-chip frosty${mode === 'gear' ? ' on' : ''}`} onClick={() => { setMode('gear'); setCat('all'); }}>Shop goods</button>
      </div>

      {(mode === 'magic' || mode === 'gear') && (
        <div class="chip-row" style={{ marginBottom: '10px' }}>
          <button class={`cond-chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>All</button>
          {cats.map(([idx, label]) => (
            <button class={`cond-chip${cat === idx ? ' on' : ''}`} onClick={() => setCat(idx)}>{label}</button>
          ))}
        </div>
      )}

      <input class="input" placeholder="Search items…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {mode !== 'rime' && list === 'loading' && <p class="stat-fine">Loading…</p>}
      {mode !== 'rime' && list === null && <p class="stat-fine">The 5e shelves need one online visit; ❄ Rime items are always here.</p>}
      <div class="ref-list" style={{ marginTop: '10px' }}>
        {rows.map((r) => (
          <div class="item-shelf-row" key={r.key}>
            <button
              class="creature-add"
              style={{ flex: 1 }}
              onClick={() => r.rime
                ? setOpenRime(r.key.slice(5))
                : setOpenApi({ kind: r.api!.magic || mode === 'magic' ? 'magic-items' : 'equipment', index: r.api!.index, name: r.name })}
            >
              <span>{r.rime ? `${r.emoji} ` : ''}{r.name}</span>
              {r.rime ? <span class="cr frosty-cr">❄ rime</span>
                : r.magic && mode !== 'magic' ? <span class="cr">magic</span> : null}
            </button>
            <button class="btn mini" onClick={() => setGiveFor(giveFor === r.key ? null : r.key)}>Give ▸</button>
            {giveFor === r.key && (
              <div class="item-give-targets">
                <button class="cond-chip" onClick={() => grant(r, null)}>🎒 Party stash</button>
                {state.value.party.map((p) => (
                  <button class="cond-chip" key={p.id} onClick={() => grant(r, p.id)}>{p.name}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && (mode === 'rime' || Array.isArray(list)) && <p class="stat-fine" style={{ padding: '12px' }}>Nothing matches.</p>}
      </div>

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
