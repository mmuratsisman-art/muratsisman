-- MURAT/LAB CMS — FAZ 3B-A2: Projects draft lifecycle + Site Content draft/publish functions
--
-- ADDITIVE migration. Does NOT modify or delete any existing row, table, column, policy, trigger or function
-- (0001-0004 are untouched; this file re-uses public.touch_draft() and public.is_admin() from them).
-- Adds: 1 draft table (project_drafts), 6 project functions, 3 site-content functions.
-- Apply once, after 0001-0004, from the Supabase SQL Editor (see supabase/README.md). NEVER applied automatically.
-- Rollback: 0005_faz3b_projects_site_content_down.sql (manual).
--
-- ── Projects: identical lifecycle to Notes/Lab (see 0004 header) ───────────────────────────────────────────
--   live row  : public.projects (public RLS shows it only when status = 'published')
--   draft doc : public.project_drafts (admin-only, ONE pending working copy per project)
--   create_project / save_project_draft / publish_project / unpublish_project / discard_project_draft
--   Published slug protection already exists (0004: projects_protect_slug trigger).
--   Fields NOT touched by publish: seo_*, cover_media_id, created_*, id, status (except lifecycle), published_at (unless doc sets it).
--
-- ── Site content: singleton documents (10 fixed keys) ──────────────────────────────────────────────────────
--   draft     : public.site_content_drafts   (admin-only working copy; PK = key)
--   published : public.site_content_published (public read; written ONLY by functions)
--   "pending changes" = a draft row whose data differs from the published row.
--   save_site_content_draft(key, data, expected_draft_updated_at)      compare-and-set on the draft's updated_at
--   publish_site_content_draft(key, expected_draft_updated_at)         publishes EXACTLY the draft version the caller saw
--   discard_site_content_draft(key)                                    removes the draft of a key that HAS a published version
--   There is intentionally NO unpublish for site content: the public site needs these documents to render.
--   (0001's publish_site_content(key) is left in place and unused by the app.)
--   Error vocabulary: forbidden | not_found | stale_draft | nothing_to_discard

------------------------------------------------------------------------------------------
-- 1. project_drafts (admin-only). FK ON DELETE CASCADE: a draft never outlives its project.
------------------------------------------------------------------------------------------

create table public.project_drafts (
  entity_id           uuid primary key references public.projects (id) on delete cascade,
  data                jsonb not null,
  based_on_updated_at timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null,
  constraint project_drafts_data_object check (jsonb_typeof(data) = 'object')
);

create trigger project_drafts_touch before insert or update on public.project_drafts
  for each row execute function public.touch_draft();

alter table public.project_drafts enable row level security;
revoke all on public.project_drafts from anon, authenticated;
grant select, insert, update, delete on public.project_drafts to authenticated;
create policy project_drafts_admin_all on public.project_drafts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------------------------------------
-- 2. Internal helper: copy WHITELISTED editable fields draft doc -> live row (not callable by API roles)
------------------------------------------------------------------------------------------

create or replace function public._apply_project_doc(p_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects set
    slug                  = p_data ->> 'slug',
    title                 = p_data ->> 'title',
    subtitle              = coalesce(p_data ->> 'subtitle', ''),
    summary               = coalesce(p_data ->> 'summary', ''),
    accent                = p_data ->> 'accent',
    size                  = coalesce(p_data ->> 'size', 'standard'),
    graphic               = coalesce(p_data ->> 'graphic', 'rings'),
    tags                  = array(select jsonb_array_elements_text(coalesce(p_data -> 'tags', '[]'::jsonb))),
    coming_soon           = coalesce((p_data ->> 'coming_soon')::boolean, false),
    kind                  = nullif(p_data ->> 'kind', ''),
    type_label            = nullif(p_data ->> 'type_label', ''),
    category              = nullif(p_data ->> 'category', ''),
    project_status_label  = nullif(p_data ->> 'project_status_label', ''),
    project_status_accent = nullif(p_data ->> 'project_status_accent', ''),
    case_study            = case when jsonb_typeof(p_data -> 'case_study') = 'object' then p_data -> 'case_study' else null end,
    sort_order            = coalesce((p_data ->> 'sort_order')::integer, sort_order)
  where id = p_id;
end;
$$;

revoke all on function public._apply_project_doc(uuid, jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------------------
-- 3. PROJECTS: create / save draft / publish / unpublish / discard (same semantics as 0004 notes & lab)
------------------------------------------------------------------------------------------

create or replace function public.create_project(p_data jsonb)
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

  insert into public.projects (slug, title, accent, status)
  values (p_data ->> 'slug', p_data ->> 'title', coalesce(p_data ->> 'accent', 'blue'), 'draft')
  returning id, updated_at into v_id, v_base;

  insert into public.project_drafts (entity_id, data, based_on_updated_at)
  values (v_id, p_data, v_base);

  return v_id;
end;
$$;

create or replace function public.save_project_draft(p_id uuid, p_data jsonb, p_expected_draft_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live      public.projects%rowtype;
  v_draft     public.project_drafts%rowtype;
  v_has_draft boolean;
  v_out       timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.projects where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into v_draft from public.project_drafts where entity_id = p_id for update;
  v_has_draft := found;

  if v_has_draft then
    if p_expected_draft_updated_at is distinct from v_draft.updated_at then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
    update public.project_drafts set data = p_data where entity_id = p_id;
  else
    if p_expected_draft_updated_at is not null then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
    insert into public.project_drafts (entity_id, data, based_on_updated_at)
    values (p_id, p_data, v_live.updated_at);
  end if;

  -- Never-published shell: keep the reserved slug/title in sync. Ever-published rows stay pristine.
  if v_live.published_at is null and v_live.status <> 'published' then
    update public.projects set slug = p_data ->> 'slug', title = p_data ->> 'title' where id = p_id;
    update public.project_drafts
       set based_on_updated_at = (select updated_at from public.projects where id = p_id)
     where entity_id = p_id;
  end if;

  select updated_at into v_out from public.project_drafts where entity_id = p_id;
  return v_out;
end;
$$;

create or replace function public.publish_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live      public.projects%rowtype;
  v_draft     public.project_drafts%rowtype;
  v_has_draft boolean;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.projects where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into v_draft from public.project_drafts where entity_id = p_id for update;
  v_has_draft := found;

  if v_has_draft then
    if v_draft.based_on_updated_at is distinct from v_live.updated_at then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
  elsif v_live.status = 'published' then
    raise exception 'nothing_to_publish' using errcode = '23514';
  end if;

  if v_live.status = 'draft' then
    update public.projects set status = 'preview' where id = p_id;
  end if;

  if v_has_draft then
    perform public._apply_project_doc(p_id, v_draft.data);
  end if;

  update public.projects set status = 'published' where id = p_id;
  delete from public.project_drafts where entity_id = p_id;
end;
$$;

create or replace function public.unpublish_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live public.projects%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.projects where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_live.status <> 'published' then raise exception 'not_published' using errcode = '23514'; end if;

  update public.projects set status = 'draft' where id = p_id;

  update public.project_drafts
     set based_on_updated_at = (select updated_at from public.projects where id = p_id)
   where entity_id = p_id;
end;
$$;

create or replace function public.discard_project_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live public.projects%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_live from public.projects where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_live.published_at is null then raise exception 'nothing_to_discard' using errcode = '23514'; end if;

  delete from public.project_drafts where entity_id = p_id;
  if not found then raise exception 'nothing_to_discard' using errcode = '23514'; end if;
end;
$$;

------------------------------------------------------------------------------------------
-- 4. SITE CONTENT: compare-and-set save, checked publish, discard
------------------------------------------------------------------------------------------

create or replace function public.save_site_content_draft(p_key text, p_data jsonb, p_expected_draft_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft     public.site_content_drafts%rowtype;
  v_has_draft boolean;
  v_out       timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_draft from public.site_content_drafts where key = p_key for update;
  v_has_draft := found;

  if v_has_draft then
    if p_expected_draft_updated_at is distinct from v_draft.updated_at then
      raise exception 'stale_draft' using errcode = '40001';
    end if;
    update public.site_content_drafts set data = p_data where key = p_key returning updated_at into v_out;
  else
    if p_expected_draft_updated_at is not null then
      raise exception 'stale_draft' using errcode = '40001';   -- the draft vanished (discarded elsewhere)
    end if;
    -- key validity and object shape are enforced by the table CHECK constraints
    insert into public.site_content_drafts (key, data) values (p_key, p_data)
      on conflict (key) do nothing
      returning updated_at into v_out;
    if v_out is null then raise exception 'stale_draft' using errcode = '40001'; end if;   -- a concurrent tab created it first
  end if;

  return v_out;
end;
$$;

create or replace function public.publish_site_content_draft(p_key text, p_expected_draft_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.site_content_drafts%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_draft from public.site_content_drafts where key = p_key for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  -- publish exactly the draft version the caller just saved/saw; a newer edit from another tab is never published silently
  if p_expected_draft_updated_at is distinct from v_draft.updated_at then
    raise exception 'stale_draft' using errcode = '40001';
  end if;

  insert into public.site_content_published (key, data, published_at, published_by)
  values (v_draft.key, v_draft.data, now(), auth.uid())
  on conflict (key) do update
    set data = excluded.data,
        published_at = excluded.published_at,
        published_by = excluded.published_by;
end;
$$;

create or replace function public.discard_site_content_draft(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  perform 1 from public.site_content_drafts where key = p_key for update;
  if not found then raise exception 'nothing_to_discard' using errcode = '23514'; end if;

  -- a never-published key has no live version to go back to: its draft IS the content
  perform 1 from public.site_content_published where key = p_key;
  if not found then raise exception 'nothing_to_discard' using errcode = '23514'; end if;

  delete from public.site_content_drafts where key = p_key;
end;
$$;

------------------------------------------------------------------------------------------
-- 5. Function privileges: authenticated only (each re-checks is_admin() = fail-closed). anon: none.
------------------------------------------------------------------------------------------

revoke all on function
  public.create_project(jsonb), public.save_project_draft(uuid, jsonb, timestamptz), public.publish_project(uuid),
  public.unpublish_project(uuid), public.discard_project_draft(uuid),
  public.save_site_content_draft(text, jsonb, timestamptz), public.publish_site_content_draft(text, timestamptz),
  public.discard_site_content_draft(text)
from public, anon;

grant execute on function
  public.create_project(jsonb), public.save_project_draft(uuid, jsonb, timestamptz), public.publish_project(uuid),
  public.unpublish_project(uuid), public.discard_project_draft(uuid),
  public.save_site_content_draft(text, jsonb, timestamptz), public.publish_site_content_draft(text, timestamptz),
  public.discard_site_content_draft(text)
to authenticated;
