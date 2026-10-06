-- MURAT/LAB CMS foundation (Phase 3A) — 0002: Row Level Security + grants
--
-- Principles
--   * RLS is enabled on EVERY table. A table without a matching policy is closed.
--   * anon / authenticated may read ONLY published content. Drafts and previews are admin-only.
--   * Only public.is_admin() (admin_users allowlist) may write. Writes by anyone else are denied.
--   * Grants below are explicit on purpose (do not rely on Supabase default privileges); RLS still gates every row.
--   * The service-role key bypasses RLS: it must never reach the browser or the Next.js app (see docs/cms/SECURITY.md).

alter table public.admin_users            enable row level security;
alter table public.media_assets           enable row level security;
alter table public.projects               enable row level security;
alter table public.lab_entries            enable row level security;
alter table public.notes                  enable row level security;
alter table public.site_content_drafts    enable row level security;
alter table public.site_content_published enable row level security;

-- admin_users: completely closed to API roles (is_admin() is SECURITY DEFINER and reads it internally).
revoke all on public.admin_users from anon, authenticated;

-- ---------------------------------------------------------------- grants
grant select on public.projects, public.lab_entries, public.notes, public.media_assets, public.site_content_published to anon, authenticated;
grant insert, update, delete on public.projects, public.lab_entries, public.notes, public.media_assets to authenticated;
grant select, insert, update, delete on public.site_content_drafts to authenticated;
-- site_content_published: NO write grants. Only public.publish_site_content() (SECURITY DEFINER) writes to it.

-- ---------------------------------------------------------------- projects / lab_entries / notes
create policy projects_public_read on public.projects
  for select to anon, authenticated using (status = 'published');
create policy projects_admin_all on public.projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy lab_entries_public_read on public.lab_entries
  for select to anon, authenticated using (status = 'published');
create policy lab_entries_admin_all on public.lab_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy notes_public_read on public.notes
  for select to anon, authenticated using (status = 'published');
create policy notes_admin_all on public.notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- site content
create policy site_content_published_public_read on public.site_content_published
  for select to anon, authenticated using (true);
create policy site_content_drafts_admin_all on public.site_content_drafts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- media metadata
-- Public may read metadata only for assets referenced by PUBLISHED content (cover / OG image / profile image).
-- Inline images inside jsonb bodies are not referenced yet; add a junction table before introducing them.
create policy media_assets_public_read on public.media_assets
  for select to anon, authenticated using (
    exists (select 1 from public.projects p
            where p.status = 'published' and media_assets.id in (p.cover_media_id, p.seo_og_media_id))
    or exists (select 1 from public.lab_entries l
            where l.status = 'published' and media_assets.id in (l.cover_media_id, l.seo_og_media_id))
    or exists (select 1 from public.notes n
            where n.status = 'published' and media_assets.id in (n.cover_media_id, n.seo_og_media_id))
    or exists (select 1 from public.site_content_published s
            where s.data ->> 'imageMediaId' = media_assets.id::text)
  );
create policy media_assets_admin_all on public.media_assets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
