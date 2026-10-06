-- MURAT/LAB CMS foundation (Phase 3A) — 0001: schema
-- Apply order: 0001 (schema) -> 0002 (RLS + grants) -> 0003 (storage).
-- NOT applied to any database by the application. Review, then run in a Supabase project (SQL editor or `supabase db push`).
--
-- Design notes (see docs/cms/ARCHITECTURE.md):
--   * One table per domain (projects, lab_entries, notes) — no generic "content" table.
--   * JSONB only where the structure is genuinely flexible and already modelled in TypeScript:
--       projects.case_study (CaseStudy), lab_entries.story (LabStory), notes.content (NoteBlock[]).
--   * Vocabulary (accent, size, ...) uses text + CHECK constraints (easier to evolve than enums).
--   * Lifecycle: draft -> preview -> published. Transitions are enforced by a trigger (below).

------------------------------------------------------------------------------------------
-- Helper functions
------------------------------------------------------------------------------------------

-- Sets updated_at / updated_by on every write. auth.uid() is NULL for SQL editor / service role.
create or replace function public.touch_row()
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

-- Lifecycle guard shared by projects, lab_entries and notes.
--   INSERT: authenticated API users must start from 'draft'
--           (SQL editor / service-role seeding may insert any status, e.g. the one-time content cutover).
--   UPDATE: allowed transitions only:
--           draft -> preview, preview -> draft, preview -> published, published -> draft (unpublish).
--   published_at is set automatically the first time content becomes published.
create or replace function public.enforce_content_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and jwt_role = 'authenticated' then
      raise exception 'new content must start as draft (got %)', new.status using errcode = '23514';
    end if;
  elsif new.status is distinct from old.status then
    if not (
      (old.status = 'draft'     and new.status = 'preview') or
      (old.status = 'preview'   and new.status in ('draft', 'published')) or
      (old.status = 'published' and new.status = 'draft')
    ) then
      raise exception 'invalid status transition % -> %', old.status, new.status using errcode = '23514';
    end if;
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------------------
-- Admin allowlist (single owner initially). Authorization source of truth for RLS and server checks.
-- Rows are inserted manually by the owner after creating the Auth user (see docs/cms/SETUP.md).
-- Never derive admin rights from user-editable JWT metadata.
------------------------------------------------------------------------------------------

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

------------------------------------------------------------------------------------------
-- Media (metadata for files in the public 'site-media' storage bucket)
------------------------------------------------------------------------------------------

create table public.media_assets (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null default 'site-media',
  path       text not null,
  alt_text   text not null default '',
  width      integer,
  height     integer,
  mime_type  text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,

  constraint media_assets_bucket_path_key unique (bucket, path),
  constraint media_assets_size_positive   check (size_bytes > 0),
  constraint media_assets_dimensions      check ((width is null or width > 0) and (height is null or height > 0)),
  constraint media_assets_mime_allowed    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
);

------------------------------------------------------------------------------------------
-- Projects (case studies)
------------------------------------------------------------------------------------------

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  status       text not null default 'draft',
  published_at timestamptz,
  sort_order   integer not null default 0,

  title        text not null,
  subtitle     text not null default '',
  summary      text not null default '',           -- maps to Project.description
  accent       text not null,
  size         text not null default 'standard',   -- feature | standard | teaser (home bento)
  graphic      text not null default 'rings',
  tags         text[] not null default '{}',
  coming_soon  boolean not null default false,

  kind                  text,                      -- personal | work | ai-experiment
  type_label            text,
  category              text,
  project_status_label  text,                      -- the status PILL on the case study (not the lifecycle)
  project_status_accent text,
  case_study            jsonb,                     -- CaseStudy (sections, diagram, cases, tags)

  cover_media_id    uuid references public.media_assets (id) on delete set null,
  seo_title         text,
  seo_description   text,
  seo_canonical_url text,
  seo_og_media_id   uuid references public.media_assets (id) on delete set null,
  seo_noindex       boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,

  constraint projects_slug_key unique (slug),
  constraint projects_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint projects_status_valid check (status in ('draft', 'preview', 'published')),
  constraint projects_published_has_date check (status <> 'published' or published_at is not null),
  constraint projects_accent_valid check (accent in ('blue', 'green', 'orange', 'purple')),
  constraint projects_size_valid check (size in ('feature', 'standard', 'teaser')),
  constraint projects_graphic_valid check (graphic in ('rings', 'flow', 'nodes', 'dots')),
  constraint projects_kind_valid check (kind is null or kind in ('personal', 'work', 'ai-experiment')),
  constraint projects_pill_pair check ((project_status_label is null) = (project_status_accent is null)),
  constraint projects_pill_accent_valid check (project_status_accent is null or project_status_accent in ('blue', 'green', 'orange', 'purple')),
  constraint projects_case_study_object check (case_study is null or jsonb_typeof(case_study) = 'object'),
  constraint projects_canonical_https check (seo_canonical_url is null or seo_canonical_url ~ '^https://')
);

create index projects_status_order_idx on public.projects (status, sort_order);
create index projects_tags_idx on public.projects using gin (tags);
create index projects_cover_media_idx on public.projects (cover_media_id) where cover_media_id is not null;
create index projects_og_media_idx on public.projects (seo_og_media_id) where seo_og_media_id is not null;

create trigger projects_status before insert or update on public.projects
  for each row execute function public.enforce_content_status();
create trigger projects_touch before insert or update on public.projects
  for each row execute function public.touch_row();

------------------------------------------------------------------------------------------
-- Lab experiments
------------------------------------------------------------------------------------------

create table public.lab_entries (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  status       text not null default 'draft',
  published_at timestamptz,
  sort_order   integer not null default 0,

  title             text not null,
  short_title       text,
  type              text not null default 'EXPERIMENT',   -- EXPERIMENT | PROTOTYPE | CONCEPT
  experiment_status text not null default 'EXPLORING',    -- ACTIVE | EXPLORING | PAUSED | ARCHIVED (not the lifecycle)
  category          text,
  summary           text not null,
  description       text not null default '',
  accent            text not null,
  featured          boolean not null default false,
  year              text not null,
  tags              text[] not null default '{}',
  story             jsonb not null default '{}'::jsonb,   -- LabStory { why, how, learned, state } — text only; labels live in the template

  cover_media_id    uuid references public.media_assets (id) on delete set null,
  seo_title         text,
  seo_description   text,
  seo_canonical_url text,
  seo_og_media_id   uuid references public.media_assets (id) on delete set null,
  seo_noindex       boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,

  constraint lab_entries_slug_key unique (slug),
  constraint lab_entries_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint lab_entries_status_valid check (status in ('draft', 'preview', 'published')),
  constraint lab_entries_published_has_date check (status <> 'published' or published_at is not null),
  constraint lab_entries_type_valid check (type in ('EXPERIMENT', 'PROTOTYPE', 'CONCEPT')),
  constraint lab_entries_experiment_status_valid check (experiment_status in ('ACTIVE', 'EXPLORING', 'PAUSED', 'ARCHIVED')),
  constraint lab_entries_accent_valid check (accent in ('blue', 'green', 'orange', 'purple')),
  constraint lab_entries_story_object check (jsonb_typeof(story) = 'object'),
  constraint lab_entries_canonical_https check (seo_canonical_url is null or seo_canonical_url ~ '^https://')
);

create index lab_entries_status_order_idx on public.lab_entries (status, sort_order);
create index lab_entries_featured_idx on public.lab_entries (status, featured, sort_order);
create index lab_entries_tags_idx on public.lab_entries using gin (tags);
create index lab_entries_cover_media_idx on public.lab_entries (cover_media_id) where cover_media_id is not null;
create index lab_entries_og_media_idx on public.lab_entries (seo_og_media_id) where seo_og_media_id is not null;

create trigger lab_entries_status before insert or update on public.lab_entries
  for each row execute function public.enforce_content_status();
create trigger lab_entries_touch before insert or update on public.lab_entries
  for each row execute function public.touch_row();

------------------------------------------------------------------------------------------
-- Notes
------------------------------------------------------------------------------------------

create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  status       text not null default 'draft',
  published_at timestamptz,                         -- also the public "date" shown on a note

  title                 text not null,
  excerpt               text not null default '',
  content               jsonb not null default '[]'::jsonb,   -- NoteBlock[] (p | h | quote | list)
  tags                  text[] not null default '{}',
  accent                text not null default 'blue',
  reading_time_minutes  integer,                    -- optional override; NULL = computed from content

  cover_media_id    uuid references public.media_assets (id) on delete set null,
  seo_title         text,
  seo_description   text,
  seo_canonical_url text,
  seo_og_media_id   uuid references public.media_assets (id) on delete set null,
  seo_noindex       boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,

  constraint notes_slug_key unique (slug),
  constraint notes_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint notes_status_valid check (status in ('draft', 'preview', 'published')),
  constraint notes_published_has_date check (status <> 'published' or published_at is not null),
  constraint notes_accent_valid check (accent in ('blue', 'green', 'orange', 'purple')),
  constraint notes_content_array check (jsonb_typeof(content) = 'array'),
  constraint notes_reading_time_positive check (reading_time_minutes is null or reading_time_minutes > 0),
  constraint notes_canonical_https check (seo_canonical_url is null or seo_canonical_url ~ '^https://')
);

create index notes_status_published_idx on public.notes (status, published_at desc);
create index notes_tags_idx on public.notes using gin (tags);
create index notes_cover_media_idx on public.notes (cover_media_id) where cover_media_id is not null;
create index notes_og_media_idx on public.notes (seo_og_media_id) where seo_og_media_id is not null;

create trigger notes_status before insert or update on public.notes
  for each row execute function public.enforce_content_status();
create trigger notes_touch before insert or update on public.notes
  for each row execute function public.touch_row();

------------------------------------------------------------------------------------------
-- Site content (hero, currently, about, contact, social, ...): singleton documents.
-- Two tables so that drafts can NEVER be read publicly (RLS is row-level, not column-level).
--   site_content_drafts    — admin only, edited freely
--   site_content_published — publicly readable, written ONLY by public.publish_site_content()
-- The profile photo is referenced as { "imageMediaId": "<media_assets.id>" } inside the 'about' document.
------------------------------------------------------------------------------------------

create table public.site_content_drafts (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,

  constraint site_content_drafts_key_valid check (key in ('site_meta', 'hero', 'currently', 'about', 'contact', 'social', 'lab_intro', 'lab_page', 'notes_page', 'lab_categories')),
  constraint site_content_drafts_object check (jsonb_typeof(data) = 'object')
);

create table public.site_content_published (
  key          text primary key,
  data         jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,

  constraint site_content_published_key_valid check (key in ('site_meta', 'hero', 'currently', 'about', 'contact', 'social', 'lab_intro', 'lab_page', 'notes_page', 'lab_categories')),
  constraint site_content_published_object check (jsonb_typeof(data) = 'object')
);

create trigger site_content_drafts_touch before insert or update on public.site_content_drafts
  for each row execute function public.touch_row();

-- Explicit publish operation: copies the current draft of ONE key into the published table.
create or replace function public.publish_site_content(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.site_content_published (key, data, published_at, published_by)
  select d.key, d.data, now(), auth.uid()
  from public.site_content_drafts d
  where d.key = p_key
  on conflict (key) do update
    set data = excluded.data,
        published_at = excluded.published_at,
        published_by = excluded.published_by;

  if not found then
    raise exception 'no draft found for key %', p_key using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.publish_site_content(text) from public;
grant execute on function public.publish_site_content(text) to authenticated;
