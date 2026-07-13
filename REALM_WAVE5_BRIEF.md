# Brief — Wave 5: the ground plane

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language.

Verified against `e18056c` (Waves 1–4 merged). Current state: `RealmStage` at `STAGE_W=384 / STAGE_H=216`, integer-scaled; actors carry **only an `x`** and stand on a single footline (`bottom: calc(8% - footPad*scale)`); every descriptor in `actor-sprites.ts` has `scale: 2`; the seam allow-list carries the five `inventory[]` paths from Wave 4.

## What this wave is

The stage is currently a **strip**: one horizontal line, no depth. That's why foe names collide into `BANDITBANDIT CAP`, and it's why there is nowhere to put a trophy. This wave turns it into a **ground plane** — the floor everything else in the roadmap stands on (decoration, camp objects, and eventually a walkable Realm).

## Scope fence

No PixiJS — this stays CSS/DOM. No walkable movement, no player input on the stage, no backend. Projection changes are exactly the paths enumerated in Task 6; add nothing else. Do not touch travel, encounters, or the compendium beyond Task 7.

---

## Task 1 — Sprite scale 2× → 1×

Set `scale: 1` on every descriptor in `src/data/actor-sprites.ts`. Characters go from ~19% of stage height to ~10% — the world doesn't change size, the characters do, and the world *feels* twice as large.

Audit what breaks at half size and fix it: name labels, mini-HP bars, speech bubbles, and turn markers are positioned from `footPad * scale` and `contentH * scale` and will all need their offsets and font sizes rechecked. **Labels must stay legible at the new size** — if a name label at 1× is unreadable, keep the *label* at its current size and only shrink the sprite.

## Task 2 — The depth axis

Every actor and object gains a **`y`** alongside its `x`:

- `y = 0` → the far edge of the ground (the treeline / back of camp)
- `y = 1` → the near edge (foreground)

**Screen mapping.** Define a ground band on the 384×216 canvas — the walkable snow, roughly the bottom third; measure it against the existing backgrounds rather than guessing. `y` interpolates linearly between `groundTop` and `groundBottom`. The existing footline becomes `y ≈ 0.5`, so nothing jumps.

**Depth sort (painter's algorithm).** Render order is `y` ascending — higher `y` draws later, therefore in front. Implement with `z-index: round(y * 1000)` on each positioned actor. This is what lets a PC walk *behind* a tent and in front of a campfire.

**Perspective scale (subtle — do not overdo).** `drawScale = lerp(0.85, 1.0, y)`. Far actors are slightly smaller. Keep it gentle; this is depth cueing, not a 3D camera. Because pixel art must not be resampled at fractional sizes, apply this via CSS `transform: scale()` on the actor wrapper (which is GPU-composited and stays crisp), never by changing the sprite's pixel dimensions.

## Task 3 — Spread the actors out

Rework the position functions (`homeX`, `combatX`, and the ally roam modes) to place actors in **two dimensions**:

- **Camp:** the party spreads across the ground plane in a loose cluster — varied `y`, not a rank. Seeded and deterministic, same as today.
- **Combat:** party occupies the left-ish region, foes the right-ish, but **both scatter in `y`** rather than forming two lines. This directly fixes the name-collision in Ben's screenshot.
- **Ally roam modes** (`pc` / `party` / `free`) now roam in `x` *and* `y`. `free` should genuinely wander the plane.

Keep every position seeded from the existing deterministic sources — no new randomness, and the sim tests must stay reproducible.

## Task 4 — Fix the giant emoji foes 🐛

**Bug in Ben's screenshot:** un-descriptored foes (the bandits) render as emoji tokens *twice the size of the actual PC sprites* — giant floating swords. The token font-size is scaled off the sprite scale instead of a token scale.

Fix: emoji tokens size to roughly the **content height of a 1× descriptor sprite** so a bandit token and a wolf sprite read as the same species of thing. Preserve the `hpState` tint and the `down` 💀-fade.

## Task 5 — Trophies and camp objects

This is Pillar 1 — *"we take the dragon head!"* — finally rendering.

**Schema.** `OwnedItem` (schema.ts:280) gains:

```ts
display?: { x: number; y: number };   // placed in the world. absent = in the pack, not on display.
```

Placement is **DM-authored (Canonical)**, per Ben's decision — *"start with me, open it up later."* Player rearrangement is a later wave and will need the Expressive domain and a backend; do not build toward it now beyond keeping this field self-contained.

**DM UI.** In the Party screen's stash/items rows, the `⋯` menu gains **Display in camp ▸**, opening a small **placement sheet**: the 384×216 stage rendered as a picker, tap a spot to set `(x, y)`, drag to adjust, plus a **Remove from display** action. Show the item's emoji at the tapped position with the same depth-scale it will have in the world, so what he sees is what lands.

**Renderer.** `RealmStage` draws every item with a `display` position as a ground object: emoji at the depth-appropriate scale, y-sorted with the actors (so a PC can stand in front of the skull), with a tap/hover label showing its name. Objects never move — they are furniture, not actors.

## Task 6 — Projection: two paths 🔒

- `PvItem` gains `display?: { x, y }`.
- **Seam allow-list: add exactly `inventory[].display.x` and `inventory[].display.y`.** Nothing else. Test A must fail before, pass after.
- The `notes` sentinel stays untouched.

The Realm page's Pack section should now show a small 🏕 marker on displayed items — *"this one's in camp."*

## Task 7 — Monster sprites (Ben's QA #2)

Same pattern as the NPC sprites from Wave 4:

- `CustomMonster` (schema.ts:210) gains `sprite?: string`.
- `AppState` gains `monsterOverrides: Record<string, string>` — monster id → descriptor id — mirroring the existing `npcOverrides` pattern. This is how a *preset* Monster Manual entry gets a sprite without editing seed data. Migration default `{}`.
- The **same sprite-picker component** appears in the Bestiary detail sheet (the expanded card in Ben's screenshot) and in the custom-monster editor. Do not build a third picker.
- **Foe resolution order:** `monsterOverrides[id]` → `CustomMonster.sprite` → descriptor `matches` on name → emoji token.
- No projection change — combatant sprite resolution already flows through allowed paths.

## Task 8 — Initiative rows (Ben's QA #1)

Wave 4 over-condensed: names truncate to single letters (`B`, `B`, `G`, `K`) because the HP bar steals their width.

Restack the row: **sprite thumbnail · name on top · slim HP bar underneath.** The bar shrinks (its *color* carries the signal, so it doesn't need the width); the name gets a full line and stops truncating. Foes keep the masked `HEALTHY` chip — that masking is the seam working and must survive. Keep the active-turn ▶ and `NEXT` badge unmistakable.

---

## Verify before you push

- `npm run build` green — seam tests pass with **exactly two** new allow-list paths.
- Depth: a PC positioned at high `y` visibly draws *in front of* a camp building; at low `y`, behind it.
- Scale: characters read as ~10% of stage height and the world feels roomy; name labels still legible.
- Emoji foes are the same visual size as sprite foes — no giant swords.
- Trophies: place an item in camp, publish, confirm it appears in the Realm on a phone and survives a reload.
- Initiative: full names, no single-letter truncation.
- Regenerate `public/snapshot.json` with one displayed trophy so the feature is visible on first open.

## Report back in plain language

1. What the ground band is (the y=0 and y=1 screen positions) and how depth-sorting works now
2. Where **Display in camp** lives and what the placement sheet looks like
3. Where monster sprites are set, and the resolution order
4. The two allow-list paths, verbatim
5. A demo script: display a trophy, publish, open on a phone
6. Anything you couldn't do
