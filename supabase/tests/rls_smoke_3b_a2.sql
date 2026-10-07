-- MURAT/LAB CMS — FAZ 3B-A2 RLS + lifecycle smoke test (migration 0005: projects drafts + site content functions)
--
-- Run in the Supabase SQL Editor AFTER applying 0001-0005. Runs as the privileged `postgres` role and switches roles itself.
-- Expect the NOTICE "ALL 3B-A2 SMOKE TESTS PASSED"; any failure raises an exception starting with "FAIL".
-- Everything runs inside ONE transaction that is ROLLED BACK at the end (no production content is touched or kept).
-- That includes the DELETEs of site_content rows for the keys 'hero', 'lab_page' and 'about' below: they only make the test
-- deterministic if those keys already hold real content, and are undone by the final ROLLBACK.
--
-- NOTE (single transaction): now() is constant inside a transaction, so updated_at never advances between steps.
-- Time-dependent staleness is therefore SIMULATED (expected token shifted by 1 second / based_on_updated_at shifted).
-- Real multi-request behaviour (two browser tabs) is covered by the manual QA checklist in docs/cms/LIFECYCLE.md.
--
-- SHELL SEMANTICS (intended behaviour, same contract as Notes/Lab in 0004; this test asserts it):
--   create_project() inserts a SHELL row in public.projects = only what the schema REQUIRES (slug, title, accent) + status 'draft'
--   (never public); every other column keeps its schema default (summary '', subtitle '', size 'standard', graphic 'rings',
--   tags '{}', kind/type_label/category/pill/case_study NULL, sort_order 0). ALL editable content lives ONLY in project_drafts.data.
--   A draft save on a NEVER-published shell mirrors just slug + title (reserved slug, readable list title) and re-bases the draft.
--   publish_project() is the only step that copies the whole whitelisted doc to the live row (atomically, then deletes the draft).
--
-- Claims used (auth.uid() reads request.jwt.claims):   a1 = admin (admin_users)   b2 = authenticated NON-admin

begin;
select set_config('request.jwt.claims', '', true);

-- pre-flight: a previous aborted run must not leave fixtures behind (would surface as confusing duplicate-key errors)
do $$ begin
  if exists (select 1 from public.projects where slug like 't3b2-%')
     or exists (select 1 from auth.users where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2')) then
    raise exception 'FAIL PRE-FLIGHT: leftover 3B-A2/A1 test fixtures found. Run "rollback;" once, check they are gone, then re-run this script.';
  end if;
end $$;

-- ================================================================= fixtures (postgres)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'owner3b2@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'other3b2@example.test');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000000a1');

delete from public.site_content_drafts where key in ('hero', 'lab_page', 'about');
delete from public.site_content_published where key in ('hero', 'lab_page', 'about');

insert into public.projects (slug, title, accent, summary, status, published_at)
  values ('t3b2-proj-pub', 'Pub project', 'blue', 'sum', 'published', now());
insert into public.projects (slug, title, accent) values ('t3b2-proj-shell', 'Shell project', 'blue');   -- draft base row
insert into public.project_drafts (entity_id, data, based_on_updated_at)
  select id, jsonb_build_object('title', 'SECRET DRAFT'), updated_at from public.projects where slug = 't3b2-proj-pub';
insert into public.site_content_published (key, data) values ('lab_page', '{"eyebrow":"LIVE","note":"live note","projectsLinkLabel":"Live"}');
insert into public.site_content_drafts (key, data) values ('hero', '{"secret":"SECRET HERO DRAFT"}');

-- ================================================================= 1) ANON
set local role anon;

do $$ begin
  if (select count(*) from public.projects where slug like 't3b2-%') <> 1 then
    raise exception 'FAIL anon must see only the published project (draft base row hidden)';
  end if;
  if (select count(*) from public.site_content_published where key = 'lab_page') <> 1 then
    raise exception 'FAIL anon must read published site content';
  end if;
end $$;

do $$ declare ok boolean := false; begin begin perform 1 from public.project_drafts; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not SELECT project_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin insert into public.project_drafts (entity_id, data, based_on_updated_at) values (gen_random_uuid(), '{}', now()); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not INSERT project_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin update public.project_drafts set data = '{}'; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not UPDATE project_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin delete from public.project_drafts; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not DELETE project_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin perform 1 from public.site_content_drafts; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not SELECT site_content_drafts'; end if; end $$;
do $$ declare ok boolean := false; begin begin insert into public.site_content_published (key, data) values ('hero', '{}'); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not INSERT site_content_published'; end if; end $$;

do $$ declare ok boolean; begin
  ok := false; begin perform public.create_project('{"slug":"t3b2-x","title":"x","accent":"blue"}'); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not execute create_project'; end if;
  ok := false; begin perform public.publish_project((select id from public.projects where slug = 't3b2-proj-pub')); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not execute publish_project'; end if;
  ok := false; begin perform public.save_site_content_draft('lab_page', '{}', null); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not execute save_site_content_draft'; end if;
  ok := false; begin perform public.publish_site_content_draft('hero', now()); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not execute publish_site_content_draft'; end if;
  ok := false; begin perform public.discard_site_content_draft('hero'); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL anon must not execute discard_site_content_draft'; end if;
end $$;

reset role;

-- ================================================================= 2) AUTHENTICATED NON-ADMIN (b2)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;

do $$ declare msg text; v uuid; begin
  v := (select id from public.projects where slug = 't3b2-proj-pub');
  if v is null then raise exception 'FAIL non-admin must still read the published project'; end if;
  if (select count(*) from public.project_drafts) <> 0 then raise exception 'FAIL non-admin must see 0 rows in project_drafts'; end if;
  if (select count(*) from public.site_content_drafts) <> 0 then raise exception 'FAIL non-admin must see 0 rows in site_content_drafts'; end if;

  begin insert into public.project_drafts (entity_id, data, based_on_updated_at) values (v, '{}', now()); msg := null; exception when others then msg := 'denied'; end;
  if msg is distinct from 'denied' then raise exception 'FAIL non-admin must not INSERT project_drafts'; end if;
  begin insert into public.site_content_drafts (key, data) values ('about', '{}'); msg := null; exception when others then msg := 'denied'; end;
  if msg is distinct from 'denied' then raise exception 'FAIL non-admin must not INSERT site_content_drafts'; end if;
  begin insert into public.site_content_published (key, data) values ('about', '{}'); msg := null; exception when others then msg := 'denied'; end;
  if msg is distinct from 'denied' then raise exception 'FAIL non-admin must not INSERT site_content_published'; end if;

  -- every new function: forbidden
  begin perform public.create_project('{"slug":"t3b2-y","title":"y","accent":"blue"}'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin create_project must be forbidden (got %)', msg; end if;
  begin perform public.save_project_draft(v, '{}', null); msg := null; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin save_project_draft must be forbidden (got %)', msg; end if;
  begin perform public.publish_project(v); msg := null; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin publish_project must be forbidden (got %)', msg; end if;
  begin perform public.unpublish_project(v); msg := null; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin unpublish_project must be forbidden (got %)', msg; end if;
  begin perform public.discard_project_draft(v); msg := null; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin discard_project_draft must be forbidden (got %)', msg; end if;
  begin perform public.save_site_content_draft('about', '{}', null); msg := null; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin save_site_content_draft must be forbidden (got %)', msg; end if;
  begin perform public.publish_site_content_draft('hero', now()); msg := null; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin publish_site_content_draft must be forbidden (got %)', msg; end if;
  begin perform public.discard_site_content_draft('hero'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is distinct from 'forbidden' then raise exception 'FAIL non-admin discard_site_content_draft must be forbidden (got %)', msg; end if;

  -- internal helper is not callable by API roles
  begin perform public._apply_project_doc(v, '{}'); msg := null; exception when others then msg := 'denied'; end;
  if msg is distinct from 'denied' then raise exception 'FAIL _apply_project_doc must not be callable by API roles'; end if;
end $$;

reset role;

-- ================================================================= 3) ADMIN (a1): PROJECTS lifecycle
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_id uuid; v_tok timestamptz; v_msg text; r public.projects%rowtype;
  v_doc jsonb := jsonb_build_object(
    'slug', 't3b2-proj-new', 'title', 'Full Proj', 'subtitle', 'sub', 'summary', 'sum', 'accent', 'purple', 'size', 'feature', 'graphic', 'flow',
    'tags', jsonb_build_array('a', 'b'), 'coming_soon', false, 'kind', 'personal', 'type_label', 'PERSONAL', 'category', 'Cat',
    'project_status_label', 'ACTIVE', 'project_status_accent', 'green',
    'case_study', jsonb_build_object('sections', jsonb_build_array(), 'tags', jsonb_build_array('x')), 'sort_order', 7);
begin
  -- create: shell (draft, never public) + draft doc
  -- note: 'summary' is passed on purpose; create_project() must NOT write it to the shell (it is not a schema-required column)
  v_id := public.create_project(jsonb_build_object('slug', 't3b2-proj-new', 'title', 'New Proj', 'accent', 'green', 'summary', 's'));
  if (select status from public.projects where id = v_id) <> 'draft' then raise exception 'FAIL create_project must create a DRAFT shell'; end if;
  if not exists (select 1 from public.project_drafts where entity_id = v_id) then raise exception 'FAIL create_project must create the draft doc'; end if;
  if (select summary from public.projects where id = v_id) <> '' then raise exception 'FAIL create_project must insert only the schema-required fields (summary belongs to the draft doc)'; end if;
  if (select data ->> 'summary' from public.project_drafts where entity_id = v_id) is distinct from 's' then raise exception 'FAIL create_project must store the full doc in the draft'; end if;

  -- duplicate slug
  begin perform public.create_project(jsonb_build_object('slug', 't3b2-proj-new', 'title', 'Dup', 'accent', 'blue')); v_msg := null;
  exception when unique_violation then v_msg := 'dup'; end;
  if v_msg is distinct from 'dup' then raise exception 'FAIL duplicate project slug must be rejected (got %)', v_msg; end if;

  -- save: compare-and-set on the draft token
  select updated_at into v_tok from public.project_drafts where entity_id = v_id;
  begin perform public.save_project_draft(v_id, v_doc, v_tok - interval '1 second'); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'stale_draft' then raise exception 'FAIL save with a stale token must raise stale_draft (got %)', v_msg; end if;
  begin perform public.save_project_draft(v_id, v_doc, null); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'stale_draft' then raise exception 'FAIL save with null token while a draft exists must raise stale_draft (got %)', v_msg; end if;
  v_tok := public.save_project_draft(v_id, v_doc, v_tok);
  if v_tok is null then raise exception 'FAIL save_project_draft must return the new draft token'; end if;

  -- never-published shell: a draft save mirrors ONLY slug + title. Every other column is still create_project()'s minimal shell
  -- (accent from the create call, status 'draft') plus schema defaults; the draft content stays solely in project_drafts.data.
  select * into r from public.projects where id = v_id;
  if r.slug <> 't3b2-proj-new' or r.title <> 'Full Proj' then
    raise exception 'FAIL draft save must mirror slug and title onto the never-published shell (got slug %, title %)', r.slug, r.title;
  end if;
  if r.status <> 'draft' or r.published_at is not null then raise exception 'FAIL a draft save must not publish or date the shell (status %)', r.status; end if;
  if r.accent <> 'green' then raise exception 'FAIL the shell keeps the accent given to create_project (green), not the draft doc''s (got %)', r.accent; end if;
  if r.summary <> '' or r.subtitle <> '' or r.size <> 'standard' or r.graphic <> 'rings' or cardinality(r.tags) <> 0 or r.coming_soon
     or r.kind is not null or r.type_label is not null or r.category is not null
     or r.project_status_label is not null or r.project_status_accent is not null or r.case_study is not null or r.sort_order <> 0 then
    raise exception 'FAIL draft content must stay in the draft doc and must not leak into the live shell (row: %)', to_jsonb(r);
  end if;
  if (select data ->> 'summary' from public.project_drafts where entity_id = v_id) is distinct from 'sum'
     or (select data ->> 'accent' from public.project_drafts where entity_id = v_id) is distinct from 'purple' then
    raise exception 'FAIL the draft doc must hold the saved content (summary sum, accent purple)';
  end if;

  -- publish: whitelisted fields copied, draft deleted, status published
  perform public.publish_project(v_id);
  select * into r from public.projects where id = v_id;
  if r.status <> 'published' or r.published_at is null then raise exception 'FAIL publish_project must publish'; end if;
  if r.size <> 'feature' or r.graphic <> 'flow' or r.accent <> 'purple' or r.sort_order <> 7 or r.kind <> 'personal'
     or r.type_label <> 'PERSONAL' or r.category <> 'Cat' or r.subtitle <> 'sub' or r.summary <> 'sum'
     or r.project_status_label <> 'ACTIVE' or r.project_status_accent <> 'green' or r.tags <> array['a', 'b']
     or jsonb_typeof(r.case_study) <> 'object' or r.case_study -> 'tags' <> '["x"]'::jsonb then
    raise exception 'FAIL publish_project must apply every editable field (row: %)', to_jsonb(r);
  end if;
  if exists (select 1 from public.project_drafts where entity_id = v_id) then raise exception 'FAIL publish_project must delete the draft doc'; end if;
  begin perform public.publish_project(v_id); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'nothing_to_publish' then raise exception 'FAIL publishing without a pending draft must raise nothing_to_publish (got %)', v_msg; end if;

  -- edit published: live row UNTOUCHED, pending draft created, based on live
  v_tok := public.save_project_draft(v_id, v_doc || '{"title":"EDITED"}'::jsonb, null);
  if (select title from public.projects where id = v_id) <> 'Full Proj' then raise exception 'FAIL editing a published project must not change the live row'; end if;
  if (select based_on_updated_at from public.project_drafts where entity_id = v_id) is distinct from (select updated_at from public.projects where id = v_id) then
    raise exception 'FAIL pending draft must be based on the live updated_at';
  end if;

  -- slug lock: a draft that changes the slug cannot be published
  v_tok := public.save_project_draft(v_id, v_doc || '{"title":"EDITED","slug":"t3b2-proj-changed"}'::jsonb, v_tok);
  begin perform public.publish_project(v_id); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%slug cannot be changed%' then raise exception 'FAIL publishing a changed slug of a published project must be rejected (got %)', v_msg; end if;
  if (select slug from public.projects where id = v_id) <> 't3b2-proj-new' then raise exception 'FAIL slug must be unchanged'; end if;
  v_tok := public.save_project_draft(v_id, v_doc || '{"title":"EDITED"}'::jsonb, v_tok);

  -- stale draft: live changed under the draft (simulated)
  update public.project_drafts set based_on_updated_at = based_on_updated_at - interval '1 second' where entity_id = v_id;
  begin perform public.publish_project(v_id); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'stale_draft' then raise exception 'FAIL publishing a stale draft must raise stale_draft (got %)', v_msg; end if;
  if (select title from public.projects where id = v_id) <> 'Full Proj' then raise exception 'FAIL a rejected publish must not change the live row'; end if;
  update public.project_drafts set based_on_updated_at = (select updated_at from public.projects where id = v_id) where entity_id = v_id;

  -- publish the edit
  perform public.publish_project(v_id);
  if (select title from public.projects where id = v_id) <> 'EDITED' then raise exception 'FAIL publish must apply the pending edit'; end if;

  -- discard: pending draft removed, live untouched; nothing_to_discard afterwards
  v_tok := public.save_project_draft(v_id, v_doc || '{"title":"DISCARD ME"}'::jsonb, null);
  perform public.discard_project_draft(v_id);
  if exists (select 1 from public.project_drafts where entity_id = v_id) then raise exception 'FAIL discard must delete the draft doc'; end if;
  if (select title from public.projects where id = v_id) <> 'EDITED' then raise exception 'FAIL discard must not touch the live row'; end if;
  begin perform public.discard_project_draft(v_id); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'nothing_to_discard' then raise exception 'FAIL discard without a draft must raise nothing_to_discard (got %)', v_msg; end if;

  -- unpublish with a pending draft: row back to draft, content preserved, pending draft re-based (not stale)
  v_tok := public.save_project_draft(v_id, v_doc || '{"title":"PENDING"}'::jsonb, null);
  perform public.unpublish_project(v_id);
  select * into r from public.projects where id = v_id;
  if r.status <> 'draft' or r.title <> 'EDITED' then raise exception 'FAIL unpublish must set draft and keep content (status %, title %)', r.status, r.title; end if;
  if (select based_on_updated_at from public.project_drafts where entity_id = v_id) is distinct from r.updated_at then
    raise exception 'FAIL unpublish must re-base the pending draft so it is not stale';
  end if;
  begin perform public.unpublish_project(v_id); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'not_published' then raise exception 'FAIL unpublishing a non-published project must raise not_published (got %)', v_msg; end if;

  -- a never-published shell has nothing to discard back to
  v_id := public.create_project(jsonb_build_object('slug', 't3b2-proj-never', 'title', 'Never', 'accent', 'blue'));
  begin perform public.discard_project_draft(v_id); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'nothing_to_discard' then raise exception 'FAIL discard on a never-published project must raise nothing_to_discard (got %)', v_msg; end if;

  -- non-object case_study in the doc becomes NULL (never invalid data in the live row)
  v_tok := public.save_project_draft(v_id, jsonb_build_object('slug', 't3b2-proj-never', 'title', 'Never', 'accent', 'blue', 'case_study', 'not an object'), (select updated_at from public.project_drafts where entity_id = v_id));
  perform public.publish_project(v_id);
  if (select case_study from public.projects where id = v_id) is not null then raise exception 'FAIL a non-object case_study must be stored as NULL'; end if;

  -- unknown project
  begin perform public.publish_project(gen_random_uuid()); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'not_found' then raise exception 'FAIL unknown project must raise not_found (got %)', v_msg; end if;
end $$;

-- direct slug change of a PUBLISHED project is blocked by the 0004 trigger (defence in depth)
do $$ declare v_msg text; begin
  begin update public.projects set slug = 't3b2-hijack' where slug = 't3b2-proj-pub'; v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%slug cannot be changed%' then raise exception 'FAIL direct UPDATE of a published slug must be rejected (got %)', v_msg; end if;
end $$;

-- ================================================================= 4) ADMIN (a1): SITE CONTENT lifecycle
do $$
declare
  v_tok timestamptz; v_msg text; v_pub timestamptz;
  v_live jsonb := '{"eyebrow":"LIVE","note":"live note","projectsLinkLabel":"Live"}';
  v_new  jsonb := '{"eyebrow":"NEW","note":"new note","projectsLinkLabel":"New"}';
begin
  -- first draft of a key that HAS a published version: expected must be null
  begin perform public.save_site_content_draft('lab_page', v_new, now()); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'stale_draft' then raise exception 'FAIL first save with a non-null token must raise stale_draft (got %)', v_msg; end if;
  v_tok := public.save_site_content_draft('lab_page', v_new, null);
  if v_tok is null then raise exception 'FAIL save_site_content_draft must return the draft token'; end if;
  if (select data from public.site_content_published where key = 'lab_page') <> v_live then raise exception 'FAIL saving a draft must not change the published document'; end if;

  -- a second "first" save (concurrent tab) must lose
  begin perform public.save_site_content_draft('lab_page', v_new, null); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'stale_draft' then raise exception 'FAIL second null-token save must raise stale_draft (got %)', v_msg; end if;
  -- wrong token
  begin perform public.save_site_content_draft('lab_page', v_new, v_tok - interval '1 second'); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'stale_draft' then raise exception 'FAIL stale token must raise stale_draft (got %)', v_msg; end if;
  -- correct token
  v_tok := public.save_site_content_draft('lab_page', '{"eyebrow":"NEWER","note":"n","projectsLinkLabel":"p"}', v_tok);

  -- publish: only the exact draft version the caller saw
  begin perform public.publish_site_content_draft('lab_page', v_tok - interval '1 second'); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'stale_draft' then raise exception 'FAIL publishing with a stale token must raise stale_draft (got %)', v_msg; end if;
  if (select data from public.site_content_published where key = 'lab_page') <> v_live then raise exception 'FAIL a rejected publish must not change the published document'; end if;
  perform public.publish_site_content_draft('lab_page', v_tok);
  if (select data ->> 'eyebrow' from public.site_content_published where key = 'lab_page') <> 'NEWER' then raise exception 'FAIL publish must copy the draft to published'; end if;
  if (select published_by from public.site_content_published where key = 'lab_page') is distinct from '00000000-0000-0000-0000-0000000000a1'::uuid then raise exception 'FAIL published_by must be the admin'; end if;
  begin perform public.publish_site_content_draft('nope', now()); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'not_found' then raise exception 'FAIL publishing a key without a draft must raise not_found (got %)', v_msg; end if;

  -- edit after publish: published untouched until publish; discard removes the pending draft
  v_tok := public.save_site_content_draft('lab_page', '{"eyebrow":"PENDING","note":"n","projectsLinkLabel":"p"}', (select updated_at from public.site_content_drafts where key = 'lab_page'));
  if (select data ->> 'eyebrow' from public.site_content_published where key = 'lab_page') <> 'NEWER' then raise exception 'FAIL editing after publish must not change published'; end if;
  perform public.discard_site_content_draft('lab_page');
  if exists (select 1 from public.site_content_drafts where key = 'lab_page') then raise exception 'FAIL discard must delete the draft row'; end if;
  if (select data ->> 'eyebrow' from public.site_content_published where key = 'lab_page') <> 'NEWER' then raise exception 'FAIL discard must not touch published'; end if;
  begin perform public.discard_site_content_draft('lab_page'); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'nothing_to_discard' then raise exception 'FAIL discard without a draft must raise nothing_to_discard (got %)', v_msg; end if;

  -- a never-published key: its draft IS the content, so discard is refused; publish creates the published row
  select updated_at into v_tok from public.site_content_drafts where key = 'hero';
  v_tok := public.save_site_content_draft('hero', '{"first":"A"}', v_tok);
  begin perform public.discard_site_content_draft('hero'); v_msg := null; exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'nothing_to_discard' then raise exception 'FAIL discard on a never-published key must raise nothing_to_discard (got %)', v_msg; end if;
  perform public.publish_site_content_draft('hero', v_tok);
  if (select data ->> 'first' from public.site_content_published where key = 'hero') <> 'A' then raise exception 'FAIL first publish must create the published row'; end if;

  -- table CHECK constraints still guard key and shape
  begin perform public.save_site_content_draft('evil', '{}', null); v_msg := null; exception when check_violation then v_msg := 'check'; end;
  if v_msg is distinct from 'check' then raise exception 'FAIL an unknown key must be rejected by the table CHECK (got %)', v_msg; end if;
  begin perform public.save_site_content_draft('about', '[]', null); v_msg := null; exception when check_violation then v_msg := 'check'; end;
  if v_msg is distinct from 'check' then raise exception 'FAIL a non-object document must be rejected by the table CHECK (got %)', v_msg; end if;
end $$;

reset role;

-- ================================================================= 5) ANON again: nothing leaked
set local role anon;

do $$ begin
  if (select title from public.projects where slug = 't3b2-proj-pub') <> 'Pub project' then raise exception 'FAIL anon must see the original published project'; end if;
  -- t3b2-proj-shell never published; t3b2-proj-new was UNPUBLISHED in section 3 -> both invisible. t3b2-proj-never was published last.
  if exists (select 1 from public.projects where slug in ('t3b2-proj-shell', 't3b2-proj-new')) then raise exception 'FAIL anon must not see draft or unpublished project rows'; end if;
  if (select title from public.projects where slug = 't3b2-proj-never') is distinct from 'Never' then raise exception 'FAIL anon must see the project published last'; end if;
  if (select data ->> 'eyebrow' from public.site_content_published where key = 'lab_page') <> 'NEWER' then raise exception 'FAIL anon must read the published site document'; end if;
  if exists (select 1 from public.site_content_published where data::text like '%SECRET%') then raise exception 'FAIL a draft secret leaked into published site content'; end if;
end $$;

reset role;
do $$ begin raise notice 'ALL 3B-A2 SMOKE TESTS PASSED'; end $$;
rollback;
