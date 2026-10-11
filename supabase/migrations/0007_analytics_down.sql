-- MURAT/LAB — Visitor Analytics ROLLBACK for 0007_analytics.sql
--
-- *** MANUAL ONLY. Never run automatically. Review before running. ***
--
-- Removes ONLY objects created by 0007: 2 functions, the writer guard trigger/function and the 3 analytics tables.
-- Does NOT touch 0001-0006 objects or any CMS content row. The Supabase Auth writer user is NOT deleted (remove it in the dashboard).
--
-- DATA IMPACT: all collected analytics counters (analytics_daily, analytics_day) and the writer allowlist are DELETED.
-- Export first if you need them:
--   SELECT * FROM public.analytics_daily ORDER BY day, kind, key;
--   SELECT day, hits, capped FROM public.analytics_day ORDER BY day;

drop function if exists public.record_hit(text, text, integer);
drop function if exists public.analytics_summary(integer);
drop table if exists public.analytics_writers;
drop table if exists public.analytics_daily;
drop table if exists public.analytics_day;
drop function if exists public.guard_analytics_writer();
