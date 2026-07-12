# Brief — Wave 2: World systems (travel map, Encounters tab, Progress rework)

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works entirely through the deployed GitHub Pages site and his phone. Report back in plain language.

All facts below were verified against the repo. Where line numbers drift, re-locate; do not re-derive the conclusions.

---

## Preconditions — check both, stop and report if either fails

1. **Wave 1 is merged.** Verify `RealmStage` exists and `slotView` uses `'realm'`. If not, REALM_WAVE1_BRIEF.md has not been executed — stop and say so.
2. **`icewind-dale-region.png` exists at the repo root** (1353×954 PNG, uploaded by Ben). If missing, stop and tell him exactly that filename is needed.

## Scope fence

**DO NOT:** touch `RealmStage`/the Realm page, sprites or atlases, `projectPlayerView`, or the TV panel. Do not add PixiJS. Do not refactor unrelated code. **Wave 2 makes ZERO changes to `PlayerView`** — the seam tests from Wave 1 must pass untouched. New data added here (map pins, chapter fields) is DM-only and never projected; Test A's allow-list is the tripwire proving it.

---

# Part A — Travel: anywhere to anywhere

## Verified facts

- `src/screens/world.tsx` ~381: `PACES` multipliers — cautious 1.5, normal 1.0, dogsled 0.5. `journeyDays()` looks up `TOWN_DISTANCES` (`{from,to,days}`, symmetric) and returns `max(1, ceil(days × mult))`.
- The `advance()` handler decrements rations, advances weather day, logs, and on arrival does `if (!d.towns[jj.dest]) d.towns[jj.dest] = defaultTownStatus(); d.towns[jj.dest].visited = true` — **this will pollute the towns record when destinations become landmarks. Guard it** (Task A3).
- Map calibration, measured from the printed scale bar: 0-mile tick at x≈868, 20-mile tick at x≈1163 → **295 px = 20 miles → `milesPerPx ≈ 0.0678`** at native 1353×954. Re-verify yourself (crop the region x 820–1230, y 860–940, overlay a labeled pixel ruler, read the ticks) and correct if my reading is off by more than a few px.

## A1 — Map module + gazetteer

Move the PNG to `src/assets/map/icewind-dale.png`. Create `src/data/map.ts`:

```ts
export const MAP_CAL = { imgW: 1353, imgH: 954, milesPerPx: 0.0678 /* verified per above */ };
export interface MapPlace { id: string; name: string; x: number; y: number; kind: 'town' | 'landmark' | 'custom'; }
export const MAP_PLACES: MapPlace[] = [ /* you place these */ ];
```

**Pin placement recipe** (same technique used to read the scale bar): crop a region of the map, upscale 3×, draw a pixel-coordinate grid every 25–50 px labeled with original coordinates, view it, read each town's dot to within ~4 px. Iterate per cluster. Pin **all ten towns** (Bremen, Targos, Bryn Shander, Lonelywood, Termalaine, Caer-Konig, Caer-Dineval, Easthaven, Good Mead, Dougan's Hole — pin the town *dot*, not the label) and **ten landmarks** (Sea of Moving Ice, Kelvin's Cairn, Reghed Glacier, Spine of the World — pin the Ten Trail pass, The Redrun, Maer Dualdon, Lac Dinneshere, Redwaters, Shaengarne River, Dwarven Valley — pin the feature's center or a sensible anchor).

**Derived speed:** for every `TOWN_DISTANCES` pair, compute straight-line miles from the pins; `MILES_PER_DAY_NORMAL = median(miles / tableDays)`. **Validate:** at least 3 pairs should reconstruct their table days within ±1 day using the formula below. If they don't, your pins or my calibration are off — fix before proceeding.

**Terrain multipliers:** `road 1.0 · tundra 1.5 · mountain 2.0 · sea ice 1.5`.

**Leg formula:** `days = max(1, ceil((straightMiles / MILES_PER_DAY_NORMAL) × terrainMult × paceMult))`.

## A2 — Schema: custom pins

`AppState` gains `mapPins: MapPlace[]` (kind `'custom'`), migration default `[]`. Seeded places stay in `map.ts`; only the DM's own pins live in state. Never projected.

## A3 — Travel UI

- FROM/TO become grouped `<select>`s — **Towns / Landmarks / Your pins** — plus a `🗺 Pick on map` button.
- **MapPicker sheet:** the map, scrollable, with a 1×/2× zoom toggle (keep it simple). Pins rendered as tappable dots. First tap sets origin, second sets destination (tapping a pin snaps to it; tapping empty ground drops a crosshair point). Draw the line, show a live estimate box with **terrain chips** (default: tundra; the chip row is the DM's judgment about the route — the app doesn't pretend to know). Either endpoint gets a `Save as pin…` action (name it → `mapPins`).
- **Estimate source labeling:** if both endpoints are towns present in `TOWN_DISTANCES`, use the table (existing `journeyDays`) and label it *"module road time"*; otherwise use the leg formula and label it *"overland estimate."*
- `Set out ✦` creates the same `Journey` as today (origin/dest are now any place names).
- **Fix the arrival guard:** only create/flag `towns[dest].visited` when `dest` is one of `TOWNS`; landmark/pin arrivals just log *"Arrived at X."*

---

# Part B — Encounters tab

## Verified facts

- `src/data/rime-data.js` contains **`ENC_TABLES`** — eight rollable tables: Wilderness Travel (d20), Open Tundra (d12), Bryn Shander (d12), Targos (d12), Easthaven (d10), Caer Towns (d10), Small Towns (d8), Underdark/Sunblight (d10). Rows are `{range:'1-5'|'8', text, note, type:'combat'|'noncombat'|'hazard', combatants?}` — and **row `combatants` arrays already match the `PresetCombatant` shape** (`{srcType:'monster'|'api', srcId, count:'3'|'1d4'|'1d4+1', name?, emoji?, hp?, ac?}`, schema.ts:128).
- `rime-data.js:333` — **`RIME_ENCOUNTERS`**: prebuilt encounters `{id, name, type, category:'travel'|'story'|'social', difficulty, desc, combatants[], location?}`.
- `src/screens/combat.tsx` already resolves preset combatant specs into real `Combatant`s and pushes them (`s.combat.combatants.push(...cs)` at ~477 and ~592, with auto-numbering per the pattern at line 249). **Find that resolver and reuse it. Do not write a second one.** You'll only need to extend dice-count parsing if it doesn't already handle `'1d4+1'`.

Neither `ENC_TABLES` nor `RIME_ENCOUNTERS` appears to be exported/consumed anywhere — this tab is **surfacing dormant data, not authoring content**. Export them from `src/data/index.ts` following the existing pattern.

## B1 — The tab

Add **Encounters** as a sixth World tab (after Weather).

**Section 1 — Rollable tables.** One card per `ENC_TABLES` entry: name, die badge, trigger text. A `🎲 Roll` button rolls the die (brief highlight animation lands on the matching row). Rows render with type icons (⚔ combat / ⚠ hazard / ○ noncombat). Any row with `combatants` gets **`Send to initiative ▸`**: resolve counts (roll the dice), reuse the preset resolver, push. Rows without combatants (hazards, discoveries) get a tap-to-open popup showing `text` + `note` in full. After a send, show a confirmation with a jump: *"Added 5 combatants — open Combat ▸."* **Do not auto-start combat.**

**Section 2 — Prebuilt encounters.** `RIME_ENCOUNTERS` grouped by category, difficulty chips color-coded. Combat entries → same Send to initiative. Non-combat → popup with `desc` (+ location). This is the popup summary Ben asked for.

---

# Part C — Progress rework (Ben's three decisions, verbatim)

His answers: **(1)** quest checklist auto-ticks, chapter completion stays manual. **(2)** Cold-Hearted Killer & Nature Spirits become **named beats that auto-complete via their quest**. **(3)** — render scale, not part of this wave.

## Verified facts

- Chapter seed: `src/state/schema.ts:354` — Ch1 "Ten-Towns" milestones are exactly: `'Party arrives in Icewind Dale'`, `'Cold-Hearted Killer: Sephek confronted'`, `'Nature Spirits: the awakened beast dealt with'`, `'Three or more town quests resolved'`.
- `Quest.chapter: number | null` **already exists** (schema.ts:224); seeded module quests carry it (the current milestone modal lists "Chapter 1 quests"). `Milestone` is `{label, done, notes?}` (schema.ts:246); `Chapter` is `{id, label, levels, milestones}` — **no done flag**.
- The milestone editor modal currently embeds the full chapter-quest list with tap-to-advance. That renderer moves to the chapter card (C3).

## C1 — Schema + migration

- `Milestone` gains `questId?: string | null`. When set, the beat's **done state is derived** at render time from `quest.status === 'completed'` — never stored, so it can't drift, and it un-completes if the DM reverts a quest. The manual toggle is disabled on linked beats (show a small 🔗 + quest name instead).
- `Chapter` gains `done: boolean` (migration default `false`).
- **Ch1 transformation** — apply to the seed AND to existing saves in `migrations.ts`, matching by label prefix so his real progress survives:
  - `'Party arrives in Icewind Dale'` → keep, manual (preserve `done`/`notes`).
  - `'Cold-Hearted Killer: …'` → relabel `'Cold-Hearted Killer'`, link `questId` to the quest named `Cold-Hearted Killer` (preserve notes).
  - `'Nature Spirits: …'` → relabel `'Nature Spirits'`, link to the `Nature Spirits` quest (preserve notes).
  - `'Three or more town quests resolved'` → **delete** (replaced by the derived checklist).
- Chapters 2+ milestones are untouched — Ben is happy with their curation.

## C2 — Quest ↔ chapter linking

Wherever quests are created/edited, add a **Chapter** picker (None / Ch1…ChN) writing `Quest.chapter`. Custom quests linked to a chapter appear in that chapter's checklist immediately.

## C3 — Chapter card layout (Progress tab)

Each chapter card shows, in order:

1. **Beats** — the milestones list: manual beats toggle as today; quest-linked beats render derived ✓ with 🔗.
2. **Chapter quests** — the derived checklist: every quest where `chapter === id`, name + status chip, **tap-to-advance preserved** (this is the renderer relocated from the milestone modal). Completed quests render ✓ and dim. This list *is* Ben's "quests completed, listed as they're completed."
3. **`Complete chapter ✦`** — manual, sets `Chapter.done`, marks the card. When all beats are done, give the button a subtle ready-glow; never auto-complete.

The milestone editor modal slims to: label, notes, optional **Link to quest** picker. The embedded all-quests list is removed from it.

---

## Verify before you push

- `npm run build` passes — including the Wave 1 seam tests, **unmodified**.
- Calibration validation from A1 passed (state the three pairs and their reconstructed days in your report).
- Travel sanity: Bryn Shander → Sea of Moving Ice at normal pace yields a plausible multi-day overland estimate; Bryn Shander → Targos still reads "module road time," 1 day.
- Encounters: roll Wilderness Travel until a combat row lands, send it, confirm combatants appear in Combat with correct counts, emoji, hp, auto-numbered names.
- Migration: a save containing the old Ch1 milestones (with some `done: true` and notes) boots into the new shape with progress preserved.

## Report back in plain language

1. Where the map picker is and a 15-second demo he should try (Bryn Shander → Sea of Moving Ice)
2. The calibration numbers and the three validation pairs
3. Where the Encounters tab is and what one full roll-to-initiative round trip looks like
4. What Ch1's card shows now versus before, and confirmation his existing ticks/notes survived
5. Anything you couldn't do
