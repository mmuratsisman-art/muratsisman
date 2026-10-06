-- MURAT/LAB CMS — RLS / lifecycle smoke test (Phase 3A)
--
-- Executed by the project owner on a real Supabase project (migrations 0001-0003 applied): PASS, no FAIL exception.
-- Re-run after ANY change to schema, RLS or storage policies:
--   1. After applying migrations 0001-0003 (prefer a development project; this file rolls back, but still).
--   2. Paste into the SQL editor (runs as the privileged `postgres` role) and execute.
--   3. Expect: NOTICE "ALL RLS SMOKE TESTS PASSED". Any failure raises an exception named "FAIL ...".
-- Everything is wrapped in a transaction that is ROLLED BACK at the end: no data is kept.

begin;

-- ------------------------------------------------------------------ fixtures (as postgres)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'other@example.test');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000000a1');

insert into public.projects (slug, title, accent, status) values ('t-draft', 'T draft', 'blue', 'draft');
insert into public.projects (slug, title, accent, status, published_at) values ('t-pub', 'T pub', 'blue', 'published', now());
insert into public.site_content_drafts (key, data) values ('hero', '{"x":1}');
insert into public.site_content_published (key, data) values ('about', '{"y":2}');

-- ------------------------------------------------------------------ ANON
set local role anon;

do $$ begin
  if (select count(*) from public.projects where slug like 't-%') <> 1 then
    raise exception 'FAIL anon must see exactly the 1 published project';
  end if;
  if (select count(*) from public.site_content_published) <> 1 then
    raise exception 'FAIL anon must read published site content';
  end if;
end $$;

do $$ declare denied boolean := false; begin
  begin perform 1 from public.admin_users; exception when others then denied := true; end;
  if not denied then raise exception 'FAIL anon must not read admin_users'; end if;
end $$;

do $$ declare denied boolean := false; begin
  begin perform 1 from public.site_content_drafts; exception when others then denied := true; end;
  if not denied then raise exception 'FAIL anon must not read site_content_drafts'; end if;
end $$;

do $$ declare denied boolean := false; begin
  begin insert into public.projects (slug, title, accent) values ('t-anon', 'x', 'blue'); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL anon must not insert projects'; end if;
end $$;

reset role;

-- ------------------------------------------------------------------ AUTHENTICATED, NOT ADMIN
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  if public.is_admin() then raise exception 'FAIL non-admin must not be admin'; end if;
  if (select count(*) from public.projects where slug like 't-%') <> 1 then
    raise exception 'FAIL non-admin must see only published projects';
  end if;
end $$;

do $$ declare denied boolean := false; begin
  begin insert into public.projects (slug, title, accent) values ('t-hack', 'x', 'blue'); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL non-admin must not insert projects'; end if;
end $$;

do $$ declare denied boolean := false; begin
  begin perform public.publish_site_content('hero'); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL non-admin must not publish site content'; end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- ------------------------------------------------------------------ ADMIN
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  if not public.is_admin() then raise exception 'FAIL owner must be admin'; end if;
  if (select count(*) from public.projects where slug like 't-%') <> 2 then
    raise exception 'FAIL admin must see draft + published projects';
  end if;
end $$;

-- new content must start as draft
do $$ declare denied boolean := false; begin
  begin insert into public.projects (slug, title, accent, status) values ('t-direct', 'x', 'blue', 'published'); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL API insert directly as published must be rejected'; end if;
end $$;

-- lifecycle: draft -> published (skipping preview) is rejected
do $$ declare denied boolean := false; begin
  begin update public.projects set status = 'published' where slug = 't-draft'; exception when others then denied := true; end;
  if not denied then raise exception 'FAIL draft -> published must be rejected'; end if;
end $$;

-- lifecycle: draft -> preview -> published -> draft is allowed; published_at is set
do $$ begin
  update public.projects set status = 'preview' where slug = 't-draft';
  update public.projects set status = 'published' where slug = 't-draft';
  if (select published_at from public.projects where slug = 't-draft') is null then
    raise exception 'FAIL published_at must be set when publishing';
  end if;
  update public.projects set status = 'draft' where slug = 't-draft';
end $$;

-- slug rules
do $$ declare denied boolean := false; begin
  begin insert into public.projects (slug, title, accent) values ('t-pub', 'dup', 'blue'); exception when unique_violation then denied := true; end;
  if not denied then raise exception 'FAIL duplicate slug must be rejected'; end if;
end $$;
do $$ declare denied boolean := false; begin
  begin insert into public.projects (slug, title, accent) values ('Bad Slug', 'x', 'blue'); exception when check_violation then denied := true; end;
  if not denied then raise exception 'FAIL invalid slug must be rejected'; end if;
end $$;

-- site content: explicit publish only
do $$ declare denied boolean := false; begin
  begin insert into public.site_content_published (key, data) values ('contact', '{}'); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL direct writes to site_content_published must be rejected'; end if;
end $$;
do $$ begin
  perform public.publish_site_content('hero');
  if not exists (select 1 from public.site_content_published where key = 'hero' and data = '{"x":1}') then
    raise exception 'FAIL publish_site_content must copy the draft';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

do $$ begin raise notice 'ALL RLS SMOKE TESTS PASSED'; end $$;

rollback;
