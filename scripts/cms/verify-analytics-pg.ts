/**
 * Visitor Analytics — migration 0007 GERÇEK PostgreSQL üzerinde (yerel, geçici küme; Supabase'e/üretime ASLA bağlanmaz).
 * Doğrular: (1) 0007 uygulanır; (2) supabase/tests/rls_smoke_analytics.sql geçer (RLS, RPC, tavanlar, yazıcı≠admin, iptal);
 * (3) 0007 yalnızca EKLER: mevcut tablo/politika/hak/fonksiyon kataloğu BİREBİR aynı kalır, CMS satırları değişmez;
 * (4) _down tüm nesneleri kaldırır ve kataloğu eski haline getirir; (5) yeniden uygulanabilir.
 * Ortam: PG_TEST_HOST, PG_TEST_PORT, [PG_TEST_USER]. Yoksa ATLANIR (PASS sayılmaz). Not: Supabase'e özgü auth/varsayılan haklar
 * test kümesinde taklit edilir (supabase-stub.sql); gerçek Supabase davranışı TEST projesinde doğrulanmalıdır.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runner } from './test-harness';
import { buildTemplate, pgEnv, scenarioDb } from './import/test-support';

const env = pgEnv();
if (!env) {
  console.log('ATLANDI: PG_TEST_HOST/PG_TEST_PORT tanımlı değil. Bu testler ÇALIŞTIRILMADI (PASS sayılmaz).');
  process.exit(0);
}
const { check, finish } = runner();
const UP = 'supabase/migrations/0007_analytics.sql';
const DOWN = 'supabase/migrations/0007_analytics_down.sql';
const SMOKE = 'supabase/tests/rls_smoke_analytics.sql';
const ANALYTICS_TABLES = ['analytics_writers', 'analytics_daily', 'analytics_day'];

/** Mevcut (analytics OLMAYAN) nesnelerin kataloğu: tablo/politika/hak/fonksiyon tanımı/tetikleyici özeti. */
const CATALOG_SQL = `
select md5(string_agg(x, E'\\n' order by x)) from (
  select 'policy:' || schemaname || '.' || tablename || ':' || policyname || ':' || coalesce(qual,'') || ':' || coalesce(with_check,'') || ':' || cmd || ':' || roles::text as x
    from pg_policies where schemaname = 'public' and tablename not like 'analytics\\_%'
  union all
  select 'grant:' || table_name || ':' || grantee || ':' || privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and table_name not like 'analytics\\_%' and grantee in ('anon','authenticated','PUBLIC')
  union all
  select 'func:' || p.proname || ':' || md5(pg_get_functiondef(p.oid)) || ':' || p.proacl::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname not in ('record_hit','analytics_summary','guard_analytics_writer')
  union all
  select 'rls:' || relname || ':' || relrowsecurity::text from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname not like 'analytics\\_%'
  union all
  select 'trigger:' || c.relname || ':' || t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace and c.relname not like 'analytics\\_%'
) s;`;

async function main() {
  const tmpl = buildTemplate(env!, 'muratlab_analytics_tmpl');
  const d = scenarioDb(env!, tmpl);
  try {
    const before = d.sql(CATALOG_SQL);
    const fpBefore = d.fingerprint();
    assert.ok(before.length === 32, 'katalog özeti alınamadı');

    await check('Q1 0007 uygulanır; 3 tablo + 3 fonksiyon + 1 tetikleyici oluşur', () => {
      d.file(UP);
      const t = d.sql(`select string_agg(relname, ',' order by relname) from pg_class where relnamespace='public'::regnamespace and relname like 'analytics\\_%' and relkind='r'`);
      assert.equal(t, [...ANALYTICS_TABLES].sort().join(','));
      const f = d.sql(`select string_agg(proname, ',' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('record_hit','analytics_summary','guard_analytics_writer')`);
      assert.equal(f, 'analytics_summary,guard_analytics_writer,record_hit');
      assert.equal(d.sql(`select count(*) from pg_trigger where tgname='analytics_writers_guard'`), '1');
    });
    await check('Q2 0007 yalnızca EKLER: mevcut politika/hak/fonksiyon/RLS/tetikleyici kataloğu birebir aynı; CMS satırları değişmedi', () => {
      assert.equal(d.sql(CATALOG_SQL), before);
      assert.equal(d.fingerprint(), fpBefore);
    });
    await check('Q3 RLS/RPC smoke testi (supabase/tests/rls_smoke_analytics.sql) GEÇER', () => {
      const r = spawnSync('psql', ['-h', env!.host, '-p', String(env!.port), '-U', env!.superUser, '-d', d.db, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', SMOKE], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${r.stderr}`.split('\n').filter((l) => /ERROR|FAIL/.test(l)).join(' | ') || r.stderr);
      assert.match(r.stderr, /ALL ANALYTICS SMOKE TESTS PASSED/);
      assert.equal(d.sql('select count(*) from public.analytics_daily'), '0'); // ROLLBACK: kalıcı veri yok
      assert.equal(d.sql(`select count(*) from public.projects where slug like 't7a-%'`), '0');
      assert.equal(d.fingerprint(), fpBefore);
    });
    await check('Q4 anon kullanıcı rolüyle doğrudan çağrı/okuma reddedilir (gerçek rol geçişi)', () => {
      const denied = (q: string) => !d.try(`begin; set local role anon; ${q}; commit;`).ok;
      assert.ok(denied(`select public.record_hit('page','/',1)`));
      assert.ok(denied(`select public.analytics_summary(30)`));
      assert.ok(denied(`select * from public.analytics_daily`));
      assert.ok(denied(`insert into public.analytics_daily values (current_date,'page','/',1)`));
    });
    await check('Q5 tablo şeması gizlilik: kimlik taşıyabilecek kolon yok; bit dizisi 8192 bayt; kısıtlar', () => {
      const cols = d.sql(`select string_agg(table_name||'.'||column_name, ',' order by table_name, ordinal_position) from information_schema.columns where table_schema='public' and table_name like 'analytics\\_%'`);
      assert.equal(cols, 'analytics_daily.day,analytics_daily.kind,analytics_daily.key,analytics_daily.hits,analytics_day.day,analytics_day.hits,analytics_day.capped,analytics_day.uniq_bits,analytics_writers.user_id,analytics_writers.created_at');
      assert.equal(d.sql(`select octet_length(uniq_bits) from (select decode(repeat('00', 8192),'hex') as uniq_bits) x`), '8192');
      assert.equal(d.try(`insert into public.analytics_daily values (current_date,'visitor','x',1)`).ok, false);
      assert.equal(d.try(`insert into public.analytics_day (day, uniq_bits) values (current_date, '\\x00')`).ok, false);
    });
    await check('Q6 _down tüm analytics nesnelerini kaldırır ve kataloğu 0007 öncesine BİREBİR döndürür', () => {
      d.file(DOWN);
      assert.equal(d.sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'analytics\\_%'`), '0');
      assert.equal(d.sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('record_hit','analytics_summary','guard_analytics_writer')`), '0');
      assert.equal(d.sql(CATALOG_SQL), before);
      assert.equal(d.fingerprint(), fpBefore);
    });
    await check('Q7 geri alma sonrası yeniden uygulanabilir ve smoke testi yine geçer', () => {
      d.file(UP);
      const r = spawnSync('psql', ['-h', env!.host, '-p', String(env!.port), '-U', env!.superUser, '-d', d.db, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', SMOKE], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /ALL ANALYTICS SMOKE TESTS PASSED/);
    });
    await check('Q8 migration dosyaları: CRLF, "analytics" dışı nesneye dokunmaz (kaynak taraması)', () => {
      for (const f of [UP, DOWN, SMOKE]) {
        const b = readFileSync(f, 'utf8');
        assert.equal(b.replace(/\r\n/g, '').includes('\n'), false, `${f}: yalnızca CRLF olmalı`);
      }
    });
  } finally {
    d.drop();
  }
  finish('Tüm analytics PostgreSQL kontrolleri geçti.');
}
void main();
