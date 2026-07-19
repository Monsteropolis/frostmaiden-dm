-- ============================================================
-- REALM BACKEND — Brief 2 follow-up: service_role grants, made EXPLICIT.
--
-- Brief 1 customised table privileges — it revoked everything from
-- anon/authenticated and then granted authenticated exactly what it
-- needs — and RELIED on service_role's implicit default privileges for
-- the rest. The hosted project has those defaults; a local
-- `supabase start` stack does not reliably, so the auth Edge Function's
-- stand-in (a service_role client in tests/auth.mts) hit
-- "permission denied for table campaigns" (SQLSTATE 42501) provisioning
-- a campaign.
--
-- service_role is the trusted Edge-Function identity: it is the ONLY
-- component that reads password_hash / dm_token_hash and the one that
-- provisions campaigns. Granting it full access here is by design and
-- matches what the hosted project already has (so this is a no-op there).
-- It does NOT touch the anon/authenticated boundary that
-- tests/boundary.mts guards — those roles keep exactly the grants Brief 1
-- gave them, and password_hash stays unreadable to everyone but
-- service_role.
-- ============================================================

grant all on public.campaigns        to service_role;
grant all on public.characters       to service_role;
grant all on public.placements       to service_role;
grant all on public.journal_entries  to service_role;
