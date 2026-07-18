-- ============================================================
-- REALM BACKEND — Brief 1: foundation schema + the RLS boundary.
--
-- This is a SEPARATE store from Canonical state. By construction
-- there is no HP, quest, weather, session, NPC, or monster table
-- here — the DM's secrets cannot leak from this backend because
-- they never enter it. The only data: auth stubs, camp
-- decorations (placements), and player journals.
--
-- Security model: the anon key ships in the client (that is by
-- design); every rule below is enforced by Postgres row-level
-- security keyed off three JWT claims minted by the auth Edge
-- Function (Brief 2):
--   campaign_id  uuid   — which campaign this token belongs to
--   character_id text   — the player's character id (null for DM)
--   is_dm        bool   — DM token
-- Full claim shape is documented in src/backend/claims.ts and
-- supabase/README.md. tests/boundary.mts proves every rule and
-- gates CI, exactly like tests/seam.mts gates the projection.
-- ============================================================

-- ---- claim helpers ---------------------------------------------------------
create schema if not exists app;
grant usage on schema app to anon, authenticated;

create or replace function app.campaign_id() returns uuid
language sql stable as $$
  select nullif(coalesce(auth.jwt() ->> 'campaign_id', ''), '')::uuid
$$;

create or replace function app.character_id() returns text
language sql stable as $$
  select nullif(coalesce(auth.jwt() ->> 'character_id', ''), '')
$$;

create or replace function app.is_dm() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_dm')::boolean, false)
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

grant execute on all functions in schema app to anon, authenticated;

-- ---- the four tables -------------------------------------------------------

create table public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  dm_token_hash text not null default '',
  created_at    timestamptz not null default now()
);

-- Auth stub ONLY: a character row carries a name and a password hash,
-- never HP, never anything Canonical. `id` is the local party-member id
-- (a per-device counter like "pc3"), so it is only unique WITHIN a
-- campaign — the primary key is composite for that reason.
create table public.characters (
  id            text not null,
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  name          text not null default '',
  password_hash text,
  created_at    timestamptz not null default now(),
  primary key (campaign_id, id)
);

-- Camp decorations. v1 is fully communal: owner_id is RECORDED (so the
-- future "personal areas" model needs no migration) but NOT enforced.
create table public.placements (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id    text not null default '',
  scene_id    text not null default '',
  item_ref    text not null default '',
  x           real not null default 0,
  y           real not null default 0,
  updated_at  timestamptz not null default now()
);
create index placements_campaign_idx on public.placements (campaign_id);

create table public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id   text not null,
  title       text not null default '',
  body        text not null default '',
  is_shared   boolean not null default false,
  updated_at  timestamptz not null default now()
);
create index journal_entries_campaign_idx on public.journal_entries (campaign_id);

create trigger placements_touch before update on public.placements
  for each row execute function app.touch_updated_at();
create trigger journal_entries_touch before update on public.journal_entries
  for each row execute function app.touch_updated_at();

-- ---- row-level security: deny-all, then exactly the needed holes -----------

alter table public.campaigns       enable row level security;
alter table public.characters      enable row level security;
alter table public.placements      enable row level security;
alter table public.journal_entries enable row level security;

-- Table privileges. Supabase grants broad defaults to anon/authenticated on
-- new tables; replace them with exactly what the rules need. `anon` (no
-- login) gets NOTHING — every read requires a campaign token.
revoke all on public.campaigns, public.characters, public.placements, public.journal_entries
  from anon, authenticated;

grant select, insert, update, delete on public.placements       to authenticated;
grant select, insert, update, delete on public.journal_entries  to authenticated;
grant select, insert, update, delete on public.campaigns        to authenticated;
grant         insert, update, delete on public.characters       to authenticated;
-- password_hash is deliberately ABSENT from this column list: the API can
-- never return it, to anyone, DM included. (Selecting it — or `*`, which
-- expands to it — fails with "permission denied".)
grant select (id, campaign_id, name, created_at) on public.characters to authenticated;

-- campaigns: members read their own campaign; only the DM writes it.
create policy campaigns_member_read on public.campaigns
  for select to authenticated
  using (id = (select app.campaign_id()));
create policy campaigns_dm_insert on public.campaigns
  for insert to authenticated
  with check ((select app.is_dm()) and id = (select app.campaign_id()));
create policy campaigns_dm_update on public.campaigns
  for update to authenticated
  using ((select app.is_dm()) and id = (select app.campaign_id()))
  with check ((select app.is_dm()) and id = (select app.campaign_id()));
create policy campaigns_dm_delete on public.campaigns
  for delete to authenticated
  using ((select app.is_dm()) and id = (select app.campaign_id()));

-- characters: members read id/name (join picker); only the DM writes.
create policy characters_member_read on public.characters
  for select to authenticated
  using (campaign_id = (select app.campaign_id()));
create policy characters_dm_insert on public.characters
  for insert to authenticated
  with check ((select app.is_dm()) and campaign_id = (select app.campaign_id()));
create policy characters_dm_update on public.characters
  for update to authenticated
  using ((select app.is_dm()) and campaign_id = (select app.campaign_id()))
  with check ((select app.is_dm()) and campaign_id = (select app.campaign_id()));
create policy characters_dm_delete on public.characters
  for delete to authenticated
  using ((select app.is_dm()) and campaign_id = (select app.campaign_id()));

-- placements: fully communal within the campaign — any member may place,
-- move, or remove anything (Ben's decision). owner_id is not consulted.
create policy placements_member_read on public.placements
  for select to authenticated
  using (campaign_id = (select app.campaign_id()));
create policy placements_member_insert on public.placements
  for insert to authenticated
  with check (campaign_id = (select app.campaign_id()));
create policy placements_member_update on public.placements
  for update to authenticated
  using (campaign_id = (select app.campaign_id()))
  with check (campaign_id = (select app.campaign_id()));
create policy placements_member_delete on public.placements
  for delete to authenticated
  using (campaign_id = (select app.campaign_id()));

-- journals: the author owns the words. Anyone in the campaign reads a
-- SHARED entry; a private entry is readable by its author and by the DM
-- (Ben's decision: the DM sees everything). Only the author ever writes.
create policy journal_read on public.journal_entries
  for select to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and (
      author_id = (select app.character_id())
      or is_shared
      or (select app.is_dm())
    )
  );
create policy journal_author_insert on public.journal_entries
  for insert to authenticated
  with check (
    campaign_id = (select app.campaign_id())
    and author_id = (select app.character_id())
  );
create policy journal_author_update on public.journal_entries
  for update to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and author_id = (select app.character_id())
  )
  with check (
    campaign_id = (select app.campaign_id())
    and author_id = (select app.character_id())
  );
create policy journal_author_delete on public.journal_entries
  for delete to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and author_id = (select app.character_id())
  );
