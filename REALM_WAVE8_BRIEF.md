# Brief — Wave 8: sprite completion, boss fixes, Places tab, quest UX

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language.

Verified against `e2ad369` (Waves 1–7 merged). This wave is completion and polish — **no backend, no new architecture.** The two new features Ben proposed (player co-presence, shared journal) are being designed separately and are NOT in this wave.

## Scope fence

No PixiJS. No player-writable state. **Projection: zero new seam paths** — if Test A demands one, stop and report. Everything here is DM-side or render-side. Do not hand-author new tile scenes (a Tiled pipeline is coming in a later wave — don't create scenes you'll redo). You MAY fix roofs on existing scenes.

---

## Task 1 — Boss animation bugs (QA #8, #9)

**1a — Frost guardian doesn't walk.** It has a walk anim (`row: 1, frames: 10, sheetW: 3072`). Two things to check:
- **Trigger:** `pickPose`/roam only requests `'walk'` on `map`/`road` scenes or during ally roam (realm-stage.tsx ~87–90). A boss standing in a combat scene rarely gets `walk`. Confirm the frost guardian is actually *being asked* to walk in the context Ben sees it; if the issue is that combat actors never walk, that's the real bug — make combat actors use their walk anim during their idle drift.
- **Step math:** the CSS `--realm-to` end-position uses `frameW`, but the walk row's frames may differ from idle's. Verify the `steps()` count and `--realm-to` distance both use the *walk* anim's frame count against the correct `sheetW`, so the row plays cleanly without bleeding the next row.

**1b — Bringer of Death doesn't walk + missing picker icon.**
- Walk: same trigger check as above.
- Missing icon: the picker thumbnail reads the idle anim's first frame. `bringerIdle` exists (`idle.png`, 8 frames). Confirm the thumbnail crops to frame 0 at the right `frameW` — if the thumbnail shows nothing or the whole strip, the picker's crop math is the bug, not the asset.

**1c — Bringer offset** (from Wave 7 QA, verify it stuck): confirm `footOffsetX` centers it.

## Task 2 — Sprite scale tweaks (QA #1, #2)

- **Cat:** displays wrong AND should be half size. The cat descriptor uses multi-file anims (`idle.png` 640×64 = 10 frames, `walk.png` 960×64 = 15 frames). "Displays wrong" is likely a frame-count mismatch — **re-measure each cat sheet's true frame count** (width ÷ frameW) and correct the descriptor. Then set `scale: 0.5` (or halve via a render scale if 0.5 causes sub-pixel issues — keep it integer-friendly by halving the frame box instead if needed).
- **Demon:** double its size — `scale: 2`.

## Task 3 — Register the unused dungeon pack (QA #10, #11)

`More Sprites.zip` contains a large **16×16 dungeon character set** at the archive root, already in the app's naming convention (`{name}_idle_anim_f0..3`, `{name}_run_anim_f0..3`). None are registered. Add descriptors for all usable ones — these are 4-frame idle + 4-frame run, identical in shape to the working `ice_zombie`:

angel, big_demon, big_zombie, chort, doc, dwarf_m, dwarf_f, elf_m, elf_f, imp, knight_m, knight_f, lizard_m, lizard_f, masked_orc, necromancer, ogre (if distinct from existing), orc_shaman, orc_warrior, pumpkin_dude, skelet, tiny_zombie, wizzard_m, wizzard_f, wogol, zombie, plus the slimes (muddy, swampy, slug, tiny_slug).

**Measure each** (`frameW/frameH/contentH/footPad`) — don't guess. Assign categories (`npc` for dwarves/elves/wizards/knights, `monster` for demons/zombies/orcs/slimes). Give sensible `matches` patterns. Also **finish the Retro Wildlife pack** — beetle and snake are present but unregistered (the bear from the same pack works).

**Do NOT** attempt the "Basic Asset Pack" (dragons/humanoids/vermin) — those are `.aseprite`/`.gif` only and need manual export. Skip and note in your report.

Report the final descriptor count.

## Task 4 — The Places tab (QA #6)

Ben needs non-town locations (Kelvin's Cairn, Sea of Moving Ice, the Spine of the World, etc.) as first-class entries, the way towns are.

- Add a **Places** tab to the World screen, immediately right of Towns.
- **Data source:** the 10 landmarks already pinned in `src/data/map.ts` (`kind: 'landmark'`) are the seed list. Each Place card shows: name, a description/notes field, party standing (reuse the town standing control), NPCs present here (reuse the town NPC-linking UI), and related quests.
- **Schema:** add a `places: Place[]` collection to `AppState` (migration default: seed from `MAP_PLACES` landmarks). `Place = { id, name, notes, standing, npcIds: string[], questIds: string[], visited }` — mirror the Town shape where it makes sense, minus town-only fields (population, speaker, key locations).
- Places are **DM-authored, Canonical.** They may surface to the Realm later, but **this wave adds no projection** — keep them DM-only for now.

## Task 5 — Quest UX (QA #4, #5)

**5a — Open a quest to advance it from the Session/Progress view (QA #4).** Currently a chapter's linked quest is shown but tapping it only opens the beat's edit popup. Make the quest row itself tappable to **advance its status** (dormant → active → resolved), or open a small quest-status control — the same tap-to-advance that exists in the chapter checklist. Ben's complaint: he sees the linked quest but can't act on it from there.

**5b — Completed quests cross off in their town (QA #5).** A quest has a `town` field. In the Town card's "Quests" list, a quest with `status === 'resolved'` renders **struck through and dimmed**. Same treatment anywhere a town's quest list appears. This is pure render — the data already links quest→town.

## Task 6 — Travel time in hours (QA #7)

Travel currently reports whole days. Ben wants hours, because the party doesn't always travel a full 8-hour day.

- In `map.ts`, expose the raw travel time in **hours** (define a travel day as **8 hours**: `hours = (miles / MILES_PER_DAY_NORMAL) × terrain × pace × 8`).
- The MapPicker estimate shows hours; **when hours > 8, also express it as days** ("~14 hours · about 2 days of travel"). Under 8 hours shows just hours ("~5 hours on the trail").
- Keep the existing `journeyDays` for the actual day-advancement mechanic (rations/weather tick per day) — this is a *display* change plus an hours accessor, not a rework of the travel clock. Round hours sensibly (nearest half or whole hour).

---

## Verify before you push

- `npm run build` green. **Seam tests pass with ZERO new allow-list paths.**
- Both bosses walk during their drift, and the bringer has a picker icon.
- Cat renders correctly at half size; demon is doubled.
- New dungeon sprites appear in the picker under the right categories and render in the Realm.
- Places tab lists the landmarks; adding an NPC/quest/standing to a Place persists.
- A resolved quest shows struck-through in its town.
- Travel estimate reads in hours, converting to days past 8h.
- Regenerate `public/snapshot.json`.

## Report back in plain language

1. What the two boss bugs turned out to be
2. Final sprite count, and confirmation the cat/demon scales are right
3. What the Places tab shows and how it differs from Towns
4. How advancing a quest works now from the session view, and where completed quests cross off
5. A travel example in hours (e.g. Bryn Shander → Sea of Moving Ice)
6. Confirmation zero seam paths were added
7. Anything you couldn't do — explicitly including the skipped Basic Asset Pack
