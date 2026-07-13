# Brief — Wave 4: allies, NPCs, initiative, and the items domain

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language.

Verified against `eb84469` (Waves 1–3 merged). Wave 3 shipped well: `RealmStage` renders descriptor sprites for PCs and matched foes at 384×216, and the whole `sprite` plumbing chain — `PC.sprite` / `Ally.sprite` in the schema, both projected, both on the seam allow-list — is **already correct and needs no changes.**

## Scope fence

Part A is a **renderer-only** fix — the data already flows. Do not touch the schema for the ally bug, do not touch projection for it, and do not add allow-list paths for it. Part D's projection changes are enumerated exactly; add nothing else. No PixiJS. No refactors outside the named files.

---

# Part A — The ally/sidekick sprite bug 🐛

**Root cause, single line.** `src/tv/realm-stage.tsx:306` builds allies via a `critters` map that reads only `{id, linkedPcId, down, name}` and hard-renders every one of them as a 12px `idle_critter.png` tile. It **never consults `a.sprite`** — unlike the PC path (:281, `actorSpriteById(p.sprite)`) and the foe path (:301). The picker saves correctly, the projection ships it, the renderer ignores it. That's the whole bug.

**Fix:** allies resolve exactly like PCs. `actorSpriteById(a.sprite)` → if a descriptor exists, render through the existing `<SpriteActor>` (all its behavior — name label, mini-HP, bubbles, flinch, active/next turn marks, `pose-down` — comes free). Only allies with **no** descriptor fall back to the 12px critter. Preserve `down` handling in both paths.

## Part B — Ally roaming + link modes

**Schema:** `Ally.follow?: 'pc' | 'party' | 'free'` (migration default: existing allies with a `linkedPcId` → `'pc'`; without → `'party'`). Keep `linkedPcId` as-is; `follow: 'pc'` is what makes it meaningful.

**Editor:** in the ally/sidekick editor, a **Follows** control — `A character ▾ (picker) · The whole party · Roams free`. Selecting "A character" reveals the existing linked-to field.

**Renderer** — the three modes, using the existing seeded/deterministic idiom (no new randomness sources):
- `'pc'` — current behavior: hover near the linked PC's x, small hop.
- `'party'` — wander within the party's x-range (min→max of PC positions), slow drift, wider amplitude than a familiar.
- `'free'` — roam the full stage width on a slow seeded oscillation, indifferent to the party. This is Ben's *"roam around more broadly as if they aren't linked to a party member."*

Ben's note about Gribbles: an ally in `'pc'` mode still shows the linked PC's name field, so nothing about the current link UX is lost.

## Part C — NPC sprites

NPCs join initiative and travel with the party, so they need to appear in the Realm.

- Add `sprite?: string` to **`CustomNpc`** (schema.ts:158) and to **`NpcOverride`** (:45) — the latter is how a *preset/module* NPC gets a sprite without editing seed data. Migration: both default `undefined`.
- The **same sprite-picker component** from the character editor appears in the custom-NPC editor and in the preset-NPC detail sheet. Do not build a second picker.
- **Resolution order for any NPC-derived actor:** `NpcOverride.sprite` → `CustomNpc.sprite` → descriptor `matches` on the name → emoji token.
- **Combat:** a combatant sourced from an NPC (`srcType: 'npc'`) resolves its sprite via that order. Extend the existing foe-sprite path — do not duplicate it.
- **Realm:** an NPC recruited as an `Ally` already flows through Part A/B; nothing extra needed.

## Part D — Initiative redesign

Current problem (Ben's screenshot): the initiative list eats ~60% of a wide screen at a fixed width while the Realm preview beside it is a postage stamp, so the diorama — the emotional payload — is the smallest thing on screen.

- **Narrow the initiative column** (target ~360–420px, or ~⅓ of a desktop viewport) and give the reclaimed width to the Realm preview. On phones the stacked layout is unchanged.
- **Condense each row:** portrait/sprite thumbnail · name · HP. Named PCs/allies keep the numeric `11/11` bar; foes keep the masked `HEALTHY` chip (that masking is correct and must survive). Drop the row to a single line where it currently wraps.
- **Use the sprite, not the emoji, in the row thumbnail** when the combatant resolves to a descriptor — it visually ties the tracker to the scene.
- Keep the active-turn ▶ highlight and `NEXT` badge; make the active row unmistakable at a glance.
- The Realm preview pane keeps its integer-scale rule (never a fractional scale — pixel art must stay crisp).

## Part E — Encounters: collapsible

On World ▸ Encounters, both the **rollable tables** and the **prebuilt encounters** sections collapse. Each table card is independently collapsible (header + die badge always visible, rows hidden until expanded), plus a section-level collapse for Prebuilt. Default state: all collapsed, so the tab opens as a scannable index. Persist expansion in component state only — do not add it to `AppState`.

---

# Part F — The items domain

## Ben's decisions (verbatim — do not relitigate)

1. **Ownership: both** — a shared party stash *and* per-PC items.
2. **Realm visibility: everything they carry.** No per-item visibility flag. The consequence is the model: *granting an item is revealing it.*

## F1 — Schema

```ts
export interface OwnedItem {
  id: string;
  name: string;
  emoji: string;
  qty: number;
  ownerId: string | null;   // null = party stash, else a PC id
  srcIndex?: string;        // optional link back to the compendium entry
  notes?: string;           // DM-only. NEVER projected — sentinel-guarded in F3.
}
// AppState gains: inventory: OwnedItem[]   (migration default [])
```

No encumbrance, no weight, no currency math — gold and rations live in `travel.resources` and stay there. Items are things, not numbers.

## F2 — DM UI

**Party screen (`src/screens/party.tsx`):** a **🎒 Party stash** card — rows of emoji · name · qty, qty via the shared `Stepper`, a `⋯` menu per item (*Move to…* stash/any PC · *Edit* · *Remove*), and a quick-add row (name + emoji + qty) for improvised loot. Each PC's **expanded** card gains an **Items** section with the same rows.

**Compendium ▸ Items** (data already exists: `RIME_EQUIPMENT` at `rime-data.js:438`, `RIME_MAGIC_ITEMS` at :459, both exported at :759): each row gains **`Give ▸`** → target picker (🎒 Party stash / each PC). Default emoji by `equipment_category.name` (Adventuring Gear 🎒 · Weapon ⚔️ · Armor 🛡️ · Potion 🧪 · Scroll 📜 · Ring/Wondrous 💍) — editable after granting. Granting **copies** into `inventory`; the catalog is a menu, nothing decrements.

## F3 — Projection: five paths, one sentinel 🔒

- `PlayerView` gains `inventory: PvItem[]`, `PvItem = { id, name, emoji, qty, ownerId }`.
- **Seam allow-list: add exactly these five and nothing else** — `inventory[].id`, `inventory[].name`, `inventory[].emoji`, `inventory[].qty`, `inventory[].ownerId`. Test A must fail before you add them and pass after.
- **Sentinel corpus: add `OwnedItem.notes`** (fixture item carries `'SEAM_ITEM_NOTES'`; assert absence). DM notes on loot never reach a phone.
- **Part C adds no projected fields** — NPC sprites reach the Realm only through `Ally.sprite`/combatant resolution, which are already allowed.

## F4 — The Pack (Realm page)

`src/realm/main.tsx` gains a **Pack** section beneath the stage: the 🎒 stash group first, then a group per PC carrying anything (names resolved from `v.party`). Rows: emoji · name · ×qty; tap opens a small detail popover. **Hidden entirely when inventory is empty** — no empty-state box. Match the existing status-strip visual language.

## F5 — The item-get moment (live only)

When an item is granted during play, the world reacts — with **no new plumbing**:

- `RealmStage` keeps a ref of the previous view's inventory ids. A newly-appeared id makes its owner (or, for stash grants, the whole party) play the existing **cheer** treatment with a speech bubble showing the item's emoji for ~2 ticks.
- This is **derived locally from successive `PlayerView`s** — Expressive state computed from Canonical, exactly like poses. No `poke` change, no new projected field, no persistence. The published snapshot is a photograph and correctly does *not* replay a past grant.

---

## Verify before you push

- `npm run build` green — seam tests pass with **exactly five** new allow-list paths and **one** new sentinel.
- Ally fix: a sidekick with a wolf sprite renders as the wolf, at PC scale, with a name label — not a 12px critter. An ally with no sprite still renders as a critter.
- Roam modes: `free` visibly ranges wider than `party`, which ranges wider than `pc`.
- Regenerate `public/snapshot.json` with a couple of demo items so the Pack is visible on first open.

## Report back in plain language

1. Why sidekick sprites were broken and what the one-line cause was
2. Where **Follows** lives in the ally editor and what each mode looks like on screen
3. Where NPC sprites are set (custom + preset) and how a combatant resolves one
4. What changed about initiative's proportions
5. The five allow-list paths and the sentinel, verbatim
6. A demo script: grant an item with the TV live and watch the moment
7. Anything you couldn't do
