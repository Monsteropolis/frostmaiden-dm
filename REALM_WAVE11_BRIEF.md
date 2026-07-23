# Realm — Wave 11 Brief

**Theme:** make the Realm legible, then give players their class resources.

**Written against a fresh read of `main` @ `d304465`.** Schema is at **v13**. `STAGE_W = 448`, `STAGE_H = 224`. Build is green: seam 3/3, currency 14/14, sprite audit 803 frames / zero mismatches. `npm run test:sim` is **316 passed, 12 failed** — see Part F; that is expected on arrival, not a surprise you caused.

Six parts. **Report back after A–D, then after E, then after F**, so Ben can QA the legibility work without the Casting tab in the way.

---

## Rules that apply to every part

1. **Seam.** This wave makes **zero seam changes**. Nothing is added to or removed from `projectPlayerView()`. Part E is entirely Expressive state; `PvPc.cls` and `PvPc.level` already cross the seam and are sufficient. `tests/seam.mts` must pass unchanged at the end. **If you find yourself wanting to add a field to `PlayerView`, stop and report instead.**
2. **Integer scales only for pixel art.** Part B exists because this rule was violated. Do not introduce a new fractional transform anywhere in the stage.
3. **Check the three recurring bugs proactively** as you touch each file: missing `overflow: hidden` on anything showing one frame of a sprite sheet; swallowed errors that discard the underlying cause; fractional scaling of pixel art.
4. **Ben has no terminal and cannot open devtools on a phone.** Anything he must verify has to be visible on screen. Anything he must *do* has to be doable in a browser, with click-by-click steps.
5. **Do not change product code to make a test pass.** If a test failure turns out to be a real regression rather than a stale expectation, stop and report it.

---

## Part A — `jupiterc` becomes the interface font

**Goal:** the app's chrome uses Ben's font, loaded from project assets, with no external font service.

The file is currently at the **repo root** (`jupiterc.ttf`, 19,280 bytes, committed by Ben on 21 Jul). It is not in `src/assets/fonts/` and is not referenced by any `@font-face`. Nothing about the font work has been started.

**Do:**

1. Move `jupiterc.ttf` → `src/assets/fonts/jupiterc.ttf`. Remove the root copy; don't leave a duplicate.
2. Before wiring it, **open the file and confirm it is a valid TrueType font and read its internal family name** from the name table. Report that name. If the file is malformed, stop and say so — do not ship a silent fallback.
3. Declare it in `src/styles/tokens.css` (that is where `--font-ui` lives), matching the existing `@font-face` style used for Ancient Modern Tales in `tv.css`:
   - `font-family: 'Jupiter'`, `src: url('../assets/fonts/jupiterc.ttf') format('truetype')`, `font-display: swap`.
   - Vite will fingerprint the asset; verify the built CSS references a hashed filename and the font actually loads in `dist/`.
4. Change `--font-ui` (currently `'Space Grotesk', Arial, sans-serif`) to `'Jupiter', 'Space Grotesk', Arial, sans-serif`. Space Grotesk stays as the fallback — it is already bundled, so a font failure degrades instead of breaking.
5. **Do not change** `--font-read` (Spectral — the reading serif for prose) or `--font-px` (Silkscreen — pixel chrome). Those are different jobs.

**Known risk to check and report:** `jupiterc.ttf` is a single weight, but `--font-ui` is used at 400/500/600/700 across `base.css`. The browser will synthesise the bolder weights, which on a display face often looks smeared. Render a screen with mixed weights, look at it, and tell Ben whether it holds up. If it doesn't, propose `font-synthesis: none` plus a weight audit rather than silently accepting it.

**Ben verifies:** open the DM app — the interface lettering has changed everywhere, and nothing has become unreadable at small sizes.

---

## Part B — in-world labels that can actually be read

This is the most urgent item. In Ben's screenshot, "Tostito" and "Duvessa Shane" collided into one illegible block and "Chillitita" overlapped "Knif," and every outline looked jagged and broken up.

**Four separate faults. Fix all four.**

### B1 — the outline is being fractionally scaled (this is the "jagged, incomplete" one)

`src/tv/realm-stage.tsx:385-386`:

```ts
const wrapperScale = depthScale(y) * (sprite.zoom ?? 1);
const labelScale = 1 / wrapperScale;
```

The name is a **child** of a wrapper carrying a fractional depth scale, then counter-scaled by its inverse. The net scale is integer, but the browser rasterises the glyph and its four `text-shadow` copies at the fractional scale *before* the parent scales back up — so the 1px outline lands on fractional device pixels and drops out in patches. This violates rule 2.

**Do:** take the name out of the depth-scaled subtree. Render names in a separate unscaled overlay layer above the actors, each positioned in canvas coordinates using the same `left` the actor uses and the existing foot-line offset (`(sprite.frameH - sprite.footPad) * s + 2`). Delete `labelScale` entirely.

**Prove it:** after the change, no element in a label's ancestor chain carries a non-integer `transform`. The only scale acting on a name should be the canvas's integer `k`. State in your report how you verified this.

### B2 — colour

Labels anchor below the foot line, feet are on the ground, and winter is the only v1 terrain — so the common case is text sitting on near-white snow. Today it is near-white text (`--ink` = `#E9E7F4`) held off near-white snow by a 1px black outline. That is inverted.

**Do:** on `.realm-sprite-name` only —

- `color: #0D0E22`
- `text-shadow: -1px -1px 0 #F2F6FA, 1px -1px 0 #F2F6FA, -1px 1px 0 #F2F6FA, 1px 1px 0 #F2F6FA`

Dark letterforms carry themselves on snow; the light halo carries them in `cave_dark` and `cave_deep`. **Leave `.tv-foe-name` and `.realm-object-label` alone** — both already have their own background fill, so they aren't suffering this problem.

### B3 — font

Ancient Modern Tales is a storybook display face; its strokes go sub-pixel at 9px. Silkscreen is a pixel font already in the dependency list and already imported on both the TV and Realm entry points.

**Do:** `--font-label: 'Silkscreen', monospace`. Set `.realm-sprite-name { font-size: 8px }` — Silkscreen's native design size, so with B1's integer scale it lands on whole pixels.

Check whether `'Ancient Modern Tales'` is still referenced anywhere after this. If it isn't, remove the `@font-face` block too and say so. Leave `AncientModernTales-a7Po.ttf` on disk either way.

### B4 — priority and collisions

**Do:**

- **PCs are always labelled.** Familiars, allies, NPCs and monsters are **unlabelled by default** and show their name for ~3 seconds when their sprite is tapped.
- **Collision handling for whatever is visible:** after positioning, if two visible label boxes overlap horizontally, stagger the later one down by one line-height. Resolve in a **deterministic** order (sort by x, then by id) — the stage is deterministic and tested that way, and a label that jitters between ticks is worse than one that overlaps.

**Ben verifies:** open the Realm and the TV view. Names are crisp at every window size, no two visible names overlap, only the three PCs are named by default, and tapping Chillitita shows her name briefly.

---

## Part C — the stage fits the window it's in

**Read this before diagnosing:** the handover proposes raising `STAGE_H` to 384. **Do not do that.** The code comment at `realm-stage.tsx:255-260` explains that 448 was chosen so a 1080p TV lands 4× (1792×896). A 640×384 or 704×384 canvas would drop the TV to 2× — strictly worse on the surface that currently works.

Measurement of Ben's desktop screenshot: the canvas was scaling and centring **correctly** (`k = 2`, canvas 896×448, centred in a ~1150×705 panel). Two separate real problems remain.

### C1 — on a phone, no integer scale fits

`useStageScale` does `Math.max(1, Math.floor(Math.min(r.width / STAGE_W, r.height / STAGE_H)))`. On a 360px-wide phone that floors to `k = 1`, so a 448px canvas renders inside a 360px box and `overflow: hidden` crops 88px off the world. Ben's choice: **narrow the canvas on phones**, keep pixels exact.

**Do:**

- Change `useStageScale` to return `{ k, stageW }`. `stageW` is the largest multiple of 32 that fits the measured container width at `k = 1`, clamped to `[320, 448]`, and only reduced below 448 when 448 would not fit at `k ≥ 1`. `STAGE_H` stays 224 always. A 360px phone gets 352; an iPhone 15 gets 384; a TV keeps 448.
- **Narrow the viewport, not the world.** Keep the world 448 wide — tile scenes are all authored at `gridW = 28`, `gridH = 14`, and the depth band maths assumes it. Show a centred window onto that world and **clamp actor roaming to the visible columns** so nobody wanders off-view. Do not re-author scenes and do not change `gridW`.
- The flat-art gutter constants in `tv.css` are derived from 448 and must become computed: `.tv-idle-bg { left: 32px }`, `.tv-idle-bg-side.left { left: -352px }`, `.tv-idle-bg-side.right { left: 416px }` are all `(448 − 384) / 2 = 32`. Drive them from a CSS custom property set inline from JS. At `stageW = 352` the gutter goes negative (the 384-wide art is wider than the canvas) and the art centre-crops — that is acceptable; confirm it looks right rather than assuming.
- Audit every remaining hardcoded 448 or `STAGE_W` use (lines 525, 530, 718 among them) and make each consume the effective width.

### C2 — the world has no visible edge

The scene's own night sky is dark navy and the page behind it is `#0D0E22`, and `.tv-realm-canvas` has no border. So the canvas boundary is invisible and the world reads as a strip floating in a void — which is what Ben described as "the scene doesn't fill its container."

**Do:** give `.tv-realm-canvas` a visible boundary consistent with the existing 8-bit skin — square corners, a 2px `var(--border-strong)` frame — and a canvas background distinct from the page, so the band above the art reads as *sky inside the stage* rather than empty page.

### C3 — instrument it

Ben cannot open devtools on a phone. **Surface the measured container width/height, the chosen `k`, and the chosen `stageW` in the existing on-screen Realm diagnostics**, so he can report real numbers from each of his devices instead of us inferring from screenshots.

**Ben verifies:** open the Realm on his phone — the world fills the width without cropping, and the stage has a visible edge. Open it on the TV — nothing has changed there; it is still 4×.

---

## Part D — the sign-in screen, phone-first

**Concrete bug to fix first.** `.realm-login-scrim` is `position: fixed; inset: 0; display: grid; place-items: center` with **no scroll**. When the on-screen keyboard opens, the modal is taller than the remaining viewport and both ends clip with no way to reach them.

**Do:**

- Add `overflow-y: auto` to the scrim, switch to top-aligned with vertical padding rather than hard centring, and use `100dvh` so the keyboard doesn't fight the layout.
- `.realm-login-code` is `font-size: 20px; letter-spacing: 0.22em; maxLength 8`. Measure whether an 8-character code overflows the field at 360px; if it does, cap the letter-spacing and use a `clamp()` size rather than a fixed 20px.
- Rebuild the whole modal phone-first. Test at **360×640 and 360×780, with the keyboard open**, on both the `code` and `pick` steps (`src/realm/main.tsx:265-310`).

**Ben verifies:** on his phone, tap "Enter the Realm," type a code with the keyboard up — everything stays reachable and nothing is cut off.

---

## Part E — the Casting sheet

**One data model, two presentations.** Every class resource is *a pool with a maximum, a used count, and a recharge trigger*. Rage, ki, superiority dice, action surge, channel divinity, bardic inspiration — and spell slots are simply nine such pools that recharge on a long rest. Build it once and every class is covered. This is the answer to "I want similar pages for the other classes" — not nine bespoke pages.

### E1 — the table

New migration `supabase/migrations/<timestamp>_character_resources.sql`. **Copy the structure of `20260721000000_realm_spells_items.sql` exactly** — same deny-all-then-holes RLS, same four policies keyed on `app.campaign_id()` / `app.character_id()` / `app.is_dm()`, same `touch_updated_at` trigger, same grants.

```
character_resources
  id            uuid pk
  campaign_id   uuid not null references campaigns(id) on delete cascade
  character_id  text not null
  kind          text not null check (kind in ('pool','stat'))
  key           text not null          -- 'slot_1'..'slot_9', 'rage', 'ki', 'casting_mod', 'misc'
  max           int  not null default 0    -- pools only
  used          int  not null default 0    -- pools only
  recharge      text not null default 'long' check (recharge in ('short','long'))
  value         int  not null default 0    -- stats only
  max_overridden boolean not null default false
  updated_at    timestamptz not null default now()
  unique (campaign_id, character_id, kind, key)
```

### E2 — prove the rules

Extend `tests/boundary.mts` with the same four assertions the Wave 10 tables got (see lines 207-260 for the exact shape): a player writes their own row → allowed; a player writes another character's row → denied, **and** cannot read another character's rows; the DM reads every character's rows → allowed. **Never weaken an existing assertion to make a red test green.**

### E3 — the class-levels endpoint does not exist yet

**The handover states this is "already wired in `src/lib/api.tsx` and already offline-cached." It is not.** `api.tsx` has `getClassSpells` hitting `/classes/{slug}/spells` and nothing else. This is net-new work.

Add `getClassLevel(slug, level)` hitting `https://www.dnd5eapi.co/api/2014/classes/{slug}/levels/{level}`, caching **exactly** like `getClassSpells` does (mem map → `idb-keyval` under a `lvl:{slug}:{level}` key → fetch → store). The response carries `spellcasting` (slot counts per level) and `class_specific` (rage count, ki points, action surges, and so on).

### E4 — auto-fill, but never overwrite

Maxima auto-fill from E3. **Never overwrite a maximum the player has overridden** — that is what `max_overridden` is for. Once a player edits a max, auto-fill leaves it alone permanently.

### E5 — the page

New `src/realm/casting.tsx`, plus one entry in `REALM_TABS` in `src/realm/main.tsx` (`{ id: 'casting', label: 'Casting', icon: '🔮' }`) — the array is built so a new tab is a data edit, not a rework. Client helpers go in `realm-client.ts` following `listCharacterSpells` / `setSpellTag`.

Layout, per Ben: **stat block at the top, pools table below.**

- **Stat block** (casters only). Spell Save DC = `8 + proficiency + casting modifier + misc`. Spell Attack = the same without the 8. **Proficiency derives from level automatically**: `2 + floor((level - 1) / 4)`, using `PvPc.level`. The player types their own casting ability modifier — there are no ability scores on the DM's sheet in v1.
- **Class and level come from the DM's sheet** (`PvPc.cls`, `PvPc.level`), never from player input. One source of truth.
- **Slots table.** Tap to spend, **tap again to return** — Ben explicitly wants untapping, for arcane recovery and for correcting mistakes. Must be usable one-handed on a phone mid-combat: targets ≥44px.
- **Short rest / long rest** buttons, each with a confirmation step. **Warlock pact magic recharges on a short rest** — do not treat every slot as long-rest.
- **Martial classes** get the same page minus the stat block, showing their own pools.
- Non-casters with no pools get a graceful empty state, the way `abilities.tsx` already handles non-casters.

**Ben must do this himself, in the browser:** open the Supabase dashboard → SQL editor → paste the contents of the new migration file → run. Give him the exact click path and tell him what a successful result looks like. **No Edge Function redeploy is needed this wave** — `realm-login` is untouched.

---

## Part F — repair the session simulation and gate it

`npm run test:sim` is the 316-check regression harness that drives the real UI. It is currently **12 failing** and it is **not wired into CI**, so it went dark when Wave 10 shipped and nobody saw.

All twelve trace to Wave 10 Part E replacing the flat `travel.gold` with the `Coins` split (`travel.coins` = pp/gp/sp/cp) and splitting rations into party/pet. The schema and the projection are correct; the *test's expectations* are stale.

The twelve, with verified source lines in `tests/session-sim.mts`:

| Line | Stale expectation |
|---|---|
| 448 | `bodyHas('Rations')` — verify the label against the shipped UI, don't assume |
| 618 | `migrated.travel.gold === 0` |
| 620 | `migrated.travel.rations === state.value.travel.rations` — now an object, so `===` compares identity |
| 625 | `bodyHas('Gold 💰')` |
| 627 | `state.value.travel.gold === 10` |
| 638, 646 | `d.travel.gold = 137` / `pv.resources.gold === 137` |
| 647 | `pv.resources.rations >= 0` — now `{ party, pet }` |
| 656, 657 | `'GOLD'` / `'RATIONS'` in the TV ledger HTML |
| 739 | `['GOLD','RATIONS','DAY']` in the explore HTML |
| 865 | `state.value.travel.gold === 0` |
| 1113 | asserts `m10.version === 12`; the migration chain now terminates at `SCHEMA_VERSION = 13` |

Note lines 849–854 currently **pass** by accident — `d.travel.gold = 999` just sets a stray property that survives export/import. Clean them up to use `travel.coins` while you're in there, but they are not among the twelve.

The current shapes to assert against: `state.travel.coins = { pp, gp, sp, cp }`, `state.travel.rations = { party, pet }`, `pv.resources = { coins, rations, partySize }`.

**Then wire it into CI:** add a `npm run test:sim` step to `.github/workflows/main.yml` in the `checks` job, after the sprite audit and before the Supabase steps. It needs no database.

**Re-read rule 5 before you start this part.** If any of the twelve turns out to be a real regression rather than a stale expectation, stop and report it — do not edit the assertion to hide it.

---

## Reporting

Report in plain language, in three instalments (A–D, then E, then F). For each, tell Ben:

- **what changed**, in one sentence per part, no TypeScript;
- **what to open and what he should see** — which page, which tab, on which device;
- **what he must do himself**, with exact click-by-click steps in a browser;
- **anything you could not verify**, said plainly rather than glossed.

Call out explicitly: the `jupiterc` internal family name and how the synthesised bold weights look (A); how you proved no fractional transform remains on labels (B1); the measured container/`k`/`stageW` values on at least two window sizes (C3); and the before/after `test:sim` counts (F).

---

## Acceptance for the wave

- `npm run build` green — typecheck, **seam 3/3 unchanged**, currency 14/14.
- `npm run test:sprites` green.
- `npm run test:sim` green and running in CI.
- `npm run test:boundary` green with the new `character_resources` assertions added and no existing assertion weakened.
- `npm run bundle:fn -- --check` green (untouched, but CI gates it).
- No new fractional transform anywhere in the stage subtree.
- `projectPlayerView` unchanged.
