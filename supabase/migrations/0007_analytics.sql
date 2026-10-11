-- MURAT/LAB — Visitor Analytics (FAZ 1) — 0007: günlük toplam sayaçlar + yetkili yazıcı RPC'si
--
-- ADDITIVE migration. 3 YENİ tablo, 1 YENİ tetikleyici fonksiyonu + tetikleyici, 2 YENİ SECURITY DEFINER fonksiyonu.
-- Mevcut hiçbir tabloyu, kolonu, politikayı, tetikleyiciyi veya fonksiyonu (0001-0006) DEĞİŞTİRMEZ / SİLMEZ.
-- Yeniden kullandığı tek şey: public.is_admin(), public.projects / lab_entries / notes (yalnızca OKUR).
--
-- *** Hiçbir veritabanına otomatik UYGULANMAZ. Önce TEST projesinde, sonra (ayrı onayla) production'da, elle çalıştırılır. ***
-- Geri alma: 0007_analytics_down.sql (elle).
--
-- ----------------------------------------------------------------------------------------------------------------
-- Güvenlik modeli
--   * anon: HİÇBİR hak yok (tablo da, fonksiyon da). `PUBLIC` execute hakkı da geri alınır.
--   * Yazma: yalnızca record_hit(). Çağıran, ayrı ve ADMIN OLMAYAN bir Supabase Auth hesabı olmalı ve public.analytics_writers
--     tablosunda kayıtlı olmalı (auth.uid() ile, JWT metadata'sına GÜVENİLMEZ). Satırı silmek erişimi ANINDA iptal eder.
--   * Okuma: yalnızca analytics_summary(); içeride public.is_admin() ile fail-closed.
--   * Tablolara API rollerinden doğrudan erişim yok (RLS açık + politika yok + REVOKE). Fonksiyonlar SECURITY DEFINER,
--     search_path = '' (her nesne şema-nitelikli).
--   * Service-role anahtarı GEREKMEZ.
-- Gizlilik
--   * IP, User-Agent, hash veya ziyaretçi kimliği SAKLANMAZ. Saklanan: (gün, tür, yol/slug, sayaç) ve günlük 65.536 bitlik
--     bit dizisi. Bit dizisi yalnızca "bu kova dolu" bilgisini taşır; bir kişiye geri bağlanamaz. Gün sınırı Europe/Istanbul.
--   * Günlük tekil sayı yaklaşıktır (linear counting). 7/30 günlük tekil ÜRETİLMEZ.
-- Günlük tavanlar (sabit): toplam 20.000, sayfa başına 5.000, showcase başına 2.000. Aşılınca sayım durur (analytics_day.capped).
-- ----------------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------------------------
-- 1. Tablolar
------------------------------------------------------------------------------------------

create table public.analytics_writers (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.analytics_daily (
  day  date    not null,
  kind text    not null,
  key  text    not null,
  hits integer not null default 0,
  constraint analytics_daily_pkey primary key (day, kind, key),
  constraint analytics_daily_kind_check check (kind in ('page', 'showcase')),
  constraint analytics_daily_key_len check (char_length(key) between 1 and 120),
  constraint analytics_daily_hits_check check (hits >= 0)
);

create table public.analytics_day (
  day       date    primary key,
  hits      integer not null default 0,
  capped    boolean not null default false,
  -- 65.536 bit = 8.192 bayt. Günlük yaklaşık tekil ziyaretçi için "dolu kova" işaretleri; kimlik taşımaz.
  uniq_bits bytea   not null default decode(repeat('00', 8192), 'hex'),
  constraint analytics_day_hits_check check (hits >= 0),
  constraint analytics_day_bits_len check (octet_length(uniq_bits) = 8192)
);

alter table public.analytics_writers enable row level security;
alter table public.analytics_daily   enable row level security;
alter table public.analytics_day     enable row level security;
-- Bilinçli olarak POLİTİKA YOK: API rolleri için tablolar kapalıdır; yalnızca aşağıdaki SECURITY DEFINER fonksiyonları erişir.

revoke all on public.analytics_writers, public.analytics_daily, public.analytics_day from public, anon, authenticated;

-- Ayrı görev ilkesi: yazıcı hesabı admin olamaz (yanlışlıkla admin hesabı eklenirse kayıt reddedilir).
create or replace function public.guard_analytics_writer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.admin_users a where a.user_id = new.user_id) then
    raise exception 'analytics writer must not be an admin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger analytics_writers_guard
  before insert or update on public.analytics_writers
  for each row execute function public.guard_analytics_writer();

revoke all on function public.guard_analytics_writer() from public, anon, authenticated;

------------------------------------------------------------------------------------------
-- 2. record_hit: yalnızca kayıtlı yazıcı hesabı
--    p_kind   : 'page' | 'showcase'
--    p_path   : page → '/', '/lab', '/notes', '/projects/<slug>', '/lab/<slug>', '/notes/<slug>' (YAYINLANMIŞ içerik)
--               showcase → yayınlanmış ve case_study.showcase.url taşıyan projenin slug'ı
--    p_bucket : 0..65535 (yalnızca 'page'; sunucu tarafında HMAC'ten türetilen kova numarası, kimlik DEĞİL)
--    Dönüş    : 'ok' | 'capped' | 'invalid'  (yetkisizse 42501 hatası)
------------------------------------------------------------------------------------------

create or replace function public.record_hit(p_kind text, p_path text, p_bucket integer)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_total_cap    constant integer := 20000;
  c_page_cap     constant integer := 5000;
  c_showcase_cap constant integer := 2000;
  v_day     date := (now() at time zone 'Europe/Istanbul')::date;
  v_key     text;
  v_cap     integer;
  v_slug    text;
  v_total   integer;
  v_cur     integer;
begin
  -- yetki: kayıtlı, admin olmayan yazıcı (fail-closed)
  if (select auth.uid()) is null
     or not exists (select 1 from public.analytics_writers w where w.user_id = (select auth.uid()))
     or public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- biçim doğrulama (RPC doğrudan çağrılsa da geçerli)
  if p_kind is null or p_path is null or char_length(p_path) > 120 then
    return 'invalid';
  end if;

  if p_kind = 'page' then
    if p_bucket is null or p_bucket < 0 or p_bucket > 65535 then return 'invalid'; end if;
    if p_path in ('/', '/lab', '/notes') then
      v_key := p_path;
    elsif p_path ~ '^/(projects|lab|notes)/[a-z0-9]+(-[a-z0-9]+)*$' then
      v_slug := substring(p_path from '^/[a-z]+/(.*)$');
      if char_length(v_slug) > 80 then return 'invalid'; end if;
      if p_path like '/projects/%' and exists (select 1 from public.projects p where p.slug = v_slug and p.status = 'published') then
        v_key := p_path;
      elsif p_path like '/lab/%' and exists (select 1 from public.lab_entries l where l.slug = v_slug and l.status = 'published') then
        v_key := p_path;
      elsif p_path like '/notes/%' and exists (select 1 from public.notes n where n.slug = v_slug and n.status = 'published') then
        v_key := p_path;
      else
        return 'invalid';
      end if;
    else
      return 'invalid';
    end if;
    v_cap := c_page_cap;
  elsif p_kind = 'showcase' then
    if p_path !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_path) > 80 then return 'invalid'; end if;
    if not exists (
      select 1 from public.projects p
      where p.slug = p_path and p.status = 'published'
        and p.case_study is not null and jsonb_typeof(p.case_study) = 'object'
        and p.case_study -> 'showcase' ->> 'url' is not null
    ) then
      return 'invalid';
    end if;
    v_key := p_path;
    v_cap := c_showcase_cap;
  else
    return 'invalid';
  end if;

  -- günün satırını oluştur ve KİLİTLE (kısa işlemler seri çalışır; sayaçlar tutarlı kalır)
  insert into public.analytics_day (day) values (v_day) on conflict (day) do nothing;
  select d.hits into v_total from public.analytics_day d where d.day = v_day for update;

  if v_total >= c_total_cap then
    update public.analytics_day set capped = true where day = v_day;
    return 'capped';
  end if;

  select coalesce(
    (select a.hits from public.analytics_daily a where a.day = v_day and a.kind = p_kind and a.key = v_key), 0)
  into v_cur;
  if v_cur >= v_cap then
    update public.analytics_day set capped = true where day = v_day;
    return 'capped';
  end if;

  insert into public.analytics_daily (day, kind, key, hits) values (v_day, p_kind, v_key, 1)
  on conflict (day, kind, key) do update set hits = public.analytics_daily.hits + 1;

  if p_kind = 'page' then
    update public.analytics_day
       set hits = hits + 1,
           uniq_bits = set_bit(uniq_bits, p_bucket, 1)
     where day = v_day;
  else
    update public.analytics_day set hits = hits + 1 where day = v_day;
  end if;
  return 'ok';
end;
$$;

------------------------------------------------------------------------------------------
-- 3. analytics_summary: yalnızca admin (okuma)
--    p_days: 1..90 (arayüz 7 ve 30 kullanır). Dönüş: jsonb (yalnızca toplamlar).
--    "uniques" günlük YAKLAŞIK tekildir (linear counting: -m * ln(boş/m)); kova dolarsa null.
--    7/30 günlük tekil hesaplanmaz.
------------------------------------------------------------------------------------------

create or replace function public.analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_bits constant numeric := 65536;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_from  date;
  v_daily jsonb;
  v_top   jsonb;
  v_show  jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_from := v_today - (v_days - 1);

  select coalesce(jsonb_agg(jsonb_build_object(
           'day', g.d::date,
           'views', coalesce(pv.hits, 0),
           'clicks', coalesce(sc.hits, 0),
           'uniques', case
                        when dd.uniq_bits is null then 0
                        when (c_bits - bit_count(dd.uniq_bits)) <= 0 then null
                        else round(-c_bits * ln((c_bits - bit_count(dd.uniq_bits)) / c_bits))::integer
                      end,
           'capped', coalesce(dd.capped, false)
         ) order by g.d), '[]'::jsonb)
    into v_daily
  from generate_series(v_from::timestamp, v_today::timestamp, interval '1 day') as g(d)
  left join (select a.day, sum(a.hits)::integer as hits from public.analytics_daily a where a.kind = 'page' group by a.day) pv on pv.day = g.d::date
  left join (select a.day, sum(a.hits)::integer as hits from public.analytics_daily a where a.kind = 'showcase' group by a.day) sc on sc.day = g.d::date
  left join public.analytics_day dd on dd.day = g.d::date;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.views desc, t.path), '[]'::jsonb) into v_top
  from (
    select a.key as path, sum(a.hits)::integer as views
    from public.analytics_daily a
    where a.kind = 'page' and a.day >= v_from
    group by a.key order by sum(a.hits) desc, a.key limit 10
  ) t;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.clicks desc, t.slug), '[]'::jsonb) into v_show
  from (
    select a.key as slug,
           (select p.title from public.projects p where p.slug = a.key) as title,
           coalesce(sum(a.hits) filter (where a.day >= v_from), 0)::integer as clicks,
           sum(a.hits)::integer as clicks_total
    from public.analytics_daily a
    where a.kind = 'showcase'
    group by a.key
  ) t;

  return jsonb_build_object(
    'today', v_today,
    'days', v_days,
    'total_views', coalesce((select sum(a.hits) from public.analytics_daily a where a.kind = 'page'), 0)::integer,
    'today_views', coalesce((select sum(a.hits) from public.analytics_daily a where a.kind = 'page' and a.day = v_today), 0)::integer,
    'views_7d',    coalesce((select sum(a.hits) from public.analytics_daily a where a.kind = 'page' and a.day > v_today - 7), 0)::integer,
    'views_30d',   coalesce((select sum(a.hits) from public.analytics_daily a where a.kind = 'page' and a.day > v_today - 30), 0)::integer,
    'total_clicks', coalesce((select sum(a.hits) from public.analytics_daily a where a.kind = 'showcase'), 0)::integer,
    'daily', v_daily,
    'top_pages', v_top,
    'showcase', v_show
  );
end;
$$;

------------------------------------------------------------------------------------------
-- 4. Fonksiyon hakları: yalnızca authenticated (her biri içeride kendi kontrolünü yapar). anon / PUBLIC: yok.
------------------------------------------------------------------------------------------

revoke all on function public.record_hit(text, text, integer) from public, anon, authenticated;
revoke all on function public.analytics_summary(integer) from public, anon, authenticated;
grant execute on function public.record_hit(text, text, integer) to authenticated;
grant execute on function public.analytics_summary(integer) to authenticated;
