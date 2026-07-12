# Brief — Wave 1: Realm rename, TV panel refactor, QA sweep, combat scene, seam tests

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works entirely through the deployed GitHub Pages site and his phone. Report back in plain language: what to open, what he should see, anything you couldn't do.

All facts below were verified against a clone of `main` taken today (HEAD `3541c51`). Where I cite a line number, it's from that clone — re-locate if drift, but don't re-derive the conclusions.

---

## Scope fence

**DO NOT:** touch travel, the World▸Travel journey logic, `TOWN_DISTANCES`, encounter systems, or the Progress/milestone data model — those are Wave 2 and have open design questions. Do not reimplement the diorama. Do not add PixiJS or new renderers. Do not touch sprites/atlases. Do not refactor unrelated code. Do not modify `projectPlayerView`'s *filtering* (you will extend its output shape only where a task explicitly says so).

**DO:** the twelve tasks below. They are ordered so the rename lands first (everything else builds on it).

---

## Task 1 — The Realm rename

"Idle" was a placeholder name. The product concept is now **the Realm**: *the Realm is a place, the TV is a live window onto it, the phone is a photograph of it.*

- Rename export `IdleStage` → `RealmStage` (file `src/tv/idle.tsx` → `src/tv/realm-stage.tsx`), update all imports (`src/tv/app.tsx`, `src/realm/main.tsx`).
- `slotView: 'idle'` → `'realm'` across: `PlayerView` union (`src/tv/projection.ts:33`), `tv/app.tsx` conditionals (lines ~190, ~273), TvPanel chips, and `TvSettings` in the schema.
- **Migration:** stored saves carry `tv.slotView === 'idle'`. Add a migration step in `src/state/migrations.ts` (the system exists — follow its pattern, bump version) mapping `'idle'` → `'realm'`. The published `public/snapshot.json` also carries the old value; regenerate it at the end (Task 12).
- CSS class names (`tv-idle-*`) may stay as-is to keep the diff small — cosmetic rename is not worth the churn.

## Task 2 — TV panel restructure: three axes + header

Verified current state (`src/components/TvPanel.tsx` ~85–140): one chip row mixes `scene | idle | video` with the `idleFull` toggle and a Celebrate one-shot; Connect to TV sits at the very bottom (~line 201).

Rebuild the panel top-to-bottom as:

1. **Header row (pinned at top):** room code input + status pip + **Connect to TV / Disconnect** button. This replaces the bottom placement — the user called it out as inconvenient.
2. **Display** — radio chips: `🖼 Scene art · ⛺ The Realm · 📺 Video`. (One `slotView`.) Video stays disabled without a `youtubeId`.
3. **Layout** — chips `Inset · Fullscreen` bound to `idleFull`, enabled only when Display = The Realm.
4. **Moments** — one-shot buttons, visually distinct from the radios (they *fire*, they don't *select*): `🎉 Party cheer · 👋 Wave · 😈 Foes taunt` (the last enabled only during combat). These use the new poke shape (Task 3).
5. **Scene art (collapsed).** Category chips only (`✨ Pixel · 🏠 Locations · 🗺 Maps · 👹 Monsters · 🧙 NPCs`) with **no grid rendered until a category is tapped**; tapping again collapses. Remove the `All` chip (it's what forces the giant grid). **Auto stays**, pinned above the chips as its own always-visible tile, relabeled: `✨ Auto — follows the weather and your journey`.
6. Ambience (YouTube) — Task 8.
7. Publish to the Realm — keep as built.

Tighten paddings throughout; the whole panel should feel one size smaller.

## Task 3 — Generalize the poke (Moments) shape

Current: `poke: { seq, pcId, kind: 'wave' | 'cheer' }` — `pcId: ''` means everyone.

New: `poke: { seq: number; target: 'party' | 'foes' | 'everyone' | string /* pcId */; kind: 'wave' | 'cheer' | 'flinch' | 'taunt' }`.

- Migration: `{ pcId: '' }` → `target: 'party'`; `{ pcId: x }` → `target: x`.
- Update `TvSettings`, `PlayerView`, projection passthrough, and the `pokeActive` plumbing in `tv/app.tsx`.
- `RealmStage` honors `target`: `'party'` hits PCs, `'foes'` hits non-friendly combatants (Task 7), `'everyone'` hits all, a pcId hits one actor.

## Task 4 — Auto-fired flinch on damage

When a PC's HP *decreases* (the −, −5 handlers on the party card, and the combat tracker's damage path if it patches HP through a different call site), fire `poke { target: <pcId>, kind: 'flinch' }` automatically. No new button — the damage tap *is* the trigger.

The atlas has no flinch frames (`POSE_FRAMES` = idle/walk/sit/sleep/shiver/down/cheer/wave). Implement flinch as **CSS only**: a ~500ms shake + red flash class on that actor, keyed off `poke.seq`. No art changes.

## Task 5 — Party card: HP controls + DM notes

- Remove the numeric HP input (the `10 ↕` spinner). Keep `−`, `+`, `−5`, `+5`, `Full`.
- Add `notes: string` to `PC` in the schema (migration: default `''`). Render in the **expanded** card as a textarea labeled **"Notes (DM only)"**, autosaving via the normal `patch()` flow.
- **`PC.notes` must never be projected.** Do not add it to `PvPc`. Task 6 enforces this permanently.

## Task 6 — The seam tests (this task gates every future deploy)

Create `tests/seam.mts`, run with `vite-node` (mirror `tests/session-sim.mts`, which already registers happy-dom).

**Fixture:** start from the app's seeded state, then inject sentinels into every DM-only field: `PC.notes = 'SEAM_PC_NOTES'`, a session with `'SEAM_SESSION_SECRET'` in every text field, a **dormant** quest named `'SEAM_DORMANT_QUEST'` with sentinel `trigger/development/notes`, an arc with sentinel `lastDev/nextTrigger/notes`, an `npcOverride` and a `customMonster` carrying sentinel strings, sentinel entries in the weather and travel logs. Keep `combat.active = false` in the fixture so no monster name is legitimately projectable.

**Test A — structural allow-list.** Recursively walk `projectPlayerView(fixture)` and assert every key path is on an explicit allow-list transcribed from today's `PlayerView` (v, mode, day, weather.{id,name,icon,conSave}, location, travel.{origin,dest,day,totalDays}, resources.{gold,rations,partySize}, sceneId, youtubeId, mediaVisible, slotView, idleFull, poke.{seq,target,kind}, party[].{id,name,cls,hp,maxHp,conditions[],inspiration,deathS,deathF,down}, allies[].{id,name,emoji,hpState,conditions[],linkedPcId,down,deathS,deathF}, combat, quests[].{id,name,town,status,mainHook}, sentAt). An unknown path **fails the test and prints the path** — this is the tripwire for the field someone adds in three months.

**Test B — sentinel corpus.** `JSON.stringify` the projection and assert **zero** sentinel strings appear, and that no dormant quest's name appears.

**Wire it into the build:** `package.json` → `"test:seam": "vite-node tests/seam.mts"`, and change `build` to `tsc --noEmit && vite-node tests/seam.mts && vite build`. A leak must fail the deploy, not a code review.

## Task 7 — Combat mode in RealmStage

When `v.mode === 'combat' && v.combat`, the Realm renders the fight as ambience (this is not a VTT — everyone just mills about in battle):

- **Friendlies** whose id matches a `v.party` entry render as normal atlas actors (reuse the class→row mapping). Friendly non-PCs (allies) render as their existing critter/emoji treatment.
- **Foes** render as **emoji tokens** (`PvCombatant.emoji` already ships), sized ~2× the critter size, name label underneath — the `"???"` masking already happens upstream in projection. Tint by `hpState` (reuse the existing `hp-critical` filter pattern); `down` foes fade to ~30% opacity with a small 💀.
- Loose formation: party drifting in the left half, foes in the right, mild mingle — not two rigid ranks.
- **Active turn:** the active combatant steps forward a few px with a small ▼ above; `next` gets a faint one.
- **Speech bubbles:** extend the seeded `pickBubble` pattern for foes — sparse, deterministic: `arrrg`, `grr`, `!`, `⚔️`, `😤`. Party keeps its existing bubbles (worry 😟 when someone's down already works).
- A small `Round N` chip in a corner.
- Moments: `target: 'foes'` makes foes taunt/cheer (the 😈 button from Task 2); `'everyone'` includes them.

No new sprites anywhere in this task — foes are tokens until the render-scale decision lands (separately in flight).

## Task 8 — Fix YouTube ambience (root cause verified)

**Diagnosis:** `parseYouTubeId` (TvPanel.tsx:17) is correct; Play patches state correctly. The player (`AmbiencePlayer`, `tv/app.tsx` ~286) autoplays with `mute=1` — mandatory for autoplay — and unmuting requires a click **on the TV's YouTube player**. But in audio-only mode the iframe is collapsed to a 2px, opacity-0 speck: **unclickable, therefore permanently silent.** Ambience mode cannot produce sound by construction. That's the whole bug.

**Fix:**
- Add `enablejsapi=1` (and `origin`) to the embed URL. Keep `mute=1` autoplay.
- The **TV app** (not the iframe) renders a `🔊 Tap once for sound` pill whenever a `youtubeId` is set and audio hasn't been unlocked this session. One tap = the user gesture on the correct device; on tap, send the IFrame API commands to the player (`unMute`, `setVolume(60)` via `postMessage` to the iframe contentWindow) and hide the pill for the rest of the session.
- The pill must appear in **both** visible and audio-only modes — in audio-only it's the only possible unmute path.
- Update the panel's helper copy: "Starts muted — tap the 🔊 pill on the TV once to enable sound."

## Task 9 — Weather sheet becomes display-only

The header's "The sky over Icewind Dale" sheet currently duplicates the World▸Weather controls (conditions + Roll + Day + New day). Strip it to: current condition (icon + name) and its table mechanics (CON save line etc. from the `WEATHER` table), plus a link/button "Set on World ▸ Weather". Remove Roll weather, Day, and New day from the sheet only — the World page keeps all of it.

## Task 10 — World ▸ Weather page polish

- Condition chips compact enough to sit on **one row** (icon + short label; "Auril's Wrath" can truncate to fit).
- Weather log rows get a small ✕ to delete an entry (splice from `weather.log` via `patch`). Sort the log consistently (newest first) — the current render interleaves days (D4, D3, D5, D5…).

## Task 11 — World ▸ Travel Supplies visual pass

Verified problem: three different control paradigms in one card — custom steppers for rations, a native number spinner for party (off-theme), and a five-element gold row with misaligned baselines.

Build one small shared `Stepper` component and use it for all three: consistent button size, `tabular-nums` value, aligned baselines. Gold becomes a segmented `[−10][−1][ value ][+1][+10]`. Do not touch the journey planner logic — layout/styling only.

## Task 12 — Centered modal + regenerate snapshot

- The `Sheet` component gets a `center` variant: on viewports ≥768px it renders as a centered modal; below that it stays a bottom sheet. Apply to the **New session** dialog (the user's specific complaint). Other sheets unchanged.
- Finally: regenerate `public/snapshot.json` via the existing seed script so the published shape carries `slotView: 'realm'` and the new poke shape.

---

## Verify before you push

- `npm run build` passes — which now *includes* the seam tests. If Test A fails on a path you added (e.g., poke.target), that's the allow-list needing your addition, deliberately: update the list *consciously*.
- `dist/` contains `realm.html` and the regenerated `snapshot.json`.
- Migration check: load a save with `slotView:'idle'` and old poke shape → app boots, TV panel shows The Realm selected.
- If you can render headlessly: combat fixture → foes visible as tokens, party as actors.

## Report back in plain language

1. What changed in the TV panel, top to bottom
2. Where the 🔊 sound pill appears and the one tap he must do on the TV
3. Confirmation the seam tests run on every build, and what they caught during development (if anything)
4. The migration performed on his existing save
5. Anything you couldn't do
