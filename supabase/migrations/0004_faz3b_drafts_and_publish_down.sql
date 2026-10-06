-- MURAT/LAB CMS — FAZ 3B-A1 ROLLBACK for 0004_faz3b_drafts_and_publish.sql
--
-- *** MANUAL ONLY. Never run automatically. Review before running. ***
--
-- Removes ONLY objects created by 0004:
--   functions, the 3 slug-protection triggers (on EXISTING tables: only the TRIGGERS are dropped, never the tables),
--   the 2 draft tables (with their policies/triggers) and the helper trigger functions.
-- Does NOT touch anything from 0001-0003 (projects, lab_entries, notes, site_content_*, media_assets, admin_users,
-- is_admin(), publish_site_content(), RLS policies, storage).
--
-- DATA IMPACT (read this):
--   * Pending draft docs (note_drafts / lab_entry_drafts) are DELETED. Live (published) rows are untouched.
--   * Entities created through the admin UI keep their SHELL row in public.notes / public.lab_entries
--     (status 'draft', never public, with placeholder content). Their real content lived in the dropped draft docs.
--     List them first and decide: SELECT id, slug, title FROM public.notes WHERE published_at IS NULL;  (same for lab_entries)
--   * No published/live content is modified or removed by this script.

-- functions (drop first; they reference the draft tables)
drop function if exists public.create_note(jsonb);
drop function if exists public.save_note_draft(uuid, jsonb, timestamptz);
drop function if exists public.publish_note(uuid);
drop function if exists public.unpublish_note(uuid);
drop function if exists public.discard_note_draft(uuid);
drop function if exists public.create_lab_entry(jsonb);
drop function if exists public.save_lab_entry_draft(uuid, jsonb, timestamptz);
drop function if exists public.publish_lab_entry(uuid);
drop function if exists public.unpublish_lab_entry(uuid);
drop function if exists public.discard_lab_entry_draft(uuid);
drop function if exists public._apply_note_doc(uuid, jsonb);
drop function if exists public._apply_lab_entry_doc(uuid, jsonb);

-- slug-protection triggers on EXISTING tables (drop the triggers only)
drop trigger if exists projects_protect_slug on public.projects;
drop trigger if exists lab_entries_protect_slug on public.lab_entries;
drop trigger if exists notes_protect_slug on public.notes;

-- draft tables (policies, triggers and grants go with them)
drop table if exists public.note_drafts;
drop table if exists public.lab_entry_drafts;

-- helper trigger functions
drop function if exists public.protect_published_slug();
drop function if exists public.touch_draft();
