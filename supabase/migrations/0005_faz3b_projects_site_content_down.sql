-- MURAT/LAB CMS — FAZ 3B-A2 ROLLBACK for 0005_faz3b_projects_site_content.sql
--
-- *** MANUAL ONLY. Never run automatically. Review before running. ***
--
-- Removes ONLY objects created by 0005: 8 functions + 1 helper, and the project_drafts table (policy/trigger go with it).
-- Does NOT touch 0001-0004 objects (note_drafts, lab_entry_drafts, projects_protect_slug, touch_draft(), is_admin(),
-- publish_site_content(), site_content_* tables, RLS policies, storage).
--
-- DATA IMPACT (read this):
--   * Pending project draft docs (project_drafts) are DELETED. Published projects are untouched.
--   * Projects created through the admin UI keep their SHELL row in public.projects (status 'draft', never public,
--     placeholder content; their real content lived in the dropped draft doc). List them first:
--       SELECT id, slug, title FROM public.projects WHERE published_at IS NULL;
--   * site_content_drafts / site_content_published rows are NOT touched (only the functions are removed).

drop function if exists public.create_project(jsonb);
drop function if exists public.save_project_draft(uuid, jsonb, timestamptz);
drop function if exists public.publish_project(uuid);
drop function if exists public.unpublish_project(uuid);
drop function if exists public.discard_project_draft(uuid);
drop function if exists public._apply_project_doc(uuid, jsonb);
drop function if exists public.save_site_content_draft(text, jsonb, timestamptz);
drop function if exists public.publish_site_content_draft(text, timestamptz);
drop function if exists public.discard_site_content_draft(text);

drop table if exists public.project_drafts;
