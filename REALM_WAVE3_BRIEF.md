# Brief — Wave 3: finish Travel, then the 32px era

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language.

Verified against main at `79615eb` (Waves 1–2 merged). Notable current facts: `SCHEMA_VERSION = 7`; the build gate is `tsc --noEmit && vite-node tests/seam.mts && vite build`; `RealmStage` renders 16×24 atlas actors (`backgroundPosition: -frame*16 / -row*24`), 12px critters, 20px cameos, on 128×72 pixel scenes with actors on a snow line ~86% down; all randomness is seeded and deterministic; `QuestStatus` uses `'resolved'`.

## Structure — two independent parts, one hard gate between them

**Part 0 (Travel) has no asset dependency — do it unconditionally.**
**Parts 1–5 (the 32px era) require `sprites-src.zip` at the repo root.** If it's absent when you finish Part 0: commit Part 0, report, and STOP. Do not improvise sprite work from any other source — see the tripwire in Part 1 for why.

## Scope fence

Do not touch `projectPlayerView`'s filtering (Part 4 adds exactly two output fields, nothing else). Do not add PixiJS or any renderer — the sprite system below is CSS. Do not modify the seam tests except the two deliberate allow-list lines in Part 4. No refactors outside the named files.

---

# Part 0 — Travel (Wave 2 Part A, previously skipped)

`REALM_WAVE2_BRIEF.md` sits at the repo root; execute its **Part A exactly as written** (tasks A1–A3: map module + gazetteer + pins, custom-pin schema, travel UI with MapPicker). The map is present (`icewind-dale-region.png`, 1353×954). Restating the non-negotiables so this section stands alone:

- Calibration: **295 px = 20 miles → `milesPerPx ≈ 0.0678`** (scale-bar ticks at x≈868 and x≈1163 — re-verify with a labeled-ruler crop before trusting).
- Pin all ten towns + ten landmarks using the crop-and-grid recipe; derive `MILES_PER_DAY_NORMAL` as the median of straight-line-miles ÷ table-days over `TOWN_DISTANCES`; **validate ≥3 pairs reconstruct within ±1 day.**
- Leg formula `max(1, ceil(miles / MPD × terrain × pace))`; town-pairs in the table keep the table ("module road time" vs "overland estimate" labels).
- **Fix the arrival guard**: only towns get `towns[dest].visited`; landmarks/pins just log arrival.
- Custom pins → `AppState.mapPins` (schema v7→v8 migration, default `[]`). Never projected — the seam's Test A is the tripwire.

---

# Part 1 — Asset intake, with the corruption tripwire 🚨

**Why this gate exists:** every sprite PNG that previously round-tripped through the design-review pipeline was silently rescaled to **⅞ (0.875×) of native and alpha-flattened**. Every corrupted file has dimensions divisible by 28 (56, 84, 112, 308, 616, 644…). Those copies are poisoned as sources — resampled pixel art cannot be restored. Ben is uploading `sprites-src.zip` built from his **original downloaded packs**.

1. Unzip to `assets-src/` (keep it at repo root, outside `src/` and `public/`, so nothing bundles it).
2. **Measure every PNG.** For each file record `width×height`. **REJECT the intake and stop** if the character sheets match the corrupted dimension family (both dims divisible by 28 — e.g. a 56×56 `shady_guy_00.png`, a 616×112 `Soldier_Idle.png`): that means the zip was built from the poisoned copies, and Ben needs to re-zip from the original downloads. Expected healthy natives are ~8/7 of those (64×64, 704×128, …) but **record whatever the originals actually are — the manifest documents measured truth, not predictions.**
3. Copy only the sheets used in Parts 3–4 into `src/assets/actors/<actorId>/`, original filenames. Your report includes the full dimensions table — this is the moment the ×0.875 theory gets confirmed or corrected on the record.

---

# Part 2 — The actor sprite system (descriptors + CSS animation)

Create `src/data/actor-sprites.ts`:

```ts
export interface ActorAnim { file: string; frames: number; fps: number; layout: 'h' | 'v'; }
export interface ActorSprite {
  id: string;                 // 'shady_guy' | 'b_witch' | 'soldier' | 'cat' | 'orc' | …
  label: string;              // shown in the picker
  frameW: number; frameH: number;   // native frame box, measured from the originals
  contentH: number;           // measured character height inside the frame (for footline math)
  anims: Partial<Record<'idle'|'walk'|'hurt'|'death'|'attack'|'run'|'jump', ActorAnim>>;
  matches?: (RegExp | string)[];    // for monsters: combatant srcId/name matching
}
export const ACTOR_SPRITES: ActorSprite[] = [ /* measured, per Part 1 */ ];
```

**Rendering:** descriptor-backed actors are a div sized `frameW×frameH`, `background-image` = the anim's sheet, animated with **CSS `steps(frames)`** on `background-position` (horizontal or vertical per `layout`). No JS animation loop — the existing 700ms tick keeps choosing *poses*; CSS runs the *frames*. Actors without a descriptor keep the exact current atlas path.

**Pose → anim mapping with fallbacks** (the pose vocabulary is the contract; do not change `pickPose`):
`idle→idle · walk→walk/run · down→death` (play once, hold last frame — `animation-fill-mode: forwards`) `· sit/sleep/shiver→idle` (real frames are a future art gap — list what fell back in your report). The Wave-1 CSS emotes stay universal and unchanged: flinch = shake+flash, cheer = bounce, wave = wiggle — they work on any sprite.

---

# Part 3 — The stage grows to 384×216

Replace the per-actor `.full … scale(4.5)` approach with a **stage canvas**: an inner div at a fixed logical **384×216**, integer-scaled to fit its container (`k = max(1, floor(min(w/384, h/216)))`), `image-rendering: pixelated`. Actors position in canvas pixels; the snow-line percentage is unchanged.

- **Legacy 128×72 scenes render 3×** (integer — visually identical to today).
- If the intake includes 384×216 backgrounds, register them as scenes rendered 1:1; if not, skip — nothing depends on them.
- **Transition scale rule** so mixed parties look like one game: legacy atlas actors draw at **2×** (16×24 → a 32×48 box), critters and cameos 2×. Descriptor actors draw at native 1×. A descriptor-less fourth PC then reads as the same sprite generation as knif/gerd/vomaat, not a giant.

Both the TV (`tv.html`) and the Realm (`realm.html`) get this via the shared `RealmStage` — verify on both.

---

# Part 4 — Who wears which sprite

- `PC.sprite?: string` and `Ally.sprite?: string` (schema migration; default undefined → current atlas/emoji behavior).
- **Character editor** gains a sprite picker: a small grid of descriptor idle-frame thumbnails + "Default". Same for the ally/sidekick editor (the cat!).
- **Projection:** add `sprite` passthrough to `PvPc` and `PvAlly`. **This is a deliberate seam change — the first ever.** Test A will fail until you add exactly `party[].sprite` and `allies[].sprite` to the allow-list; add those two lines consciously and nothing else. The sentinel corpus is untouched.
- **Combat foes:** a combatant whose `srcId`/name matches a descriptor's `matches` renders as its sprite (hpState tint and 💀-fade behaviors preserved); everyone else stays an emoji token. Expect most Frostmaiden-specific monsters to remain emoji until themed packs are acquired — the *system* lands now; coverage grows with assets.
- Expected initial assignments, if the packs are in the intake: knif→`shady_guy` (single-token idle; walk falls back to idle+bob), gerd→`b_witch`, vomaat→`soldier`, the cat→`cat`. Ben sets these via the new picker — don't hardcode names.

---

# Part 5 — Regenerate + verify

- Regenerate `public/snapshot.json` (it must carry the new `sprite` fields once Ben assigns them — for now the seed regen just proves shape compatibility).
- `npm run build` green — including seam tests with **exactly two** new allow-list paths.
- Headless render (happy-dom, per `tests/session-sim.mts` pattern): a fixture with one descriptor PC + one atlas PC + one matched foe + one emoji foe renders all four.
- Travel validation numbers from Part 0 in the report.

## Report back in plain language

1. Travel: where the map picker is + the Bryn Shander → Sea of Moving Ice demo; calibration + the three validation pairs
2. The intake dimensions table — and a plain verdict on the ×0.875 theory
3. Which sprites are wired, which poses are real vs fallback, per actor
4. Where the sprite picker is in the character editor
5. The two seam allow-list lines added, verbatim
6. Anything you couldn't do
