-- ============================================================
-- REALM BACKEND — Wave 11 (Part E): character_resources, the one
-- data model behind every class's resource sheet.
--
-- Every class resource is a POOL (a maximum, a used count, a
-- recharge trigger) or a STAT (a single number the player types).
-- Spell slots are simply nine long-rest pools (slot_1..slot_9);
-- rage/ki/superiority dice/action surge/channel divinity are pools
-- too; the caster's spellcasting modifier and a misc adjustment are
-- stats. Build it once and every class is covered.
--
-- Per-CHARACTER and Expressive, exactly like character_spells: a
-- player reads/writes only their own rows; the DM (is_dm) reads all;
-- nobody writes another character's rows. Same deny-all-then-holes
-- RLS, the same four policies keyed on app.campaign_id() /
-- app.character_id() / app.is_dm(), the same touch trigger and grants
-- as 20260721000000_realm_spells_items.sql. tests/boundary.mts proves
-- every rule and gates CI.
-- ============================================================

create table public.character_resources (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  character_id   text not null,
  kind           text not null check (kind in ('pool', 'stat')),
  key            text not null,             -- 'slot_1'..'slot_9', 'rage', 'ki', 'casting_mod', 'misc'
  max            int  not null default 0,   -- pools only
  used           int  not null default 0,   -- pools only
  recharge       text not null default 'long' check (recharge in ('short', 'long')),
  value          int  not null default 0,   -- stats only
  max_overridden boolean not null default false,
  updated_at     timestamptz not null default now(),
  unique (campaign_id, character_id, kind, key)
);
create index character_resources_campaign_idx on public.character_resources (campaign_id, character_id);

create trigger character_resources_touch before update on public.character_resources
  for each row execute function app.touch_updated_at();

-- ---- row-level security: deny-all, then exactly the needed holes ------------
alter table public.character_resources enable row level security;

revoke all on public.character_resources from anon, authenticated;
grant select, insert, update, delete on public.character_resources to authenticated;

-- a player owns their own rows; the DM may read all.
create policy character_resources_read on public.character_resources
  for select to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and (character_id = (select app.character_id()) or (select app.is_dm()))
  );
create policy character_resources_owner_insert on public.character_resources
  for insert to authenticated
  with check (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );
create policy character_resources_owner_update on public.character_resources
  for update to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  )
  with check (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );
create policy character_resources_owner_delete on public.character_resources
  for delete to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );
