-- MURAT/LAB CMS — FAZ 3B-B ROLLBACK for 0006_faz3b_content_import_provenance.sql
--
-- *** MANUAL ONLY. Never run automatically. Review before running. ***
--
-- Removes ONLY objects created by 0006: the 2 provenance tables (their triggers, policies and indexes go with them)
-- and the 2 guard functions. Does NOT touch 0001-0005 objects or any CMS content row.
--
-- DATA IMPACT: the import ledger (who imported what, when) is DELETED. Imported content itself stays in
-- projects / lab_entries / notes / site_content_* untouched, but the tool can no longer prove which rows it imported
-- (scoped import rollback is impossible afterwards). Export the ledger first if you may need it:
--   SELECT * FROM public.content_import_items ORDER BY created_at;

drop table if exists public.content_import_items;
drop table if exists public.content_import_runs;
drop function if exists public.guard_content_import_item();
drop function if exists public.guard_content_import_run();
