# Realm backend (Supabase)

A **separate store** from Canonical state. It holds exactly three kinds of
data: character auth stubs, camp decorations (placements), and player
journals. Nothing Canonical — no HP, quests, weather, sessions, or secrets —
exists in this backend, so nothing here can leak it. The DM/player seam
remains `projectPlayerView()`, guarded by `tests/seam.mts`; this store is
guarded by `tests/boundary.mts`.

## The boundary, in one paragraph

The anon key ships in the client on purpose (that is how Supabase works);
**row-level security in Postgres is the entire security model.** Every rule
lives in `migrations/20260718000000_realm_foundation.sql`. `tests/boundary.mts`
logs in as players and as the DM and proves the database rejects every
forbidden action and allows every promised one. CI runs it on every push and
the Pages deploy is blocked unless it passes.

## Token claim contract (Brief 2 must match this)

RLS keys off a JWT with these claims, HS256-signed with the project's JWT
secret (the Edge Function of Brief 2 mints it; `tests/boundary.mts` mints
test tokens in the identical shape; TypeScript mirror in
`src/backend/claims.ts`):

```json
{
  "sub": "pc3",                 // character id, or "dm" for the DM token
  "role": "authenticated",      // always — is_dm tells players and DM apart
  "campaign_id": "<uuid>",      // the campaigns row this token belongs to
  "character_id": "pc3",        // null on a DM token
  "is_dm": false,
  "iat": 1752796800,
  "exp": 1752800400
}
```

Notes for Brief 2:
- `characters.id` is only unique **within** a campaign (it is the local
  party-member id, e.g. `pc3`); the primary key is `(campaign_id, id)`.
- `password_hash` is API-invisible by column privilege. Never `select('*')`
  on `characters` — always name columns (`select('id, name')`). And never
  **upsert** a row that includes `password_hash`: the `excluded.password_hash`
  reference counts as a read of the unreadable column and Postgres denies the
  whole write (42501). Write the hash with a plain `update()` (see
  `setRealmPassword` in `src/backend/realm-client.ts`).
- The client entry points are `getSupabase()` / `getSupabaseWithToken()` in
  `src/backend/supabase.ts`. Never a `service_role` key anywhere in the repo.

## Authentication (Brief 2)

The `realm-login` Edge Function (`functions/realm-login/`) is the only door
through the boundary: it is the sole reader of `characters.password_hash`
and `campaigns.dm_token_hash`, and the sole minter of tokens. Its
decision-making lives in `functions/_shared/realm-auth.ts` so
`tests/auth.mts` runs the exact deployed logic against the local stack.
Shared with the client (which imports the same files): the Realm-code
derivation (`_shared/realm-code.ts`) and the password hasher
(`_shared/password.ts` — the DM's device hashes before sending; plaintext
never leaves the phone).

Player login: Realm code → character picker (`id`/`name` only) → password
only if the character is gated (blank stored hash = ungated, by decision).
Tokens are short-lived (6 h) and held in page memory only — players re-enter
each session.

## Running the boundary & auth tests

```
npx supabase start        # needs Docker (CI does this automatically)
npm run test:boundary
npm run test:auth
```

Without arguments they target the local stack with the standard local-dev
demo credentials; `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` /
`SUPABASE_TEST_JWT_SECRET` / `SUPABASE_TEST_SERVICE_KEY` override.

## Applying the schema to the hosted project

The repo never holds admin credentials, so migrations are applied to the
hosted project by hand: Supabase dashboard → **SQL Editor** → paste the full
contents of the migration file → **Run**. One paste per migration file, in
filename order, once each.

## Deploying the Edge Function (hosted project)

Done from a machine that is logged into Supabase (the repo holds no
credentials). From the repo root:

```
npx supabase login                     # opens the browser once
npx supabase link --project-ref lzzrwoduheivmvnnfpaj
npx supabase secrets set REALM_JWT_SECRET="<JWT secret>"
npx supabase functions deploy realm-login
```

`<JWT secret>` is dashboard → Project Settings → **JWT Keys** → *Legacy JWT
secret* (reveal + copy). It signs the tokens the function mints; Postgres
verifies them with the same secret. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are provided to the function automatically —
the secret key is never typed anywhere, and never enters this repo or the
client bundle.
