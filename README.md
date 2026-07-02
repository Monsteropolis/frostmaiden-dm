# Frostmaiden DM Companion

A mobile-first, offline-capable PWA for running *Rime of the Frostmaiden* at the table. Built on the Fate Direct brand system — cosmos, thread, and star — overlaid with glacial frost.

## Quick preview (no install)

A production build is included in `dist/`. Serve it with any static server:

```bash
npx serve dist
```

Then open the printed URL. (Service workers need a server — opening `index.html` directly from disk won't register offline support.)

## Put it on your phone (GitHub Pages)

The repo ships with `.github/workflows/deploy.yml` — GitHub builds and publishes automatically on every push.

1. Create a new GitHub repo (e.g. `frostmaiden-dm`), then from this folder:
   ```bash
   git init && git add . && git commit -m "Phase 2"
   git branch -M main
   git remote add origin https://github.com/YOURNAME/frostmaiden-dm.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Source: "GitHub Actions"** (one time).
3. Wait ~1 minute for the action to finish. Your app is live at
   `https://YOURNAME.github.io/frostmaiden-dm/`
4. On your phone, open that URL → **Add to Home Screen** (Safari share menu on iOS, Chrome ⋮ menu on Android). It installs as a full-screen app and works offline afterward.

From then on, every `git push` updates the live app; reopen it on the phone to get the new version. Campaign data lives in the phone's browser storage and survives updates.

## Development

Requires Node 18+.

```bash
npm install
npm run dev       # dev server with hot reload
npm run build     # typecheck + production build to dist/
npm run icons     # regenerate PWA icons from the inline SVG
```

## Architecture

```
src/
  data/
    rime-data.js     # carried-forward module content (NPCs, quests, towns…)
    index.ts         # typed facade — the app imports seed data from here
  state/
    schema.ts        # versioned state shape + weather definitions
    migrations.ts    # numbered upgrade steps; never silently breaks a save
    store.ts         # Preact signal + patch() + debounced autosave (400ms,
                     #   flushes immediately on tab hide/close)
  components/        # shell: Starfield, Header (weather strip), BottomNav
  screens/           # one module per tab
  styles/
    tokens.css       # the design system — every color/size decision lives here
    base.css         # shell, cards, badges, nav
```

**State** lives in `localStorage` under `fmdm_state_v1`, versioned and migrated on load. A corrupt save is backed up to `fmdm_state_v1_backup` rather than destroyed. The D&D 5e API cache (Phase 5) will live in IndexedDB via `idb-keyval`, with the service worker also caching API responses for offline use.

## Design system

Fate Direct dark-cover palette as the ground, frost as the Rime:

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0D0E22` | deepened midnight — app background |
| `--surface` | `#171833` | brand Midnight — cards |
| `--panel` | `#2A2A52` | brand Panel — raised elements |
| `--ink` | `#E9E7F4` | Starlight — text |
| `--thread` | `#C23A52` | fate in motion: escalation, active turn, CON saves, dying |
| `--silver` | `#CDD4E0` | entities of consequence |
| `--frost` | `#9BD7E8` | the Rime: weather, cold states, focus rings |

Type: Space Grotesk (UI voice — "Direct") + Spectral (reading voice — "Fate"), self-hosted for offline.

The signature element is **the thread**: a single garnet hairline beneath the header that reappears as the active-tab indicator. Garnet is rationed — if you see it, fate is in motion.

## Phase roadmap

1. ✅ **Foundation** — shell, design system, storage + migrations, PWA, seed data
2. ✅ **Table core** — Party (PCs + allies), Initiative/Combat tracker, Encounters
3. **NPCs, Towns, Arcs** — relationship system, quick updates, thread linking
4. **Campaign layer** — Sessions, Quests, Travel, Weather system
5. **Compendium + hardening** — 5e API with offline caching, polish
