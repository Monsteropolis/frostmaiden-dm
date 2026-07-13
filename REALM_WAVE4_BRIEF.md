# Brief — Wave 4: the items domain

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language.

## Ben's design decisions (verbatim — do not relitigate)

1. **Ownership: both** — a shared party stash *and* per-PC items.
2. **Realm visibility: everything they carry.** No per-item visibility flag. The consequence is the model: *granting an item is revealing it.* The inventory is the shared truth between the DM and the players' phones.

## Precondition

Wave 3 must be merged — verify `src/data/map.ts` exists (its Part 0). Wave 3's sprite parts (2–5) may or may not have landed depending on an asset upload; **adapt to whichever `RealmStage` form exists.** If `map.ts` is absent, stop and report that Wave 3 hasn't run.

## Scope fence

No encumbrance, weights, or currency math — gold and rations already live in `travel.resources` and stay there; items are things, not numbers. No item-icon sprite work — **v1 visuals are emoji** (item icon sheets are a named gap in the sprite library; they arrive with a future acquisition at 32px). No persistent item list on the TV — the TV is ambient. Projection changes are limited to the exact paths enumerated in Task 3. No refactors outside the named files.

---

## Task 1 — Schema

```ts
export interface OwnedItem {
  id: string;
  name: string;
  emoji: string;
  qty: number;
  ownerId: string | null;   // null = party stash, else a PC id
  srcIndex?: string;        // optional link back to the compendium entry
  notes?: string;           // DM-only. NEVER projected — sentinel-guarded in Task 3.
}
// AppState gains: inventory: OwnedItem[]
```

Migration: next `SCHEMA_VERSION` bump (Wave 3 has bumps in flight — take whatever is current +1), default `inventory: []`.

## Task 2 — DM UI (Party screen + Compendium)

**Party screen (`src/screens/party.tsx`):**
- A **🎒 Party stash** card: item rows (emoji · name · qty), a qty stepper (**reuse Wave 1's shared `Stepper`**), a `⋯` menu per item with *Move to…* (stash / any PC), *Edit*, *Remove*, and a **quick-add** row (name + emoji + qty) for improvised loot.
- Each PC's **expanded** card gains an **Items** section with the same row treatment. Keep it light — this is story visibility, not bookkeeping.

**Compendium Items tab (data at `rime-data.js:438/459` — `RIME_EQUIPMENT`, `RIME_MAGIC_ITEMS`, exported at :759):**
- Each item row gains **`Give ▸`** → a target picker (🎒 Party stash / each PC by name). Default emoji by `equipment_category.name` (Adventuring Gear 🎒, Weapon ⚔️, Armor 🛡️, Potion 🧪, Scroll 📜, Ring/Wondrous 💍✨ — sensible map, editable after granting). Granting copies into `inventory`; the catalog is a menu, not stock — nothing decrements.

## Task 3 — Projection: five deliberate paths, one new sentinel 🔒

- `PlayerView` gains `inventory: PvItem[]` where `PvItem = { id, name, emoji, qty, ownerId }`.
- **Seam allow-list: add exactly these five paths and nothing else** — `inventory[].id`, `inventory[].name`, `inventory[].emoji`, `inventory[].qty`, `inventory[].ownerId`. Test A must fail before you add them and pass after.
- **Sentinel corpus: add `OwnedItem.notes`** — fixture item carries `'SEAM_ITEM_NOTES'`; assert absence. DM notes on loot never reach a phone.

## Task 4 — The Pack (Realm page)

`src/realm/main.tsx` gains a **Pack** section under the stage: the 🎒 stash group first, then a group per PC who carries anything (owner names resolved from `v.party`). Rows are emoji · name · ×qty; tap opens a small detail popover. **Hidden entirely when inventory is empty** — no empty-state box. Match the existing status-strip visual language; phone-first spacing.

## Task 5 — The item-get moment (live TV / live Realm)

When the DM grants an item during play, the world should *react* — without any new plumbing:

- `RealmStage` keeps a ref of the previous view's inventory ids. When a new id appears: the owner (or, for stash grants, the party) plays the **cheer** treatment and shows a speech bubble with the item's emoji for ~2 ticks.
- This is **derived locally from successive `PlayerView`s** — Expressive state computed from Canonical, exactly like poses. No `poke` changes, no new projection fields, no persistence. The published snapshot is a photograph and does not animate a past grant; that is correct behavior.

## Task 6 — Regenerate + verify

- Regenerate `public/snapshot.json` (seed a couple of demo items so Ben's first look shows the Pack working).
- `npm run build` green — seam tests passing with **exactly five** new allow-list paths and **one** new sentinel.
- Headless render: fixture with a stash item + a PC-owned item renders the Pack with two groups; a grant between two successive views triggers the bubble path.

## Report back in plain language

1. Where the stash and per-PC items live on the Party screen, and where `Give ▸` is in the Compendium
2. What the Pack looks like on the Realm page (and that it vanishes when empty)
3. The five allow-list paths and the sentinel, verbatim
4. A demo script: grant an item while the TV is live and watch the moment
5. Anything you couldn't do
