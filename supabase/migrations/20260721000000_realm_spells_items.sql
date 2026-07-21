-- ============================================================
-- REALM BACKEND — Wave 10 (Parts B3 + C1): two player-owned
-- Expressive tables, following the established pattern exactly.
--
--   character_spells — a player's known/prepared spell tags.
--   item_locations   — where a player keeps each item (person/home).
--
-- Both are per-CHARACTER (unlike communal placements): a player
-- reads/writes only their own rows; the DM (is_dm) reads all;
-- nobody writes another character's rows. This is the same seam
-- the journal uses for author_id, keyed on character_id.
--
-- Neither table holds Canonical state — the item's EXISTENCE and
-- the spell's rules stay on the DM's device / the 5e API. These
-- rows only record the player's own arrangement, exactly like
-- decorations. tests/boundary.mts proves every rule and gates CI.
-- ============================================================

-- ---- character_spells (B3) -------------------------------------------------
create table public.character_spells (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  character_id text not null,
  spell_index  text not null,             -- the 5e API index, e.g. 'fire-bolt'
  known        boolean not null default true,
  prepared     boolean not null default false,
  updated_at   timestamptz not null default now(),
  unique (campaign_id, character_id, spell_index)
);
create index character_spells_campaign_idx on public.character_spells (campaign_id, character_id);

create trigger character_spells_touch before update on public.character_spells
  for each row execute function app.touch_updated_at();

-- ---- item_locations (C1) ---------------------------------------------------
create table public.item_locations (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  character_id text not null,
  item_id      text not null,             -- the OwnedItem.id from the snapshot
  location     text not null default 'person' check (location in ('person', 'home')),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, character_id, item_id)
);
create index item_locations_campaign_idx on public.item_locations (campaign_id, character_id);

create trigger item_locations_touch before update on public.item_locations
  for each row execute function app.touch_updated_at();

-- ---- row-level security: deny-all, then exactly the needed holes ------------
alter table public.character_spells enable row level security;
alter table public.item_locations   enable row level security;

revoke all on public.character_spells, public.item_locations from anon, authenticated;
grant select, insert, update, delete on public.character_spells to authenticated;
grant select, insert, update, delete on public.item_locations   to authenticated;

-- character_spells: a player owns their own rows; the DM may read all.
create policy character_spells_read on public.character_spells
  for select to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and (character_id = (select app.character_id()) or (select app.is_dm()))
  );
create policy character_spells_owner_insert on public.character_spells
  for insert to authenticated
  with check (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );
create policy character_spells_owner_update on public.character_spells
  for update to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  )
  with check (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );
create policy character_spells_owner_delete on public.character_spells
  for delete to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );

-- item_locations: identical shape — a player owns their own rows; DM reads all.
create policy item_locations_read on public.item_locations
  for select to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and (character_id = (select app.character_id()) or (select app.is_dm()))
  );
create policy item_locations_owner_insert on public.item_locations
  for insert to authenticated
  with check (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );
create policy item_locations_owner_update on public.item_locations
  for update to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  )
  with check (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );
create policy item_locations_owner_delete on public.item_locations
  for delete to authenticated
  using (
    campaign_id = (select app.campaign_id())
    and character_id = (select app.character_id())
  );
