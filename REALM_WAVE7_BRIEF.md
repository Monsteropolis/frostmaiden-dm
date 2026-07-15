# Brief — Wave 7: the frame-clip fix, obstacles, and finishing the sprite library

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language. He is happy with the direction — this wave is polish and completion, not new systems.

Verified against `0f6f6b9` (Waves 1–6 merged). The renderer already supports multi-row sheets (`anim.row` → `backgroundPositionY`, line 287) and `livelySprites()` auto-registers 50 NPC strips. The problems below are specific and diagnosed; don't re-architect.

## Scope fence

No PixiJS. No walkable movement. No backend. **Projection: zero new seam paths** — nothing here crosses the boundary; if Test A demands a new path, stop and report. Don't touch travel, encounters, sessions, or items.

---

## Task 1 — The frame-clip bug 🐛 (root cause of QA #2, boss "shows whole sheet")

**Diagnosis, confirmed against source.** `SpriteActor`'s root div (realm-stage.tsx ~305) sets `width/height` to one frame and animates `background-position`, **but never sets `overflow: hidden`.** With no clip, the whole sheet bleeds outside the frame box. It looks fine for small single-file sheets (one frame ≈ whole image) and catastrophic for the 3072×640 frost guardian — you see all 16 columns at once (Ben's image 2). The descriptor is *correct*; the box just doesn't clip.

**Fix:** add `overflow: hidden` to the `.realm-sprite-actor` sprite box (and the same for the atlas-actor and foe-token boxes if they share the defect — check all three render paths). Verify the frost guardian now shows one 192px frame animating through idle, and that **every other sprite still looks right** — this touches all of them.

This one line is likely the single highest-value change in the wave. Do it first and eyeball the whole cast.

## Task 2 — Placed objects are obstacles (QA #2, "bear goes behind the rock")

Right now trophies/objects only affect **draw order** (depth sort), not **movement**. Actors drift through them (Ben's bear clips the rock).

- Give tile `object` cells and displayed items an optional **footprint** (the ground cells they occupy — default the single cell at their base).
- In the ground-plane position functions (`homeX`/roam/`combatX`), treat occupied footprints as **soft obstacles**: an actor's drift target reflects/steers around them rather than passing through. Keep it seeded and deterministic — no per-frame physics, just don't path a drift target onto an occupied cell.
- This stays *ambient* — actors mill and avoid; they don't navigate. That's enough to read as "the rock blocks the path."

## Task 3 — Finish the sprite library (QA #4, #5, #6)

Ben is right: most of the provided art isn't in. Only 8 hand-authored descriptors + 50 lively strips landed. Missing packs are still sitting in the zips.

**Extract and register everything usable, following the measured-not-guessed rule:**

- **The cat** — `sprites-src.zip` → the Tiny/free 2D cat pack (Ben specifically asked twice). Register as `beast`, `matches` for cat/feline/familiar. This is Chillitita's intended sprite.
- **The ice zombie** — `More Sprites.zip/frames/ice_zombie_anim_f0..3.png` (4-frame idle). Register as `monster`, matches ice/frozen/zombie.
- **Mana Seed** and **FreeCharactersAnimationsAssetPack** character bases — register the usable hero/townsfolk sheets.
- Anything else measurable in either zip that maps to a `hero/npc/monster/beast/boss` category.

**The corruption tripwire still applies** — reject any sheet with dimensions divisible by 28 and report it. **Measure `frameW/frameH/contentH/footPad` per sheet; never guess.** For multi-row sheets, set `row` per anim (now that Task 1 makes rows actually work). Report the final descriptor count.

## Task 4 — Bringer of Death centering (QA #9)

The bringer sprite renders offset. Its `contentH: 54, footPad: 1` are likely mismeasured, or the content isn't horizontally centered in its 140px frame. Re-measure the content bounding box across its idle frames and set `footPad` (and a new optional `footOffsetX` if the content is off-center) so it stands centered on its position like the other actors.

While here, **spot-check the footPad of every boss/large sprite** — they're the ones where a few px of mismeasurement is visible.

---

## Task 5 — Labels: legibility (QA #1, #3)

Three separate fixes to the in-world name labels:

**5a — Position under the sprite, not over it (QA #3).** Labels currently overlap the sprite (Ben's images 1, 3). Anchor each label *below* the sprite's foot line — `top: 100%` of the frame box plus a small gap — so it never covers the character. Account for the sprite's transparent padding so the gap is visual, not geometric (use `contentH`/`footPad`, which you now have accurately).

**5b — A more legible font (QA #1).** The current pixel font is hard to read even outlined. Pick a compact, high-legibility bitmap/pixel font with clear letterforms at ~7–9px (e.g. a "m5x7"/"m6x11"-style or a clean small sans like a subset of the existing UI font). It must read cleanly *with* the black outline against both snow (light) and cave (dark). Apply only to in-world labels — don't restyle the whole app.

**5c — Keep the 1px outline** from Wave 6, but verify it's a true 4-direction outline (`-1,-1 / 1,-1 / -1,1 / 1,1`), not a soft shadow. Consider a subtle semi-transparent dark pill behind the text as a fallback if the outline alone still isn't enough on busy tile ground — your judgment on which reads better.

---

## Task 6 — Initiative rail polish (QA #7, #8)

**6a — Box clipping (QA #7).** The bottom of the initiative box is cut off (Ben's image 4). Reduce row height slightly / fix the container's height calc so the last row and its padding are fully visible.

**6b — The HP bars are blank and static (QA #7) 🐛.** The under-name HP bars from Wave 5's restack render empty and don't move when HP changes. Wire the bar fill to `hp/maxHp` (the same value the numeric readout uses) so it fills proportionally and updates live as the DM adjusts HP. Foe rows keep the masked `HEALTHY` chip — no numeric bar for them (that masking is the seam; preserve it).

**6c — Remove the NEXT badge (QA #8).** The `>` caret below the active `▶` already marks the on-deck combatant. Delete the `NEXT` pill; keep the caret.

## Task 7 — Emote token transparency (QA #10)

The "foes taunt" (😈) and "hunger" emotes render on an opaque background block (Ben's earlier shots). Render them with a transparent background like the other speech bubbles — the emote glyph floats, no box. Match the existing bubble treatment.

---

## Task 8 — Better scenes + three more (QA #11)

**8a — Fix the roofs.** The current tiled houses are missing part of the roof (Ben's images 5, 6 — buildings look truncated at the top). This is an object-tile placement bug in the composed scenes: the upper roof row isn't placed, or is placed off the top of the 224px stage. Re-compose the affected buildings so full roofs render.

**8b — Three new scenes**, authored as data like the Wave 6 set, varied and place-like (objects at different depths, a sense of somewhere to go):
- **`town_market`** — stalls, crates, a well, market awnings (RPGW town tiles).
- **`frozen_lake`** — ice expanse, cracked-ice patches, a dock or reeds at the edge.
- **`dwarven_hall` or `cave_deep`** — RPGW_Caves interior: pillars, rubble, a chasm edge.

Reuse the Wave 6 tilemap format exactly; register in `scenes.ts`. Existing scenes keep working.

---

## Verify before you push

- `npm run build` green. **Seam tests pass with ZERO new allow-list paths.**
- Frost guardian shows ONE frame, animating — and every existing sprite still looks correct after the overflow fix.
- The cat and ice zombie are pickable in the sprite picker and render in the Realm.
- HP bars in initiative fill proportionally and move when HP changes.
- Labels sit fully below sprites, legible on both a snow scene and a cave scene.
- Roofs are complete in all town scenes.
- Regenerate `public/snapshot.json`.

## Report back in plain language

1. What the frost-guardian bug was in one sentence, and confirmation the whole cast still renders right
2. Final sprite count and which packs are now in (cat and ice zombie explicitly)
3. How obstacles work now — what a player sees when the bear meets the rock
4. Which font you chose for labels and why it's more legible
5. The three new scenes
6. Confirmation zero seam paths were added
7. Anything you couldn't do
