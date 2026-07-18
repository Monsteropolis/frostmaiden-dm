# Backend Brief 2 — authentication (the door through the boundary)

**Repo:** `Monsteropolis/frostmaiden-dm`. Read this whole brief before touching anything.

**The person you're working for is not an engineer.** He works through the deployed site and his phone. Report in plain language.

This is the **second** backend brief. Brief 1 built the schema and proved the security boundary (PR #9, merged; boundary test green in CI). This brief builds **authentication** — how a player proves which character they are and receives a scoped token the RLS rules already understand.

## Preconditions — verify, stop if either fails

1. Brief 1 is merged (it is) **and its migration has been run on the live Supabase project.** If the tables don't exist on the project yet, the auth flow can't be tested end to end — note it and build against the schema anyway, but flag that Ben must run the SQL.
2. The Supabase client config from Brief 1 (URL + publishable key) is present. *(Note: Supabase renamed keys — the browser-safe key is now the **publishable** key, formerly "anon." Use that. Never the **secret** key, formerly "service_role.")*

## Ben's decisions (verbatim — do not relitigate)

1. **Login path:** a **stable per-campaign Realm code**, separate from the ephemeral TV session code, **also surfaced on the TV** during a session for convenience.
2. **Passwords:** the **DM decides per character.** A character with a password is gated; a character with a blank password can be picked by anyone who has the Realm code.
3. **Session length:** players **re-enter each session** — no persistent stored login. Proving identity is per-session.

## The claim contract (already established by Brief 1 — match it exactly)

The RLS helpers read three JWT claims (`src/backend/claims.ts`, and `app.campaign_id()/character_id()/is_dm()` in the migration):
- `campaign_id` (uuid) — which campaign the token belongs to
- `character_id` (text) — the player's character id; **null/absent for the DM**
- `is_dm` (bool) — true only for the DM token

The Edge Function's entire job is to mint tokens carrying these claims correctly. Get this shape wrong and every RLS rule silently misbehaves — so a test asserting the minted token's claims is mandatory (Task 5).

## Scope fence

Auth only. **No journal UI, no decoration UI, no co-presence** — those are Briefs 3+. Do not touch the projection, the snapshot, or the peer transport's live behavior (you *will* surface the Realm code through the DM UI, but you are not changing how the TV mirror works). The existing seam tests and the Brief 1 boundary test must both still pass unchanged.

---

## Task 1 — The Realm code (stable, per-campaign)

- Each campaign needs a **stable, human-typable Realm code** — distinct from the ephemeral TV room code. Derive it from the campaign id (a short, unambiguous code using the same alphabet convention the TV codes already use — no 0/O, 1/I confusion). It does **not** change per session.
- Surface it in the DM app in two places: a permanent spot in DM/Realm settings, and **on the TV during a session** (a small "Realm: XXXX" line) so a player at the table can read it off the screen.
- This code is what a player enters to reach the login screen. It identifies the *campaign*, not a session — so login works when no TV/session is active, which is the whole point of "on their own time."

## Task 2 — The DM sets passwords (Edit character page)

- Add an optional **Realm password** field to the Edit-character page (per party member), matching the existing "Fate Direct" styling.
- **Low-friction, per Ben:** the field accepts anything — a simple password or a short word/phrase. Blank is valid and meaningful: **blank = ungated** (anyone with the Realm code can pick that character).
- **The DM's device hashes the password before it leaves** — the plaintext is never sent or stored. Write the resulting hash to `characters.password_hash` (the DM token has write access to `characters`; the hash column is write-permitted even though it's never *readable* — Brief 1 granted insert/update but not select on it).
- Show a small state indicator per character: 🔒 gated / 🔓 open, so the DM can see at a glance which characters are protected.
- A "clear password" affordance sets it back to blank/ungated.

## Task 3 — The auth Edge Function (the token minter)

Create a Supabase **Edge Function** (`supabase/functions/realm-login/`). It is the **only** component that reads `password_hash`, and it needs the **secret** key to do so — which is why this logic lives server-side in the function and **never** in the client. The function:

1. Receives `{ realmCode, characterId, password }`.
2. Resolves the campaign from the Realm code; loads the character's `password_hash`.
3. **If the stored hash is blank:** the character is ungated — proceed (no password needed).
   **If a hash exists:** verify the submitted password against it. Reject on mismatch with a generic "wrong password" (don't reveal whether the character exists).
4. On success, **mint a signed JWT** carrying `campaign_id`, `character_id`, and `is_dm: false`, with a **short expiry** consistent with "re-enter each session" (e.g. a few hours — long enough for a game night, not persistent).
5. Return the token to the client.

**Security requirements:**
- The function uses the **secret** key (Supabase provides it to Edge Functions as an environment secret — it is *not* committed and *not* in the client bundle). Confirm in your report that the secret key appears nowhere in the repo or the client build.
- Passwords are compared against a hash, never stored or logged in plaintext. Never log the password or the hash.
- Rate-limit or at least debounce attempts to blunt brute-forcing a short password (best-effort — the threat model is a friendly group, but don't leave it wide open).

## Task 4 — The player login screen (Realm page)

- On the Realm page, when the player has no valid token, show a **login screen**: enter Realm code → fetch that campaign's character list (names only — Brief 1 made only `id, name` readable, never the hash) → pick your character → enter password **only if** that character is gated.
- On success, store the token **in memory for the session only** — **not** in localStorage (per "re-enter each session," and so a borrowed phone retains nothing). A refresh or reopen requires logging in again. This is deliberate.
- Handle the states on-screen (you can't devtools a phone): wrong password, unknown Realm code, ungated character (skips straight in), expired token (bounce back to login).
- Until login, the Realm still shows the **published snapshot read-only** exactly as today — logging in *adds* the ability to write (journal/decoration, in later briefs); it is not required just to *view* the world. Confirm the read-only Realm still works with no token.

## Task 5 — Tests

- **Claim-shape test:** mint a token via the function's logic for a known character; assert the JWT carries exactly `campaign_id`, `character_id`, `is_dm:false` with correct values. (Guards the contract every RLS rule depends on.)
- **Auth-behavior test:** gated character + right password → token issued; + wrong password → rejected; ungated character + no password → token issued; unknown Realm code → rejected.
- **Integration with the boundary test:** using a token minted by the real flow (not a hand-forged one), re-run the key Brief-1 assertions — a real player token can write its own placements/journal and cannot touch others' or Canonical. This proves the *minted* tokens actually satisfy the rules, not just synthetic test tokens.
- The existing seam test and Brief 1 boundary test still pass unchanged.

---

## Verify before you push

- `npm run build` green; all tests above pass; existing seam + boundary tests unchanged.
- The **secret** key is provably absent from repo and client bundle; only the Edge Function uses it, via environment secret.
- `password_hash` is still unreadable via the client (Brief 1 guarantee intact) — the Edge Function reads it server-side only.
- End-to-end (if the migration is live): DM sets a password on a character → player enters Realm code, picks that character, enters the password → receives a token. Ungated character skips the password.
- Read-only Realm still works with no login.

## Report back in plain language

1. Where the Realm code shows up (settings + TV) and how it differs from the TV code
2. Where the DM sets a character password, and the 🔒/🔓 indicator
3. What a player sees logging in — gated vs ungated character
4. Confirmation the **secret** key is nowhere in the app, and that only the Edge Function ever reads a password hash
5. That login is per-session (nothing stored on the device) and read-only viewing still needs no login
6. What Ben must do next: deploy the Edge Function (needs his Supabase login — give exact steps), and set at least one character password to test
7. Anything you couldn't do
