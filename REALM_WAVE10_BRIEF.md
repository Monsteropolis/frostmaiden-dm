Agent Orchestration & Reasoning: Before executing, create a brief execution plan. Determine whether the task benefits from decomposition into specialized sub-agents. Spawn agents only when doing so is expected to improve quality, correctness, or efficiency. Assign each agent a clear objective, required context, and success criteria. Match the reasoning effort to the complexity of the task, using the lowest sufficient capability for routine work and reserving the highest reasoning for architecture, ambiguity, novel problem-solving, and final decision-making. Execute independent tasks in parallel where possible. After all agents complete, critically evaluate their outputs, resolve disagreements using evidence rather than majority opinion, perform an end-to-end consistency review, and produce a single integrated answer. Avoid unnecessary delegation, unnecessary reasoning, or duplicate work.

---

# Brief — Wave 10: the player app, and the groundwork for personal realms

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** No terminal, no local dev environment — he works through the deployed site, the Supabase dashboard, and his phone. Any step that must be his needs exact browser instructions. Report in plain language.

Verified against `24c337e` (Waves 1–9 + Backend Briefs 1–3 merged).

## Where this is heading (context for your judgment calls)

Pocket Realms is becoming a two-sided product. The DM tool is mature. The **player side** is the frontier: players log in on their own devices and, increasingly, *do* things — journal, manage their character, and soon own and decorate their own properties which they can show to (or hide from) the rest of the party.

The next wave after this one is **personal realms**: the DM grants a player a property, the player furnishes it, and sets it Private / Visible / Open to visitors. That wave is a **security change** — it rewrites the existing rule that currently lets any party member write any placement — so it must land alone and clean.

**This wave therefore does two things:** it builds the player app (Parts A–G), and it lands the parts of personal realms that carry *no security risk at all* (Parts H–I) so the security brief that follows can be small and focused. **Do not implement any backend/RLS change for property access in this wave.**

**If you judge this wave too large for one PR, the split line is A–G (the player app) and H–I (DM-side groundwork).** Say so and ship two.

## Verified facts — do not re-derive

- **Assets already in the repo root:** `AncientModernTales-a7Po.ttf` and `MediavelFree.png` (256×128 RGBA, clean alpha, passes the ÷28 tripwire; fits an 8/16/32px grid — inspect and pick the grid its contents actually use).
- **Spell data is already wired:** `src/lib/api.tsx:123` fetches `https://www.dnd5eapi.co/api/2014/spells`; the service worker already runtime-caches `dnd5eapi.co` offline. Spells carry `level` and `classes`. **Do not bundle a local spell list.**
- **`PvPc` projects `cls` but NOT `level`** (`projection.ts:40–52`). `PC.level` exists (the Edit sheet shows it) and must be projected for spell filtering — a deliberate seam addition (B1).
- **Resources are flat:** `travel: { …, rations: number, partySize: number, gold: number }` (`schema.ts:391`).
- **The Realm page stacks** stage → `Pack` → `JournalPanel` (`realm/main.tsx:104–105`) with no navigation.
- **`OwnedItem.display?: {x,y}`** already exists (`schema.ts:323`) — the Wave 5 DM-places-things-in-camp flow. **Part H reuses it; do not invent a second placement mechanism.**
- **`PlaceCard`** lives at `src/screens/world.tsx:206` — Part I's grant control goes there.
- **Tilesets available for props:** `src/assets/tiles/{caves,mana,tiny}`.

## Scope fence

No property *access* backend (no `places` mirror table, no per-place RLS, no access states) — that is the next brief. No live multiplayer/co-presence. Do not touch the peer transport. Projection changes are limited to the paths enumerated in B1 and E5; add nothing else, and the seam test must fail before you add them and pass after.

---

## Part A — Deferred QA

**A1 — Remove the grey pill behind names; adopt the new font.** `.realm-sprite-name` (`styles/tv.css:755`) draws a translucent dark pill — remove it, keeping the 4-direction black outline as the sole legibility mechanism. Register `AncientModernTales-a7Po.ttf` via `@font-face`, move it to `src/assets/fonts/`, and set it as `--font-label` so all in-world labels use it. Verify at ~9px against both a snow scene and a cave scene; if the new font is unreadable at that size with the outline alone, **say so in your report** rather than silently reinstating a pill.

**A2 — Enlarged sprites drag their name label with them.** `realm-stage.tsx:360` applies `sprite.zoom` to the actor **wrapper**, and the label (line 375) is a child of it, so it inherits the zoom. Apply zoom to the sprite element only (or counter-scale the label by `1/zoom`) so **every name renders at the same size regardless of sprite scale**. Depth-scale must not change label size either — check both.

**A3 — Actors need a movement state machine.** Wave 9 correctly derived pose from movement, but familiars in `pc` mode only micro-drift near their owner, so the delta never crosses the walk threshold and the cat never animates. Replace continuous drift with a small **seeded state machine**: `pause → walk → pause`, deterministic dwell times, where a `walk` state sets a real destination a meaningful distance away and the pose follows the state. Apply to familiars, party members, allies in all three follow modes, and idle combatants. It should read as "wanders, stops, looks around, wanders again," and the walk animation must only play during a `walk` state.

**A4 — Notes must be deletable.** Audit everywhere notes exist (DM notes on party cards, town/place notes, milestone notes, journal entries) and add a delete affordance with a confirm step. Journal RLS already permits author-delete; if the UI lacks it, add it.

---

## Part B — Class abilities & the spellbook

**B1 — Class and level come from the DM's sheet, not player input.** *(Judgment call — flag in your report.)* Two sources of truth for a character's level would drift the first time Ben levels someone up, and he already sets both in the Edit sheet. **Project `level` on `PvPc`** — add exactly `party[].level` to the seam allow-list, nothing else — and derive spells from the character's existing `cls` + `level`. Players never set class or level. Non-spellcasting classes get a graceful state, not an empty list.

**B2 — The spell library.** Reuse `src/lib/api.tsx`. Filter to the character's class, group by spell level, cap at what their character level can cast. Include search and a **My class / All spells** toggle (Ben wants the full library available too). Each spell opens a detail view. Respect the existing offline caching.

**B3 — Tagging known/prepared spells (Expressive → backend).** New table `character_spells`: `id`, `campaign_id`, `character_id`, `spell_index`, `known` (bool), `prepared` (bool), `updated_at`.
- **RLS, matching the established pattern:** a player reads/writes only rows where `character_id` = their token claim; the DM (`is_dm`) may read all; nobody writes another character's rows.
- **Extend `tests/boundary.mts`** with those three assertions, following its existing pattern exactly.
- UI: mark known on any spell; a secondary prepared toggle; a **My spellbook** view of known spells grouped by level.

**B4 — Non-casters get something.** Martial classes see class name, level, and any DM-authored notes visible to them. Do not build a class-features engine.

---

## Part C — Inventory: home base vs. on person

**C1 — Where location lives.** Item *existence* is Canonical (DM grants, Wave 4); item *arrangement* is Expressive (player-owned), exactly like decoration. New table `item_locations`: `id`, `campaign_id`, `character_id`, `item_id` (the `OwnedItem.id`), `location` (`'person' | 'home'`), `updated_at`.
- **RLS:** player reads/writes only their own `character_id`; DM reads all. Extend the boundary test with the same three assertions as B3.
- The Realm merges snapshot items with their locations, **defaulting to `'person'`** when no row exists, so nothing vanishes for a player who has never organised anything.
- **No projection change** — item locations never enter `PlayerView`.

**C2 — The UI.** Two panels labelled **On person** and **Home base**, side by side on wide screens and stacked on a phone. Movement between them must be frictionless: drag-and-drop where the platform supports it well, **plus** an always-available tap affordance (`→ Home` / `→ Person` per row) so it works reliably on a phone. Show counts per panel. The party stash (`ownerId: null`) stays visible but read-only to players.

---

## Part D — Player emotes

**D1** — An emote bar in the player app using the existing vocabulary (whatever `POSE_FRAMES` and the CSS emotes already support). Tapping plays that emote on **their own character in their own Realm view**, immediately.

**D2 — Be honest about reach.** In v1 the emote is **local to that player's screen.** Making the table see it on the TV needs a live player→DM channel, which is the multiplayer track and deliberately not here. **Dispatch through a single function** so broadcasting later is a one-line change. State the limitation plainly in your report so Ben can set expectations with his players.

---

## Part E — Currency and rations

**E1** — Replace `travel.gold: number` with `travel.coins: { pp, gp, sp, cp }`. Migration: existing `gold` → `gp`, rest `0`.

**E2 — Conversion on subtraction.** Standard 5e rates — **1pp = 10gp, 1gp = 10sp, 1sp = 10cp** — with automatic borrowing: subtracting 7cp from a party holding 1sp and 0cp breaks the silver and leaves 3cp. Borrow recursively from higher denominations; if the total across all denominations is insufficient, **refuse and say so** rather than going negative. Unit-test this, including multi-level borrows (paying copper while holding only platinum).

**E3** — Replace `travel.rations: number` with `{ party: number; pet: number }`. Migration: existing → `party`, `pet` starts `0`. Per-travel-day consumption continues to decrement party rations; pet rations are DM-managed only this wave.

**E4** — Supplies card gets a stepper per denomination (reuse the shared `Stepper`) and both ration counts. The TV footer shows a compact coin readout (omit zero denominations) and rations labelled **Party** and **Pet**.

**E5 — Seam.** Replace `resources.gold` with `resources.coins.{pp,gp,sp,cp}` and `resources.rations` with `resources.rations.{party,pet}` in `PlayerView`; update the allow-list to exactly those paths, **removing the two obsolete ones**. Test A must fail before and pass after.

---

## Part F — The UI sprite sheet

Inspect `MediavelFree.png`, determine its grid, and catalogue what's actually in it (panels, frames, buttons, icons — don't assume). Move it to `src/assets/ui/`. Apply it to **player app** chrome where it genuinely helps — panel frames, buttons, tabs — at integer render scale with `image-rendering: pixelated`. **Do not restyle the DM app**; it keeps "Fate Direct." Leave unmapped sheet regions unused and say which in your report rather than forcing them in.

---

## Part G — Player app navigation

The Realm page currently stacks stage → Pack → journal with no navigation. Once logged in, a player needs **Journal · Abilities · Inventory** plus the world view.

Build a phone-first tab bar. The stage stays visible or one tap away — the world is the point, the panels are what you do while in it. **Design the tab bar to accept an additional tab without rework** — a **Places** tab arrives next wave. Logged-out visitors still see the read-only world exactly as today: no tabs, no login required.

---

## Part H — The prop catalog (groundwork, zero backend)

Personal realms will let players furnish their properties. The catalog those props come from is **static content** with no security surface, so it lands now — and pays off immediately on the DM side.

- Build a **prop catalog** as repo content (the pattern of `ENC_TABLES` — a typed static list, not a database): decorative objects sourced from `src/assets/tiles/{caves,mana,tiny}`. Furniture, containers, plants, banners, rugs, lights. Each entry: id, label, category, the sprite/tile reference, and its footprint (reuse the Wave 5 obstacle footprint concept so props block movement consistently).
- **Wire it to the existing Wave 5 flow:** the DM can already place items in camp via `OwnedItem.display`. Extend that placement UI so the DM can also place **props** from the catalog — a category-browsable picker, placed on the ground plane, depth-sorted like everything else.
- Distinguish the two kinds at the data level: a placed thing is either a **granted item** or a **catalog prop**. Ben's decision is that players will eventually place both, so the distinction must exist from the start.
- **Immediate payoff:** Ben can furnish the camp himself this wave — a table by the fire, crates, banners — before any player touches it. This also validates the catalog before it becomes load-bearing.

---

## Part I — Property ownership (Canonical only, zero backend)

Ben's approved decisions, locked: **the DM can see inside a Private place; a player may own multiple properties; revoking a property never deletes its decorations.**

- Add `ownerId: string | null` to `Place` (`schema.ts:219`). `null` = communal (the default for every existing place — migration must preserve that).
- In `PlaceCard` (`world.tsx:206`), add a **grant/revoke** control: assign the place to a party member, or return it to communal. A player may hold several places, so this is per-place, not per-player.
- Show ownership clearly in the Places list (owner name, or "communal").
- Optionally associate a place with a scene id so a property knows what it looks like — if the plumbing is small, do it; if it's not, note it for the next brief.
- **No backend, no RLS, no access states in this wave.** Ownership is DM-authored Canonical state and stays in the app. The mirror and per-place permissions are the next brief's entire subject.

---

## Verify before you push
- `npm run build` green; seam test passes with exactly the enumerated changes (`party[].level` added; `resources.gold` → `resources.coins.*`; `resources.rations` → `resources.rations.*`); boundary tests pass with the new `character_spells` and `item_locations` assertions.
- Every name label renders at the same size regardless of sprite zoom or depth.
- The cat visibly walks, stops, and walks again — animating only while moving.
- Currency borrow cases pass, including multi-level borrows and insufficient-funds refusal.
- A player can tag a spell and move an item between On person and Home base, and both survive a re-login.
- The DM can place a catalog prop in camp and it renders depth-sorted, blocking movement per its footprint.
- Granting a place to a party member persists and displays; existing places remain communal after migration.
- Migrations committed, and Ben told exactly which SQL to run in the dashboard.

## Report back in plain language
1. What the player app looks like now — the tabs and what's under each
2. How the spellbook picks which spells to show, and where "known" is stored
3. How moving an item between On person and Home base works on a phone
4. **Who can currently see a player's emote** — be explicit about the v1 limitation
5. The currency conversion rules, and what happens when the party can't afford something
6. What was in `MediavelFree.png` and where you used it
7. What's in the prop catalog and how Ben places one in camp
8. How Ben grants a property, and what changed for existing places
9. The exact seam paths added and removed
10. What Ben must do in the Supabase dashboard
11. Anything you couldn't do
