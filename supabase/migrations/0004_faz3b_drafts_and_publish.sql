-- MURAT/LAB CMS — FAZ 3B-A1: draft infrastructure + atomic publish functions (Notes & Lab)
--
-- ADDITIVE migration. Does NOT modify or delete any existing row, table, column, policy or function.
-- It adds: 2 draft tables, 1 shared trigger function + 3 triggers on EXISTING tables (slug protection),
-- and SECURITY DEFINER functions. Apply once, after 0001-0003 (see supabase/README.md).
-- Rollback: 0004_faz3b_drafts_and_publish_down.sql (manual, never automatic).
--
-- ── Model ("live row" vs "draft doc") ───────────────────────────────────────────────
--   live/base row : the row in public.notes / public.lab_entries. Public RLS shows it ONLY when status = 'published'.
--   draft doc     : ONE pending working copy per entity in note_drafts / lab_entry_drafts (admin-only).
--                   All edits go to the draft doc; the live row is only changed by publish_*().
--   NEW entity    : create_*() inserts a SHELL base row (status 'draft', never public) holding only the fields the
--                   schema requires (slug, title, ...) plus the full draft doc, in ONE transaction → no half-created
--                   records. Real content lives in the draft doc until the first publish.
--   EDIT published: save_*_draft() writes the draft doc only → the live row is NOT touched.
--   PUBLISH       : publish_*() locks live row + draft, rejects stale drafts, copies ONLY whitelisted editable
--                   fields draft → live, sets status 'published', deletes the draft. All in one transaction.
--   UNPUBLISH     : unpublish_*() → status 'draft'. Content stays in the row; a pending draft is re-based so that
--                   unpublishing itself never makes it "stale".
--   DISCARD       : discard_*_draft() deletes the pending draft doc of an entity that HAS a live version. It is NOT a
--                   delete of the entity (there is no delete operation in the app).
--
-- ── Optimistic concurrency ──────────────────────────────────────────────────────────
--   draft.based_on_updated_at = live.updated_at at the moment the draft was started.
--   publish_*() compares it with the CURRENT live.updated_at; mismatch → 'stale_draft'.
--   save_*_draft() compares p_expected_draft_updated_at with the current draft.updated_at (two tabs); mismatch → 'stale_draft'.
--   Error vocabulary (exception messages the app maps to friendly text):
--     forbidden | not_found | stale_draft | nothing_to_publish | not_published | nothing_to_discard
--     'published content slug cannot be changed' (slug trigger)

------------------------------------------------------------------------------------------
-- 1. Published slug protection (DB level) — applies to projects, lab_entries, notes
------------------------------------------------------------------------------------------

create or replace function public.protect_published_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' and new.slug is distinct from old.slug then
    raise exception 'published content slug cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger projects_protect_slug before update of slug on public.projects
  for each row execute function public.protect_published_slug();
create trigger lab_entries_protect_slug before update of slug on public.lab_entries
  for each row execute function public.protect_published_slug();
create trigger notes_protect_slug before update of slug on public.notes
  for each row execute function public.protect_published_slug();

------------------------------------------------------------------------------------------
-- 2. Draft tables (admin-only)
--    FK: entity_id -> live row, ON DELETE CASCADE (a draft can never outlive its entity; no orphans).
--    PK = entity_id → at most ONE pending draft per entity.
--    Decision: project_drafts is NOT created here. Its shape is coupled to the Projects form/validator (3B-A2);
--    an unused table would be dead schema without tests. It arrives, with publish_project(), in migration 0005.
------------------------------------------------------------------------------------------

create or replace function public.touch_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create table public.note_drafts (
  entity_id           uuid primary key references public.notes (id) on delete cascade,
  data                jsonb not null,
  based_on_updated_at timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null,
  constraint note_drafts_data_object check (jsonb_typeof(data) = 'object')
);

create table public.lab_entry_drafts (
  entity_id           uuid primary key references public.lab_entries (id) on delete cascade,
  data                jsonb not null,
  based_on_updated_at timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null,
  constraint lab_entry_drafts_data_object check (jsonb_typeof(data) = 'object')
);

create trigger note_drafts_touch before insert or update on public.note_drafts
  for each row execute function public.touch_draft();
create trigger lab_entry_drafts_touch before insert or update on public.lab_entry_drafts
  for each row execute function public.touch_draft();

------------------------------------------------------------------------------------------
-- 3. RLS + grants for draft tables
--    anon: no privileges at all. authenticated: privileges granted, but the policy only lets admins through,
--    so a non-admin sees 0 rows and every write is rejected. Admin = public.is_admin() (admin_users allowlist).
------------------------------------------------------------------------------------------

alter table public.note_drafts      enable row level security;
alter table public.lab_entry_drafts enable row level security;

revoke all on public.note_drafts, public.lab_entry_drafts from anon, authenticated;
grant select, insert, update, delete on public.note_drafts, public.lab_entry_drafts to authenticated;

create policy note_drafts_admin_all on public.note_drafts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lab_entry_drafts_admin_all on public.lab_entry_drafts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------------------------------------
-- 4. Internal helpers: copy WHITELISTED editable fields draft doc -> live row.
--    Not callable by API roles. SEO / cover / created_* / id / status are never touched here.
------------------------------------------------------------------------------------------

create or replace function public._apply_note_doc(p_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notes set
    slug                 = p_data ->> 'slug',
    title                = p_data ->> 'title',
    excerpt              = p_data ->> 'excerpt',
    content              = p_data -> 'content',
    tags                 = array(select jsonb_array_elements_text(coalesce(p_data -> 'tags', '[]'::jsonb))),
    accent               = p_data ->> 'accent',
    reading_time_minutes = nullif(p_data ->> 'reading_time_minutes', '')::integer,
    published_at         = coalesce((p_data ->> 'published_at')::timestamptz, published_at)
  where id = p_id;
end;
$$;

create or replace function public._apply_lab_entry_doc(p_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lab_entries set
    slug              = p_data ->> 'slug',
    title             = p_data ->> 'title',
    short_title       = nullif(p_data ->> 'short_title', ''),
    type              = p_data ->> 'type',
    experiment_status = p_data ->> 'experiment_status',
    category          = nullif(p_data ->> 'category', ''),
    summary           = p_data ->> 'summary',
    description       = coalesce(p_data ->> 'description', ''),
    accent            = p_data ->> 'accent',
    featured          = coalesce((p_data ->> 'featured')::boolean, false),
    year              = p_data ->> 'year',
    tags              = array(select jsonb_array_elements_text(coalesce(p_data -> 'tags', '[]'::jsonb))),
    story             = coalesce(p_data -> 'story', '{}'::jsonb),
    sort_order        = coalesce((p_data ->> 'sort_order')::integer, sort_order)
  where id = p_id;
end;
$$;

revoke all on function public._apply_note_doc(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._apply_lab_entry_doc(uuid, jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------------------
-- 5. NOTES: create / save draft / publish / unpublish / discard
------------------------------------------------------------------------------------------

create or replace function public.create_note(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_base timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  -- shell row: only what the schema requires; never public (status 'draft')
  insert into public.notes (slug, title, accent, status)
  values (p_data ->> 'slug', p_data ->> 'title', coalesce(p_data ->> 'accent', 'blue'), 'draft')
  returning id, updated_at into v_id, v_base;

  insert into public.note_drafts (entity_id, data, based_on_updated_at)
  values (v_id, p_data, v_base);

  return v_id;
end;
$$;

create or replace function public.save_note_draft(p_id uuid, p_data jsonb, p_expected_draft_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live      public.notes%rowtype;
  v_draft     public.note_drafts%rowtype;
  v_has_draft boolean;
  v_out       timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.notes where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into v_draft from public.note_drafts where entity_id = p_id for update;
  v_has_draft := found;

  if v_has_draft then
    if p_expected_draft_updated_at is distinct from v_draft.updated_at then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
    update public.note_drafts set data = p_data where entity_id = p_id;
  else
    if p_expected_draft_updated_at is not null then
      raise exception 'stale_draft' using errcode = '40001';   -- the draft vanished (published/discarded elsewhere)
    end if;
    insert into public.note_drafts (entity_id, data, based_on_updated_at)
    values (p_id, p_data, v_live.updated_at);
  end if;

  -- Never-published shell: keep the reserved slug/title in sync with the working copy.
  -- Rows that have ever been published (published_at is set) are NOT touched: the live content stays pristine.
  if v_live.published_at is null and v_live.status <> 'published' then
    update public.notes set slug = p_data ->> 'slug', title = p_data ->> 'title' where id = p_id;
    update public.note_drafts
       set based_on_updated_at = (select updated_at from public.notes where id = p_id)
     where entity_id = p_id;
  end if;

  select updated_at into v_out from public.note_drafts where entity_id = p_id;
  return v_out;
end;
$$;

create or replace function public.publish_note(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live      public.notes%rowtype;
  v_draft     public.note_drafts%rowtype;
  v_has_draft boolean;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.notes where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into v_draft from public.note_drafts where entity_id = p_id for update;
  v_has_draft := found;

  if v_has_draft then
    -- the draft was started from an older live version → refuse to overwrite silently
    if v_draft.based_on_updated_at is distinct from v_live.updated_at then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
  elsif v_live.status = 'published' then
    raise exception 'nothing_to_publish' using errcode = '23514';
  end if;

  -- lifecycle: draft -> preview -> published (the status trigger enforces valid transitions)
  if v_live.status = 'draft' then
    update public.notes set status = 'preview' where id = p_id;
  end if;

  if v_has_draft then
    perform public._apply_note_doc(p_id, v_draft.data);
  end if;

  update public.notes set status = 'published' where id = p_id;
  delete from public.note_drafts where entity_id = p_id;
end;
$$;

create or replace function public.unpublish_note(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live public.notes%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.notes where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_live.status <> 'published' then raise exception 'not_published' using errcode = '23514'; end if;

  update public.notes set status = 'draft' where id = p_id;

  -- unpublishing bumps live.updated_at but changes no content: re-base a pending draft so it is not seen as stale
  update public.note_drafts
     set based_on_updated_at = (select updated_at from public.notes where id = p_id)
   where entity_id = p_id;
end;
$$;

create or replace function public.discard_note_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live public.notes%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.notes where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  -- A never-published entity has no live version to go back to: its draft doc IS the content.
  if v_live.published_at is null then raise exception 'nothing_to_discard' using errcode = '23514'; end if;

  delete from public.note_drafts where entity_id = p_id;
  if not found then raise exception 'nothing_to_discard' using errcode = '23514'; end if;
end;
$$;

------------------------------------------------------------------------------------------
-- 6. LAB: create / save draft / publish / unpublish / discard (same lifecycle)
------------------------------------------------------------------------------------------

create or replace function public.create_lab_entry(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_base timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  insert into public.lab_entries (slug, title, summary, accent, year, type, experiment_status, status)
  values (
    p_data ->> 'slug',
    p_data ->> 'title',
    coalesce(p_data ->> 'summary', ''),
    coalesce(p_data ->> 'accent', 'blue'),
    p_data ->> 'year',
    coalesce(p_data ->> 'type', 'EXPERIMENT'),
    coalesce(p_data ->> 'experiment_status', 'EXPLORING'),
    'draft'
  )
  returning id, updated_at into v_id, v_base;

  insert into public.lab_entry_drafts (entity_id, data, based_on_updated_at)
  values (v_id, p_data, v_base);

  return v_id;
end;
$$;

create or replace function public.save_lab_entry_draft(p_id uuid, p_data jsonb, p_expected_draft_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live      public.lab_entries%rowtype;
  v_draft     public.lab_entry_drafts%rowtype;
  v_has_draft boolean;
  v_out       timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.lab_entries where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into v_draft from public.lab_entry_drafts where entity_id = p_id for update;
  v_has_draft := found;

  if v_has_draft then
    if p_expected_draft_updated_at is distinct from v_draft.updated_at then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
    update public.lab_entry_drafts set data = p_data where entity_id = p_id;
  else
    if p_expected_draft_updated_at is not null then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
    insert into public.lab_entry_drafts (entity_id, data, based_on_updated_at)
    values (p_id, p_data, v_live.updated_at);
  end if;

  if v_live.published_at is null and v_live.status <> 'published' then
    update public.lab_entries set slug = p_data ->> 'slug', title = p_data ->> 'title' where id = p_id;
    update public.lab_entry_drafts
       set based_on_updated_at = (select updated_at from public.lab_entries where id = p_id)
     where entity_id = p_id;
  end if;

  select updated_at into v_out from public.lab_entry_drafts where entity_id = p_id;
  return v_out;
end;
$$;

create or replace function public.publish_lab_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live      public.lab_entries%rowtype;
  v_draft     public.lab_entry_drafts%rowtype;
  v_has_draft boolean;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.lab_entries where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into v_draft from public.lab_entry_drafts where entity_id = p_id for update;
  v_has_draft := found;

  if v_has_draft then
    if v_draft.based_on_updated_at is distinct from v_live.updated_at then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
  elsif v_live.status = 'published' then
    raise exception 'nothing_to_publish' using errcode = '23514';
  end if;

  if v_live.status = 'draft' then
    update public.lab_entries set status = 'preview' where id = p_id;
  end if;

  if v_has_draft then
    perform public._apply_lab_entry_doc(p_id, v_draft.data);
  end if;

  update public.lab_entries set status = 'published' where id = p_id;
  delete from public.lab_entry_drafts where entity_id = p_id;
end;
$$;

create or replace function public.unpublish_lab_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live public.lab_entries%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.lab_entries where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_live.status <> 'published' then raise exception 'not_published' using errcode = '23514'; end if;

  update public.lab_entries set status = 'draft' where id = p_id;

  update public.lab_entry_drafts
     set based_on_updated_at = (select updated_at from public.lab_entries where id = p_id)
   where entity_id = p_id;
end;
$$;

create or replace function public.discard_lab_entry_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live public.lab_entries%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.lab_entries where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_live.published_at is null then raise exception 'nothing_to_discard' using errcode = '23514'; end if;

  delete from public.lab_entry_drafts where entity_id = p_id;
  if not found then raise exception 'nothing_to_discard' using errcode = '23514'; end if;
end;
$$;

------------------------------------------------------------------------------------------
-- 7. Function privileges: authenticated only (functions re-check is_admin() internally = fail-closed). anon: none.
------------------------------------------------------------------------------------------

revoke all on function
  public.create_note(jsonb), public.save_note_draft(uuid, jsonb, timestamptz), public.publish_note(uuid),
  public.unpublish_note(uuid), public.discard_note_draft(uuid),
  public.create_lab_entry(jsonb), public.save_lab_entry_draft(uuid, jsonb, timestamptz), public.publish_lab_entry(uuid),
  public.unpublish_lab_entry(uuid), public.discard_lab_entry_draft(uuid)
from public, anon;

grant execute on function
  public.create_note(jsonb), public.save_note_draft(uuid, jsonb, timestamptz), public.publish_note(uuid),
  public.unpublish_note(uuid), public.discard_note_draft(uuid),
  public.create_lab_entry(jsonb), public.save_lab_entry_draft(uuid, jsonb, timestamptz), public.publish_lab_entry(uuid),
  public.unpublish_lab_entry(uuid), public.discard_lab_entry_draft(uuid)
to authenticated;
