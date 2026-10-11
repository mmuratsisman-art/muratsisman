/**
 * Visitor Analytics (FAZ 1) birim + kaynak testleri. Next, Supabase ve veritabanı GEREKMEZ (sahte bağımlılıklar).
 * Çalıştırma: TSX_TSCONFIG_PATH=$PWD/tsconfig.json npx tsx scripts/cms/verify-analytics.ts
 * Doğrulanmayanlar: gerçek tarayıcı davranışı (beacon), gerçek Supabase Auth girişi, Vercel WAF, next build/lint (bkz. docs/cms/ANALYTICS.md).
 * SQL/RLS testleri: scripts/cms/verify-analytics-pg.ts ve supabase/tests/rls_smoke_analytics.sql.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { analyticsStatus } from '@/lib/analytics/config';
import { istanbulDay, visitorBucket } from '@/lib/analytics/bucket';
import { browserOptedOut, checkHitRequest, isBotUserAgent, parseHitBody } from '@/lib/analytics/guard';
import { processHit, type HitDeps, type HitInput } from '@/lib/analytics/hit';
import { normalizePagePath, normalizeShowcaseSlug, splitPagePath } from '@/lib/analytics/paths';
import { chartBars, parseSummary } from '@/lib/analytics/summary';
import { createCapMemory, createLimiter, createRecorder, createSession, type RpcOutcome } from '@/lib/analytics/writer';
import { runner } from './test-harness';

const { check, finish } = runner();
const read = (f: string) => readFileSync(f, 'utf8');
const SECRET = 'x'.repeat(40);
const FULL_ENV = {
  ANALYTICS_ENABLED: '1', ANALYTICS_WAF_CONFIRMED: '1', ANALYTICS_HASH_SECRET: SECRET, ANALYTICS_WRITER_EMAIL: 'w@example.test', ANALYTICS_WRITER_PASSWORD: 'pw-not-real',
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.example.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k',
};
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const URL_ = 'https://muratsisman.com.tr/api/hit';
const hdrs = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const GOOD = { 'content-type': 'application/json', origin: 'https://muratsisman.com.tr', 'sec-fetch-site': 'same-origin', 'user-agent': CHROME };

async function main() {
  /* ── Etkinleştirme kapısı ── */
  await check('A1 varsayılan KAPALI: boş ortamda enabled=false ve tüm gereken değişken ADLARI listelenir', () => {
    const s = analyticsStatus({});
    assert.equal(s.enabled, false);
    assert.deepEqual(!s.enabled && s.missing, ['ANALYTICS_ENABLED', 'ANALYTICS_WAF_CONFIRMED', 'ANALYTICS_HASH_SECRET', 'ANALYTICS_WRITER_EMAIL', 'ANALYTICS_WRITER_PASSWORD', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
  });
  await check('A2 tam ortam açar; her bayrak/sır tek tek eksilince KAPANIR; WAF beyanı olmadan açılmaz; kısa sır reddedilir; "true" kabul edilmez', () => {
    assert.deepEqual(analyticsStatus(FULL_ENV), { enabled: true });
    for (const k of Object.keys(FULL_ENV)) {
      const e: Record<string, string | undefined> = { ...FULL_ENV };
      delete e[k];
      assert.equal(analyticsStatus(e).enabled, false, k);
    }
    assert.equal(analyticsStatus({ ...FULL_ENV, ANALYTICS_WAF_CONFIRMED: '0' }).enabled, false);
    assert.equal(analyticsStatus({ ...FULL_ENV, ANALYTICS_ENABLED: 'true' }).enabled, false);
    assert.equal(analyticsStatus({ ...FULL_ENV, ANALYTICS_HASH_SECRET: 'kisa' }).enabled, false);
    assert.equal(analyticsStatus({ ...FULL_ENV, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' }).enabled, true);
  });
  await check('A3 durum çıktısı DEĞER sızdırmaz (yalnızca ad)', () => {
    const s = analyticsStatus({ ...FULL_ENV, ANALYTICS_ENABLED: undefined });
    const text = JSON.stringify(s);
    for (const v of [SECRET, 'pw-not-real', 'w@example.test', 'x.example.test']) assert.equal(text.includes(v), false);
  });

  /* ── Yol doğrulama ── */
  await check('P1 izin verilen yollar; sorgu/parça/yüzde/sondaki eğik çizgi/büyük harf/yabancı rota/uzun yol reddedilir', () => {
    for (const p of ['/', '/lab', '/notes', '/projects/yakala', '/lab/a-b-1', '/notes/x']) assert.equal(normalizePagePath(p), p, p);
    for (const p of ['', '/projects', '/projects/', '/projects/Yakala', '/projects/a_b', '/projects/a--b', '/projects/a/b', '/admin', '/admin/analytics', '/api/hit', '/projects/x?y=1', '/projects/x#z',
      '/projects/%2e%2e', '//', '/lab/', 'projects/x', '/PROJECTS/x', '/projects/' + 'a'.repeat(81), '/' + 'a'.repeat(200), ' /', '/\u0000'])
      assert.equal(normalizePagePath(p), null, JSON.stringify(p));
    for (const bad of [null, undefined, 1, {}, [], true]) assert.equal(normalizePagePath(bad), null);
    assert.equal(normalizeShowcaseSlug('quality-management-system'), 'quality-management-system');
    for (const bad of ['', 'A', 'a b', '/x', 'a/b', 'x?y', null, 3]) assert.equal(normalizeShowcaseSlug(bad), null);
    assert.deepEqual(splitPagePath('/projects/yakala'), { section: 'projects', slug: 'yakala' });
    assert.deepEqual(splitPagePath('/lab'), { section: null, slug: null });
  });

  /* ── İstek süzgeçleri ── */
  const req = (over: Record<string, string | null>, method = 'POST') => {
    const h: Record<string, string> = { ...GOOD };
    for (const [k, v] of Object.entries(over)) {
      if (v === null) {
        delete h[k];
      } else {
        h[k] = v;
      }
    }
    return checkHitRequest({ method, headers: hdrs(h), requestUrl: URL_ });
  };
  await check('G1 geçerli istek kabul; text/plain ve gerçek tarayıcı UA\'ları (Chrome/Safari iOS/Firefox) kabul', () => {
    assert.deepEqual(req({}), { ok: true });
    assert.deepEqual(req({ 'content-type': 'text/plain;charset=UTF-8' }), { ok: true });
    for (const ua of [CHROME, SAFARI_IOS, FIREFOX]) assert.deepEqual(req({ 'user-agent': ua }), { ok: true }, ua);
  });
  await check('G2 reddedilenler: yöntem, GPC, DNT, içerik türü, boyut, Origin (yok/yabancı/alt alan/http), Sec-Fetch-Site', () => {
    assert.deepEqual(req({}, 'GET'), { ok: false, reason: 'method' });
    assert.deepEqual(req({}, 'PUT'), { ok: false, reason: 'method' });
    assert.deepEqual(req({ 'sec-gpc': '1' }), { ok: false, reason: 'privacy' });
    assert.deepEqual(req({ dnt: '1' }), { ok: false, reason: 'privacy' });
    assert.equal(req({ 'sec-gpc': '0', dnt: '0' }).ok, true);
    for (const ct of ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/html', '']) assert.deepEqual(req({ 'content-type': ct }), { ok: false, reason: 'content-type' });
    assert.deepEqual(req({ 'content-length': '513' }), { ok: false, reason: 'size' });
    assert.deepEqual(req({ 'content-length': 'abc' }), { ok: false, reason: 'size' });
    assert.equal(req({ 'content-length': '30' }).ok, true);
    for (const o of [null, 'https://evil.example', 'https://sub.muratsisman.com.tr', 'http://muratsisman.com.tr', 'null', 'not a url', 'https://muratsisman.com.tr.evil.example']) assert.deepEqual(req({ origin: o }), { ok: false, reason: 'origin' }, String(o));
    for (const s of ['cross-site', 'same-site', 'none']) assert.deepEqual(req({ 'sec-fetch-site': s }), { ok: false, reason: 'origin' }, s);
    assert.equal(req({ 'sec-fetch-site': null }).ok, true); // eski tarayıcılar başlığı göndermez; Origin yine zorunlu
  });
  await check('G3 bot UA\'ları reddedilir (boş/kısa dahil)', () => {
    for (const ua of ['', null, 'x', 'curl/8.0.1', 'python-requests/2.31', 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'HeadlessChrome/129', 'Mozilla/5.0 AppleWebKit Lighthouse', 'node-fetch/1.0', 'axios/1.6.0', 'Go-http-client/1.1', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0', 'Mozilla/5.0 (compatible; AhrefsBot/7.0)'])
      assert.equal(isBotUserAgent(ua as string | null), true, String(ua));
    for (const ua of [CHROME, SAFARI_IOS, FIREFOX]) assert.equal(isBotUserAgent(ua), false);
    assert.deepEqual(req({ 'user-agent': 'curl/8.0.1' }), { ok: false, reason: 'bot' });
  });
  await check('G4 gövde ayrıştırma: yalnızca {k,p}; fazla anahtar/yanlış tür/büyük gövde/geçersiz yol reddedilir', () => {
    assert.deepEqual(parseHitBody('{"k":"p","p":"/projects/yakala"}'), { kind: 'page', path: '/projects/yakala' });
    assert.deepEqual(parseHitBody('{"k":"s","p":"yakala"}'), { kind: 'showcase', path: 'yakala' });
    for (const b of ['', 'x', '[]', 'null', '1', '{}', '{"k":"p"}', '{"k":"p","p":"/","x":1}', '{"k":"x","p":"/"}', '{"k":"p","p":"/projects/X"}', '{"k":"p","p":"/admin"}', '{"k":"p","p":"/?a=1"}',
      '{"k":"s","p":"/projects/x"}', '{"k":"s","p":"A"}', '{"k":1,"p":"/"}', '{"k":"p","p":["/"]}', JSON.stringify({ k: 'p', p: '/' + 'a'.repeat(600) }), '{"k":"p","p":"/"}' + ' '.repeat(600)])
      assert.equal(parseHitBody(b), null, b.slice(0, 40));
  });
  await check('G5 tarayıcı tercihi: GPC / DNT bildiren tarayıcıda gönderim yapılmaz', () => {
    assert.equal(browserOptedOut({ globalPrivacyControl: true }), true);
    assert.equal(browserOptedOut({ doNotTrack: '1' }), true);
    assert.equal(browserOptedOut({ doNotTrack: 'yes' }), true);
    assert.equal(browserOptedOut({ doNotTrack: null }, { doNotTrack: '1' }), true);
    assert.equal(browserOptedOut({ doNotTrack: '0', globalPrivacyControl: false }), false);
    assert.equal(browserOptedOut({}), false);
    assert.equal(browserOptedOut(undefined), true);
  });

  /* ── Kova (günlük yaklaşık tekil) ── */
  await check('B1 kova: 0..65535, deterministik; gün/IP/UA/sır değişince değişir; girdiler çıktıda yok', () => {
    const b = visitorBucket(SECRET, '2026-10-11', '203.0.113.9', CHROME);
    assert.ok(Number.isInteger(b) && b >= 0 && b <= 65535);
    assert.equal(b, visitorBucket(SECRET, '2026-10-11', '203.0.113.9', CHROME));
    const others = [visitorBucket(SECRET, '2026-10-12', '203.0.113.9', CHROME), visitorBucket(SECRET, '2026-10-11', '203.0.113.10', CHROME), visitorBucket(SECRET, '2026-10-11', '203.0.113.9', FIREFOX), visitorBucket('y'.repeat(40), '2026-10-11', '203.0.113.9', CHROME)];
    assert.ok(others.filter((o) => o !== b).length >= 3); // 16 bitte rastlantısal eşitlik mümkün ama hepsi eşit olamaz
  });
  await check('B2 kova dağılımı yaklaşık düzgün (10.000 farklı IP → beklenen dolu kova sayısına yakın) ve günler arası bağlanamaz', () => {
    const m = 65536;
    const n = 10000;
    const seen = new Set<number>();
    for (let i = 0; i < n; i++) seen.add(visitorBucket(SECRET, '2026-10-11', `198.51.${(i >> 8) & 255}.${i & 255}`, CHROME));
    const expected = m * (1 - Math.exp(-n / m));
    assert.ok(Math.abs(seen.size - expected) < 0.02 * expected, `${seen.size} vs ${expected.toFixed(0)}`);
    // linear counting tahmini gerçeğe yakın
    const est = -m * Math.log((m - seen.size) / m);
    assert.ok(Math.abs(est - n) / n < 0.03, `tahmin ${est.toFixed(0)}`);
    // aynı kişinin ertesi günkü kovası bağımsız: eşleşme oranı ~1/65536 (≈0)
    let same = 0;
    for (let i = 0; i < 2000; i++) if (visitorBucket(SECRET, '2026-10-11', `192.0.2.${i % 250}.${i}`, CHROME) === visitorBucket(SECRET, '2026-10-12', `192.0.2.${i % 250}.${i}`, CHROME)) same++;
    assert.ok(same < 10, `aynı kova ${same}`);
  });
  await check('B3 gün sınırı Europe/Istanbul: 21:30 UTC → ertesi gün; 20:59 UTC → aynı gün', () => {
    assert.equal(istanbulDay(new Date('2026-10-11T21:30:00Z')), '2026-10-12');
    assert.equal(istanbulDay(new Date('2026-10-11T20:59:00Z')), '2026-10-11');
    assert.equal(istanbulDay(new Date('2026-12-31T21:00:00Z')), '2027-01-01');
  });

  /* ── Orkestrasyon (processHit) ── */
  const mk = () => {
    const calls = { exists: 0, record: [] as [string, string, number][], limiterTake: 0 };
    let capped = false;
    const deps: HitDeps = {
      env: FULL_ENV,
      now: () => new Date('2026-10-11T12:00:00Z'),
      exists: async () => { calls.exists += 1; return true; },
      record: async (k, p, b) => { calls.record.push([k, p, b]); return 'ok'; },
      limiter: { take: () => { calls.limiterTake += 1; return true; } },
      cap: { isCapped: () => capped, mark: () => { capped = true; } },
    };
    return { calls, deps, setCapped: (v: boolean) => { capped = v; } };
  };
  const input = (body: string, over: Partial<Record<string, string>> = {}, method = 'POST'): HitInput => ({
    method, headers: hdrs({ ...GOOD, ...over } as Record<string, string>), requestUrl: URL_, readBody: async () => body, ip: '203.0.113.9', userAgent: CHROME,
  });
  await check('H1 KAPALI iken hiçbir bağımlılık çağrılmaz (varsayılan güvenli)', async () => {
    const m = mk();
    let bodyRead = false;
    const r = await processHit({ ...input('{"k":"p","p":"/"}'), readBody: async () => { bodyRead = true; return ''; } }, { ...m.deps, env: {} });
    assert.deepEqual(r, { recorded: false, reason: 'disabled' });
    assert.equal(bodyRead, false);
    assert.equal(m.calls.exists + m.calls.record.length + m.calls.limiterTake, 0);
    const r2 = await processHit(input('{"k":"p","p":"/"}'), { ...m.deps, env: { ...FULL_ENV, ANALYTICS_WAF_CONFIRMED: undefined } });
    assert.equal(r2.reason, 'disabled');
    assert.equal(m.calls.record.length, 0);
  });
  await check('H2 geçerli sayfa isteği: tek kayıt, kova sunucuda türetilir (ham IP/UA RPC\'ye gitmez)', async () => {
    const m = mk();
    const r = await processHit(input('{"k":"p","p":"/projects/yakala"}'), m.deps);
    assert.deepEqual(r, { recorded: true, reason: 'ok' });
    assert.equal(m.calls.record.length, 1);
    const [k, p, b] = m.calls.record[0];
    assert.deepEqual([k, p], ['page', '/projects/yakala']);
    assert.equal(b, visitorBucket(SECRET, '2026-10-11', '203.0.113.9', CHROME));
    assert.ok(!JSON.stringify(m.calls.record).includes('203.0.113.9') && !JSON.stringify(m.calls.record).includes('Mozilla'));
  });
  await check('H3 showcase isteği: kova 0, tür showcase', async () => {
    const m = mk();
    await processHit(input('{"k":"s","p":"yakala"}'), m.deps);
    assert.deepEqual(m.calls.record, [['showcase', 'yakala', 0]]);
  });
  await check('H4 MALİYET KONTROLÜ: reddedilen istekler DB/Auth çağrısı (exists/record) YAPMAZ', async () => {
    const bad: [string, Partial<Record<string, string>>, string, string][] = [
      ['{"k":"p","p":"/"}', {}, 'GET', 'method'],
      ['{"k":"p","p":"/"}', { origin: 'https://evil.example' }, 'POST', 'origin'],
      ['{"k":"p","p":"/"}', { 'content-type': 'text/html' }, 'POST', 'content-type'],
      ['{"k":"p","p":"/"}', { 'user-agent': 'curl/8' }, 'POST', 'bot'],
      ['{"k":"p","p":"/"}', { 'sec-gpc': '1' }, 'POST', 'privacy'],
      ['{"k":"p","p":"/"}', { dnt: '1' }, 'POST', 'privacy'],
      ['{"k":"p","p":"/admin"}', {}, 'POST', 'payload'],
      ['not json', {}, 'POST', 'payload'],
      ['{"k":"p","p":"/","x":1}', {}, 'POST', 'payload'],
    ];
    for (const [body, over, method, reason] of bad) {
      const m = mk();
      const r = await processHit(input(body, over, method), m.deps);
      assert.deepEqual(r, { recorded: false, reason }, reason + body);
      assert.equal(m.calls.exists + m.calls.record.length + m.calls.limiterTake, 0, reason);
    }
  });
  await check('H5 yayınlanmamış/bilinmeyen yol: record çağrılmaz; exists hata verirse de çağrılmaz', async () => {
    const m = mk();
    const r = await processHit(input('{"k":"p","p":"/projects/yok"}'), { ...m.deps, exists: async () => false });
    assert.equal(r.reason, 'unknown-path');
    const r2 = await processHit(input('{"k":"p","p":"/projects/yok"}'), { ...m.deps, exists: async () => { throw new Error('db'); } });
    assert.equal(r2.reason, 'unknown-path');
    assert.equal(m.calls.record.length, 0);
  });
  await check('H6 tavan belleği ve hız sınırı DB çağrısını keser; "capped" sonrası bellek işaretlenir', async () => {
    const m = mk();
    m.setCapped(true);
    assert.equal((await processHit(input('{"k":"p","p":"/"}'), m.deps)).reason, 'capped-memory');
    m.setCapped(false);
    assert.equal((await processHit(input('{"k":"p","p":"/"}'), { ...m.deps, limiter: { take: () => false } })).reason, 'rate');
    assert.equal(m.calls.record.length, 0);
    const r = await processHit(input('{"k":"p","p":"/"}'), { ...m.deps, record: async () => 'capped' });
    assert.deepEqual(r, { recorded: false, reason: 'capped' });
    assert.equal((await processHit(input('{"k":"p","p":"/"}'), m.deps)).reason, 'capped-memory');
  });
  await check('H7 record hata dönerse (error/invalid) sayılmaz; bağımlılık hata FIRLATIRSA bile processHit fırlatmaz kontratı route\'ta try/catch ile korunur', async () => {
    const m = mk();
    assert.equal((await processHit(input('{"k":"p","p":"/"}'), { ...m.deps, record: async () => 'error' })).recorded, false);
    assert.equal((await processHit(input('{"k":"p","p":"/"}'), { ...m.deps, record: async () => 'invalid' })).recorded, false);
    const body = await processHit({ ...input('{"k":"p","p":"/"}'), readBody: async () => { throw new Error('boom'); } }, m.deps);
    assert.equal(body.reason, 'body');
  });

  /* ── Yazıcı oturumu ve kayıt ── */
  await check('W1 oturum: eşzamanlı istekler TEK giriş yapar; süre dolmadan önce yenilenir; süre içinde yeniden giriş yok', async () => {
    let t = 1_000_000;
    let signIns = 0;
    const s = createSession({ now: () => t, signIn: async () => { signIns += 1; await new Promise((r) => setTimeout(r, 5)); return { expiresAtMs: t + 3_600_000 }; } });
    const results = await Promise.all(Array.from({ length: 25 }, () => s.ensure()));
    assert.ok(results.every(Boolean));
    assert.equal(signIns, 1);
    t += 3_000_000;
    await s.ensure();
    assert.equal(signIns, 1);
    t += 600_000; // bitişe 60 sn'den az kaldı → yenile
    await s.ensure();
    assert.equal(signIns, 2);
  });
  await check('W2 giriş başarısızlığı: devre kesici (backoff) — Auth\'a yağmur yağmaz; backoff sonrası yeniden dener; fırlatma da yutulur', async () => {
    let t = 0;
    let n = 0;
    const s = createSession({ now: () => t, failBackoffMs: 120_000, signIn: async () => { n += 1; if (n === 1) return null; if (n === 2) throw new Error('429'); return { expiresAtMs: t + 3_600_000 }; } });
    assert.equal(await s.ensure(), false);
    for (let i = 0; i < 50; i++) assert.equal(await s.ensure(), false);
    assert.equal(n, 1);
    t += 121_000;
    assert.equal(await s.ensure(), false); // ikinci deneme fırlatır → yine kapalı
    assert.equal(n, 2);
    t += 121_000;
    assert.equal(await s.ensure(), true);
    assert.equal(n, 3);
  });
  const mkRec = (script: RpcOutcome[]) => {
    let t = 0;
    let signIns = 0;
    const session = createSession({ now: () => t, signIn: async () => { signIns += 1; return { expiresAtMs: t + 3_600_000 }; } });
    const rpcCalls: [string, string, number][] = [];
    const problems: string[] = [];
    const record = createRecorder({ session, rpc: async (k, p, b) => { rpcCalls.push([k, p, b]); return script.shift() ?? { data: 'ok', error: null }; }, onProblem: (c) => problems.push(c) });
    return { record, rpcCalls, problems, signIns: () => signIns, advance: (ms: number) => { t += ms; } };
  };
  await check('W3 kayıt: ok/capped/invalid sınıflanır; bilinmeyen dönüş "error"', async () => {
    const m = mkRec([{ data: 'ok', error: null }, { data: 'capped', error: null }, { data: 'invalid', error: null }, { data: 'garip', error: null }, { data: null, error: null }]);
    assert.equal(await m.record('page', '/', 1), 'ok');
    assert.equal(await m.record('page', '/', 1), 'capped');
    assert.equal(await m.record('page', '/', 1), 'invalid');
    assert.equal(await m.record('page', '/', 1), 'error');
    assert.equal(await m.record('page', '/', 1), 'error');
  });
  await check('W4 süresi dolmuş token (401/JWT): bir kez yeniden giriş + tek yeniden deneme; ikinci kez de başarısızsa "error"', async () => {
    const m = mkRec([{ data: null, error: { status: 401, message: 'JWT expired' } }, { data: 'ok', error: null }]);
    assert.equal(await m.record('page', '/', 1), 'ok');
    assert.equal(m.signIns(), 2);
    assert.equal(m.rpcCalls.length, 2);
    const m2 = mkRec([{ data: null, error: { code: 'PGRST301' } }, { data: null, error: { code: 'PGRST301' } }]);
    assert.equal(await m2.record('page', '/', 1), 'error');
    assert.equal(m2.rpcCalls.length, 2);
  });
  await check('W5 42501 (yazıcı iptal edildi): yeniden deneme YOK, uzun süre devre dışı; sonraki çağrılar RPC yapmaz', async () => {
    const m = mkRec([{ data: null, error: { code: '42501', message: 'forbidden' } }]);
    assert.equal(await m.record('page', '/', 1), 'error');
    assert.equal(m.rpcCalls.length, 1);
    for (let i = 0; i < 20; i++) assert.equal(await m.record('page', '/', 1), 'error');
    assert.equal(m.rpcCalls.length, 1);
    assert.ok(m.problems.includes('forbidden'));
    m.advance(601_000);
    assert.equal(await m.record('page', '/', 1), 'ok'); // iptal kalktıysa (veya düzeltildiyse) 10 dk sonra yeniden dener
  });
  await check('W6 diğer RPC hatası yeniden denenmez; fırlatan RPC yutulur', async () => {
    const m = mkRec([{ data: null, error: { code: '23505', message: 'x' } }]);
    assert.equal(await m.record('page', '/', 1), 'error');
    assert.equal(m.rpcCalls.length, 1);
    let t = 0;
    const session = createSession({ now: () => t, signIn: async () => ({ expiresAtMs: t + 3_600_000 }) });
    const rec = createRecorder({ session, rpc: async () => { throw new Error('network'); } });
    assert.equal(await rec('page', '/', 1), 'error');
    t += 1;
  });
  await check('W7 hız sınırlayıcı ve tavan belleği', () => {
    let t = 0;
    const l = createLimiter(3, 1000, () => t);
    assert.deepEqual([l.take(), l.take(), l.take(), l.take()], [true, true, true, false]);
    t += 1000;
    assert.equal(l.take(), true);
    const c = createCapMemory(5000, () => t);
    assert.equal(c.isCapped(), false);
    c.mark();
    assert.equal(c.isCapped(), true);
    t += 5001;
    assert.equal(c.isCapped(), false);
  });

  /* ── Özet ayrıştırma + grafik ── */
  const goodSummary = () => ({
    today: '2026-10-11', days: 7, total_views: 10, today_views: 3, views_7d: 7, views_30d: 9, total_clicks: 2,
    daily: [{ day: '2026-10-10', views: 4, clicks: 1, uniques: 3, capped: false }, { day: '2026-10-11', views: 3, clicks: 1, uniques: null, capped: true }],
    top_pages: [{ path: '/', views: 5 }], showcase: [{ slug: 'yakala', title: 'YAKALA', clicks: 1, clicks_total: 2 }, { slug: 'x', title: null, clicks: 0, clicks_total: 0 }],
  });
  await check('S1 özet ayrıştırma: geçerli kabul; bozuk şekiller null', () => {
    const s = parseSummary(goodSummary());
    assert.ok(s);
    assert.equal(s.totalViews, 10);
    assert.equal(s.daily[1].uniques, null);
    assert.equal(s.showcase[1].title, null);
    const mut = (f: (o: Record<string, unknown>) => void) => { const o = goodSummary() as unknown as Record<string, unknown>; f(o); return parseSummary(o); };
    assert.equal(parseSummary(null), null);
    assert.equal(parseSummary([]), null);
    assert.equal(parseSummary('x'), null);
    assert.equal(mut((o) => { o.total_views = -1; }), null);
    assert.equal(mut((o) => { o.today = '11.10.2026'; }), null);
    assert.equal(mut((o) => { delete o.daily; }), null);
    assert.equal(mut((o) => { (o.daily as Record<string, unknown>[])[0].capped = 'x'; }), null);
    assert.equal(mut((o) => { (o.daily as Record<string, unknown>[])[0].uniques = 'x'; }), null);
    assert.equal(mut((o) => { (o.top_pages as Record<string, unknown>[])[0].views = '5'; }), null);
    assert.equal(mut((o) => { (o.showcase as Record<string, unknown>[])[0].clicks_total = null; }), null);
  });
  await check('S2 grafik geometrisi: oranlı yükseklik, sıfır günler, boş veri', () => {
    const d = [{ day: 'a', views: 0, clicks: 0, uniques: 0, capped: false }, { day: 'b', views: 5, clicks: 0, uniques: 1, capped: false }, { day: 'c', views: 10, clicks: 0, uniques: 1, capped: false }];
    const { bars, max } = chartBars(d, 100, 50);
    assert.equal(max, 10);
    assert.equal(bars[0].h, 0);
    assert.equal(bars[2].h, 50);
    assert.equal(bars[1].h, 25);
    assert.ok(bars.every((b) => b.x >= 0 && b.x + b.w <= 100.01 && b.y >= 0));
    assert.deepEqual(chartBars([], 100, 50), { bars: [], max: 0 });
    assert.ok(chartBars([{ day: 'a', views: 0, clicks: 0, uniques: 0, capped: false }], 100, 50).bars.every((b) => b.h === 0));
    assert.ok(chartBars([{ day: 'a', views: 1, clicks: 0, uniques: 0, capped: false }, { day: 'b', views: 1000, clicks: 0, uniques: 0, capped: false }], 100, 50).bars[0].h >= 2); // küçük ama sıfır olmayan gün görünür
  });

  /* ── Kaynak taraması: gizlilik, güvenlik, etkinleştirme kapısı ── */
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
  const ANALYTICS_SRC = [...files('src/lib/analytics'), ...files('src/components/analytics'), 'src/app/api/hit/route.ts', ...files('src/components/admin/analytics'), 'src/app/(admin)/admin/(protected)/analytics/page.tsx'];
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  await check('X1 çerez/depolama YOK: analytics kodu cookie, localStorage, sessionStorage, indexedDB kullanmaz', () => {
    for (const f of ANALYTICS_SRC) {
      const c = strip(read(f));
      assert.equal(/localStorage|sessionStorage|indexedDB|document\.cookie|cookies\(\)|set-cookie|Set-Cookie/.test(c), false, f);
    }
  });
  await check('X2 service-role kullanılmaz; ham IP/UA loglanmaz veya RPC\'ye geçirilmez; sır/parola loglanmaz', () => {
    for (const f of ANALYTICS_SRC) {
      const c = strip(read(f));
      assert.equal(/SERVICE_ROLE|service_role|sb_secret_/.test(c), false, f);
      for (const m of c.matchAll(/console\.\w+\(([^)]*)\)/g)) assert.equal(/\bip\b|userAgent|user-agent|PASSWORD|SECRET|EMAIL|password|token/i.test(m[1]), false, `${f}: ${m[0]}`);
    }
    const hit = strip(read('src/lib/analytics/hit.ts'));
    assert.match(hit, /d\.record\(hit\.kind, hit\.path, bucket\)/); // RPC'ye yalnızca tür, yol ve kova gider
    const rt = strip(read('src/lib/analytics/runtime.ts'));
    assert.match(rt, /p_kind: kind, p_path: path, p_bucket: bucket/);
    assert.equal(/p_ip|p_ua|p_user|p_visitor/.test(rt), false);
  });
  await check('X3 route: nodejs runtime, force-dynamic, yalnızca POST, her çıkış 204 + no-store; hata sızdırmaz', () => {
    const r = read('src/app/api/hit/route.ts');
    assert.match(r, /export const runtime = 'nodejs'/);
    assert.match(r, /export const dynamic = 'force-dynamic'/);
    assert.deepEqual([...r.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]), ['POST']);
    assert.equal((strip(r).match(/new Response\(/g) ?? []).length, 1);
    assert.match(r, /status: 204/);
    assert.match(r, /no-store/);
    assert.match(r, /catch \{/);
  });
  await check('X4 beacon: kimlik bilgisi göndermez (credentials omit), keepalive, GPC/DNT kontrolü; yalnızca (site) layout\'ta ve derleme bayrağına bağlı', () => {
    const b = read('src/components/analytics/HitBeacon.tsx');
    assert.match(b, /^'use client'/);
    assert.match(b, /credentials: 'omit'/);
    assert.match(b, /keepalive: true/);
    assert.match(b, /browserOptedOut/);
    assert.match(b, /data-showcase-slug/);
    const importers = files('src').filter((f) => /\.(tsx?|mjs)$/.test(f) && /import[^;]*HitBeacon/.test(read(f)) && !f.endsWith('HitBeacon.tsx'));
    assert.deepEqual(importers.map((f) => f.replace(/\\/g, '/')), ['src/app/(site)/layout.tsx']);
    const l = read('src/app/(site)/layout.tsx');
    assert.match(l, /process\.env\.NEXT_PUBLIC_ANALYTICS_BEACON === '1' && <HitBeacon \/>/);
    for (const f of files('src/app/(admin)').concat(files('src/components/admin'))) assert.equal(/HitBeacon|api\/hit/.test(read(f).replace(/ANALYTICS-TEST|docs\/cms\/ANALYTICS/g, '')), false, f);
  });
  await check('X5 ShowcaseLink: yalnızca veri özniteliği eklendi; güvenli yeni sekme davranışı (noopener noreferrer, _blank, doğrulanmış href) korunur', () => {
    const s = read('src/components/project/ShowcaseLink.tsx');
    assert.match(s, /target="_blank"/);
    assert.match(s, /rel="noopener noreferrer"/);
    assert.match(s, /href=\{checked\.url\}/);
    assert.match(s, /if \(!checked\.ok\) return null;/);
    assert.match(s, /data-showcase-slug=\{slug\}/);
    assert.match(read('src/app/(site)/projects/[slug]/page.tsx'), /<ShowcaseLink url=\{cs\.showcase\.url\} slug=\{project\.slug\}/);
    assert.equal(/slug=/.test(read('src/components/admin/preview/ProjectPreviewView.tsx')), false); // önizleme sayılmaz
  });
  await check('X6 admin: sayfa requireAdmin ister, RPC admin oturumuyla (createClient) çağrılır; menüye eklendi; middleware /admin ile sınırlı kalır', () => {
    const p = read('src/app/(admin)/admin/(protected)/analytics/page.tsx');
    assert.match(p, /requireAdmin\(\)\)\.kind !== 'admin'\) notFound\(\)/);
    assert.match(p, /createClient\(\)/);
    assert.match(p, /rpc\('analytics_summary'/);
    assert.equal(/createPublicClient|SERVICE_ROLE/.test(p), false);
    assert.match(read('src/lib/cms/admin-sections.ts'), /href: '\/admin\/analytics'/);
    assert.match(read('src/middleware.ts'), /matcher: \['\/admin\/:path\*'\]/);
  });
  await check('X7 mevcut RLS/CMS dosyaları analytics tarafından değiştirilmedi: 0007 yalnızca yeni nesneler oluşturur; mevcut tabloları değiştirmez', () => {
    const sql = read('supabase/migrations/0007_analytics.sql');
    const stmts = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    for (const m of stmts.matchAll(/(alter table|create policy|drop |truncate|delete from|update )\s+(public\.)?(\w+)/gi)) {
      const what = m[1].toLowerCase();
      if (what === 'alter table') assert.match(m[3], /^analytics_/, m[0]);
      else if (what === 'update ') assert.match(m[3], /^analytics_/, m[0]);
      else assert.fail(`beklenmeyen ifade: ${m[0]}`);
    }
    assert.equal(/create policy/i.test(stmts), false); // politika YOK (tablolar API'ye kapalı)
    assert.equal(/grant\s+(select|insert|update|delete|all)\b[^;]*\bto\s+[^;]*\b(anon|authenticated)\b/i.test(stmts), false); // tablolara API hakkı verilmez
    assert.equal(/grant execute[^;]*\bto\b[^;]*\banon\b/i.test(stmts), false);
    assert.equal(/\b(ip|user_agent|useragent|visitor_id|session_id|fingerprint)\b\s+(text|inet|uuid|varchar|bytea)/i.test(stmts), false);
    assert.equal((stmts.match(/security definer/gi) ?? []).length, 2);
    assert.equal((stmts.match(/set search_path = ''/g) ?? []).length, 3); // iki SECURITY DEFINER + tetikleyici fonksiyonu
  });
  await check('X8 .env.example yalnızca ADLARI içerir (değer yok) ve etkinleştirme bayrakları yorum olarak, varsayılan kapalı', () => {
    const e = read('.env.example');
    for (const n of ['NEXT_PUBLIC_ANALYTICS_BEACON', 'ANALYTICS_ENABLED', 'ANALYTICS_WAF_CONFIRMED', 'ANALYTICS_HASH_SECRET', 'ANALYTICS_WRITER_EMAIL', 'ANALYTICS_WRITER_PASSWORD']) assert.match(e, new RegExp(`^# ${n}=\\s*$`, 'm'), n);
    assert.equal(/^(NEXT_PUBLIC_ANALYTICS|ANALYTICS_)\w*=\S/m.test(e), false);
    assert.equal(/^[^#\n]*ANALYTICS_/m.test(e), false);
  });
  await check('X9 dokümanlar: gizlilik/KVKK, sahte istek sınırı, etkinleştirme sırası, WAF beyanının manuel olduğu, 7/30 tekil yok', () => {
    const d = read('docs/cms/ANALYTICS.md');
    for (const re of [/KVKK/, /Do Not Track|DNT/, /Global Privacy Control|GPC/, /tamamen önlenemez/, /ANALYTICS_WAF_CONFIRMED[^\n]*(gerçek|doğrulama)/i, /7\/30 günlük tekil/, /20\.000/, /5\.000/, /2\.000/, /veri envanteri/i, /aydınlatma/i, /service-role/i])
      assert.match(d, re, String(re));
    assert.match(read('docs/cms/ANALYTICS-TEST-KURULUM.md'), /production/i);
  });

  finish('Tüm analytics kontrolleri geçti.');
}
void main();
