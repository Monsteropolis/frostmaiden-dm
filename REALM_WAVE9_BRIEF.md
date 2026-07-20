Agent Orchestration & Reasoning: Before executing, create a brief execution plan. Determine whether the task benefits from decomposition into specialized sub-agents. Spawn agents only when doing so is expected to improve quality, correctness, or efficiency. Assign each agent a clear objective, required context, and success criteria. Match the reasoning effort to the complexity of the task, using the lowest sufficient capability for routine work and reserving the highest reasoning for architecture, ambiguity, novel problem-solving, and final decision-making. Execute independent tasks in parallel where possible. After all agents complete, critically evaluate their outputs, resolve disagreements using evidence rather than majority opinion, perform an end-to-end consistency review, and produce a single integrated answer. Avoid unnecessary delegation, unnecessary reasoning, or duplicate work.

---

# Brief — Wave 9: unblock the Realm, audit the sprites, reclaim the stage

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** No terminal, no local dev environment — he works through the deployed site, the Supabase dashboard, and his phone. Any step that must be his needs exact click-by-click instructions in a browser. Report in plain language.

Verified against `d67fa85` (Briefs 1–3 merged). **Part A is blocking and comes first** — Ben cannot use the Realm at all right now. Parts B and C are independent of it and of each other.

---

## Part A — The Realm connection is broken (Ben's QA #3 and #5 — same root cause)

**Symptoms:** Tapping **🔄 Sync party to Realm** returns *"Could not set up the campaign."* Then attempting to log in from the Realm page returns *"no party found with that realm code."* These are one failure: the sync never succeeded, so no campaign and no character rows exist, so there is nothing for a login to find.

**Verified trace (do not re-derive):** `supabase/functions/_shared/realm-auth.ts:107–110` — the `dm-login` action inserts into `campaigns` with columns `{id, name, dm_token_hash, realm_code}`. On any database error it returns the generic `err(500, 'Could not set up the campaign.')` and **discards the actual Postgres error.** Two of the four columns/permissions that insert depends on come from migrations *after* the foundation:
- `realm_code` is added by `20260719000000_realm_code.sql`
- `service_role` INSERT/UPDATE privileges are granted by `20260719000001_service_role_grants.sql`

If either migration hasn't been applied to the **hosted** project, that insert fails and produces exactly this error. Note the irony to avoid repeating: a previous commit already fixed this same swallowed-error pattern in the *test* path (`6e6fdaf`, "surface the real service-role error instead of a swallowed one") — the production path still has it.

### A1 — Stop swallowing the real error
Change every generic `Could not set up the campaign.` return to include the underlying database error message (code + message). This is a DM-facing diagnostic path, not player-facing — it leaks no campaign secrets (there are no Canonical tables in this backend by construction). Surface it in the TvPanel's sync status so Ben can read it on his phone without devtools.

### A2 — Preflight the schema, and say exactly what's missing
Before attempting the insert, verify the expected schema is present (that `campaigns` exists **and** has a `realm_code` column, that `characters` exists, and that the service role can actually write). On failure return a specific, actionable message naming **which migration file** to run — e.g. *"The database is missing `realm_code` — run `20260719000000_realm_code.sql` in the Supabase SQL Editor."*

Mirror this in the app: `RealmUnreachableError` already distinguishes missing tables (`realm-client.ts:211`); extend that vocabulary so "tables missing", "column missing", "permission denied", and "function not deployed" are four visibly different messages, each naming the fix.

### A3 — Give Ben a one-screen setup check
Add a small **"Check Realm setup"** button next to Sync in the TvPanel that runs the preflight and reports a plain-language checklist: function reachable ✓/✗, tables present ✓/✗, `realm_code` column present ✓/✗, service role can write ✓/✗ — each failure naming the exact dashboard step to fix it. He should never again be told only that something "could not" happen.

### A4 — Confirm the actual state and tell him what to do
Determine whether all three migrations have in fact been applied to the hosted project, and whether the Edge Function is deployed and its secrets set. Report the true state. If a step remains, give **browser-only** instructions (SQL Editor / dashboard function deploy) — no CLI.

### A5 — Multiple campaigns (Ben's forward-looking ask — scope deliberately)
Ben asked whether he can see which realms exist and hold more than one, for running multiple campaigns. **Do not build campaign switching in this wave.** Do two small things:
- Surface the current campaign's identity in the Realm login section: the Realm code plus the campaign id and name, so it's inspectable rather than invisible.
- Confirm in your report how a second campaign would work today given `realm.campaignId` lives in `AppState` (i.e. per save file) — Ben needs to know whether loading a different save already yields a separate realm, and whether anything would collide. This is a fact-finding answer, not a build.

---

## Part B — The sprite audit (Ben's QA #1 and #2)

### B1 — Walk animation plays when nobody is walking (QA #1) 🐛

**Verified root cause:** `pickPose` (`src/tv/realm-stage.tsx:87, 90`) assigns the `walk` pose from a **seeded random roll** — 35% of actors in camp, 60% on map/road scenes — *independently of whether the actor is moving.* Line 470 then derives a ±7px drift *from* the pose, so a "walking" actor plays a full walk cycle while barely translating. That is precisely Ben's complaint: the walk animation is used when the character isn't walking.

**Fix — invert the dependency.** Movement should determine the pose, not the reverse: compute the actor's position for this tick, compare to its previous position, and use `walk` **only when the delta is non-trivial**; otherwise `idle`. There is already a correct precedent in this file at line 556 (allies use `moving ? 'walk' : 'idle'`) — extend that model to the party/PC path and to combat actors (line 507, where `c.active ? 'walk'` currently forces a walk cycle on the active combatant regardless of motion).

Keep all randomness seeded and deterministic (the session sim depends on it). The goal is that a standing character stands still and a drifting character walks — nothing more elaborate.

### B2 — Systematic sprite audit (QA #2)

Ben flagged: chort, lizardfolk (F/M), slug, pumpkin dude, dwarf (M/F), elf (M/F), knight (M/F), wizard (M/F), trader — and correctly judged it "widespread." Two distinct defects are in play; find both, and audit **every** descriptor rather than only the named ones.

**Defect 1 — the picker thumbnail does not clip.** `.sprite-pick-thumb` (`src/styles/base.css:663`) sets background and border-radius but **no `overflow: hidden`** — the same class of bug fixed for `SpriteActor` in Wave 7. A thumb box sized to one frame with no clip lets neighbouring frames bleed in, which matches the doubled-sprite appearance in Ben's screenshots. Fix the thumbnail box the same way the actor box was fixed, and check every other place a sprite frame is rendered (initiative rows, any preview) for the identical omission.

**Defect 2 — verify the descriptors against the actual files.** Write a check (a script, or a test in the existing harness) that for **every** entry in `ACTOR_SPRITES` and every anim asserts:
- sheet width ÷ `frameW` equals the declared `frames` exactly (no remainder),
- sheet height matches `frameH` (× rows where a `row` is used),
- `contentH` and `footPad` match the measured content bounding box of frame 0,
- no declared frame is entirely empty.

Report a table of every mismatch. Fix them by **re-measuring the source**, never by guessing.

**Defect 3 — the ÷28 tripwire is over-firing.** The comment at `actor-sprites.ts:66–68` states the pack's playable heroes "are all 16×28 → the ÷28 tripwire refuses them, as designed." That is a **false positive.** The corruption signature we were guarding against was the ×0.875 rescale, which produced sheets where dimensions were 7/8 of a power-of-two-ish native size — the meaningful test is *both* dimensions divisible by 28, not either one. 16×28 is a legitimate native frame size in the 0x72 pack. Narrow the tripwire accordingly (and document the corrected rule where the old one is described), then re-verify any sprite previously rejected on that basis. Do **not** weaken it to the point where genuinely corrupted ×0.875 sheets would pass — state in your report what the corrected rule is and confirm it still rejects the known-bad dimension families.

### B3 — The demon at two sizes

Wave 8 doubled the demon to `scale: 2` at Ben's request; it's now too large. Two changes:

1. **Change the enlarged demon to `scale: 1.5`.**
2. **Register a second demon descriptor** so the picker offers both — one at the sprite's **original/native scale** (`scale: 1`, matching every other actor) and one at the enlarged **1.5×**. Ben's labels: *"original size"* and *"vomaat size"*. Use wording close to his so he recognises them in the picker; the exact strings are his call to refine later.

Implementation notes:
- **Both entries share the same image assets** — this is two `ACTOR_SPRITES` entries pointing at the same files, not a duplicated PNG. Do not copy art.
- **Only ONE of the two may carry `matches` patterns.** If both auto-match monster names, foe sprite resolution becomes ambiguous and non-deterministic. Give `matches` to the original-size entry and make the enlarged one **picker-only** (explicitly chosen, never auto-assigned).
- **On the fractional scale:** 1.5 is not an integer, and this project's standing rule is integer-only scaling for pixel art. It is acceptable *here* because the per-actor scale multiplies inside the logical canvas, which is then integer-scaled to the display — so at even stage scales (4×, 6×) the sprite's pixels land on whole device pixels (1.5 × 4 = 6). At odd stage scales it will be very slightly soft. Implement it the way Wave 5's `depthScale` already does — a **CSS `transform: scale()` on the actor wrapper**, GPU-composited, never by resampling the source image. Do not introduce a second scaling mechanism.

---

## Part C — Give the Realm the space (Ben's QA #4)

Ben wants the stage to occupy the full area on the right, and says it matters even more in fullscreen — because players will soon be running around, decorating, and interacting with things on that surface. Right now the diorama is a small box in a large dark field (his screenshots 3 and 4).

**Verified constraint:** the stage is a fixed **384×224** logical canvas rendered at the largest *integer* scale that fits. On his display that lands at 4× (1536×896); 5× would need 1120px of height and doesn't fit, so ~400px of available width goes unused. Integer scaling is non-negotiable — fractional scaling destroys pixel art — so the space has to come from somewhere else.

Do both of the following:

**C1 — Reclaim wasted space.** Trim the padding, margins, and chrome around the stage container so the available box is as large as it can be, in both the normal and fullscreen layouts. In fullscreen especially, the scene is the point — everything else should yield. This alone may be enough to reach the next integer step.

**C2 — Widen the logical canvas.** A taller-than-necessary 384×224 canvas wastes width on a 16:9 screen and, more importantly, gives players very little room to move around in. Widen the logical stage (e.g. to 448×224 or 512×224 — pick based on what actually fits the common cases and keeps a clean tile grid; 224 is already divisible by both 16 and 32, so preserve that property on the width you choose). More width means more room to walk and more surface to decorate, which is the direction the product is heading.

Handle existing art honestly: legacy 384-wide flat backgrounds should anchor or scale to fill the wider canvas without distortion (they are backdrops — mild cropping or edge extension is acceptable; stretching is not). Tile scenes should be re-composed to the new grid width. Re-measure the ground band so actors don't shift vertically.

Verify on both surfaces — `tv.html` and `realm.html` share `RealmStage`, and the Realm page is where players will actually be moving around.

---

## Verify before you push
- `npm run build` green; existing seam, boundary, and journal tests all pass unchanged.
- **Part A:** the sync path reports the *real* underlying error; the setup check correctly identifies a deliberately-broken configuration; the true hosted state is reported.
- **Part B:** the audit table shows zero mismatches; standing actors do not play walk cycles; the corrected tripwire still rejects known-bad dimensions; both demon entries appear in the picker and only one auto-matches.
- **Part C:** the stage visibly fills more of the available area in both normal and fullscreen, at an integer scale, on both `tv.html` and `realm.html`.

## Report back in plain language
1. **Part A: exactly why the sync failed**, and precisely what Ben must do (browser-only) to finish fixing it
2. The multi-campaign fact-finding answer from A5
3. What the sprite audit found — the mismatch table, and what the corrected ÷28 rule is
4. Confirmation that a standing character now stands still
5. What the stage looks like now, and what logical canvas size you chose and why
6. Anything you couldn't do
