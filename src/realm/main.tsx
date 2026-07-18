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
import { useEffect, useState } from 'preact/hooks';
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
import type { PlayerView } from '../tv/projection';
import {
  fetchRealmCharacters, realmLogin, normalizeRealmCode,
  type RealmCharacter, type RealmSession,
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

function Realm() {
  const [v, setV] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);
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

  return (
    <div class="realm-page">
      {v
        ? <section class="tv-scene idle-slot full"><RealmStage v={v} full /></section>
        : <section class="realm-blank">{status.kind === 'loading' ? 'Loading the realm…' : 'No snapshot to show.'}</section>}
      {v && <Pack v={v} />}
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
  const inv = v.inventory ?? [];   // older published snapshots predate the field
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
