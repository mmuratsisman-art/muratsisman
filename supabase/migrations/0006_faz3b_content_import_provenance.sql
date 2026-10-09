-- MURAT/LAB CMS — FAZ 3B-B: content import provenance (run + item ledger)
--
-- ADDITIVE migration. Creates 2 NEW tables, 2 NEW trigger functions and their triggers/policies/indexes.
-- It does NOT modify or delete any existing row, table, column, policy, trigger or function
-- (0001-0005 are untouched; this file only re-uses public.touch_row() and public.is_admin()).
-- It adds NO new SECURITY DEFINER function and no new executable surface for API roles.
--
-- *** NOT applied automatically, NOT applied to production by the delivery of FAZ 3B-B. ***
-- Apply once, manually, after 0001-0005, from the Supabase SQL Editor (see docs/cms/IMPORT.md).
-- Rollback: 0006_faz3b_content_import_provenance_down.sql (manual).
--
-- Purpose: per-record provenance for the one-time content import (src/data/* -> CMS):
--   which source record (type + slug/key + file path + content hash) produced which CMS entity, in which import run,
--   and how far the import got for that record (intent -> created -> published -> completed).
--   The import tool uses it to (a) resume an interrupted run ONLY for records it can prove it created,
--   (b) scope a rollback to records it imported, (c) detect inconsistencies between provenance and real CMS rows.
--
-- This ledger is evidence, not authority: the tool never trusts it alone. Content equality is always re-verified
-- against the live CMS rows before resuming or rolling back.
--
-- Access: admin only (public.is_admin()). anon: nothing. No DELETE grant: history is append/forward-only
-- (a rolled-back item is marked 'rolled_back', never removed).

------------------------------------------------------------------------------------------
-- 1. Runs
------------------------------------------------------------------------------------------

create table public.content_import_runs (
  id            uuid primary key default gen_random_uuid(),
  tool_version  text not null,
  source_digest text not null,
  plan_digest   text not null,
  status        text not null default 'running',
  summary       jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,

  constraint content_import_runs_status_valid  check (status in ('running', 'completed', 'aborted')),
  constraint content_import_runs_source_digest check (source_digest ~ '^[0-9a-f]{64}$'),
  constraint content_import_runs_plan_digest   check (plan_digest ~ '^[0-9a-f]{64}$'),
  constraint content_import_runs_summary_obj   check (jsonb_typeof(summary) = 'object')
);

------------------------------------------------------------------------------------------
-- 2. Items (one active row per source record)
------------------------------------------------------------------------------------------

create table public.content_import_items (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.content_import_runs (id) on delete restrict,
  last_run_id uuid not null references public.content_import_runs (id) on delete restrict,
  entity_type text not null,
  source_key  text not null,                 -- slug (project | lab_entry | note) or site content key
  source_path text not null,                 -- e.g. src/data/projects/yakala.ts (informational)
  source_hash text not null,                 -- sha256 of the canonical document the tool writes (draft doc)
  entity_id   uuid,                          -- CMS row id (projects/lab_entries/notes); NULL for site_content
  state       text not null default 'intent',
  seo_hash    text,                          -- projects only: sha256 of the {seo_title, seo_description} pair written after publish
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,

  constraint content_import_items_type_valid   check (entity_type in ('project', 'lab_entry', 'note', 'site_content')),
  constraint content_import_items_state_valid  check (state in ('intent', 'created', 'published', 'completed', 'rolled_back')),
  constraint content_import_items_key_len      check (char_length(source_key) between 1 and 80),
  constraint content_import_items_hash_format  check (source_hash ~ '^[0-9a-f]{64}$' and (seo_hash is null or seo_hash ~ '^[0-9a-f]{64}$')),
  constraint content_import_items_entity_shape check ((entity_type = 'site_content') = (entity_id is null) or state in ('intent', 'rolled_back')),
  constraint content_import_items_seo_projects check (seo_hash is null or entity_type = 'project'),
  constraint content_import_items_error_len    check (last_error is null or char_length(last_error) <= 500)
);

-- One ACTIVE (non rolled-back) item per source record, and one active item per CMS entity.
create unique index content_import_items_active_source_key on public.content_import_items (entity_type, source_key)
  where state <> 'rolled_back';
create unique index content_import_items_active_entity on public.content_import_items (entity_id)
  where entity_id is not null and state <> 'rolled_back';
create index content_import_items_run_idx on public.content_import_items (run_id);

------------------------------------------------------------------------------------------
-- 3. Guard triggers
--    * Identity columns are immutable (a ledger row can never be re-pointed at another source/run).
--    * entity_id may be set once (NULL -> value), never changed.
--    * State moves forward only: intent -> created -> published -> completed; any state -> rolled_back (terminal).
------------------------------------------------------------------------------------------

create or replace function public.guard_content_import_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rank_old int;
  rank_new int;
begin
  if new.run_id is distinct from old.run_id
     or new.entity_type is distinct from old.entity_type
     or new.source_key is distinct from old.source_key
     or new.source_path is distinct from old.source_path
     or new.source_hash is distinct from old.source_hash
     or new.created_at is distinct from old.created_at then
    raise exception 'content_import_items identity columns are immutable' using errcode = '23514';
  end if;

  if old.entity_id is not null and new.entity_id is distinct from old.entity_id then
    raise exception 'content_import_items.entity_id cannot be changed once set' using errcode = '23514';
  end if;

  if old.state = 'rolled_back' and new.state <> 'rolled_back' then
    raise exception 'rolled_back is terminal' using errcode = '23514';
  end if;

  if new.state is distinct from old.state and new.state <> 'rolled_back' then
    rank_old := array_position(array['intent', 'created', 'published', 'completed'], old.state);
    rank_new := array_position(array['intent', 'created', 'published', 'completed'], new.state);
    if rank_new <> rank_old + 1 then
      raise exception 'invalid import item transition % -> %', old.state, new.state using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_content_import_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tool_version is distinct from old.tool_version
     or new.source_digest is distinct from old.source_digest
     or new.plan_digest is distinct from old.plan_digest
     or new.started_at is distinct from old.started_at
     or new.created_at is distinct from old.created_at then
    raise exception 'content_import_runs identity columns are immutable' using errcode = '23514';
  end if;
  if old.status <> 'running' and new.status is distinct from old.status then
    raise exception 'a finished import run cannot change status' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger content_import_runs_guard before update on public.content_import_runs
  for each row execute function public.guard_content_import_run();
create trigger content_import_runs_touch before insert or update on public.content_import_runs
  for each row execute function public.touch_row();
create trigger content_import_items_guard before update on public.content_import_items
  for each row execute function public.guard_content_import_item();
create trigger content_import_items_touch before insert or update on public.content_import_items
  for each row execute function public.touch_row();

------------------------------------------------------------------------------------------
-- 4. RLS + grants: admin only; no DELETE for anyone
------------------------------------------------------------------------------------------

alter table public.content_import_runs  enable row level security;
alter table public.content_import_items enable row level security;

revoke all on public.content_import_runs, public.content_import_items from anon, authenticated;
grant select, insert, update on public.content_import_runs, public.content_import_items to authenticated;

create policy content_import_runs_admin_all on public.content_import_runs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy content_import_items_admin_all on public.content_import_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
