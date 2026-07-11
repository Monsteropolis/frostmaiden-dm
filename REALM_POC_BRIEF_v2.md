# Brief: publish one Realm snapshot by hand (v2 — verified against the repo)

**Repo:** `Monsteropolis/frostmaiden-dm`

> **This supersedes the v1 brief.** V1 was written without repo access and its reference code was wrong in five places. Everything below has been **verified by reading the actual source.** Do not guess where this brief states a fact — it has been checked.

**The person you're working for is not an engineer.** He designs the product; he does not read TypeScript, has no local dev environment, and works entirely through the deployed GitHub Pages site. Report back in plain language: what to open, what he should see, what you couldn't do.

---

## Why

`src/tv/idle.tsx` (`IdleStage`) already renders the party milling around a campfire, driven by real campaign state. It's only reachable as a **live WebRTC broadcast to a TV.** A player can't open it on their own phone a week later.

We're proving the delivery loop by hand before building any machinery:

```
AppState → projectPlayerView() → public/snapshot.json → GitHub Pages → a player's phone
```

---

## Verified facts (do not re-derive these)

**`IdleStage` is completely pure.** `src/tv/idle.tsx`:

```ts
export function IdleStage({ v, full = false, pokeActive = null }: {
  v: PlayerView;
  full?: boolean;
  pokeActive?: { pcId: string; kind: 'wave' | 'cheer' } | null;
})
```

- The prop is **`v`**, not `view`.
- **It owns its own animation clock** — `setInterval(…, 700)` internally. **Do not pass a tick.**
- It imports only: `preact/hooks`, projection *types*, `scenes`, and three PNG URLs. **Zero transport, peer, or WebRTC dependency.** It renders standalone from a plain object.

**How the TV mounts it** (`src/tv/app.tsx:402`):

```tsx
<section class="tv-scene idle-slot full"><IdleStage v={v} full pokeActive={pokeActive} /></section>
```

**Sizing is pure CSS — do not build a scaling system.** `src/styles/tv.css`:
```css
.tv-scene.idle-slot { padding: 0 !important; position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.tv-scene.idle-slot.full { flex: 1; border-radius: 0; }
.tv-idle-stage { position: absolute; inset: 0; }
.tv-scene.idle-slot.full .tv-idle-actor { transform: scale(4.5) translateX(-50%); }
```
Give the section a flex parent with height and it fills it. **No integer-scale hook, no stage dimensions, no transforms.**

**The projection.** `src/tv/projection.ts:175` — `export function projectPlayerView(s: AppState): PlayerView`. Pure. `PlayerView` already carries `v: PV_VERSION` and `sentAt: number` (epoch ms), so **publish the raw `PlayerView`. No envelope wrapper.** It is literally the object the TV already receives over the wire — zero new abstractions, which is the entire point of this exercise.

**State is a global signal.** `src/state/store.ts:58` — `export const state = signal<AppState>(…)`. So:
```ts
import { state } from '../state/store';
import { projectPlayerView } from '../tv/projection';
const view = projectPlayerView(state.value);   // no props needed
```

**Vite:** `base: './'` (relative). `vite.config.ts` registers entries as `{ main: 'index.html', tv: 'tv.html' }` — follow that shape exactly.

**Build:** `npm run build` = `tsc --noEmit && vite build`. **Type errors fail the build.**

**Service worker — ⚠️ V1 GOT THIS WRONG.** `workbox.globPatterns: ['**/*.{js,css,html,svg,png,woff2}']` — **`json` is not in the list**, and the only `runtimeCaching` rule targets `dnd5eapi.co`. `snapshot.json` is **not precached and not runtime-cached.** It goes straight to the network.

**➡️ Do not change the PWA config.** Just *confirm* the above after your build and report. (Keep `cache: 'no-store'` on the fetch as belt-and-braces.)

---

## Scope fence

**DO NOT:** reimplement the diorama (import `IdleStage`) · add PixiJS · touch sprites or the atlas · build `projectRealmSnapshot()` or `diffWorld()` · refactor anything · add a backend · modify `projectPlayerView()`.

**DO:** the five tasks. Nothing else.

---

## The five tasks

### 1. `realm.html` (repo root)

Mirror `tv.html` exactly. Mount point `<div id="realm"></div>`, script `/src/realm/main.tsx`. Register in `vite.config.ts` as a third entry alongside `main` and `tv`.

### 2. `src/realm/main.tsx`

Mirror `src/tv/main.tsx` (same font + `tokens.css` + `tv.css` imports — the stage CSS lives in `tv.css` and is required).

```tsx
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/silkscreen/400.css';
import '../styles/tokens.css';
import '../styles/tv.css';
import '../styles/realm.css';           // new, tiny — see task 3
import { IdleStage } from '../tv/idle';
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
        ? <section class="tv-scene idle-slot full"><IdleStage v={v} full /></section>
        : <section class="realm-blank">{status.kind === 'loading' ? 'Loading the realm…' : 'No snapshot to show.'}</section>}
      <RealmStatus status={status} v={v} onRetry={() => setNonce((n) => n + 1)} />
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
```

### 3. `src/styles/realm.css`

Small. `.realm-page` = fixed inset-0 flex column on the app background. `.realm-strip` = a bottom bar with `warn` / `bad` variants. **Use the existing `tokens.css` variables** — do not invent a new palette. Match the "Fate Direct" system already in the app.

### 4. Add a **Copy snapshot** button to `src/components/TvPanel.tsx`

That file already imports `state` and drives the TV broadcast — it's the right home. **It must work in the production build; the user has no dev environment.** Do not gate on `import.meta.env.DEV`.

```tsx
const [copied, setCopied] = useState<{ kb: string; withheld: number } | null>(null);

const copySnapshot = () => {
  const view = projectPlayerView(state.value);
  const json = JSON.stringify(view, null, 2);
  const withheld = Math.round((1 - JSON.stringify(view).length / JSON.stringify(state.value).length) * 100);
  navigator.clipboard.writeText(json).then(
    () => setCopied({ kb: (json.length / 1024).toFixed(1), withheld }),
    () => { /* clipboard blocked — render the JSON in a readonly, auto-selected textarea */ },
  );
};
```

Show the result: *"Copied — 9.4 KB. **97% of your state withheld** from players. Paste it over `public/snapshot.json` on GitHub and commit."*

**Keep the withheld percentage.** It's the user's at-a-glance confirmation, on every single publish, that the DM/player seam is holding. Style it to match the panel.

### 5. Seed `public/snapshot.json` with a *real* snapshot

Not a placeholder. **His first open must show a working camp, not a broken page.**

Write `scripts/seed-snapshot.mts`, run with `vite-node` (mirror `tests/session-sim.mts`, which already uses `@happy-dom/global-registrator` to get a DOM in node). It should import `state`, call `projectPlayerView(state.value)`, and write the result to `public/snapshot.json`.

⚠️ **If the fresh seed state has an empty `party`, `IdleStage` renders nothing and it will look broken.** Check. If empty, use `tests/session-sim.mts` to drive state into a populated session first, then project that.

---

## Verify before you push

His feedback loop is a full deploy cycle. Don't make him debug your typos.

- `npm run build` passes clean (this includes `tsc --noEmit`).
- `realm.html` and `snapshot.json` are both in `dist/`.
- `dist/snapshot.json` has a non-empty `party` array.
- If you can, render `IdleStage` headlessly against the seeded snapshot (happy-dom is already a devDependency) and confirm actors appear in the output — don't just confirm it compiles.

---

## Report back in plain language

1. The URL to open
2. What he should see
3. Where the **Copy snapshot** button is in the DM app
4. The withheld percentage
5. Confirmation that `snapshot.json` is **not** in the service worker's precache manifest (`dist/sw.js`)
6. Anything you couldn't do
