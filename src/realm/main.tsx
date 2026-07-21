// ============================================================
// REALM PAGE (player-facing) — a player opens this on their own
// phone and sees the party's idle diorama, driven by the last
// snapshot the DM published by hand to public/snapshot.json.
//
// THE ONE RULE: this file does not reimplement the diorama. It
// imports RealmStage and hands it a PlayerView. Everything the
// stage needs (its own animation clock, sizing via tv.css) lives
// where it already lives.
// ============================================================

import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/silkscreen/400.css';
// Wave 7 (QA #1): legible pixel font for in-world name labels.
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '../styles/tokens.css';
import '../styles/tv.css';
import '../styles/realm.css';
import { RealmStage } from '../tv/realm-stage';
import type { PlayerView, PvPc, PokeActive, PokeKind } from '../tv/projection';
import { AbilitiesPanel } from './abilities';
import { InventoryPanel } from './inventory';
import { propById } from '../data/props';
import {
  fetchRealmCharacters, realmLogin, normalizeRealmCode,
  listMyJournal, listSharedJournal, writeJournalEntry, updateJournalEntry,
  deleteJournalEntry,
  setShared as setEntryShared, fetchCharacterNames, RealmUnreachableError,
  type RealmCharacter, type RealmSession, type JournalEntry,
} from '../backend/realm-client';

const SNAPSHOT_URL = `${import.meta.env.BASE_URL}snapshot.json`;
const CACHE_KEY = 'realm:snapshot';

type Status =
  | { kind: 'loading' }
  | { kind: 'live' }
  | { kind: 'cached'; because: string }
  | { kind: 'failed'; because: string };

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (!Number.isFinite(m) || m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** The logged-in player app's tabs. `world` is the diorama; the rest are what
 *  you DO while in it. Adding a tab (a Places tab arrives next wave) is one
 *  entry in this array — no rework. */
type RealmTab = 'world' | 'journal' | 'abilities' | 'inventory';
const REALM_TABS: { id: RealmTab; label: string; icon: string }[] = [
  { id: 'world', label: 'World', icon: '🏔' },
  { id: 'journal', label: 'Journal', icon: '📓' },
  { id: 'abilities', label: 'Abilities', icon: '✨' },
  { id: 'inventory', label: 'Gear', icon: '🎒' },
];

function Realm() {
  const [v, setV] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState<RealmTab>('world');
  // Part D: the emote the player fired on their OWN character. In v1 this is
  // local to this screen — dispatchEmote is the single seam a future wave makes
  // broadcast (see EmoteBar). A short-lived PokeActive drives the stage.
  const [emote, setEmote] = useState<PokeActive | null>(null);
  const emoteSeq = useRef(0);
  const emoteTimer = useRef<number>();
  // Brief 2 — the player's session token. IN MEMORY ONLY, on purpose: a
  // refresh, a closed tab, or a borrowed phone keeps nothing. Logging in adds
  // the ability to WRITE (journal/decoration, later briefs); just LOOKING at
  // the Realm never needs it.
  const [session, setSession] = useState<RealmSession | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [expired, setExpired] = useState(false);

  // Bounce back to login the moment the token lapses ("re-enter each session").
  useEffect(() => {
    if (!session) return;
    const ms = session.expiresAt - Date.now();
    if (ms <= 0) { setSession(null); setExpired(true); return; }
    const t = setTimeout(() => { setSession(null); setExpired(true); }, ms);
    return () => clearTimeout(t);
  }, [session]);

  useEffect(() => {
    let alive = true;
    fetch(`${SNAPSHOT_URL}?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${SNAPSHOT_URL}`); return r.json(); })
      .then((data: PlayerView) => {
        if (!alive) return;
        setV(data);
        setStatus({ kind: 'live' });
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const because = e instanceof Error ? e.message : String(e);
        let cached: PlayerView | null = null;
        try { const raw = localStorage.getItem(CACHE_KEY); if (raw) cached = JSON.parse(raw); } catch {}
        if (cached) { setV(cached); setStatus({ kind: 'cached', because }); }
        else { setStatus({ kind: 'failed', because }); }
      });
    return () => { alive = false; };
  }, [nonce]);

  // Refetch when the player returns to the tab — this is how they discover a new
  // publish without being told, which is the success bar for this milestone.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') setNonce((n) => n + 1); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  useEffect(() => () => clearTimeout(emoteTimer.current), []);
  // Falling back to the world view when a player signs out keeps a signed-out
  // visitor from staring at a locked tab.
  useEffect(() => { if (!session && tab !== 'world') setTab('world'); }, [session]);

  // Part D — THE ONE dispatch seam. Today it plays the emote on this screen
  // only; making the table see it later is a single added line here (broadcast
  // the same {characterId, kind} to the DM). Nothing else in the app changes.
  const dispatchEmote = (kind: PokeKind) => {
    if (!session) return;
    emoteSeq.current += 1;
    setEmote({ seq: emoteSeq.current, target: session.characterId, kind });
    clearTimeout(emoteTimer.current);
    emoteTimer.current = window.setTimeout(() => setEmote(null), 2600);
  };

  const myPc: PvPc | null =
    session && v ? v.party.find((p) => p.id === session.characterId) ?? null : null;
  const showTabs = !!session;

  return (
    <div class="realm-page">
      <main class="realm-main">
        {(tab === 'world' || !showTabs) && (
          <>
            {v
              ? <section class="tv-scene idle-slot full"><RealmStage v={v} full pokeActive={emote} /></section>
              : <section class="realm-blank">{status.kind === 'loading' ? 'Loading the realm…' : 'No snapshot to show.'}</section>}
            {showTabs && <EmoteBar onEmote={dispatchEmote} />}
            {v && <Pack v={v} />}
          </>
        )}
        {showTabs && tab === 'journal' && session && <JournalPanel session={session} />}
        {showTabs && tab === 'abilities' && session && <AbilitiesPanel session={session} pc={myPc} />}
        {showTabs && tab === 'inventory' && session && v && <InventoryPanel session={session} v={v} />}
      </main>

      {showTabs && <RealmTabs tab={tab} onTab={setTab} />}

      {expired && !session && (
        <div class="realm-strip warn">
          <div><b>Your session ended.</b> Sign in again to keep your seat.</div>
          <button onClick={() => { setExpired(false); setLoginOpen(true); }}>Sign in</button>
        </div>
      )}
      <RealmStatus
        status={status} v={v} onRetry={() => setNonce((n) => n + 1)}
        session={session}
        onLogin={() => { setExpired(false); setLoginOpen(true); }}
        onLogout={() => setSession(null)}
      />
      {loginOpen && !session && (
        <LoginSheet
          onDone={(s) => { setSession(s); setLoginOpen(false); }}
          onClose={() => setLoginOpen(false)}
        />
      )}
    </div>
  );
}

/** The phone-first tab bar (Part G). Pinned above the status strip; the world
 *  is always one tap away. Built from REALM_TABS so a new tab is a data edit. */
function RealmTabs({ tab, onTab }: { tab: RealmTab; onTab: (t: RealmTab) => void }) {
  return (
    <nav class="realm-tabs" role="tablist">
      {REALM_TABS.map((t) => (
        <button
          key={t.id}
          class={`realm-tab${tab === t.id ? ' on' : ''}`}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onTab(t.id)}
        >
          <span class="realm-tab-icon">{t.icon}</span>
          <span class="realm-tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Part D — the emote bar. The vocabulary is exactly what the stage's poke
 *  channel already animates (POSE_FRAMES + the CSS emotes). Every tap goes
 *  through the parent's single dispatchEmote. */
const EMOTES: { kind: PokeKind; icon: string; label: string }[] = [
  { kind: 'wave', icon: '👋', label: 'Wave' },
  { kind: 'cheer', icon: '🎉', label: 'Cheer' },
  { kind: 'taunt', icon: '😈', label: 'Taunt' },
  { kind: 'flinch', icon: '😖', label: 'Flinch' },
];
function EmoteBar({ onEmote }: { onEmote: (k: PokeKind) => void }) {
  return (
    <div class="realm-emote-bar realm-ui-frame">
      {EMOTES.map((e) => (
        <button key={e.kind} class="realm-emote" onClick={() => onEmote(e.kind)} aria-label={e.label}>
          <span class="realm-emote-icon">{e.icon}</span>
          <span class="realm-emote-label">{e.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- login

type LoginStep =
  | { step: 'code' }
  | { step: 'pick'; campaignName: string; code: string; characters: RealmCharacter[] }
  | { step: 'password'; campaignName: string; code: string; ch: RealmCharacter };

/** The login flow, one screen per decision, every failure spelled out on
 *  screen (you can't devtools a phone): unknown code, wrong password,
 *  gated vs ungated. Ungated characters skip the password entirely. */
function LoginSheet({ onDone, onClose }: { onDone: (s: RealmSession) => void; onClose: () => void }) {
  const [at, setAt] = useState<LoginStep>({ step: 'code' });
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const findParty = async () => {
    setBusy(true); setError('');
    try {
      const c = normalizeRealmCode(code);
      const { campaignName, characters } = await fetchRealmCharacters(c);
      if (!characters.length) { setError('That party has no characters yet — ask your DM to sync the party.'); }
      else setAt({ step: 'pick', campaignName, code: c, characters });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const login = async (c: string, ch: RealmCharacter, password: string) => {
    setBusy(true); setError('');
    try {
      onDone(await realmLogin(c, ch.id, password));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div class="realm-login-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="realm-login" role="dialog" aria-label="Sign in to the Realm">
        <button class="realm-login-close" onClick={onClose} aria-label="Close">✕</button>

        {at.step === 'code' && (
          <>
            <h2>Enter the Realm</h2>
            <p>Type your party's <b>Realm code</b> — it's on the TV during a session, or ask your DM.</p>
            <input
              class="realm-login-code"
              value={code}
              placeholder="REALM CODE"
              maxLength={8}
              onInput={(e) => setCode(normalizeRealmCode((e.target as HTMLInputElement).value))}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 4) findParty(); }}
            />
            <button class="realm-login-go" disabled={busy || code.length < 4} onClick={findParty}>
              {busy ? 'Looking…' : 'Find my party'}
            </button>
          </>
        )}

        {at.step === 'pick' && (
          <>
            <h2>{at.campaignName || 'Your party'}</h2>
            <p>Who are you? 🔒 means that character has a password.</p>
            <div class="realm-login-chars">
              {at.characters.map((ch) => (
                <button key={ch.id} disabled={busy} onClick={() => {
                  if (ch.gated) { setPw(''); setError(''); setAt({ step: 'password', campaignName: at.campaignName, code: at.code, ch }); }
                  else login(at.code, ch, '');   // ungated — straight in
                }}>
                  {ch.name} {ch.gated ? '🔒' : ''}
                </button>
              ))}
            </div>
            <button class="realm-login-back" onClick={() => { setError(''); setAt({ step: 'code' }); }}>← Different code</button>
          </>
        )}

        {at.step === 'password' && (
          <>
            <h2>{at.ch.name} 🔒</h2>
            <p>This character is protected — enter the password your DM set.</p>
            <input
              class="realm-login-code pw"
              type="password"
              value={pw}
              placeholder="Password"
              onInput={(e) => setPw((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && pw) login(at.code, at.ch, pw); }}
            />
            <button class="realm-login-go" disabled={busy || !pw} onClick={() => login(at.code, at.ch, pw)}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button class="realm-login-back" onClick={() => { setError(''); findPartyBack(at, setAt); }}>← Someone else</button>
          </>
        )}

        {error && <div class="realm-login-error">{error}</div>}
        <p class="realm-login-fine">
          Signing in lasts one game session and is remembered by nothing — closing
          this page signs you out. You can always just watch without signing in.
        </p>
      </div>
    </div>
  );
}

/** Back from the password screen to the picker without refetching. */
function findPartyBack(
  at: Extract<LoginStep, { step: 'password' }>,
  setAt: (s: LoginStep) => void,
) {
  // The picker list was already fetched to get here; refetch keeps it honest
  // but costs a round-trip — going straight back is the phone-friendly choice.
  fetchRealmCharacters(at.code)
    .then(({ campaignName, characters }) => setAt({ step: 'pick', campaignName, code: at.code, characters }))
    .catch(() => setAt({ step: 'code' }));
}

/** The Pack — what the party carries, stash first, then a group per PC who
 *  holds anything. Hidden entirely when nothing is carried. */
function Pack({ v }: { v: PlayerView }) {
  const [openItem, setOpenItem] = useState<string | null>(null);
  // Placed catalog props ride the inventory wire (appearance token) but are
  // camp furniture, not carried loot — never list them in the Pack.
  const inv = (v.inventory ?? []).filter((i) => !propById(i.emoji));
  if (!inv.length) return null;
  const groups: { key: string; label: string; items: typeof inv }[] = [];
  const stash = inv.filter((i) => i.ownerId === null);
  if (stash.length) groups.push({ key: 'stash', label: '🎒 Party stash', items: stash });
  for (const p of v.party) {
    const mine = inv.filter((i) => i.ownerId === p.id);
    if (mine.length) groups.push({ key: p.id, label: p.name, items: mine });
  }
  return (
    <div class="realm-pack">
      <div class="realm-pack-head">The Pack</div>
      {groups.map((g) => (
        <div class="realm-pack-group" key={g.key}>
          <span class="realm-pack-owner">{g.label}</span>
          <div class="realm-pack-items">
            {g.items.map((it) => (
              <button class="realm-pack-item" key={it.id}
                onClick={() => setOpenItem(openItem === it.id ? null : it.id)}>
                {it.emoji} {it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}
                {it.display && <span class="realm-pack-camp" title="On display in camp"> 🏕</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      {openItem && (() => {
        const it = inv.find((x) => x.id === openItem);
        return it ? (
          <div class="realm-pack-pop" onClick={() => setOpenItem(null)}>
            <span class="realm-pack-pop-emoji">{it.emoji}</span>
            <div>
              <div class="realm-pack-pop-name">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}</div>
              <div class="realm-pack-pop-owner">
                {it.ownerId === null ? 'In the party stash' : `Carried by ${v.party.find((p) => p.id === it.ownerId)?.name ?? 'someone'}`}
                {it.display ? ' · 🏕 on display in camp' : ''}
              </div>
            </div>
          </div>
        ) : null;
      })()}
    </div>
  );
}

// ---------------------------------------------------------------- journal

/** Brief 3 — the party journal, behind login. Two tabs: MINE is everything
 *  this character wrote (private and shared both, each wearing its flag);
 *  SHARED is every shared entry in the campaign with its author's name.
 *  Sharing an entry flips one flag on one row — there is deliberately no
 *  copy-to-shared path, so nothing is ever written twice. */
function JournalPanel({ session }: { session: RealmSession }) {
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  // one draft serves both the composer (editingId === 'new') and edits
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dTitle, setDTitle] = useState('');
  const [dBody, setDBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [errSetup, setErrSetup] = useState(false);

  const fail = (e: unknown) => {
    setErr(e instanceof Error ? e.message : String(e));
    setErrSetup(e instanceof RealmUnreachableError);
  };

  const reload = async (which: 'mine' | 'shared') => {
    setErr('');
    try {
      if (which === 'mine') setEntries(await listMyJournal(session.token));
      else {
        const [list, who] = await Promise.all([
          listSharedJournal(session.token), fetchCharacterNames(session.token),
        ]);
        setNames(who);
        setEntries(list);
      }
    } catch (e) { fail(e); }
  };

  useEffect(() => {
    setEntries(null); setOpenId(null); setEditingId(null);
    reload(tab);
  }, [tab, session.token]);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (editingId === 'new') await writeJournalEntry(session.token, { title: dTitle.trim(), body: dBody });
      else if (editingId) await updateJournalEntry(session.token, editingId, { title: dTitle.trim(), body: dBody });
      setEditingId(null);
      await reload(tab);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const toggleShare = async (entry: JournalEntry) => {
    setBusy(true); setErr('');
    try {
      await setEntryShared(session.token, entry.id, !entry.isShared);
      await reload(tab);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  // Part A4 — deletable, behind a confirm. RLS already permits author-delete.
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const remove = async (entry: JournalEntry) => {
    setBusy(true); setErr('');
    try {
      await deleteJournalEntry(session.token, entry.id);
      setConfirmDel(null);
      await reload(tab);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const startEdit = (entry: JournalEntry | null) => {
    setEditingId(entry ? entry.id : 'new');
    setDTitle(entry?.title ?? '');
    setDBody(entry?.body ?? '');
    setErr('');
  };

  const mineTab = tab === 'mine';
  return (
    <div class="realm-journal">
      <div class="realm-journal-head">
        <span class="realm-journal-title">📓 Journal</span>
        <div class="realm-journal-tabs" role="tablist">
          <button class={mineTab ? 'on' : ''} onClick={() => setTab('mine')}>Mine</button>
          <button class={!mineTab ? 'on' : ''} onClick={() => setTab('shared')}>Shared</button>
        </div>
        {mineTab && !editingId && (
          <button class="realm-journal-new" onClick={() => startEdit(null)}>＋ New entry</button>
        )}
      </div>

      {err && (
        <div class="realm-login-error">
          <b>{errSetup ? 'Realm server unreachable.' : 'That didn\'t work.'}</b> {err}
          {errSetup && (
            <div class="realm-journal-fine">
              Your words are safe on this screen but not saved yet. If this keeps up, tell your
              DM — the Realm login server may not be deployed (the DM app's Sync button says the same).
            </div>
          )}
        </div>
      )}

      {editingId && (
        <div class="realm-journal-editor">
          <input
            value={dTitle}
            placeholder="Title (optional)"
            onInput={(e) => setDTitle((e.target as HTMLInputElement).value)}
          />
          <textarea
            value={dBody}
            placeholder="What happened out there?"
            onInput={(e) => setDBody((e.target as HTMLTextAreaElement).value)}
          />
          <div class="rj-actions">
            <button class="share" disabled={busy || !dBody.trim()} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button disabled={busy} onClick={() => setEditingId(null)}>Cancel</button>
            {editingId === 'new' && <span class="realm-journal-fine">Saved private — share it after, if you want.</span>}
          </div>
        </div>
      )}

      {entries === null && !err && <div class="realm-journal-fine">Loading…</div>}
      {entries?.length === 0 && !editingId && (
        <div class="realm-journal-fine">
          {mineTab
            ? 'Nothing yet — your notes start here. Only you (and the DM) see private entries.'
            : 'Nothing shared yet. Entries anyone marks Share ▸ appear here for the whole party.'}
        </div>
      )}

      {entries?.map((entry) => (
        <div class="realm-journal-entry" key={entry.id}>
          <div class="rj-top" onClick={() => setOpenId(openId === entry.id ? null : entry.id)}>
            <span class="rj-title">{entry.title || 'Untitled'}</span>
            {!mineTab && <span class="rj-author">{names[entry.authorId] ?? entry.authorId}</span>}
            {mineTab && (
              <span class={`rj-flag${entry.isShared ? ' shared' : ''}`}>
                {entry.isShared ? '✦ shared' : 'private'}
              </span>
            )}
            <span class="rj-when">{ago(Date.parse(entry.updatedAt))}</span>
          </div>
          {openId === entry.id && editingId !== entry.id && (
            <>
              <div class="rj-body">{entry.body}</div>
              {entry.authorId === session.characterId && (
                <div class="rj-actions">
                  <button class="share" disabled={busy} onClick={() => toggleShare(entry)}>
                    {entry.isShared ? 'Unshare' : 'Share ▸'}
                  </button>
                  <button disabled={busy} onClick={() => startEdit(entry)}>Edit</button>
                  {confirmDel === entry.id
                    ? (
                      <>
                        <button class="danger" disabled={busy} onClick={() => remove(entry)}>Delete?</button>
                        <button disabled={busy} onClick={() => setConfirmDel(null)}>Keep</button>
                      </>
                    )
                    : <button class="danger" disabled={busy} onClick={() => setConfirmDel(entry.id)}>Delete</button>}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * You cannot open devtools on a phone. Everything needed to diagnose the loop is
 * on screen: what loaded, how stale, and — when it breaks — the exact URL that
 * failed. Errors say what happened. They do not apologise.
 */
function RealmStatus({ status, v, onRetry, session, onLogin, onLogout }: {
  status: Status; v: PlayerView | null; onRetry: () => void;
  session: RealmSession | null; onLogin: () => void; onLogout: () => void;
}) {
  // Brief 2: viewing never requires login — the sign-in affordance rides the
  // same strip the page already had, whatever state it's in.
  const who = session
    ? <button class="realm-login-chip" onClick={onLogout} title="Signed in — tap to sign out">
        ✦ {session.characterName} · sign out
      </button>
    : <button class="realm-login-chip" onClick={onLogin}>🔑 Sign in</button>;
  if (status.kind === 'failed') return (
    <div class="realm-strip bad">
      <div><b>Couldn't load the realm.</b> {status.because}</div>
      <div class="realm-hint">Check that <code>snapshot.json</code> exists at that URL.</div>
      <button onClick={onRetry}>Try again</button>
    </div>
  );
  if (status.kind === 'cached') return (
    <div class="realm-strip warn">
      <div><b>Offline.</b> Showing the last snapshot you loaded — published {v ? ago(v.sentAt) : '?'}.</div>
      <button onClick={onRetry}>Try again</button>
    </div>
  );
  if (status.kind === 'loading') return <div class="realm-strip">Loading the realm…</div>;
  return (
    <div class="realm-strip">
      <span class="realm-dot">●</span> Live — published {v ? ago(v.sentAt) : '?'}
      <span class="realm-meta">{v?.location} · day {v?.day} · {v?.weather.name}</span>
      {who}
    </div>
  );
}

render(<Realm />, document.getElementById('realm')!);
