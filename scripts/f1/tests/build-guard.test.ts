import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { BUILD_MISMATCH_CODE, BUILD_MISMATCH_EXIT_CODE, decideBuildRuntime, enforceBuildSourceMatch, normalizeSource } from '../../../src/lib/content/build-guard';
import { ContentUnavailableError } from '../../../src/lib/content/errors';
import { getContentSource } from '../../../src/lib/content/source';

const root = process.cwd();

test('karar tablosu: eşleşme → izin; static↔cms uyumsuzluğu (iki yön) → ret', () => {
  const P = 'production';
  assert.deepEqual(decideBuildRuntime('static', undefined, P), { ok: true, reason: 'match' });
  assert.deepEqual(decideBuildRuntime('static', 'static', P), { ok: true, reason: 'match' });
  assert.deepEqual(decideBuildRuntime('static', ' STATIC ', P), { ok: true, reason: 'match' });
  assert.deepEqual(decideBuildRuntime('cms', 'cms', P), { ok: true, reason: 'match' });
  assert.deepEqual(decideBuildRuntime('static', 'cms', P), { ok: false, built: 'static', runtime: 'cms' });
  assert.deepEqual(decideBuildRuntime('cms', 'static', P), { ok: false, built: 'cms', runtime: 'static' });
  assert.deepEqual(decideBuildRuntime('cms', '', P), { ok: false, built: 'cms', runtime: 'static' });
});

test('geçersiz değerler: static build + geçersiz çalışma değeri → ret; cms build + geçersiz → istek anı fail-closed\'a bırakılır', () => {
  const P = 'production';
  assert.equal(decideBuildRuntime('static', 'cmss', P).ok, false);
  assert.deepEqual(decideBuildRuntime('cms', 'cmss', P), { ok: true, reason: 'runtime-invalid-handled-per-request' });
  assert.equal(decideBuildRuntime('invalid', 'static', P).ok, false);
});

test('geliştirmede (NODE_ENV≠production) kontrol atlanır; build işareti yoksa "doğrulanamadı" uyarısı loglanır, ret yok', () => {
  assert.deepEqual(decideBuildRuntime('static', 'cms', 'development'), { ok: true, reason: 'skipped-dev' });
  assert.deepEqual(decideBuildRuntime(undefined, 'cms', 'production'), { ok: true, reason: 'skipped-no-marker' });
  const logs: string[] = [];
  enforceBuildSourceMatch({ built: undefined, runtime: 'cms', nodeEnv: 'production', log: (l) => logs.push(l), exit: () => { throw new Error('çıkmamalı'); } });
  assert.match(logs.join('\n'), /DOĞRULANAMADI/);
});

test('uyumsuzlukta log (kodlu) + exit(78); değerler (ham ortam) loga yazılmaz', () => {
  const logs: string[] = []; const codes: number[] = [];
  enforceBuildSourceMatch({ built: 'static', runtime: 'cms', nodeEnv: 'production', log: (l) => logs.push(l), exit: (c) => { codes.push(c); } });
  assert.deepEqual(codes, [BUILD_MISMATCH_EXIT_CODE]);
  assert.equal(BUILD_MISMATCH_EXIT_CODE, 78);
  assert.ok(logs[0].includes(`${BUILD_MISMATCH_CODE}: build=static runtime=cms`));
});

test('normalizeSource, source.ts getContentSource ile birebir aynı sınıflandırır (geçersiz → fırlatır ⇔ "invalid")', () => {
  for (const raw of [undefined, '', ' ', 'static', 'STATIC', ' Static ', 'cms', 'CMS', ' cms\n', 'cmss', 'prod', 'null', '0']) {
    let expected: string;
    try { expected = getContentSource(raw); } catch (e) { assert.ok(e instanceof ContentUnavailableError); expected = 'invalid'; }
    assert.equal(normalizeSource(raw), expected, JSON.stringify(raw));
  }
});

test('next.config.mjs: gömülen BUILT_CONTENT_SOURCE, normalizeSource ile aynı; diğer ayarlar korunur; ham değer gömülmez', async () => {
  const url = pathToFileURL(join(root, 'next.config.mjs')).href;
  const saved = process.env.CONTENT_SOURCE;
  try {
    let i = 0;
    for (const raw of [undefined, '', 'static', 'cms', 'CMS ', 'cmss']) {
      if (raw === undefined) delete process.env.CONTENT_SOURCE; else process.env.CONTENT_SOURCE = raw;
      const cfg = (await import(`${url}?t=${i++}`)).default as { reactStrictMode?: boolean; env?: Record<string, string> };
      assert.equal(cfg.reactStrictMode, true);
      assert.deepEqual(Object.keys(cfg.env ?? {}), ['BUILT_CONTENT_SOURCE']);
      assert.equal(cfg.env?.BUILT_CONTENT_SOURCE, normalizeSource(raw), JSON.stringify(raw));
      assert.ok(['static', 'cms', 'invalid'].includes(cfg.env?.BUILT_CONTENT_SOURCE ?? ''));
    }
  } finally { if (saved === undefined) delete process.env.CONTENT_SOURCE; else process.env.CONTENT_SOURCE = saved; }
});

/* ── Gerçek süreç testleri: başlangıç kontrolü GERÇEKTEN fail-closed mı? ── */
const boot = join(root, 'scripts/f1/tests/fixtures/boot-with-guard.ts');
function runBoot(env: Record<string, string | undefined>): Promise<{ code: number | null; out: string; err: string; portOpen: boolean }> {
  return new Promise((resolve, reject) => {
    const e: Record<string, string | undefined> = { PATH: process.env.PATH, HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, SystemRoot: process.env.SystemRoot, NODE_PATH: process.env.NODE_PATH, TSX_TSCONFIG_PATH: process.env.TSX_TSCONFIG_PATH };
    for (const [k, v] of Object.entries(env)) if (v !== undefined) e[k] = v;
    const child = spawn(process.execPath, [...process.execArgv.filter((a) => !a.startsWith('--test')), boot], { cwd: root, env: e as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = ''; let port = 0;
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); const m = /LISTENING (\d+)/.exec(out); if (m && !port) { port = Number(m[1]); child.kill('SIGKILL'); } });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      // çıkıştan sonra port bağlantı kabul ediyor mu?
      const probe = (p: number) => new Promise<boolean>((res) => { const s = net.connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
      const portToCheck = port || Number(/PORT (\d+)/.exec(out)?.[1] ?? 0);
      (portToCheck ? probe(portToCheck) : Promise.resolve(false)).then((portOpen) => resolve({ code, out, err, portOpen }));
    });
  });
}

test('GERÇEK SÜREÇ: static build + runtime cms → süreç 78 ile çıkar, sunucu hiç dinlemez, kodlu log vardır', async () => {
  const r = await runBoot({ NODE_ENV: 'production', BUILT_CONTENT_SOURCE: 'static', CONTENT_SOURCE: 'cms' });
  assert.equal(r.code, 78, `çıkış kodu ${r.code}; out=${r.out}; err=${r.err}`);
  assert.ok(!/LISTENING/.test(r.out), 'sunucu dinlemeye BAŞLAMAMALI');
  assert.ok(r.err.includes(`${BUILD_MISMATCH_CODE}: build=static runtime=cms`), r.err);
  assert.equal(r.portOpen, false);
});

test('GERÇEK SÜREÇ: cms build + runtime static → aynı şekilde reddedilir', async () => {
  const r = await runBoot({ NODE_ENV: 'production', BUILT_CONTENT_SOURCE: 'cms', CONTENT_SOURCE: 'static' });
  assert.equal(r.code, 78);
  assert.ok(!/LISTENING/.test(r.out));
  assert.ok(r.err.includes(`${BUILD_MISMATCH_CODE}: build=cms runtime=static`));
});

test('GERÇEK SÜREÇ: uyumlu (varsayılan static/static) → sunucu normal başlar, ret yok', async () => {
  for (const env of [{ BUILT_CONTENT_SOURCE: 'static' }, { BUILT_CONTENT_SOURCE: 'cms', CONTENT_SOURCE: 'cms' }]) {
    const r = await runBoot({ NODE_ENV: 'production', ...env });
    assert.ok(/LISTENING \d+/.test(r.out), `başlamadı: out=${r.out} err=${r.err}`);
    assert.ok(!r.err.includes(BUILD_MISMATCH_CODE));
  }
});

test('GERÇEK SÜREÇ: NODE_ENV=development → uyumsuzluk bile süreci durdurmaz', async () => {
  const r = await runBoot({ NODE_ENV: 'development', BUILT_CONTENT_SOURCE: 'static', CONTENT_SOURCE: 'cms' });
  assert.ok(/LISTENING \d+/.test(r.out), `out=${r.out} err=${r.err}`);
});
