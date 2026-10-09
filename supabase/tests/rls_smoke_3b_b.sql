-- MURAT/LAB CMS — FAZ 3B-B RLS + guard smoke test (migration 0006: content import provenance ledger)
--
-- Run in the Supabase SQL Editor AFTER applying 0001-0006. Runs as the privileged `postgres` role and switches roles itself.
-- Expect the NOTICE "ALL 3B-B SMOKE TESTS PASSED"; any failure raises an exception starting with "FAIL".
-- Everything runs inside ONE transaction that is ROLLED BACK at the end (no production data is kept).
-- Claims used (auth.uid() reads request.jwt.claims):   a1 = admin (admin_users)   b2 = authenticated NON-admin

begin;
select set_config('request.jwt.claims', '', true);

do $$ begin
  if exists (select 1 from auth.users where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2')) then
    raise exception 'FAIL PRE-FLIGHT: leftover test users found. Run "rollback;" once, check they are gone, then re-run.';
  end if;
end $$;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'owner3bb@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'other3bb@example.test');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000000a1');

-- a run + item written by postgres, to prove invisibility to non-admins
insert into public.content_import_runs (id, tool_version, source_digest, plan_digest)
  values ('00000000-0000-0000-0000-00000000f001', 't', repeat('a', 64), repeat('b', 64));
insert into public.content_import_items (run_id, last_run_id, entity_type, source_key, source_path, source_hash)
  values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f001', 'note', 't3bb-seed', 'src/data/x.ts', repeat('c', 64));

-- ======================================================== 1) ANON: nothing
set local role anon;
do $$ declare ok boolean; begin
  ok := false; begin perform 1 from public.content_import_runs;  exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not SELECT content_import_runs'; end if;
  ok := false; begin perform 1 from public.content_import_items; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not SELECT content_import_items'; end if;
  ok := false; begin insert into public.content_import_runs (tool_version, source_digest, plan_digest) values ('t', repeat('a',64), repeat('b',64)); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not INSERT content_import_runs'; end if;
end $$;
reset role;

-- ======================================================== 2) AUTHENTICATED NON-ADMIN
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$ declare ok boolean; begin
  if (select count(*) from public.content_import_runs) <> 0 or (select count(*) from public.content_import_items) <> 0 then
    raise exception 'FAIL non-admin must see 0 ledger rows';
  end if;
  ok := false; begin insert into public.content_import_runs (tool_version, source_digest, plan_digest) values ('t', repeat('a',64), repeat('b',64)); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL non-admin must not INSERT content_import_runs'; end if;
  ok := false; begin update public.content_import_items set last_error = 'x'; if not found then raise exception 'norows'; end if; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL non-admin must not UPDATE content_import_items'; end if;
end $$;
reset role;

-- ======================================================== 3) ADMIN
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$ declare run_id uuid; item_id uuid; ok boolean; begin
  if (select count(*) from public.content_import_runs) <> 1 then raise exception 'FAIL admin must see the ledger'; end if;

  insert into public.content_import_runs (tool_version, source_digest, plan_digest) values ('t', repeat('a',64), repeat('b',64)) returning id into run_id;
  if (select created_by from public.content_import_runs where id = run_id) is distinct from '00000000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'FAIL run.created_by must default to the admin';
  end if;

  -- bad formats
  ok := false; begin insert into public.content_import_runs (tool_version, source_digest, plan_digest) values ('t', 'nothex', repeat('b',64)); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL source_digest format must be enforced'; end if;
  ok := false; begin insert into public.content_import_items (run_id, last_run_id, entity_type, source_key, source_path, source_hash) values (run_id, run_id, 'page', 'x', 'p', repeat('c',64)); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL entity_type must be restricted'; end if;

  insert into public.content_import_items (run_id, last_run_id, entity_type, source_key, source_path, source_hash)
    values (run_id, run_id, 'project', 't3bb-proj', 'src/data/projects/x.ts', repeat('d',64)) returning id into item_id;

  -- one ACTIVE item per source record
  ok := false; begin insert into public.content_import_items (run_id, last_run_id, entity_type, source_key, source_path, source_hash) values (run_id, run_id, 'project', 't3bb-proj', 'p', repeat('d',64)); exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL duplicate active (entity_type, source_key) must be rejected'; end if;

  -- identity immutable
  ok := false; begin update public.content_import_items set source_key = 'other' where id = item_id; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL source_key must be immutable'; end if;
  ok := false; begin update public.content_import_items set source_hash = repeat('e',64) where id = item_id; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL source_hash must be immutable'; end if;

  -- forward-only states (no skipping)
  ok := false; begin update public.content_import_items set state = 'published' where id = item_id; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL intent -> published must be rejected (no skipping)'; end if;
  update public.content_import_items set state = 'created', entity_id = '00000000-0000-0000-0000-0000000000e1' where id = item_id;
  ok := false; begin update public.content_import_items set entity_id = '00000000-0000-0000-0000-0000000000e2' where id = item_id; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL entity_id must not change once set'; end if;
  ok := false; begin update public.content_import_items set state = 'intent' where id = item_id; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL backwards transition must be rejected'; end if;
  update public.content_import_items set state = 'published' where id = item_id;
  update public.content_import_items set state = 'completed', seo_hash = repeat('f',64) where id = item_id;

  -- seo_hash only on projects
  ok := false; begin insert into public.content_import_items (run_id, last_run_id, entity_type, source_key, source_path, source_hash, seo_hash) values (run_id, run_id, 'note', 't3bb-n', 'p', repeat('d',64), repeat('f',64)); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL seo_hash is projects-only'; end if;

  -- rolled_back is terminal, and frees the active slot
  update public.content_import_items set state = 'rolled_back' where id = item_id;
  ok := false; begin update public.content_import_items set state = 'completed' where id = item_id; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL rolled_back must be terminal'; end if;
  insert into public.content_import_items (run_id, last_run_id, entity_type, source_key, source_path, source_hash)
    values (run_id, run_id, 'project', 't3bb-proj', 'p', repeat('d',64));

  -- no DELETE for anybody (history is kept)
  ok := false; begin delete from public.content_import_items where source_key = 't3bb-proj'; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL DELETE on ledger must be denied'; end if;

  -- run: a finished run cannot change status; identity immutable
  update public.content_import_runs set status = 'completed', finished_at = now() where id = run_id;
  ok := false; begin update public.content_import_runs set status = 'running' where id = run_id; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL finished run must not change status'; end if;
  ok := false; begin update public.content_import_runs set plan_digest = repeat('0',64) where id = run_id; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL run.plan_digest must be immutable'; end if;
end $$;
reset role;

-- ======================================================== 4) 0006 changed nothing else
do $$ begin
  if (select count(*) from public.projects) + (select count(*) from public.notes) + (select count(*) from public.lab_entries) <> 0 then
    -- not a failure of 0006 per se (production has content); this only documents the check is data-agnostic
    null;
  end if;
  if not exists (select 1 from pg_policies where tablename = 'projects' and policyname = 'projects_admin_all')
     or not exists (select 1 from pg_policies where tablename = 'projects' and policyname = 'projects_public_read') then
    raise exception 'FAIL existing projects policies must be intact';
  end if;
end $$;

do $$ begin raise notice 'ALL 3B-B SMOKE TESTS PASSED'; end $$;
rollback;
