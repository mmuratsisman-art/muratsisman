-- MURAT/LAB CMS — FAZ 3B-A1 RLS + lifecycle smoke test (migration 0004)
--
-- Run in the Supabase SQL Editor AFTER applying 0001-0004. Runs as the privileged `postgres` role and switches roles
-- itself. Expect the NOTICE "ALL 3B-A1 SMOKE TESTS PASSED"; any failure raises an exception starting with "FAIL".
-- Everything runs inside ONE transaction that is ROLLED BACK at the end (no production content is touched or kept).
--
-- NOTE (single transaction): now() is constant inside a transaction, so updated_at never advances between steps.
-- Time-dependent staleness is therefore SIMULATED by shifting based_on_updated_at / the expected token by 1 second.
-- The real multi-request behaviour (unpublish with a pending draft, two browser tabs) is covered by the manual QA
-- checklist in docs/cms/LIFECYCLE.md.
--
-- Claims used (auth.uid() reads request.jwt.claims):
--   a1 = admin (listed in admin_users)   b2 = authenticated NON-admin

begin;
select set_config('request.jwt.claims', '', true);

-- ================================================================= fixtures (postgres)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'owner3b@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'other3b@example.test');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000000a1');

insert into public.notes (slug, title, excerpt, content, accent, status, published_at)
  values ('t3b-note-pub', 'Pub note', 'ex', '[]', 'blue', 'published', now());
insert into public.notes (slug, title, accent) values ('t3b-note-shell', 'Shell note', 'blue');          -- draft base row
insert into public.lab_entries (slug, title, summary, accent, year, status, published_at)
  values ('t3b-lab-pub', 'Pub lab', 'sum', 'green', '2026', 'published', now());
insert into public.lab_entries (slug, title, summary, accent, year) values ('t3b-lab-shell', 'Shell lab', 's', 'green', '2026');
-- a pending draft doc on the published note (postgres), used to prove draft tables are invisible
insert into public.note_drafts (entity_id, data, based_on_updated_at)
  select id, jsonb_build_object('title', 'SECRET DRAFT'), updated_at from public.notes where slug = 't3b-note-pub';

-- ================================================================= 1) ANON
set local role anon;

do $$ begin
  if (select count(*) from public.notes where slug like 't3b-%') <> 1 then
    raise exception 'FAIL anon must see only the published note (draft base row hidden)';
  end if;
  if (select count(*) from public.lab_entries where slug like 't3b-%') <> 1 then
    raise exception 'FAIL anon must see only the published lab entry (draft base row hidden)';
  end if;
end $$;

do $$ declare ok boolean := false; begin begin perform 1 from public.note_drafts; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not SELECT note_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin perform 1 from public.lab_entry_drafts; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not SELECT lab_entry_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin insert into public.note_drafts (entity_id, data, based_on_updated_at) values (gen_random_uuid(), '{}', now()); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not INSERT note_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin update public.note_drafts set data = '{}'; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not UPDATE note_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin delete from public.lab_entry_drafts; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not DELETE lab_entry_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin
  begin perform public.publish_note((select id from public.notes where slug = 't3b-note-pub')); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not execute publish_note'; end if; end $$;

reset role;

-- ================================================================= 2) AUTHENTICATED NON-ADMIN (b2)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

do $$ declare msg text; v uuid; begin
  v := (select id from public.notes where slug = 't3b-note-pub');
  if v is null then raise exception 'FAIL non-admin must still read the published note'; end if;
  if (select count(*) from public.note_drafts) <> 0 then raise exception 'FAIL non-admin must see 0 rows in note_drafts'; end if;
  if (select count(*) from public.lab_entry_drafts) <> 0 then raise exception 'FAIL non-admin must see 0 rows in lab_entry_drafts'; end if;

  -- draft table writes: RLS rejects
  begin insert into public.note_drafts (entity_id, data, based_on_updated_at) values (v, '{}', now()); msg := null; exception when others then msg := 'denied'; end;
  if msg is distinct from 'denied' then raise exception 'FAIL non-admin must not INSERT note_drafts'; end if;

  -- every mutation function: forbidden
  msg := null; begin perform public.publish_note(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin publish_note must be forbidden (got %)', msg; end if;
  msg := null; begin perform public.unpublish_note(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin unpublish_note must be forbidden (got %)', msg; end if;
  msg := null; begin perform public.discard_note_draft(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin discard_note_draft must be forbidden (got %)', msg; end if;
  msg := null; begin perform public.save_note_draft(v, '{}'::jsonb, null); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin save_note_draft must be forbidden (got %)', msg; end if;
  msg := null; begin perform public.create_note('{"slug":"t3b-hack","title":"x"}'::jsonb); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin create_note must be forbidden (got %)', msg; end if;
  msg := null; begin perform public.publish_lab_entry((select id from public.lab_entries where slug = 't3b-lab-pub')); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin publish_lab_entry must be forbidden (got %)', msg; end if;
  msg := null; begin perform public.create_lab_entry('{"slug":"t3b-hack","title":"x","year":"2026"}'::jsonb); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin create_lab_entry must be forbidden (got %)', msg; end if;

  -- direct unpublish via UPDATE: no policy allows it → 0 rows affected, status unchanged
  update public.notes set status = 'draft' where slug = 't3b-note-pub';
  if (select status from public.notes where slug = 't3b-note-pub') <> 'published' then
    raise exception 'FAIL non-admin direct UPDATE must not unpublish';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- ================================================================= 3) ADMIN (a1): NOTES lifecycle, part 1
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v uuid; d timestamptz; msg text; doc jsonb;
begin
  doc := jsonb_build_object('slug', 't3b-note-new', 'title', 'New note', 'excerpt', 'Ex',
           'content', '[{"kind":"p","text":"hello"}]'::jsonb, 'tags', jsonb_build_array('AI'),
           'accent', 'blue', 'reading_time_minutes', null, 'published_at', null);

  -- create → shell row (draft) + exactly one draft doc, atomically
  v := public.create_note(doc);
  perform set_config('t3b.note', v::text, true);
  if (select status from public.notes where id = v) <> 'draft' then raise exception 'FAIL create_note must create a draft shell'; end if;
  if (select count(*) from public.note_drafts where entity_id = v) <> 1 then raise exception 'FAIL create_note must create exactly one draft doc'; end if;
  if (select excerpt from public.notes where id = v) <> '' then raise exception 'FAIL shell row must not carry the content (it lives in the draft doc)'; end if;

  -- duplicate slug rejected, and nothing half-created
  msg := null;
  begin perform public.create_note(jsonb_build_object('slug', 't3b-note-new', 'title', 'Dup')); exception when unique_violation then msg := 'dup'; end;
  if msg is distinct from 'dup' then raise exception 'FAIL duplicate slug must be rejected (unique_violation)'; end if;
  if (select count(*) from public.notes where slug = 't3b-note-new') <> 1 then raise exception 'FAIL duplicate attempt must not leave a second row'; end if;
  if (select count(*) from public.note_drafts d join public.notes n on n.id = d.entity_id where n.slug like 't3b-note-new%') <> 1 then
    raise exception 'FAIL duplicate attempt must not leave an orphan draft';
  end if;

  -- save: stale expected token rejected; correct token accepted
  select updated_at into d from public.note_drafts where entity_id = v;
  msg := null;
  begin perform public.save_note_draft(v, doc, d - interval '1 second'); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'stale_draft' then raise exception 'FAIL stale expected token must be rejected (got %)', msg; end if;
  msg := null;
  begin perform public.save_note_draft(v, doc, null); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'stale_draft' then raise exception 'FAIL missing token while a draft exists must be rejected (got %)', msg; end if;
  perform public.save_note_draft(v, doc, d);

  -- publish: stale draft (simulated older base) is rejected and changes nothing
  update public.note_drafts set based_on_updated_at = based_on_updated_at - interval '1 second' where entity_id = v;
  msg := null;
  begin perform public.publish_note(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'stale_draft' then raise exception 'FAIL stale publish must be rejected (got %)', msg; end if;
  if (select status from public.notes where id = v) <> 'draft' then raise exception 'FAIL rejected publish must not change status'; end if;
  update public.note_drafts set based_on_updated_at = based_on_updated_at + interval '1 second' where entity_id = v;

  -- discard on a never-published entity is not allowed (its draft IS the content)
  msg := null;
  begin perform public.discard_note_draft(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'nothing_to_discard' then raise exception 'FAIL discard of a never-published draft must be rejected (got %)', msg; end if;

  -- publish OK: draft applied to live row, status published, published_at set, draft removed
  perform public.publish_note(v);
  if (select status from public.notes where id = v) <> 'published' then raise exception 'FAIL publish_note must publish'; end if;
  if (select published_at from public.notes where id = v) is null then raise exception 'FAIL publish must set published_at'; end if;
  if (select content -> 0 ->> 'text' from public.notes where id = v) <> 'hello' then raise exception 'FAIL publish must apply the draft content'; end if;
  if (select excerpt from public.notes where id = v) <> 'Ex' then raise exception 'FAIL publish must apply the excerpt'; end if;
  if (select count(*) from public.note_drafts where entity_id = v) <> 0 then raise exception 'FAIL publish must remove the draft doc'; end if;

  -- publishing again with nothing pending is rejected
  msg := null;
  begin perform public.publish_note(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'nothing_to_publish' then raise exception 'FAIL publish without a pending draft must be rejected (got %)', msg; end if;

  -- EDIT PUBLISHED: live row must NOT change; a draft doc is created
  perform public.save_note_draft(v, doc || jsonb_build_object('title', 'Edited title', 'excerpt', 'Edited ex'), null);
  if (select title from public.notes where id = v) <> 'New note' then raise exception 'FAIL editing a published note must NOT modify the live row'; end if;
  if (select count(*) from public.note_drafts where entity_id = v) <> 1 then raise exception 'FAIL editing a published note must create a pending draft'; end if;
  if (select based_on_updated_at from public.note_drafts where entity_id = v) is distinct from (select updated_at from public.notes where id = v) then
    raise exception 'FAIL draft of a published note must be based on the live row version';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- ================================================================= 4) ANON again: pending draft invisible, live row unchanged
set local role anon;
do $$ begin
  if (select title from public.notes where slug = 't3b-note-new') <> 'New note' then raise exception 'FAIL anon must see the OLD title while an edit is pending'; end if;
  if (select count(*) from public.notes where slug like 't3b-note-%') <> 2 then raise exception 'FAIL anon must see exactly the 2 published notes'; end if;
end $$;
reset role;

-- ================================================================= 5) ADMIN: NOTES lifecycle, part 2
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v uuid; msg text; doc jsonb;
begin
  v := current_setting('t3b.note')::uuid;
  doc := jsonb_build_object('slug', 't3b-note-new', 'title', 'Edited title', 'excerpt', 'Edited ex',
           'content', '[{"kind":"p","text":"edited"}]'::jsonb, 'tags', '[]'::jsonb, 'accent', 'green', 'reading_time_minutes', 3, 'published_at', null);

  -- published slug cannot be changed: direct UPDATE
  msg := null;
  begin update public.notes set slug = 't3b-note-renamed' where id = v; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'published content slug cannot be changed' then raise exception 'FAIL direct slug UPDATE on a published row must be rejected (got %)', msg; end if;

  -- ... and through a draft: save works, publish is rejected and leaves live + draft intact
  perform public.save_note_draft(v, doc || jsonb_build_object('slug', 't3b-note-renamed'), (select updated_at from public.note_drafts where entity_id = v));
  msg := null;
  begin perform public.publish_note(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'published content slug cannot be changed' then raise exception 'FAIL publish must not change a published slug (got %)', msg; end if;
  if (select slug from public.notes where id = v) <> 't3b-note-new' then raise exception 'FAIL live slug must be unchanged'; end if;
  if (select count(*) from public.note_drafts where entity_id = v) <> 1 then raise exception 'FAIL failed publish must keep the draft (atomic)'; end if;

  -- fix the slug in the draft, then publish the edit
  perform public.save_note_draft(v, doc, (select updated_at from public.note_drafts where entity_id = v));
  perform public.publish_note(v);
  if (select title from public.notes where id = v) <> 'Edited title' then raise exception 'FAIL publish must apply the edit'; end if;
  if (select reading_time_minutes from public.notes where id = v) <> 3 then raise exception 'FAIL publish must apply reading_time_minutes'; end if;
  if (select count(*) from public.note_drafts where entity_id = v) <> 0 then raise exception 'FAIL publish must remove the draft'; end if;

  -- DISCARD: pending draft removed, live row untouched, entity NOT deleted
  perform public.save_note_draft(v, doc || jsonb_build_object('title', 'Discard me'), null);
  perform public.discard_note_draft(v);
  if (select count(*) from public.note_drafts where entity_id = v) <> 0 then raise exception 'FAIL discard must remove the draft'; end if;
  if (select title from public.notes where id = v) <> 'Edited title' then raise exception 'FAIL discard must not touch the live row'; end if;
  if (select count(*) from public.notes where id = v) <> 1 then raise exception 'FAIL discard must not delete the entity'; end if;
  msg := null;
  begin perform public.discard_note_draft(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'nothing_to_discard' then raise exception 'FAIL discard without a draft must be rejected (got %)', msg; end if;

  -- UNPUBLISH with a pending draft: status draft, draft kept and still publishable (re-based, not stale)
  perform public.save_note_draft(v, doc || jsonb_build_object('title', 'After unpublish'), null);
  perform public.unpublish_note(v);
  if (select status from public.notes where id = v) <> 'draft' then raise exception 'FAIL unpublish must set status draft'; end if;
  if (select count(*) from public.note_drafts where entity_id = v) <> 1 then raise exception 'FAIL unpublish must keep the pending draft'; end if;
  if (select based_on_updated_at from public.note_drafts where entity_id = v) is distinct from (select updated_at from public.notes where id = v) then
    raise exception 'FAIL unpublish must re-base the pending draft';
  end if;
  msg := null;
  begin perform public.unpublish_note(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'not_published' then raise exception 'FAIL unpublish of a non-published row must be rejected (got %)', msg; end if;
  -- a previously published row keeps its slug reserved and its content pristine while unpublished
  perform public.publish_note(v);
  if (select title from public.notes where id = v) <> 'After unpublish' then raise exception 'FAIL re-publish after unpublish must apply the pending draft'; end if;
  perform public.unpublish_note(v);
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $$ begin
  if (select count(*) from public.notes where slug = 't3b-note-new') <> 0 then raise exception 'FAIL anon must not see an unpublished note'; end if;
end $$;
reset role;

-- ================================================================= 6) ADMIN: LAB lifecycle
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v uuid; msg text; doc jsonb;
begin
  doc := jsonb_build_object('slug', 't3b-lab-new', 'title', 'New lab', 'short_title', null, 'type', 'EXPERIMENT',
           'experiment_status', 'ACTIVE', 'category', null, 'summary', 'Sum', 'description', 'Desc', 'accent', 'purple',
           'featured', true, 'year', '2026', 'tags', jsonb_build_array('AI'),
           'story', jsonb_build_object('why', jsonb_build_array('w'), 'state', jsonb_build_array('s')), 'sort_order', 7);

  v := public.create_lab_entry(doc);
  perform set_config('t3b.lab', v::text, true);
  if (select status from public.lab_entries where id = v) <> 'draft' then raise exception 'FAIL create_lab_entry must create a draft shell'; end if;
  if (select count(*) from public.lab_entry_drafts where entity_id = v) <> 1 then raise exception 'FAIL create_lab_entry must create one draft doc'; end if;

  msg := null;
  begin perform public.create_lab_entry(doc); exception when unique_violation then msg := 'dup'; end;
  if msg is distinct from 'dup' then raise exception 'FAIL duplicate lab slug must be rejected'; end if;

  update public.lab_entry_drafts set based_on_updated_at = based_on_updated_at - interval '1 second' where entity_id = v;
  msg := null;
  begin perform public.publish_lab_entry(v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'stale_draft' then raise exception 'FAIL stale lab publish must be rejected (got %)', msg; end if;
  update public.lab_entry_drafts set based_on_updated_at = based_on_updated_at + interval '1 second' where entity_id = v;

  perform public.publish_lab_entry(v);
  if (select status from public.lab_entries where id = v) <> 'published' then raise exception 'FAIL publish_lab_entry must publish'; end if;
  if (select sort_order from public.lab_entries where id = v) <> 7 then raise exception 'FAIL publish must apply sort_order'; end if;
  if (select story ->> 'why' from public.lab_entries where id = v) is null then raise exception 'FAIL publish must apply story'; end if;
  if (select featured from public.lab_entries where id = v) is not true then raise exception 'FAIL publish must apply featured'; end if;

  perform public.save_lab_entry_draft(v, doc || jsonb_build_object('title', 'Edited lab'), null);
  if (select title from public.lab_entries where id = v) <> 'New lab' then raise exception 'FAIL editing a published lab entry must NOT modify the live row'; end if;

  msg := null;
  begin update public.lab_entries set slug = 't3b-lab-renamed' where id = v; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'published content slug cannot be changed' then raise exception 'FAIL lab published slug must be locked (got %)', msg; end if;

  perform public.discard_lab_entry_draft(v);
  if (select count(*) from public.lab_entry_drafts where entity_id = v) <> 0 then raise exception 'FAIL lab discard must remove the draft'; end if;
  perform public.save_lab_entry_draft(v, doc || jsonb_build_object('title', 'Edited lab'), null);
  perform public.publish_lab_entry(v);
  if (select title from public.lab_entries where id = v) <> 'Edited lab' then raise exception 'FAIL lab publish must apply the edit'; end if;
  perform public.unpublish_lab_entry(v);
  if (select status from public.lab_entries where id = v) <> 'draft' then raise exception 'FAIL lab unpublish must set draft'; end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $$ begin
  if (select count(*) from public.lab_entries where slug = 't3b-lab-new') <> 0 then raise exception 'FAIL anon must not see an unpublished lab entry'; end if;
end $$;
reset role;

-- ================================================================= 7) existing public content untouched
do $$ begin raise notice 'ALL 3B-A1 SMOKE TESTS PASSED'; end $$;

rollback;
