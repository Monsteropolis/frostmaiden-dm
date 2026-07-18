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
  on `characters` — always name columns (`select('id, name')`).
- The client entry points are `getSupabase()` / `getSupabaseWithToken()` in
  `src/backend/supabase.ts`. Never a `service_role` key anywhere in the repo.

## Running the boundary test

```
npx supabase start        # needs Docker (CI does this automatically)
npm run test:boundary
```

Without arguments it targets the local stack with the standard local-dev
demo credentials; `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` /
`SUPABASE_TEST_JWT_SECRET` override.

## Applying the schema to the hosted project

The repo never holds admin credentials, so migrations are applied to the
hosted project by hand: Supabase dashboard → **SQL Editor** → paste the full
contents of the migration file → **Run**. One paste per migration file, in
filename order, once each.
