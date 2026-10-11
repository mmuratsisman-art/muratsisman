-- MURAT/LAB — Visitor Analytics (FAZ 1) RLS + RPC smoke test (migration 0007)
--
-- *** YALNIZCA TEST Supabase projesinde çalıştırın (production'da DEĞİL). ***
-- Supabase SQL Editor'de 0001-0007 uygulandıktan sonra çalıştırılır. Ayrıcalıklı `postgres` rolüyle çalışır, rolleri kendisi değiştirir.
-- Beklenen: NOTICE "ALL ANALYTICS SMOKE TESTS PASSED". Herhangi bir hata "FAIL ..." ile başlayan bir istisna fırlatır.
-- Her şey TEK bir işlemde çalışır ve sonunda ROLLBACK edilir (hiçbir veri kalıcı olmaz).
--
-- Kimlikler (auth.uid() = request.jwt.claims.sub):  07c1 = analytics yazıcısı   07a1 = admin   07b2 = sıradan authenticated
-- Not: tek işlemde now() sabittir; gün sınırı testleri bu yüzden yoktur (gün Europe/Istanbul tarihidir).

begin;
select set_config('request.jwt.claims', '', true);

do $$ begin
  if exists (select 1 from public.projects where slug like 't7a-%')
     or exists (select 1 from auth.users where id in ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b2')) then
    raise exception 'FAIL PRE-FLIGHT: önceki bir çalıştırmadan test verisi kalmış. Bir kez "rollback;" çalıştırın, temizlendiğini kontrol edip yeniden deneyin.';
  end if;
end $$;

-- ================================================================= fixtures (postgres)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000007c1', 'authenticated', 'authenticated', 'writer7a@example.test'),
  ('00000000-0000-0000-0000-0000000007a1', 'authenticated', 'authenticated', 'admin7a@example.test'),
  ('00000000-0000-0000-0000-0000000007b2', 'authenticated', 'authenticated', 'other7a@example.test');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000007a1');
insert into public.analytics_writers (user_id) values ('00000000-0000-0000-0000-0000000007c1');

insert into public.projects (slug, title, accent, status, published_at, case_study) values
  ('t7a-show',  'T7A Show',  'blue', 'published', now(), '{"sections":[],"tags":[],"showcase":{"url":"https://example.org/"}}'),
  ('t7a-plain', 'T7A Plain', 'blue', 'published', now(), '{"sections":[],"tags":[]}'),
  ('t7a-draft', 'T7A Draft', 'blue', 'draft', null,    '{"sections":[],"tags":[],"showcase":{"url":"https://example.org/"}}');
insert into public.lab_entries (slug, title, summary, accent, year, status, published_at) values
  ('t7a-lab', 'T7A Lab', 's', 'blue', '2026', 'published', now()),
  ('t7a-lab-draft', 'T7A Lab D', 's', 'blue', '2026', 'draft', null);
insert into public.notes (slug, title, status, published_at) values
  ('t7a-note', 'T7A Note', 'published', now()),
  ('t7a-note-draft', 'T7A Note D', 'draft', null);

-- ================================================================= 1. anon: hiçbir şey
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare denied boolean;
begin
  denied := false; begin perform public.record_hit('page', '/', 1); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 1a: anon record_hit çağırabildi'; end if;
  denied := false; begin perform public.analytics_summary(30); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 1b: anon analytics_summary çağırabildi'; end if;
  denied := false; begin perform 1 from public.analytics_daily; exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 1c: anon analytics_daily okuyabildi'; end if;
  denied := false; begin perform 1 from public.analytics_day; exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 1d: anon analytics_day okuyabildi'; end if;
  denied := false; begin perform 1 from public.analytics_writers; exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 1e: anon analytics_writers okuyabildi'; end if;
  denied := false; begin insert into public.analytics_daily (day, kind, key, hits) values (current_date, 'page', '/', 1); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 1f: anon analytics_daily''ye yazabildi'; end if;
end $$;
reset role;

-- ================================================================= 2. sıradan authenticated (b2): yazıcı değil, admin değil
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare denied boolean; code text;
begin
  denied := false; begin perform public.record_hit('page', '/', 1); exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'FAIL 2a: yazıcı olmayan kullanıcı record_hit çağırabildi'; end if;
  denied := false; begin perform public.analytics_summary(30); exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'FAIL 2b: admin olmayan kullanıcı analytics_summary çağırabildi'; end if;
  foreach code in array array['analytics_daily', 'analytics_day', 'analytics_writers'] loop
    denied := false;
    begin execute format('select 1 from public.%I', code); exception when others then denied := true; end;
    if not denied then raise exception 'FAIL 2c: authenticated % tablosunu doğrudan okuyabildi', code; end if;
    denied := false;
    begin execute format('delete from public.%I', code); exception when others then denied := true; end;
    if not denied then raise exception 'FAIL 2d: authenticated % tablosundan silebildi', code; end if;
  end loop;
  denied := false; begin insert into public.analytics_writers (user_id) values ('00000000-0000-0000-0000-0000000007b2'); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 2e: authenticated kendini yazıcı yapabildi'; end if;
end $$;
reset role;

-- ================================================================= 3. admin (a1): özet okuyabilir, yazamaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare denied boolean; s jsonb;
begin
  s := public.analytics_summary(30);
  if jsonb_typeof(s) <> 'object' or (s ->> 'total_views')::int <> 0 then raise exception 'FAIL 3a: boş özet beklenen biçimde değil: %', s; end if;
  if jsonb_array_length(s -> 'daily') <> 30 then raise exception 'FAIL 3b: daily 30 gün olmalı: %', jsonb_array_length(s -> 'daily'); end if;
  denied := false; begin perform public.record_hit('page', '/', 1); exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'FAIL 3c: admin hesabı record_hit çağırabildi (ayrı görev ilkesi)'; end if;
  denied := false; begin insert into public.analytics_daily (day, kind, key, hits) values (current_date, 'page', '/', 1); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 3d: admin API üzerinden analytics_daily''ye doğrudan yazabildi'; end if;
end $$;
reset role;

-- ================================================================= 4. yazıcı (c1): yalnızca record_hit
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r text; denied boolean; s text;
begin
  -- geçerli
  if public.record_hit('page', '/', 10) <> 'ok' then raise exception 'FAIL 4a: / kabul edilmeli'; end if;
  if public.record_hit('page', '/lab', 11) <> 'ok' then raise exception 'FAIL 4b: /lab'; end if;
  if public.record_hit('page', '/notes', 12) <> 'ok' then raise exception 'FAIL 4c: /notes'; end if;
  if public.record_hit('page', '/projects/t7a-show', 13) <> 'ok' then raise exception 'FAIL 4d: yayınlanmış proje'; end if;
  if public.record_hit('page', '/lab/t7a-lab', 14) <> 'ok' then raise exception 'FAIL 4e: yayınlanmış lab'; end if;
  if public.record_hit('page', '/notes/t7a-note', 15) <> 'ok' then raise exception 'FAIL 4f: yayınlanmış not'; end if;
  if public.record_hit('page', '/', 10) <> 'ok' then raise exception 'FAIL 4g: aynı kova ikinci kez de sayılmalı (görüntüleme)'; end if;
  if public.record_hit('showcase', 't7a-show', 0) <> 'ok' then raise exception 'FAIL 4h: showcase tıklaması'; end if;
  -- geçersiz: taslak, olmayan, yanlış biçim, yanlış tür
  foreach s in array array['/projects/t7a-draft', '/lab/t7a-lab-draft', '/notes/t7a-note-draft', '/projects/yok', '/projects/', '/projects/T7A-show',
                           '/admin', '/admin/analytics', '/projects/t7a-show/', '/projects/t7a-show?x=1', '/projects/t7a-show#a', '/lab/t7a-show', '/notes/t7a-lab',
                           'projects/t7a-show', '', '//', '/%2e', repeat('/a', 80)] loop
    if public.record_hit('page', s, 1) <> 'invalid' then raise exception 'FAIL 4i: % reddedilmeliydi', s; end if;
  end loop;
  foreach s in array array['t7a-plain', 't7a-draft', 'yok', 'T7A-SHOW', '/projects/t7a-show', ''] loop
    if public.record_hit('showcase', s, 0) <> 'invalid' then raise exception 'FAIL 4j: showcase % reddedilmeliydi', s; end if;
  end loop;
  if public.record_hit('other', '/', 1) <> 'invalid' then raise exception 'FAIL 4k: bilinmeyen tür'; end if;
  if public.record_hit(null, '/', 1) <> 'invalid' or public.record_hit('page', null, 1) <> 'invalid' then raise exception 'FAIL 4l: null'; end if;
  if public.record_hit('page', '/', -1) <> 'invalid' or public.record_hit('page', '/', 65536) <> 'invalid' or public.record_hit('page', '/', null) <> 'invalid' then
    raise exception 'FAIL 4m: kova aralığı';
  end if;

  -- yazıcı tabloları doğrudan okuyamaz / yazamaz, özet çağıramaz
  denied := false; begin perform 1 from public.analytics_daily; exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 4n: yazıcı analytics_daily okuyabildi'; end if;
  denied := false; begin insert into public.analytics_daily (day, kind, key, hits) values (current_date, 'page', '/', 99999); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 4o: yazıcı analytics_daily''ye doğrudan yazabildi'; end if;
  denied := false; begin delete from public.analytics_writers; exception when others then denied := true; end;
  if not denied then raise exception 'FAIL 4p: yazıcı analytics_writers''ı değiştirebildi'; end if;
  denied := false; begin perform public.analytics_summary(30); exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'FAIL 4q: yazıcı analytics_summary çağırabildi'; end if;
end $$;
reset role;

-- ================================================================= 5. yazıcı: HER mevcut admin RPC'sinde reddedilir; CMS tablolarına yazamaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  f record; n integer := 0; denied boolean; args text; stmt text;
  tbl text;
begin
  -- public şemasındaki, authenticated'a açık, analytics'e ait OLMAYAN her SECURITY DEFINER fonksiyonu tek tek çağır.
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as ident, p.pronargs, p.proargtypes::oid[] as argtypes
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef
      and p.proname not in ('record_hit', 'analytics_summary', 'is_admin')
      and has_function_privilege('authenticated', p.oid, 'execute')
  loop
    -- her argüman için NULL ile çağır: fonksiyonların hepsi önce is_admin() kontrolü yapar (fail-closed) → 42501
    args := (select coalesce(string_agg('null::' || format_type(t, null), ', '), '') from unnest(f.argtypes) as t);
    stmt := format('select public.%I(%s)', f.proname, args);
    denied := false;
    begin execute stmt; exception when sqlstate '42501' then denied := true; when others then denied := false; end;
    if not denied then raise exception 'FAIL 5a: yazıcı % fonksiyonunda 42501 ile reddedilmedi', f.proname; end if;
    n := n + 1;
  end loop;
  if n < 10 then raise exception 'FAIL 5b: beklenenden az admin RPC bulundu (%): test yetersiz', n; end if;

  foreach tbl in array array['projects', 'lab_entries', 'notes', 'media_assets', 'site_content_drafts', 'project_drafts', 'note_drafts', 'lab_entry_drafts'] loop
    denied := false;
    begin execute format('insert into public.%I default values', tbl); exception when others then denied := true; end;
    if not denied then raise exception 'FAIL 5c: yazıcı % tablosuna yazabildi', tbl; end if;
  end loop;
  -- yayınlanmış içerik güncellenemez (RLS: 0 satır etkilenir)
  update public.projects set title = 'HACK' where slug = 't7a-show';
  if found then raise exception 'FAIL 5d: yazıcı yayınlanmış projeyi güncelleyebildi'; end if;
end $$;
reset role;

-- ================================================================= 6. sonuç doğrulama (postgres): sayaçlar, tekil tahmin, gizlilik
do $$
declare
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_views int; v_clicks int; v_bits int; s jsonb;
begin
  select coalesce(sum(hits), 0) into v_views from public.analytics_daily where kind = 'page' and day = v_day;
  select coalesce(sum(hits), 0) into v_clicks from public.analytics_daily where kind = 'showcase' and day = v_day;
  if v_views <> 7 then raise exception 'FAIL 6a: 7 sayfa görüntülemesi beklenirdi, bulundu %', v_views; end if;
  if v_clicks <> 1 then raise exception 'FAIL 6b: 1 tıklama beklenirdi, bulundu %', v_clicks; end if;
  select bit_count(uniq_bits) into v_bits from public.analytics_day where day = v_day;
  if v_bits <> 6 then raise exception 'FAIL 6c: 6 farklı kova işaretli olmalı (aynı kova iki kez), bulundu %', v_bits; end if;
  if (select hits from public.analytics_day where day = v_day) <> 8 then raise exception 'FAIL 6d: gün toplamı 8 olmalı'; end if;
  -- gizlilik: şemada ziyaretçi kimliği taşıyabilecek kolon yok
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name in ('analytics_daily', 'analytics_day', 'analytics_writers')
               and column_name ~* '(ip|agent|ua|hash|visitor|session|fingerprint|cookie)') then
    raise exception 'FAIL 6e: analytics tablolarında kimlik taşıyabilecek kolon adı var';
  end if;
end $$;

-- özet (admin)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare s jsonb; d jsonb;
begin
  s := public.analytics_summary(30);
  if (s ->> 'total_views')::int <> 7 or (s ->> 'today_views')::int <> 7 or (s ->> 'views_7d')::int <> 7 or (s ->> 'views_30d')::int <> 7 then
    raise exception 'FAIL 6f: özet toplamları: %', s - 'daily';
  end if;
  if (s ->> 'total_clicks')::int <> 1 then raise exception 'FAIL 6g: tıklama toplamı'; end if;
  d := s -> 'daily' -> 29;
  if (d ->> 'views')::int <> 7 or (d ->> 'clicks')::int <> 1 then raise exception 'FAIL 6h: bugünün günlük satırı: %', d; end if;
  if (d ->> 'uniques')::int not between 5 and 7 then raise exception 'FAIL 6i: günlük yaklaşık tekil 6 civarı olmalı: %', d; end if;
  if jsonb_array_length(s -> 'showcase') <> 1 or (s -> 'showcase' -> 0 ->> 'slug') <> 't7a-show' or (s -> 'showcase' -> 0 ->> 'title') <> 'T7A Show' then
    raise exception 'FAIL 6j: showcase satırı: %', s -> 'showcase';
  end if;
  if (s -> 'top_pages' -> 0 ->> 'path') <> '/' or (s -> 'top_pages' -> 0 ->> 'views')::int <> 2 then raise exception 'FAIL 6k: en çok görüntülenen: %', s -> 'top_pages'; end if;
  -- 7/30 günlük tekil ÜRETİLMEZ
  if s ? 'uniques' or s ? 'unique_7d' or s ? 'unique_30d' or s::text ~ 'unique_(7|30)' then raise exception 'FAIL 6l: 7/30 günlük tekil üretilmemeli'; end if;
  if jsonb_array_length((public.analytics_summary(7)) -> 'daily') <> 7 then raise exception 'FAIL 6m: p_days=7'; end if;
  if jsonb_array_length((public.analytics_summary(1000)) -> 'daily') <> 90 then raise exception 'FAIL 6n: üst sınır 90'; end if;
  if jsonb_array_length((public.analytics_summary(0)) -> 'daily') <> 1 then raise exception 'FAIL 6o: alt sınır 1'; end if;
end $$;
reset role;

-- ================================================================= 7. günlük tavanlar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare i int; r text; ok_n int := 0; capped_n int := 0;
begin
  -- sayfa başına 5.000: '/lab' zaten 1; 4.999 daha 'ok', sonraki 'capped'
  for i in 1..5005 loop
    r := public.record_hit('page', '/lab', i % 65536);
    if r = 'ok' then ok_n := ok_n + 1; elsif r = 'capped' then capped_n := capped_n + 1; end if;
  end loop;
  if ok_n <> 4999 or capped_n <> 6 then raise exception 'FAIL 7a: sayfa tavanı (ok %, capped %)', ok_n, capped_n; end if;
  -- showcase başına 2.000: 1 var
  ok_n := 0; capped_n := 0;
  for i in 1..2005 loop
    r := public.record_hit('showcase', 't7a-show', 0);
    if r = 'ok' then ok_n := ok_n + 1; elsif r = 'capped' then capped_n := capped_n + 1; end if;
  end loop;
  if ok_n <> 1999 or capped_n <> 6 then raise exception 'FAIL 7b: showcase tavanı (ok %, capped %)', ok_n, capped_n; end if;
end $$;
reset role;
do $$
begin
  if not (select capped from public.analytics_day where day = (now() at time zone 'Europe/Istanbul')::date) then raise exception 'FAIL 7c: capped bayrağı işaretlenmeli'; end if;
end $$;

-- toplam tavan 20.000: günün toplamını doğrudan 19.999'a çek (postgres), sonra 1 kabul + sonrası capped
update public.analytics_day set hits = 19999 where day = (now() at time zone 'Europe/Istanbul')::date;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007c1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.record_hit('page', '/notes', 5) <> 'ok' then raise exception 'FAIL 7d: toplam tavandan önceki son hit kabul edilmeli'; end if;
  if public.record_hit('page', '/notes', 5) <> 'capped' then raise exception 'FAIL 7e: toplam tavan aşılınca capped'; end if;
  if public.record_hit('showcase', 't7a-show', 0) <> 'capped' then raise exception 'FAIL 7f: toplam tavan showcase için de geçerli'; end if;
end $$;
reset role;

-- ================================================================= 8. ayrı görev + anında iptal
do $$
declare denied boolean;
begin
  denied := false;
  begin insert into public.analytics_writers (user_id) values ('00000000-0000-0000-0000-0000000007a1'); exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'FAIL 8a: admin hesabı yazıcı olarak eklenebildi'; end if;
end $$;
-- savunma derinliği: tetikleyici atlansa bile (burada geçici olarak devre dışı) admin hesabı record_hit çağıramaz
alter table public.analytics_writers disable trigger analytics_writers_guard;
insert into public.analytics_writers (user_id) values ('00000000-0000-0000-0000-0000000007a1');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare denied boolean;
begin
  denied := false; begin perform public.record_hit('page', '/', 1); exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'FAIL 8c: hem admin hem yazıcı kayıtlı hesap record_hit çağırabildi'; end if;
end $$;
reset role;
delete from public.analytics_writers where user_id = '00000000-0000-0000-0000-0000000007a1';
alter table public.analytics_writers enable trigger analytics_writers_guard;
delete from public.analytics_writers where user_id = '00000000-0000-0000-0000-0000000007c1';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007c1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare denied boolean;
begin
  denied := false; begin perform public.record_hit('page', '/', 1); exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'FAIL 8b: satır silindikten sonra yazıcı hâlâ çağırabiliyor (iptal anında olmalı)'; end if;
end $$;
reset role;

-- ================================================================= 9. katalog: açık GRANT/REVOKE, RLS, search_path
do $$
declare t text;
begin
  foreach t in array array['analytics_writers', 'analytics_daily', 'analytics_day'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'FAIL 9a: % için RLS kapalı', t; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then raise exception 'FAIL 9b: % için politika olmamalı', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete')
       or has_table_privilege('authenticated', 'public.' || t, 'select, insert, update, delete') then
      raise exception 'FAIL 9c: % tablosunda API rollerine hak var', t;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.record_hit(text,text,integer)', 'execute') or has_function_privilege('anon', 'public.analytics_summary(integer)', 'execute') then
    raise exception 'FAIL 9d: anon fonksiyonları çalıştırabiliyor';
  end if;
  if not has_function_privilege('authenticated', 'public.record_hit(text,text,integer)', 'execute') then raise exception 'FAIL 9e: authenticated record_hit çalıştırabilmeli (içeride kontrol var)'; end if;
  if (select count(*) from pg_proc p where p.proname in ('record_hit', 'analytics_summary', 'guard_analytics_writer') and p.pronamespace = 'public'::regnamespace
        and not coalesce('search_path=""' = any (p.proconfig), false)) > 0 then
    raise exception 'FAIL 9f: bir analytics fonksiyonunda search_path = '''' yok';
  end if;
  if has_function_privilege('authenticated', 'public.guard_analytics_writer()', 'execute') then raise exception 'FAIL 9g: tetikleyici fonksiyonu API rollerine açık'; end if;
end $$;

do $$ begin raise notice 'ALL ANALYTICS SMOKE TESTS PASSED'; end $$;
rollback;
