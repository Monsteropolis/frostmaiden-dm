-- ============================================================
-- REALM BACKEND — Brief 2: the Realm code column.
--
-- Each campaign gets a stable, human-typable code (derived from
-- its uuid by supabase/functions/_shared/realm-code.ts and
-- stamped here by the realm-login Edge Function at provisioning).
-- Players type this code to reach the login screen; it identifies
-- the CAMPAIGN, not a session, so login works with no TV running.
--
-- Readable by campaign members through the existing table-level
-- grant + campaigns_member_read policy — the code is shown on the
-- TV on purpose; it is the password (verified server-side against
-- characters.password_hash) that actually gates a character.
-- ============================================================

alter table public.campaigns add column if not exists realm_code text;
create unique index if not exists campaigns_realm_code_idx
  on public.campaigns (realm_code);
