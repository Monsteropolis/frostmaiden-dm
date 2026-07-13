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
import '../styles/tokens.css';
import '../styles/tv.css';
import '../styles/realm.css';
import { RealmStage } from '../tv/realm-stage';
import type { PlayerView } from '../tv/projection';

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
      <RealmStatus status={status} v={v} onRetry={() => setNonce((n) => n + 1)} />
    </div>
  );
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
function RealmStatus({ status, v, onRetry }: { status: Status; v: PlayerView | null; onRetry: () => void }) {
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
    </div>
  );
}

render(<Realm />, document.getElementById('realm')!);
