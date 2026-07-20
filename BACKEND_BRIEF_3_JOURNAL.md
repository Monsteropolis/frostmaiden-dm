Agent Orchestration & Reasoning: Before executing, create a brief execution plan. Determine whether the task benefits from decomposition into specialized sub-agents. Spawn agents only when doing so is expected to improve quality, correctness, or efficiency. Assign each agent a clear objective, required context, and success criteria. Match the reasoning effort to the complexity of the task, using the lowest sufficient capability for routine work and reserving the highest reasoning for architecture, ambiguity, novel problem-solving, and final decision-making. Execute independent tasks in parallel where possible. After all agents complete, critically evaluate their outputs, resolve disagreements using evidence rather than majority opinion, perform an end-to-end consistency review, and produce a single integrated answer. Avoid unnecessary delegation, unnecessary reasoning, or duplicate work.

---

# Backend Brief 3 — diagnose the Realm-code gap, then build the journal

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone, no local dev environment, no terminal unless a step truly requires his own login (in which case give exact click-by-click steps). Report in plain language.

Verified against `65f4234` (Brief 1 + Brief 2 merged, CI green). This brief has **two parts, in order.** Part A is a diagnostic — Ben reports the Realm code/sync feature isn't visibly working, and Part A must find out why before Part B builds anything else on top of a possibly-broken foundation. Part B is the journal feature itself.

---

## Part A — Diagnose: why didn't Ben see the Realm code working?

**Do not assume the cause. Investigate and report findings before Part B.**

Confirmed from source: `RealmLoginSection` in `src/components/TvPanel.tsx` renders **unconditionally** — the Realm code chip is a pure local computation (`deriveRealmCode(campaignId)`) and needs no backend. So if Ben says he "didn't see the Realm code functionality," the chip itself likely rendered fine and the *actual* gap is downstream — most likely one of:

1. **The `realm-login` Edge Function was never deployed.** Brief 2's report told Ben to run four `npx supabase` terminal commands (login, link, secrets set, functions deploy) — a real barrier for a no-terminal user. If skipped, tapping **🔄 Sync party to Realm** would fail with a network error or 404, silently, and nothing about the feature would look "on" even though the chip is visible. This is the leading hypothesis — check it first.
2. **Migrations not run on the hosted project.** If the three SQL files were never executed in the Supabase dashboard, `characters`/`campaigns` don't exist and any call fails.
3. **A real bug** — something in the sync/login path that only shows up against the hosted project rather than the CI-provisioned throwaway database.

**Investigate, in this order:**
- Check whether the Edge Function is deployed to the linked project (Supabase's management API/CLI can list deployed functions — use it, don't guess).
- Check whether the migrations have been applied to the hosted project's schema.
- If both are true and it *still* fails, reproduce the actual error (tap Sync, capture what `syncMsg` displays) and fix the real bug.
- **Report which of the three it was**, in plain language, before moving to Part B.

**Then close the gap for good, regardless of cause:**
- If deployment is the blocker, **write Ben exact, copy-paste dashboard steps** (Supabase's web UI can deploy an Edge Function and set a secret without a terminal — use that path, not the CLI, since he has no local dev environment). Do not hand him CLI commands again unless there is truly no dashboard equivalent.
- Add a **visible status indicator** in `RealmLoginSection` distinguishing "not yet synced" from "sync failed — Realm server unreachable" from "synced." Right now a failed sync and a never-attempted sync may look similar; make the failure state impossible to miss, since this exact confusion is why we're here.
- Add one line of on-screen guidance for the "unreachable" case pointing at what to check (function deployed? migrations run?).

**This diagnostic work is not optional preamble — treat it as the primary deliverable of Part A, and do not proceed to Part B until Sync actually succeeds against the hosted project (or you've documented precisely why it can't yet, e.g. Ben still needs to complete a dashboard step).**

---

## Part B — The shared journal

Once Part A confirms the login path genuinely works end to end, build the journal per the approved design (`BACKEND_DESIGN_SUPABASE.md` §5–7) and Ben's decisions: **DM sees every entry** (private and shared); `is_shared` is a player-to-player visibility flag only.

### Scope fence
No decoration, no co-presence — later briefs. Do not touch Canonical state, the projection, or the seam tests. The `journal_entries` table and its RLS already exist from Brief 1 — **this brief is UI plus the write/read calls, not new schema**, unless Part A's investigation finds the existing table needs a fix.

### B1 — Data access helpers (`src/backend/realm-client.ts`)
Add, matching the existing function style (`ensureDmToken` pattern for auth, direct `sb.from(...)` calls for data):
- `listMyJournal(token)` — entries where `author_id` = the caller's `character_id` (all of theirs: private + shared).
- `listSharedJournal(token)` — entries where `is_shared = true`, campaign-scoped (RLS already enforces this — the query just asks for shared rows).
- `writeJournalEntry(token, {title, body, isShared})` — insert.
- `updateJournalEntry(token, id, patch)` — update (RLS already restricts to the author).
- `setShared(token, id, isShared)` — the promote/demote toggle Ben asked for ("flag an entry to populate the shared page without double-writing").
- **For the DM:** `listAllJournal(dmToken)` — every entry in the campaign (RLS already allows this for `is_dm` tokens per Brief 1 Task 4/Ben's decision).

### B2 — Player journal screen (Realm page, behind login)
Only visible once a player is logged in (per the existing session state in `src/realm/main.tsx`).

- **Two tabs: "Mine" and "Shared."**
  - **Mine:** every entry they've authored, private and shared both, each showing its current flag.
  - **Shared:** every `is_shared` entry from anyone in the campaign, with the author's name.
- **New entry:** title + body, saved to "Mine" as private by default.
- **On each of their own entries:** a **Share ▸** / **Unshare** toggle — this is the promote action. No duplicate-write path; toggling `is_shared` is the only mechanism (matches Ben's explicit "prevent the need for double writing").
- Editing an existing entry stays possible (author-only, per RLS).
- Handle the offline/unreachable case gracefully — reuse whatever pattern Part A's status indicator establishes; don't invent a second one.

### B3 — DM journal view (new panel or a tab on an existing DM screen — your call on placement, follow existing navigation patterns)
- Lists **every** entry across the whole party, private and shared, clearly labeled per-author and with its share state visible.
- Read-only for the DM in this brief (no editing others' entries) — matches the approved design; writing a moderation/delete-others'-entry path is out of scope unless Ben asks.

### B4 — Tests
- Extend `tests/boundary.mts` (or add a journal-specific test file following its exact pattern) with the journal-specific assertions **already specified in Brief 1's boundary test** — re-verify they still pass with real UI calls hitting them, not just synthetic tokens:
  - A player can write/edit only their own entries.
  - A player can read their own (all) + others' shared only.
  - The DM can read everything.
  - No response ever includes another player's private entry to a non-DM caller.
- These should already be guaranteed by Brief 1's RLS — this task is confirming the new UI/query code doesn't accidentally route around it (e.g., an accidental `service_role` call from the client would defeat everything; explicitly check no client code path uses anything but the per-session player/DM token).

---

## Verify before you push
- Part A's root cause is identified and either fixed or turned into unmissable on-screen guidance.
- `npm run build` green; existing seam tests and boundary tests unchanged and passing.
- End-to-end, against the real hosted project (not just CI's throwaway DB): a player logs in, writes a private entry, shares it, and it appears on both their own Shared tab and a second player's Shared tab. The DM sees it regardless of share state.

## Report back in plain language
1. **Part A: what the actual cause was**, and what Ben needs to do (if anything) to finish closing it
2. Where the journal lives for a player, and the Mine/Shared split
3. Where the DM sees it
4. Confirmation the boundary/seam tests still pass, and that journal writes only ever use a session token, never a privileged one
5. Anything you couldn't do
