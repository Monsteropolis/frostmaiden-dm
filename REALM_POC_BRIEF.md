# Brief: publish one Realm snapshot by hand

**You are working in `Monsteropolis/frostmaiden-dm`.** Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He designs the product and directs the build; he does not read TypeScript, does not run a dev server, and works entirely through the deployed GitHub Pages site. Everything you hand back must be usable from a browser and a phone. When you report, report in plain language: what to open, what he should see, and anything you couldn't do.

---

## Why we're doing this

The project (Pocket Realms) is a persistent cozy pixel-art companion world for a *Rime of the Frostmaiden* campaign. A design review found that **the core diorama already exists and works** — `src/tv/idle.tsx` (`IdleStage`) renders the party milling around a campfire, driven entirely by real campaign state. It's currently only reachable as a live WebRTC broadcast to a TV.

The actual missing piece is **persistence and delivery**: a player can't open it on their own phone a week later.

Before building any of that machinery, we're proving the loop by hand:

```
AppState → projectPlayerView() → snapshot.json → GitHub Pages → a player's phone renders IdleStage
```

If this works, we've de-risked the entire MVP for a few hours of throwaway code, and we know exactly what to build. If it doesn't, we've learned that cheaply.

---

## Scope fence — read this twice

Coding agents wander. Do not.

**DO NOT:**
- ❌ Reimplement, fork, or rewrite the diorama. **Import the existing `IdleStage`.** If you find yourself writing sprite-positioning code, you have misunderstood the task.
- ❌ Add PixiJS, or any renderer.
- ❌ Touch sprites, the sprite atlas, or any art asset.
- ❌ Build `projectRealmSnapshot()`, `diffWorld()`, or any publish pipeline. That's the *next* milestone. This one is deliberately manual.
- ❌ Refactor existing code, "clean up while you're in there," or fix unrelated issues.
- ❌ Add a backend, a database, or auth.
- ❌ Modify `projectPlayerView()` — **unless** the leak check in step 6 fails, in which case stop and report.

**DO:** the six tasks below. Nothing else.

---

## What you need to work out by reading the code

I wrote the reference code below without access to the repo, so several things are guesses. **Read the source and correct them.** These are your job, not the user's:

1. `IdleStage` — the real export name, its file path, and **its exact props type.** (Reference code assumes `<IdleStage view={...} tick={...} />`. Almost certainly wrong.)
2. The scene dimensions — check `src/tv/scenes.ts`. (Reference assumes 128×72.)
3. What drives `IdleStage`'s animation tick on the TV, and at what cadence. (Reference assumes a 1000ms interval.)
4. Where `projectPlayerView()` lives and what it imports.
5. Where `AppState` is defined, and which field holds the schema version.
6. Where the TV-cast controls live in the DM UI — the new button goes next to them, because that's where `projectPlayerView()` is already called.
7. How `vite.config.ts` registers HTML entry points (`tv.html` is already registered somewhere — follow that pattern exactly, don't invent a second one).
8. **The PWA service worker.** See task 5 — this one will silently break everything if you miss it.

**🚩 If `IdleStage` cannot mount without WebRTC/transport/peer state, STOP and report.** That's not a bug to work around — it's a finding that changes the project plan, and the user needs to know.

---

## The six tasks

### 1. Add the player-facing page

Create `realm.html` at the repo root, alongside `index.html` and `tv.html`. Register it in `vite.config.ts` following the existing pattern.

### 2. Add the player-facing app

Create `src/realm/main.tsx`. It fetches `snapshot.json`, caches it, and mounts the existing `IdleStage`.

### 3. Add a "Copy snapshot" button to the DM app

This replaces a console hack. **It must work in the production build** — the user has no dev environment, so a `import.meta.env.DEV` guard would make it useless to him.

It goes in the DM UI near the TV-cast controls. On click it projects the state, wraps it in the envelope, and copies it to the clipboard.

It also displays a stat: how many characters were published, and what percentage of the raw state was withheld. This is the user's ongoing, at-a-glance confirmation that the DM/player security seam is doing its job. Keep it.

### 4. Seed a snapshot so the page works immediately

Create `public/snapshot.json`. **Populate it with a real projected snapshot generated from the app's seed/demo state** — not a placeholder. You can generate this however is convenient (a one-off script, a headless browser, calling the projection directly in a test). The point is that when the user opens the URL for the first time, **he sees a working camp, not a broken page.** His first real publish then *replaces* the demo — which is itself the key test.

### 5. Stop the service worker caching the snapshot ⚠️

This repo ships a PWA. If Workbox precaches `public/` or has a broad `runtimeCaching` rule, `snapshot.json` gets frozen at build time and **publishing will appear to do nothing, with no error.** That failure mode will cost the user an afternoon of confusion.

Fix it properly: exclude `snapshot.json` from precaching (`globIgnores`) **or** give it an explicit `NetworkFirst` runtime rule. The client code already sends `cache: "no-store"` plus a cache-busting query param, but that is not sufficient on its own.

### 6. Run the leak check 🔒

Serialize the `public/snapshot.json` you generated and search it for anything a player must never see: DM notes, dormant quest names, monster AC or stat blocks, session prep, unrevealed plot content.

- **Clean →** report the withheld percentage and move on.
- **Any hit →** 🚨 **STOP.** You have found a live leak in `projectPlayerView()`. Do not push. Report exactly what leaked and where it came from. This is the single most important boundary in the product.

---

## Verify before you push

The user's feedback loop is a full deploy cycle (minutes), so **do not make him debug your typos.**

- `npm run build` passes cleanly, with no type errors.
- `realm.html` is in the build output.
- `snapshot.json` is in the build output.
- If you can, run a headless browser against the built output and confirm `IdleStage` actually renders — don't just confirm it compiles.

Then commit and push. Pages will redeploy.

---

## Report back in plain language

End with:

1. **The URL to open** (e.g. `https://monsteropolis.github.io/frostmaiden-dm/realm.html`)
2. **What he should see** when he opens it
3. **Where the Copy snapshot button is** in the DM app
4. **The withheld percentage** from the leak check
5. **Anything you couldn't do**, or any assumption you had to make

---

## Reference code

Adapt freely — these are a starting point, not a spec. The comments marked `AGENT:` are the spots I know are guesses.

### `realm.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#0a1420" />
    <meta name="robots" content="noindex" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>The Realm</title>
    <style>
      html, body {
        margin: 0; padding: 0; height: 100%;
        background: #0a1420; color: #cfe3f2;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        overscroll-behavior: none;
        -webkit-tap-highlight-color: transparent;
      }
      /* Inherited, so background-image sprites stay crisp all the way down. */
      body { image-rendering: pixelated; image-rendering: crisp-edges; }
      #realm-root { height: 100%; }
    </style>
  </head>
  <body>
    <div id="realm-root"></div>
    <script type="module" src="/src/realm/main.tsx"></script>
  </body>
</html>
```

### `src/realm/main.tsx`

```tsx
/**
 * The player-facing Realm page. Throwaway — delete when projectRealmSnapshot() lands.
 *
 * THE ONE RULE: this file does not reimplement the diorama. It imports IdleStage.
 */

import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

// AGENT: fix the path + export name. Read src/tv/idle.tsx.
import { IdleStage } from "../tv/idle";

// AGENT: confirm against src/tv/scenes.ts and whatever ticks IdleStage on the TV.
const STAGE_W = 128;
const STAGE_H = 72;
const TICK_MS = 1000;

type RealmEnvelope = {
  realmSnapshotVersion: 0;
  schemaVersion: number;
  publishedAt: string;
  scene?: string;
  view: unknown; // the PlayerView, verbatim
};

type Status =
  | { kind: "loading" }
  | { kind: "live" }
  | { kind: "cached"; because: string }
  | { kind: "failed"; because: string };

const SNAPSHOT_URL = `${import.meta.env.BASE_URL}snapshot.json`;
const CACHE_KEY = "realm:poc:snapshot";

async function fetchSnapshot(): Promise<RealmEnvelope> {
  // no-store + cache-buster: necessary but NOT sufficient. See brief task 5.
  const res = await fetch(`${SNAPSHOT_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${SNAPSHOT_URL}`);
  return (await res.json()) as RealmEnvelope;
}

// localStorage throws in iOS private mode. Never let that kill the render.
function readCache(): RealmEnvelope | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RealmEnvelope) : null;
  } catch { return null; }
}
function writeCache(env: RealmEnvelope) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(env)); } catch { /* non-fatal */ }
}

// Pixel art at 1.7x is mush. Integer scales only, always.
function useIntegerScale(w: number, h: number) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const availW = window.innerWidth - 24;
      const availH = window.innerHeight - 96; // room for the status strip
      setScale(Math.max(1, Math.floor(Math.min(availW / w, availH / h))));
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
  }, [w, h]);
  return scale;
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return "at an unknown time";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function Realm() {
  const [env, setEnv] = useState<RealmEnvelope | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const [nonce, setNonce] = useState(0);
  const scale = useIntegerScale(STAGE_W, STAGE_H);

  useEffect(() => {
    let alive = true;
    setStatus({ kind: "loading" });
    fetchSnapshot()
      .then((data) => {
        if (!alive) return;
        setEnv(data);
        setStatus({ kind: "live" });
        writeCache(data);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const because = err instanceof Error ? err.message : String(err);
        const cached = readCache();
        if (cached) { setEnv(cached); setStatus({ kind: "cached", because }); }
        else { setStatus({ kind: "failed", because }); }
      });
    return () => { alive = false; };
  }, [nonce]);

  // Refetch on tab focus — this is how a player discovers a new publish without
  // being told, which is literally the success bar for this milestone.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") setNonce((n) => n + 1); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  // A RENDER clock, not a WORLD clock. It makes the party mill about; it changes
  // no state. The world only moves when the DM publishes. Never wire state to this.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const stage = useMemo(() => {
    if (!env) return null;
    // AGENT: this is the line most likely to be wrong. Match IdleStage's real props.
    return <IdleStage view={env.view as any} tick={tick} />;
  }, [env, tick]);

  return (
    <div style={S.page}>
      <div style={S.stageWrap}>
        {stage ? (
          <div style={{ ...S.stage, width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
            {stage}
          </div>
        ) : (
          <div style={S.blank}>
            {status.kind === "loading" ? "Loading the realm…" : "No snapshot to show."}
          </div>
        )}
      </div>
      <StatusStrip status={status} env={env} scale={scale} onRetry={() => setNonce((n) => n + 1)} />
    </div>
  );
}

/**
 * You cannot open devtools on a phone. Everything needed to diagnose the loop is
 * on screen: what loaded, from where, how stale, at what scale, and — when it
 * breaks — the exact URL that failed. Errors say what happened. They don't apologise.
 */
function StatusStrip({ status, env, scale, onRetry }: {
  status: Status; env: RealmEnvelope | null; scale: number; onRetry: () => void;
}) {
  const published = env ? `published ${ago(env.publishedAt)}` : "";

  if (status.kind === "failed") {
    return (
      <div style={{ ...S.strip, ...S.stripBad }}>
        <div><b>Couldn't load the realm.</b> {status.because}</div>
        <div style={S.hint}>
          Check that <code>snapshot.json</code> exists at that exact URL. If the path is missing the
          repo name, <code>base</code> is wrong in vite.config.
        </div>
        <button style={S.btn} onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (status.kind === "cached") {
    return (
      <div style={{ ...S.strip, ...S.stripWarn }}>
        <div><b>Offline.</b> Showing the last snapshot you loaded — {published}.</div>
        <div style={S.hint}>{status.because}</div>
        <button style={S.btn} onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (status.kind === "loading") return <div style={S.strip}>Loading the realm…</div>;

  return (
    <div style={S.strip}>
      <span style={{ color: "#7fd18c" }}>●</span> Live — {published}
      <span style={S.meta}>
        {env?.scene ?? "scene ?"} · schema v{env?.schemaVersion ?? "?"} · {scale}×
      </span>
    </div>
  );
}

const S: Record<string, any> = {
  page: { height: "100%", display: "flex", flexDirection: "column", background: "#0a1420" },
  stageWrap: { flex: 1, display: "grid", placeItems: "center", overflow: "hidden" },
  stage: { transformOrigin: "center center", position: "relative", overflow: "hidden", imageRendering: "pixelated" },
  blank: { opacity: 0.6, fontSize: 13 },
  strip: {
    flex: "0 0 auto",
    padding: "10px 14px calc(10px + env(safe-area-inset-bottom))",
    borderTop: "1px solid #1c3145", background: "#0d1c2b",
    fontSize: 11, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 4,
  },
  stripWarn: { background: "#2a2413", borderTop: "1px solid #5a4a1c" },
  stripBad: { background: "#2a1416", borderTop: "1px solid #5a1c22" },
  hint: { opacity: 0.65, wordBreak: "break-word" },
  meta: { opacity: 0.5, marginLeft: "auto" },
  btn: {
    alignSelf: "flex-start", marginTop: 4, background: "#1c3145", color: "#cfe3f2",
    border: "1px solid #2c4a68", borderRadius: 3, padding: "6px 12px", font: "inherit", cursor: "pointer",
  },
};

const root = document.getElementById("realm-root");
if (root) render(<Realm />, root);
```

### `src/realm/publish-button.tsx`

```tsx
/**
 * The DM's "Copy snapshot" button.
 *
 * MUST work in production — the user has no dev environment. Do NOT gate this
 * behind import.meta.env.DEV.
 *
 * WHY THE PROJECTION IS NOT OPTIONAL, even in a throwaway:
 * The raw AppState is the entire Frostmaiden module — dormant quests, monster
 * stats, session prep, the twist he hasn't revealed. GitHub Pages is public.
 * Copying raw state to a published file is exactly the failure the seam exists
 * to prevent. Everything goes through projectPlayerView(). No exceptions.
 */

import { useState } from "preact/hooks";

// AGENT: fix both paths.
import { projectPlayerView } from "../tv/projection";
import type { AppState } from "../schema";

export function PublishSnapshotButton({ state }: { state: AppState }) {
  const [done, setDone] = useState<null | { chars: number; withheld: number }>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  const copy = () => {
    try {
      const view = projectPlayerView(state);
      const envelope = {
        realmSnapshotVersion: 0 as const,
        // AGENT: use the real schema-version field name.
        schemaVersion: (state as any).version ?? 0,
        publishedAt: new Date().toISOString(),
        // AGENT: use the real current-scene field, or drop this if there isn't one.
        scene: (state as any).scene ?? "camp",
        view,
      };

      const json = JSON.stringify(envelope, null, 2);
      const rawLen = JSON.stringify(state).length;
      const viewLen = JSON.stringify(view).length;
      const withheld = Math.round((1 - viewLen / rawLen) * 100);

      // No awaits before writeText — Safari needs it inside the user gesture.
      navigator.clipboard.writeText(json).then(
        () => { setDone({ chars: json.length, withheld }); setError(null); setFallback(null); },
        () => { setFallback(json); setDone({ chars: json.length, withheld }); },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <button onClick={copy}>Copy snapshot</button>

      {done && (
        <p>
          Copied — {(done.chars / 1024).toFixed(1)} KB. <strong>{done.withheld}% of your state
          withheld</strong> from players.
          <br />
          Paste it over <code>public/snapshot.json</code> on GitHub and commit.
        </p>
      )}

      {/* Clipboard API can be blocked. Never leave him with no way to get the JSON out. */}
      {fallback && (
        <textarea
          readOnly
          rows={6}
          value={fallback}
          onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
        />
      )}

      {error && <p>Couldn't build the snapshot: {error}</p>}
    </div>
  );
}
```

> **AGENT:** style this to match the existing "Fate Direct" design system in the DM app. Don't leave it unstyled, and don't invent a new visual language for it.

### `public/snapshot.json`

Do not ship the placeholder below. **Generate a real one from seed/demo state** (task 4). This is only the shape:

```json
{
  "realmSnapshotVersion": 0,
  "schemaVersion": 5,
  "publishedAt": "2026-07-11T00:00:00.000Z",
  "scene": "camp",
  "view": {}
}
```
