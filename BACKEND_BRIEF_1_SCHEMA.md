# Backend Brief 1 — schema, security rules, and the boundary test

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language.

This is the **first** backend brief. It implements the approved design in `BACKEND_DESIGN_SUPABASE.md` §5–6. It builds the foundation and **proves the security boundary before any feature is built on it.** This is the backend equivalent of "write the seam's absence-test first."

You will be given a **Supabase Project URL** and **anon key** in the prompt.

## The single most important rule of this brief

**Nothing ships until the boundary test (Task 5) passes.** That test proves a logged-in *player* cannot write campaign state or read another player's private data. If it fails, stop and report — do not build features on an unproven boundary.

## Scope fence

This brief creates the backend foundation only. **No features yet** — no journal UI, no decoration, no co-presence, no password-setting UI. Those are later briefs. Do not touch the DM app's existing Canonical state, the projection, the snapshot, or the peer transport. **The existing seam tests must still pass unchanged** — this brief adds a *separate* store and must not alter `projectPlayerView` or anything it touches.

---

## Task 1 — Client config

Add the Supabase client (`@supabase/supabase-js`). Put the **Project URL** and **anon key** in config — these are safe to commit (the anon key is designed to ship in public web apps; RLS is what enforces security). Follow the repo's existing config pattern.

**Never** reference a `service_role` key anywhere. If one appears in any instruction, refuse and report — it bypasses all security and must never enter the client, repo, or build.

---

## Task 2 — The five tables

Create these via Supabase migration SQL (commit the migration files to the repo so the schema is version-controlled). Match `BACKEND_DESIGN_SUPABASE.md` §5.

**`campaigns`** — `id uuid pk`, `name text`, `dm_token_hash text`, `created_at`.

**`characters`** — `id text pk` (matches the local party member id), `campaign_id uuid fk`, `name text`, `password_hash text`, `created_at`. Auth stub only — **no campaign data, no HP, nothing Canonical.**

**`placements`** — `id uuid pk`, `campaign_id uuid fk`, `owner_id text` (the placing character's id), `scene_id text`, `item_ref text`, `x real`, `y real`, `updated_at`.
> Note: `owner_id` is stored now even though v1 is "fully communal — anyone can move anything." It is unused by this brief's rules but present so the future "personal areas" model needs no migration. Do not enforce ownership on placements in v1.

**`journal_entries`** — `id uuid pk`, `campaign_id uuid fk`, `author_id text`, `title text`, `body text`, `is_shared boolean default false`, `updated_at`.

Enable **row-level security on every table** (Supabase defaults to deny-all once RLS is on — that's what we want; we then open exactly the needed holes).

---

## Task 3 — Identity claims

RLS rules key off two claims that a logged-in player's token carries: `campaign_id` and `character_id`, plus a boolean `is_dm`. The token is minted by the auth Edge Function (built in Brief 2) — for **this** brief, stub the claim-reading helper and drive the boundary test (Task 5) with locally-minted test tokens carrying known claims, so the RLS rules can be validated before the real auth flow exists.

Document the exact claim shape you use so Brief 2's Edge Function matches it.

---

## Task 4 — The RLS rules (the heart)

Write these as Supabase policies. Plain-language intent, per `BACKEND_DESIGN_SUPABASE.md` §6 and Ben's decisions (communal camp; DM sees all journals):

**`placements`**
- **read:** any token whose `campaign_id` matches the row's. (Whole group sees the shared camp.)
- **insert/update/delete:** any player token whose `campaign_id` matches. **v1 is communal — do not restrict writes to `owner_id`.** (The column is recorded, not enforced.)

**`journal_entries`**
- **read:** the author (`author_id` = token's `character_id`), OR any campaign member when `is_shared = true`, OR the DM (`is_dm` true) for any row in their campaign. (Ben's decision: **DM sees everything.**)
- **insert/update/delete:** the author only (`author_id` = token's `character_id`). No one edits another player's entry. (The DM can *read* private entries but does not edit them through this path.)

**`characters`**
- **read:** `id` and `name` may be read by campaign members (needed for the join picker). **`password_hash` must never be selectable** — exclude it from any player-readable path (use a view or column privilege so the hash is not returned by the normal API).
- **write:** DM token only.

**`campaigns`** — read by campaign members; write by DM token only.

**Canonical:** there are no Canonical tables. Confirm in your report that nothing in this schema can alter HP, quests, weather, or any campaign secret — by construction, because none of it exists here.

---

## Task 5 — The boundary test (gates everything) 🔒

Create an automated test (runnable in CI, mirroring the `tests/seam.mts` discipline) that logs in as a **player** (a token with a player's claims, `is_dm=false`) and **asserts every one of these is REJECTED by the database:**

1. Insert/update/delete a `journal_entries` row authored by a *different* character → **denied.**
2. Read a *different* player's private (`is_shared=false`) journal entry → **returns nothing.**
3. Write to `characters` (any row) → **denied.**
4. Write to `campaigns` → **denied.**
5. Select `password_hash` from `characters` → **denied / not returned.**
6. Any attempt to reach a Canonical field (there is none — assert the schema exposes no HP/quest/weather table at all).

And asserts these **succeed:**
7. A player inserts/moves/deletes a `placements` row in their campaign → **allowed** (communal).
8. A player writes their own journal entry → **allowed.**
9. A player reads a shared journal entry from another player → **allowed.**
10. The DM token reads another player's private entry → **allowed** (Ben's decision).

Wire this into the build/CI so a future rule change that opens a hole **fails the build**, exactly like the seam test. This is the standing guarantee.

---

## Verify before you push

- The app still builds and the **existing seam tests pass unchanged** — this brief added a separate store and touched nothing Canonical.
- All ten boundary assertions pass.
- `password_hash` is provably unreadable via the anon path.
- The migration files are committed (schema is version-controlled, reproducible).
- No `service_role` key anywhere in the repo or build.

## Report back in plain language

1. The five tables, one line each on what they hold
2. In plain terms: what a logged-in player *can* and *cannot* do, per the boundary test
3. Confirmation the DM's campaign secrets are not in this backend at all, and why that's structural not vigilant
4. Confirmation the boundary test runs in CI and what happens if a rule later opens a hole
5. What Ben needs to do next (this brief has no user-facing UI yet — set expectations)
6. Anything you couldn't do
