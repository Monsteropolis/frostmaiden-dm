# Brief — Wave 6: tiled worlds

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language.

Verified against `9217453` (Waves 1–5 merged). Current: `RealmStage` at 384×216 with a ground plane (`y` depth, `depthZ`, `depthScale`), descriptors at `scale: 1`, backgrounds are flat PNGs. Both `sprites-src.zip` and `More Sprites.zip` are at the repo root.

## Scope fence

No PixiJS — tiles render as CSS/DOM like everything else. **No walkable player movement and no player input on the stage** — actors still drift on the ground plane. No scene *editor* UI (that's a later wave); scenes are authored as data in this wave. No backend. Projection: **zero new paths** — `sceneId` already crosses the seam, and a tiled scene is just another scene id.

---

# Part A — The tilemap scene system

## Why

Backgrounds are currently flat images: a painted backdrop with nothing in it. Tiles let a scene be *composed* — a town with buildings you can stand behind, a cave with walls, a camp with tents and crates. This is the *Link to the Past* visual interest Ben is after, and it's the last piece of the ground plane's promise.

## A1 — Intake and measure

Both zips contain tilesets. From `sprites-src.zip`: the **Mana**, **Retro**, and **Tiny** packs. From `More Sprites.zip`: **RPGW_Caves_v2.1**.

**Measure the tile size before anything else** — open each tileset PNG and determine its grid (16px and 32px are both likely; the packs may disagree with each other). **The corruption tripwire still applies:** reject any sheet whose dimensions are divisible by 28 and report it.

Copy the tilesets you use to `src/assets/tiles/<pack>/`. **Ignore `_PSD/` folders entirely** — those are editable source files, not assets.

## A2 — Stage geometry: 216 → 224

`216` is not divisible by 16 or 32, so no tile grid fits it. **Change `STAGE_H` from 216 to 224.** That gives an exact grid either way:

- 16px tiles → **24 × 14**
- 32px tiles → **12 × 7**

Integer scaling still works. Existing 384×216 flat backgrounds render anchored to the bottom with the 8px surplus at the top (or letterboxed — your call, whichever looks right). Re-measure the ground band (`groundBottomPct`) against the new height so actors don't shift.

## A3 — The tilemap format

```ts
export interface Tileset { id: string; src: string; tile: number; cols: number; }
export interface TileLayer {
  kind: 'ground' | 'object';   // ground draws behind all actors; object y-sorts with them
  tiles: (number | null)[];    // row-major, length = gridW * gridH; null = empty
}
export interface TileScene {
  id: string; label: string; tileset: string;
  gridW: number; gridH: number;
  layers: TileLayer[];
  ground?: { top: number; bottom: number };  // optional per-scene walkable band override
}
```

**Rendering.** The `ground` layer is a plain grid of positioned divs (or one div per tile with `background-position` into the tileset) — drawn behind everything, no sorting. The **`object` layer participates in depth sorting**: each non-null object tile gets a `y` derived from its grid row, and therefore a `z-index` via the existing `depthZ()`. This is what lets a PC walk *behind* a building and in front of a crate — the whole point of Wave 5's ground plane finally paying off.

Reuse `depthZ()`; do not invent a second sorting system.

## A4 — Author three scenes

Ben cannot author these by hand, so **you build them as data** and he picks them from the existing scene picker:

1. **`camp_winter`** — a small snowy camp: tents, a fire, crates, a few trees. The default home scene.
2. **`town_tentowns`** — a Ten-Towns street: buildings with doorways, a path, a well, lamps. This is the "explorable town" Ben asked for.
3. **`cave_dark`** — using RPGW_Caves: walls, a floor, some rubble.

Compose them thoughtfully — **vary the object placement so the space reads as a place, not a row.** Buildings at different depths, a path implying somewhere to go. Register them in `scenes.ts` alongside the flat backgrounds; they are just scene ids, so the scene picker, the Auto resolver, and the projection all work unchanged.

Existing flat scenes keep working. This is additive.

---

# Part B — The sprite library grows up

## B1 — Intake `More Sprites.zip`

Packs: **Bringer-Of-Death**, **Frost_Guardian_FREE_v1.0**, **Lively_NPCs_v3.1** (53 sprite sheets), **RPGW_Caves_v2.1** (Part A), and `frames`.

Register the character packs as descriptors following the existing pattern in `actor-sprites.ts` — measure `frameW`, `frameH`, `contentH`, `footPad` from the actual files; never guess. **Prefer the `sprite sheets/` folder** over `individual sprites/` where a pack offers both.

Frost Guardian and Bringer of Death are obvious Frostmaiden foes — make sure their `matches` patterns catch sensible monster names.

## B2 — Categories (Ben's QA #1)

With 53 NPC sheets landing, a flat picker grid is unusable.

`ActorSprite` gains `category: 'hero' | 'npc' | 'monster' | 'beast' | 'boss'`. The sprite picker (used in the character, ally, NPC, and monster editors — **one component, four surfaces**) gains category tabs and a search field. Default the picker's tab to the category most relevant to its surface — the monster editor opens on Monsters, the NPC editor on NPCs.

## B3 — Clean the wolf sprite 🐛 (Ben's QA #6)

`src/assets/actors/wolf/Wolf.png` has a stray line of black pixels rendering as part of the sprite. Find it (likely a frame-boundary artifact or a non-transparent row), make those pixels fully transparent, and **verify no other descriptor has the same defect** — check each sheet's frame edges programmatically for opaque rows/columns that shouldn't be there. Never resample; only alpha-clear the offending pixels.

---

# Part C — QA fixes

## C1 — Name labels legible on any background (QA #2)

Labels currently use `text-shadow: 0 1px 2px rgba(0,0,0,...)` — a drop shadow, which washes out against the pale snow backgrounds (see Ben's screenshot: `GERD` and `KNIF` are barely readable).

Replace with a true **1px black outline** on all in-world labels (actor names, item labels, the round chip):

```css
text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
```

Use `paint-order: stroke fill` with `-webkit-text-stroke` if it renders more cleanly at small sizes — whichever is crisper. The label must be legible on white snow *and* on a dark cave floor.

## C2 — Session text boxes (QA #3)

The session editor's textareas (Hook, Planned encounters, Secrets, What happened) are too small for how much Ben writes, and they clip.

- Raise the default height substantially (roughly double).
- Make them user-resizable (`resize: vertical`).
- **Persist the resized height per session, per field**, so his sizing survives a reopen. Store it on the `Session` object (e.g. `uiHeights?: Record<string, number>`) — DM-only, **never projected**, and the seam's Test A allow-list is the tripwire proving it.

## C3 — The missing glyph 🐛 (QA #4)

The **Hide on TV** button renders a `?`-in-a-box on Android — a missing emoji glyph (circled in Ben's screenshot). Replace it with an inline SVG icon (an eye-with-slash), not an emoji. **Audit every other emoji used as UI chrome** — buttons, tabs, status chips — and replace any that aren't universally supported with SVG. Emoji used as *content* (item emoji, combatant tokens) stay as they are.

## C4 — Map dots (QA #5)

The map picker's location dots are so large they obscure the terrain and make nearby ground untappable (see Ben's phone screenshot — the dots swallow Bryn Shander).

Shrink the visual dot substantially (target ~⅓ of the current area) **while keeping the tap target itself large enough to hit comfortably** — a small visible dot with a larger invisible hit area. Selected/origin/destination states stay clearly distinguishable at the smaller size. Tapping open ground between two close dots must be possible.

---

## Verify before you push

- `npm run build` green. **Seam tests pass with ZERO new allow-list paths** — nothing in this wave crosses the boundary. If Test A fails, something leaked and you must stop and report it.
- Tiled scenes: a PC at high `y` draws *in front of* a building; at low `y`, *behind* it.
- Stage at 224 with actors sitting correctly on the ground band — no vertical jump from Wave 5.
- Labels legible against both the snow scene and the cave scene.
- Sprite picker: categories tab correctly, search works, 50+ sprites remain navigable.
- Wolf renders with no stray black pixels.
- Regenerate `public/snapshot.json` on a tiled scene so the new environment shows on first open.

## Report back in plain language

1. What tile size each pack turned out to be, and which tilesets you used
2. The three scenes you built and what's in them
3. How many new sprites landed, and how the categories are organized
4. What the wolf's stray pixels turned out to be
5. Confirmation that zero seam paths were added
6. Anything you couldn't do
