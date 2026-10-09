/**
 * F0 öz-testleri. Next.js, gerçek Supabase ve ağ GEREKTİRMEZ (loopback hariç).
 * Bunlar düzenek bileşenlerini ve senaryo mantığını sınar; Next davranışını ÖLÇMEZ.
 */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LAB_COLS, NOTE_COLS, PROJECT_COLS, SITE_COLS } from '../../../src/lib/content/columns';
import { createContentProvider } from '../../../src/lib/content/provider';
import { noCache } from '../../../src/lib/content/cache';
import { supabaseReader, type QueryClient } from '../../../src/lib/content/reader';
import { staticContent } from '../../../src/lib/content/static';
import { baseWorld, mark, PROBE, setStatus, setTitle } from '../fake-supabase/fixtures';
import { startFakeSupabase } from '../fake-supabase/server';
import { runGuardSelftest } from '../guard/egress-guard-selftest';
import { assertLoopbackUrl, buildBuildEnv, buildChildEnv, FONT_MOCK_ENV, ENV_ALLOWLIST, FAKE_KEY, FORBIDDEN_ENV_PATTERN, parseArgs, type HostEnv } from '../lib/config';
import { sleep } from '../lib/http';
import { installFontMock, preflightFontMock, scanFontHosts } from '../lib/fontmock';
import { renderMarkdown, summarize } from '../lib/report';
import { assertNoSecretsCopied, clearNextCache, createBase, createVariant, isLinkLike, removeLink, safeRemoveSandbox, SANDBOX_DIRNAME } from '../lib/sandbox';
import { snapshotProject, srcDifferences } from '../lib/snapshot';
import { createRequire } from 'node:module';
import { integrity } from '../scenarios/m10-integrity';
import { m00 } from '../scenarios/m00-build';
import type { ScenarioResult } from '../lib/types';
import type { Ctx } from '../scenarios/common';
import { runScenarios } from '../scenarios';
import { classifyRuntimeSource } from '../scenarios/m08-build-flip';
import { startMockApp, type MockApp } from './mock-app';

let passed = 0;
const failures: string[] = [];
const notRuns: string[] = [];
const indent = (m: string): string => m.split('\n').map((l) => '         ' + l).join('\n');
async function t(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); } catch (e) {
    const msg = (e as Error).message;
    failures.push(`${name}: ${msg.split('\n')[0]}`);
    console.log(`  FAIL ${name}\n${indent(msg)}`); // TAM ileti (beklenen/gerçek değerler dahil) — kesilmez
  }
}
/** Ortam nedeniyle YAPILAMAYAN doğrulama: PASS sayılmaz, FAIL da sayılmaz; açıkça NOT RUN yazılır. */
function notRun(name: string, reason: string): void { notRuns.push(`${name}: ${reason}`); console.log(`  NOT RUN ${name}\n${indent(reason)}`); }

/**
 * Dizin bağlantısı kurar. Windows'ta önce JUNCTION (yönetici/Developer Mode GEREKTİRMEZ), diğer sistemlerde symlink.
 * Kurulamazsa null döner (çağıran NOT RUN raporlar).
 */
function makeDirLink(target: string, linkPath: string): 'junction' | 'symlink' | null {
  try { symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir'); return process.platform === 'win32' ? 'junction' : 'symlink'; } catch { return null; }
}

const getJson = (url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> =>
  new Promise((res, rej) => { http.get(url, { headers }, (r) => { let b = ''; r.on('data', (d: Buffer) => { b += d.toString(); }); r.on('end', () => res({ status: r.statusCode ?? 0, body: b })); }).on('error', rej); });
const AUTH = { apikey: FAKE_KEY, authorization: `Bearer ${FAKE_KEY}` };

export async function runSelftests(root: string): Promise<number> {
  const guardPath = resolve(root, 'scripts/f0/guard/egress-guard.cjs');

  console.log('\n[1] egress guard');
  await t('guard: loopback izinli; dış fetch/net/tls/dns/https ENGELLİ ve günlüğe yazılır', async () => {
    const r = await runGuardSelftest(guardPath);
    assert.ok(r.ok, r.checks.filter((c) => c.verdict !== 'PASS').map((c) => `${c.name}=${c.observed}`).join('; '));
  });

  console.log('\n[2] sahte Supabase');
  const fake = await startFakeSupabase(baseWorld());
  try {
    const q = (table: string, cols: string, extra = '') => getJson(`${fake.url}/rest/v1/${table}?select=${encodeURIComponent(cols)}${extra}`, AUTH);
    await t('yalnız 127.0.0.1 dinler', () => { assert.match(fake.url, /^http:\/\/127\.0\.0\.1:\d+$/); });
    await t('RLS taklidi: filtre olmasa bile yalnız published döner', async () => {
      const r = await q('notes', NOTE_COLS);
      const rows = JSON.parse(r.body) as { slug: string; status: string }[];
      assert.ok(rows.length > 0 && rows.every((x) => x.status === 'published'));
      assert.ok(!rows.some((x) => x.slug === PROBE.draftNoteSlug));
    });
    await t('tüm tablolar için kolon listeleri kabul edilir', async () => {
      for (const [tb, c] of [['projects', PROJECT_COLS], ['lab_entries', LAB_COLS], ['notes', NOTE_COLS], ['site_content_published', SITE_COLS]] as const) assert.equal((await q(tb, c, tb === 'site_content_published' ? '' : '&status=eq.published')).status, 200, tb);
      assert.equal(fake.violations.length, 0);
    });
    await t('ihlaller: select=*, yasak tablo, geçersiz anahtar, yazma → reddedilir ve kaydedilir', async () => {
      const n0 = fake.violations.length;
      assert.equal((await q('notes', '*')).status, 400);
      assert.equal((await getJson(`${fake.url}/rest/v1/note_drafts?select=slug`, AUTH)).status, 404);
      assert.equal((await getJson(`${fake.url}/rest/v1/notes?select=slug`, { apikey: 'sb_secret_x' })).status, 401);
      assert.equal((await q('notes', 'slug, created_by')).status, 400);
      const w = await new Promise<number>((res, rej) => { const rq = http.request(`${fake.url}/rest/v1/notes`, { method: 'POST', headers: AUTH }, (r) => res(r.statusCode ?? 0)); rq.on('error', rej); rq.end('{}'); });
      assert.equal(w, 405);
      assert.equal(fake.violations.length - n0, 5);
    });
    await t('hata modları: 500, 503, 401, malformed, null, empty, drop', async () => {
      for (const [m, status] of [['http500', 500], ['http503', 503], ['unauthorized', 401], ['malformed', 200], ['null', 200], ['empty', 200]] as const) {
        fake.setMode('notes', m);
        const r = await q('notes', NOTE_COLS, '&status=eq.published');
        assert.equal(r.status, status, m);
        if (m === 'malformed') assert.throws(() => JSON.parse(r.body));
        if (m === 'null') assert.equal(r.body, 'null');
        if (m === 'empty') assert.equal(r.body, '[]');
      }
      fake.setMode('notes', 'drop');
      await assert.rejects(() => q('notes', NOTE_COLS));
      fake.resetModes();
    });
    await t('hang: yanıt gelmez; releaseHung bağlantıyı keser', async () => {
      fake.setMode('notes', 'hang');
      const p = q('notes', NOTE_COLS);
      let done = false; void p.then(() => { done = true; }, () => { done = true; });
      await sleep(400);
      assert.equal(done, false);
      fake.releaseHung();
      await p.catch(() => undefined);
      fake.resetModes();
    });
    await t('değiştirilebilir fixture: başlık/durum değişikliği anında yansır', async () => {
      setTitle(fake.world, 'notes', PROBE.noteSlug, mark('v9'));
      const r = JSON.parse((await q('notes', NOTE_COLS)).body) as { slug: string; title: string }[];
      assert.equal(r.find((x) => x.slug === PROBE.noteSlug)?.title, mark('v9'));
      setStatus(fake.world, 'notes', PROBE.noteSlug, 'draft');
      const r2 = JSON.parse((await q('notes', NOTE_COLS)).body) as { slug: string }[];
      assert.ok(!r2.some((x) => x.slug === PROBE.noteSlug));
      fake.setWorld(baseWorld());
    });
    await t('fixture, GERÇEK 3B-E sağlayıcı/mapper’larıyla uyumlu (sahte sunucu üzerinden okunur)', async () => {
      const client: QueryClient = {
        from: (table) => ({
          select: (cols) => {
            const mk = (extra: string) => getJson(`${fake.url}/rest/v1/${table}?select=${encodeURIComponent(cols.replace(/\s+/g, ''))}${extra}`, AUTH).then((r) => ({ data: r.status === 200 ? (JSON.parse(r.body) as unknown[]) : null, error: r.status === 200 ? null : { code: String(r.status) } }));
            return Object.assign(mk(''), { eq: (c: string, v: string) => mk(`&${c}=eq.${v}`) });
          },
        }),
      };
      const p = createContentProvider({ source: () => 'cms', reader: () => supabaseReader(client), cache: noCache, staticContent });
      const notes = await p.getNotes();
      assert.ok(notes.some((n) => n.slug === PROBE.noteSlug), 'probe not görünmeli');
      assert.ok(!notes.some((n) => n.slug === PROBE.draftNoteSlug), 'taslak not görünmemeli');
      assert.ok((await p.getLabEntries()).some((e) => e.slug === PROBE.labSlug));
      assert.ok((await p.getProjects()).length >= 1);
      assert.ok((await p.getSiteContent()).siteConfig.name.length > 0);
      assert.equal((await p.getChromeIdentity()).from, 'cms');
    });
  } finally { await fake.close(); }

  console.log('\n[3] sandbox güvenliği');
  const tmpRoot = mkdtempSync(join(tmpdir(), 'f0-proj-'));
  try {
    // sahte proje + hassas dosyalar
    for (const d of ['src/lib', 'public', 'node_modules/next/dist/bin', '.next/server']) mkdirSync(join(tmpRoot, d), { recursive: true });
    writeFileSync(join(tmpRoot, 'package.json'), '{"name":"x"}');
    writeFileSync(join(tmpRoot, 'tsconfig.json'), '{}');
    writeFileSync(join(tmpRoot, 'src/lib/a.ts'), 'export const a = 1;');
    writeFileSync(join(tmpRoot, 'src/lib/.env.local'), 'SUPABASE_SERVICE_ROLE_KEY=SECRET-DO-NOT-COPY');
    writeFileSync(join(tmpRoot, 'src/lib/leaf.pem'), 'PEM');
    writeFileSync(join(tmpRoot, '.env.local'), 'NEXT_PUBLIC_SUPABASE_URL=https://real.supabase.co');
    writeFileSync(join(tmpRoot, '.next/server/x.js'), 'built');
    writeFileSync(join(tmpRoot, 'node_modules/next/dist/bin/next'), '#!/usr/bin/env node');
    const before = snapshotProject(tmpRoot);
    const base = createBase(tmpRoot, 'selftest');
    const v = createVariant(tmpRoot, base, 'sbx-cms', '// probe');
    await t('allowlist kopya: src ve tsconfig var; .env*, .pem, .next kopyalanmadı', () => {
      assert.ok(existsSync(join(v.dir, 'src/lib/a.ts')) && existsSync(join(v.dir, 'tsconfig.json')));
      assert.ok(!existsSync(join(v.dir, '.env.local')) && !existsSync(join(v.dir, 'src/lib/.env.local')) && !existsSync(join(v.dir, 'src/lib/leaf.pem')) && !existsSync(join(v.dir, '.next/server/x.js')));
    });
    await t('probe route yalnızca sandbox’ta; gerçek projede YOK', () => {
      assert.ok(existsSync(join(v.dir, 'src/app/f0-probe/revalidate/route.ts')));
      assert.ok(!existsSync(join(tmpRoot, 'src/app/f0-probe')));
    });
    await t('node_modules yalnızca bağlantı (kopya/kurulum yok)', () => {
      assert.ok(isLinkLike(join(v.dir, 'node_modules')), 'node_modules bağlantı olmalı (symlink/junction)');
      assert.ok(existsSync(join(v.dir, 'node_modules/next/dist/bin/next')));
      void readlinkSync;
    });
    await t('.gitignore ile sandbox git’e görünmez', () => assert.equal(readFileSync(join(tmpRoot, SANDBOX_DIRNAME, '.gitignore'), 'utf8').trim(), '*'));
    await t('clearNextCache yalnızca varyant içi .next/cache’i siler', () => {
      mkdirSync(join(v.dir, '.next/cache/fetch-cache'), { recursive: true });
      writeFileSync(join(v.dir, '.next/cache/fetch-cache/a'), '1');
      clearNextCache(v);
      assert.ok(!existsSync(join(v.dir, '.next/cache')));
      assert.ok(existsSync(join(tmpRoot, '.next/server/x.js')), 'kullanıcının .next’i korunmalı');
    });
    await t('silme reddi: işaret dosyası yok / proje dışı / .f0-sandbox dışı / başka proje', () => {
      const outside = mkdtempSync(join(tmpdir(), 'f0-out-'));
      const otherRoot = mkdtempSync(join(tmpdir(), 'f0-other-'));
      try {
        writeFileSync(join(outside, 'keep.txt'), 'x');
        assert.throws(() => safeRemoveSandbox(tmpRoot, outside), /altında değil/);
        mkdirSync(join(tmpRoot, SANDBOX_DIRNAME, 'rogue'), { recursive: true });
        assert.throws(() => safeRemoveSandbox(tmpRoot, join(tmpRoot, SANDBOX_DIRNAME, 'rogue')), /işaret dosyası/);
        assert.throws(() => safeRemoveSandbox(tmpRoot, join(tmpRoot, 'src')), /altında değil/);
        assert.throws(() => safeRemoveSandbox(tmpRoot, tmpRoot), /altında değil/);
        mkdirSync(join(otherRoot, 'node_modules'), { recursive: true });
        assert.throws(() => safeRemoveSandbox(otherRoot, base), /altında değil/);
        assert.ok(existsSync(join(outside, 'keep.txt')));
      } finally { rmSync(outside, { recursive: true, force: true }); rmSync(otherRoot, { recursive: true, force: true }); }
    });
    await t('gizli dosya denetimi AŞAMALI: copy aşamasında .next/node_modules yasak; build sonrası yalnız beklenen .next + node_modules bağlantısı serbest', () => {
      mkdirSync(join(v.dir, '.next/server'), { recursive: true });
      writeFileSync(join(v.dir, '.next/server/page.js'), 'built');
      assert.throws(() => assertNoSecretsCopied(v.dir, 'copy'), /yasak/, 'copy aşaması .next/node_modules’ü reddetmeli');
      assertNoSecretsCopied(v.dir, 'built', tmpRoot); // build sonrası beklenen durum: geçmeli
    });
    await t('gizli dosya denetimi build sonrası da gerçek sızıntıları yakalar (.env*, .pem, .git, .vercel, iç içe .next/node_modules)', () => {
      const plant = (rel: string, dir = false): string => { const p = join(v.dir, rel); if (dir) mkdirSync(p, { recursive: true }); else { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, 'x'); } return p; };
      for (const [rel, dir] of [['.env.local', false], ['.env', false], ['src/leaf.pem', false], ['src/id_rsa', false], ['.git', true], ['.vercel', true], ['src/.next', true], ['src/node_modules', true], ['public/k.key', false]] as [string, boolean][]) {
        const p = plant(rel, dir);
        assert.throws(() => assertNoSecretsCopied(v.dir, 'built', tmpRoot), /yasak/, `${rel} yakalanmalı`);
        rmSync(p, { recursive: true, force: true });
      }
      assertNoSecretsCopied(v.dir, 'built', tmpRoot);
    });
    await t('build sonrası: node_modules GERÇEK dizin (kopya) ise veya .next bağlantı ise reddedilir', () => {
      const d = mkdtempSync(join(tmpdir(), 'f0-nm-'));
      try {
        mkdirSync(join(d, 'node_modules/x'), { recursive: true });
        assert.throws(() => assertNoSecretsCopied(d, 'built', tmpRoot), /beklenen: proje node_modules/);
        const out = mkdtempSync(join(tmpdir(), 'f0-nx-'));
        try {
          rmSync(join(d, 'node_modules'), { recursive: true, force: true });
          if (!makeDirLink(out, join(d, '.next'))) notRun('build sonrası: .next bağlantıysa reddedilir', 'dizin bağlantısı kurulamadı');
          else assert.throws(() => assertNoSecretsCopied(d, 'built', tmpRoot), /sandbox içinde gerçek dizin/);
        } finally { rmSync(join(d, '.next'), { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
      } finally { rmSync(d, { recursive: true, force: true }); }
    });
    await t('sandbox src = proje src (yalnız probe rotası fark değil sayılır); değişiklik yakalanır', () => {
      assert.deepEqual(srcDifferences(tmpRoot, v.dir), []);
      const f = join(v.dir, 'src/lib/a.ts');
      writeFileSync(f, 'export const a = 999;');
      assert.deepEqual(srcDifferences(tmpRoot, v.dir), ['src/lib/a.ts (içerik farklı)']);
      copyFileSync(join(tmpRoot, 'src/lib/a.ts'), f);
      writeFileSync(join(v.dir, 'src/lib/extra.ts'), 'x');
      assert.deepEqual(srcDifferences(tmpRoot, v.dir), ['src/lib/extra.ts (yalnız sandbox’ta)']);
      rmSync(join(v.dir, 'src/lib/extra.ts'));
    });
    await t('M10 bütünlük: build sonrası sandbox (.next + node_modules bağlantısı) için gizli-dosya ve src kontrolleri PASS', async () => {
      const fk = await startFakeSupabase(baseWorld());
      try {
        const logf = join(tmpRoot, 'g.jsonl'); writeFileSync(logf, '');
        const r = integrity({ projectRoot: tmpRoot, fake: fk, guardLog: logf, startedPids: [], builds: 0, sandboxDirs: [v.dir], snapshotBefore: 'a', snapshotAfter: 'a', envFilesBefore: [], envFilesAfter: [], nextBuildPresent: false });
        const c1 = r.checks.find((c) => /gizli\/yasak dosya içermez/.test(c.name));
        const c2 = r.checks.find((c) => /sandbox kaynağı \(src\)/.test(c.name));
        assert.equal(c1?.verdict, 'PASS', String(c1?.observed)); assert.equal(c2?.verdict, 'PASS', String(c2?.observed));
        assert.ok(r.checks.some((c) => /Google Fonts alan adı/.test(c.name)));
        writeFileSync(join(v.dir, '.env.local'), 'x');
        const bad = integrity({ projectRoot: tmpRoot, fake: fk, guardLog: logf, startedPids: [], builds: 0, sandboxDirs: [v.dir], snapshotBefore: 'a', snapshotAfter: 'a', envFilesBefore: [], envFilesAfter: [], nextBuildPresent: false });
        assert.equal(bad.checks.find((c) => /gizli\/yasak dosya içermez/.test(c.name))?.verdict, 'FAIL');
        rmSync(join(v.dir, '.env.local'));
      } finally { await fk.close(); }
    });
    // Bağlantı korumaları: Windows'ta JUNCTION (ayrıcalık gerektirmez) ile; gerçek symlink ayrıca denenir, izin yoksa NOT RUN.
    {
      const outside = mkdtempSync(join(tmpdir(), 'f0-out-'));
      try {
        writeFileSync(join(outside, 'keep.txt'), 'x');
        const link = join(tmpRoot, SANDBOX_DIRNAME, 'linked');
        const kind = makeDirLink(outside, link);
        if (!kind) notRun('silme reddi: hedef bir dizin bağlantısı (junction/symlink)', 'Bu ortamda dizin bağlantısı oluşturulamadı (ne junction ne symlink). Koruma bu çalıştırmada DOĞRULANMADI.');
        else {
          await t(`silme reddi: hedef bir ${kind} (bağlantı) → reddedilir, hedef içeriği korunur`, () => {
            assert.ok(isLinkLike(link), 'isLinkLike bağlantıyı tanımalı');
            assert.throws(() => safeRemoveSandbox(tmpRoot, link), /bağlantı/);
            assert.ok(existsSync(join(outside, 'keep.txt')), 'bağlantı hedefinin içeriği silinmemeli');
            removeLink(link);
            assert.ok(!existsSync(link) && existsSync(join(outside, 'keep.txt')), 'removeLink yalnızca bağlantıyı kaldırmalı');
          });
          await t('iç bağlantı: sandbox içindeki bağlantı silinirken HEDEFİN içeriğine dokunulmaz', () => {
            const b2 = createBase(tmpRoot, 'selftest-inner');
            const v2 = createVariant(tmpRoot, b2, 'sbx-inner', null);
            const evil = join(v2.dir, 'src', 'evil-link');
            assert.ok(makeDirLink(outside, evil), 'iç bağlantı kurulamadı');
            safeRemoveSandbox(tmpRoot, b2);
            assert.ok(!existsSync(b2), 'sandbox silinmeli');
            assert.ok(existsSync(join(outside, 'keep.txt')), 'iç bağlantının hedefi korunmalı');
            assert.ok(existsSync(join(tmpRoot, 'node_modules/next/dist/bin/next')), 'node_modules hedefi korunmalı');
          });
        }
        // Gerçek symlink (Windows'ta yönetici/Developer Mode gerekir; yoksa NOT RUN — güvenlik kontrolü gevşetilmedi, yalnızca bu ek biçim sınanamadı)
        const sym = join(tmpRoot, SANDBOX_DIRNAME, 'linked-sym');
        let symOk = false;
        try { symlinkSync(outside, sym, 'dir'); symOk = true; } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          notRun('silme reddi: gerçek symlink', `symlink oluşturulamadı (${code ?? 'hata'}): ${process.platform === 'win32' ? 'Windows’ta symlink için yönetici yetkisi/Developer Mode gerekir.' : 'izin yok.'} ${kind ? `Aynı koruma ${kind} ile yukarıda ayrıca sınandı.` : 'Dizin bağlantısı hiç kurulamadığı için bağlantı koruması bu çalıştırmada DOĞRULANMADI.'}`);
        }
        if (symOk) {
          await t('silme reddi: gerçek symlink → reddedilir, hedef içeriği korunur', () => {
            assert.throws(() => safeRemoveSandbox(tmpRoot, sym), /bağlantı/);
            assert.ok(existsSync(join(outside, 'keep.txt')));
            removeLink(sym);
          });
        }
      } finally { rmSync(outside, { recursive: true, force: true }); }
    }
    await t('geçerli silme: sandbox gider, node_modules HEDEFİ yerinde kalır', () => {
      safeRemoveSandbox(tmpRoot, base);
      assert.ok(!existsSync(base));
      assert.ok(existsSync(join(tmpRoot, 'node_modules/next/dist/bin/next')), 'node_modules hedefi silinmemeli');
    });
    await t('kullanıcı dosyaları (içerik özeti) değişmedi', () => {
      const after = snapshotProject(tmpRoot);
      assert.equal(after.hash, before.hash);
      assert.deepEqual(after.envFileNames, ['.env.local']);
    });
    await t('snapshot bir değişikliği yakalar', () => {
      writeFileSync(join(tmpRoot, 'src/lib/a.ts'), 'export const a = 2;');
      assert.notEqual(snapshotProject(tmpRoot).hash, before.hash);
    });
  } finally { rmSync(tmpRoot, { recursive: true, force: true }); }

  console.log('\n[4] ortam allowlist ve güvenlik kontrolleri');
  await t('alt süreç env’i yalnız allowlist + F0 değişkenleri; hassas hiçbir şey taşınmaz', () => {
    const host: HostEnv = { PATH: '/bin', HOME: '/h', SUPABASE_URL: 'https://real.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'real', SUPABASE_SERVICE_ROLE_KEY: 'svc', HTTPS_PROXY: 'http://p', VERCEL_TOKEN: 't', GITHUB_TOKEN: 'g', NPM_TOKEN: 'n', SECRET_X: 's', RANDOM_VAR: '1', NODE_OPTIONS: '--inspect' };
    const e = buildChildEnv({ guardPath: '/g/guard.cjs', guardLog: '/l.jsonl', fakeUrl: 'http://127.0.0.1:1', contentSource: 'cms', nodeEnv: 'production', extra: { F0_PROBE_TOKEN: 'x' } }, host);
    const allowed = new Set<string>([...ENV_ALLOWLIST, 'NODE_OPTIONS', 'F0_GUARD_LOG', 'NEXT_TELEMETRY_DISABLED', 'NODE_ENV', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'CONTENT_SOURCE', 'F0_PROBE_TOKEN']);
    for (const k of Object.keys(e)) assert.ok(allowed.has(k), `beklenmeyen değişken: ${k}`);
    for (const bad of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'HTTPS_PROXY', 'VERCEL_TOKEN', 'GITHUB_TOKEN', 'NPM_TOKEN', 'SECRET_X', 'RANDOM_VAR']) assert.equal(e[bad], undefined, bad);
    assert.equal(e.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:1');
    assert.equal(e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, FAKE_KEY);
    assert.match(String(e.NODE_OPTIONS), /^--require ".*guard\.cjs"$/);
    assert.ok(!FORBIDDEN_ENV_PATTERN.test('PATH'));
  });
  await t('NODE_ENV: ana makineden devralınmaz, `extra` ile geçersiz kılınamaz; yalnızca tiplenmiş girdiden gelir', () => {
    const base = { guardPath: '/g.cjs', guardLog: 'l', fakeUrl: 'http://127.0.0.1:1', contentSource: 'cms' };
    assert.equal(buildChildEnv({ ...base, nodeEnv: 'production' }, { NODE_ENV: 'development' }).NODE_ENV, 'production');
    assert.equal(buildChildEnv({ ...base, nodeEnv: 'production', extra: { NODE_ENV: 'development' } }, {}).NODE_ENV, 'production');
    assert.equal(buildChildEnv({ ...base, nodeEnv: 'test' }, {}).NODE_ENV, 'test');
  });
  await t('Windows yolu NODE_OPTIONS içinde eğik çizgiye çevrilir ve tırnaklanır', () => {
    const e = buildChildEnv({ guardPath: 'C:\\Users\\Murat Şişman\\proj\\guard.cjs', guardLog: 'x', fakeUrl: 'http://127.0.0.1:1', contentSource: 'static', nodeEnv: 'production' }, {});
    assert.equal(e.NODE_OPTIONS, '--require "C:/Users/Murat Şişman/proj/guard.cjs"');
  });
  await t('URL kontrolü: yalnız loopback; gerçek Supabase/uzak adresler reddedilir', () => {
    assertLoopbackUrl('http://127.0.0.1:5555');
    for (const bad of ['https://abc.supabase.co', 'http://10.0.0.5:3000', 'https://example.com', 'http://127.0.0.1.supabase.co']) assert.throws(() => assertLoopbackUrl(bad), /Güvenlik/);
  });
  await t('bağımsız değişken ayrıştırma: bilinmeyen bayrak hata; varsayılan KURU çalıştırma', () => {
    assert.deepEqual(parseArgs([]), { run: false, selftest: false, quick: false, keepSandbox: false, only: null });
    assert.deepEqual(parseArgs(['--run', '--quick', '--only', 'm01, m04']).only, ['M01', 'M04']);
    assert.throws(() => parseArgs(['--yes']), /Bilinmeyen/);
  });
  await t('kaynak taraması: f0 kodu service-role/gerçek Supabase anahtarı/npm kurulum çağrısı içermez', () => {
    const files = ['run-f0.ts', 'lib/proc.ts', 'lib/sandbox.ts', 'lib/config.ts', 'lib/fontmock.ts', 'fake-supabase/server.ts', 'guard/egress-guard.cjs', 'font-mock/google-fonts-mock.cjs'];
    for (const f of files) {
      const src = readFileSync(resolve(root, 'scripts/f0', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // Kullanıcıya gösterilen kullanım metinleri (npx/npm ci) serbest; yalnızca ÇALIŞTIRMA çağrıları ve gizli bilgi desenleri yasak.
      assert.ok(!/(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(\s*[^)]*['"`](npm|npx|pnpm|yarn)(\.cmd)?['"`\s]|eyJ[A-Za-z0-9_-]{20,}|process\.env\.(NEXT_PUBLIC_SUPABASE|SUPABASE)/.test(src), `${f}: yasak desen`);
      assert.ok(!/shell:\s*true|(^|[^.\w])exec\(|execSync\(/.test(src), `${f}: shell kullanımı`);
    }
  });

  console.log('\n[4b] çevrimdışı font taklidi (Google Fonts)');
  const reqRoot = createRequire(join(root, 'package.json'));
  const mockPath = resolve(root, 'scripts/f0/font-mock/google-fonts-mock.cjs');
  const FONT_URLS = [
    'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800&display=swap',
    'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap',
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=swap',
  ];
  // Next'in CSS'ten font dosyası bulma mantığının HAFIZADAN yeniden yazımı (gerçek ayrıştırıcı DEĞİL; gerçek doğrulama kullanıcı ortamındaki build'dir)
  const findFontFiles = (css: string, subsets: string[]): { url: string; subset: string }[] => {
    const out: { url: string; subset: string }[] = []; let cur = '';
    for (const line of css.split('\n')) {
      const ns = /\/\* (.+?) \*\//.exec(line)?.[1];
      if (ns) cur = ns; else { const u = /src: url\((.+?)\)/.exec(line)?.[1]; if (u && subsets.includes(cur)) out.push({ url: u, subset: cur }); }
    }
    return out;
  };
  await t('mock: layout’taki 3 font için CSS üretir; latin + latin-ext font dosyaları bulunur; adresler .invalid (ağa çıkılamaz)', () => {
    const mock = reqRoot(mockPath) as Record<string, string | undefined>;
    for (const u of FONT_URLS) {
      const css = mock[u];
      assert.ok(css && css.includes('@font-face'), `CSS yok: ${u}`);
      const files = findFontFiles(css, ['latin', 'latin-ext']);
      assert.equal(files.length, 2, `${u}: ${files.length} dosya`);
      for (const f of files) { assert.match(f.url, /^https:\/\/fonts\.gstatic\.invalid\/.+\.woff2$/); assert.ok(!/gstatic\.com|googleapis\.com/.test(f.url)); }
    }
    assert.match(mock[FONT_URLS[0]] as string, /font-weight: 200 800;/);
    assert.match(mock[FONT_URLS[1]] as string, /font-family: 'Inter';[\s\S]*font-weight: 100 900;/);
    assert.match(mock['https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;1,700&display=swap'] as string, /font-style: italic;\s+font-weight: 700;/);
    assert.match(mock['https://fonts.googleapis.com/css2?family=Inter&display=swap'] as string, /font-weight: 400;/);
  });
  await t('mock: tanınmayan URL’ye yanıt VERMEZ (Next “Missing mocked response” ile durur, ağa çıkmaz)', () => {
    const mock = reqRoot(mockPath) as Record<string, string | undefined>;
    for (const u of ['https://example.com/x.css', 'https://fonts.googleapis.com/css?family=Inter', 'https://fonts.gstatic.com/s/inter/x.woff2', 'http://127.0.0.1:1/a', '']) assert.equal(mock[u], undefined, u);
  });
  await t('mock dosyası ağ kodu içermez (net/http/https/dns/tls/dgram/child_process/fetch yok)', () => {
    const src = readFileSync(mockPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/require\(|import\s|\bfetch\(|XMLHttpRequest|WebSocket|child_process|\bhttps?\./.test(src), 'mock ağ/dış modül kullanıyor');
  });
  await t('build ortamı = çalışma ortamı + YALNIZCA font değişkeni; `next start` ortamında font değişkeni yok; ana makine sızıntısı yok', () => {
    const input = { guardPath: '/g.cjs', guardLog: '/l', fakeUrl: 'http://127.0.0.1:9', contentSource: 'cms', nodeEnv: 'production' as const, extra: { F0_PROBE_TOKEN: 't' } };
    const host = { PATH: '/bin', SUPABASE_SERVICE_ROLE_KEY: 'svc', GITHUB_TOKEN: 'g', NEXT_FONT_GOOGLE_MOCKED_RESPONSES: '/evil.cjs' };
    const run = buildChildEnv(input, host);
    const bld = buildBuildEnv(input, '/sb/f0-font-mock/google-fonts-mock.cjs', host);
    assert.equal(run[FONT_MOCK_ENV], undefined, 'host’tan font değişkeni devralınmamalı');
    assert.deepEqual(Object.keys(bld).filter((k) => !(k in run)), [FONT_MOCK_ENV]);
    for (const k of Object.keys(run)) assert.equal(bld[k], run[k], k);
    assert.equal(bld[FONT_MOCK_ENV], '/sb/f0-font-mock/google-fonts-mock.cjs');
    assert.equal(bld.SUPABASE_SERVICE_ROLE_KEY, undefined); assert.equal(bld.GITHUB_TOKEN, undefined);
    assert.throws(() => buildBuildEnv(input, 'https://fonts.googleapis.com/mock.cjs', host), /Güvensiz/);
    assert.throws(() => buildBuildEnv(input, '/sb/other.js', host), /Güvensiz/);
  });
  await t('installFontMock: yalnız işaretli sandbox tabanına kopyalar; gerçek projeye yazmaz', () => {
    const proj = mkdtempSync(join(tmpdir(), 'f0-fm-'));
    try {
      mkdirSync(join(proj, 'node_modules'), { recursive: true });
      const b = createBase(proj, 'fm');
      const dest = installFontMock(proj, b, mockPath);
      assert.ok(dest.startsWith(b) && existsSync(dest));
      assert.equal(readFileSync(dest, 'utf8'), readFileSync(mockPath, 'utf8'));
      assert.deepEqual(readdirSync(proj).filter((n) => /font/i.test(n)), []);
      const rogue = join(proj, SANDBOX_DIRNAME, 'rogue'); mkdirSync(rogue, { recursive: true });
      assert.throws(() => installFontMock(proj, rogue, mockPath), /işaret dosyası/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });
  await t('preflightFontMock: değişkeni tanıyan Next → supported; tanımayan → unsupported (build başlatılmaz); klasör yok → unknown', () => {
    const proj = mkdtempSync(join(tmpdir(), 'f0-pf-'));
    try {
      assert.equal(preflightFontMock(proj).status, 'unknown');
      const d = join(proj, 'node_modules/next/dist/compiled/@next/font/dist/google'); mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'loader.js'), 'module.exports={}');
      assert.equal(preflightFontMock(proj).status, 'unsupported');
      writeFileSync(join(d, 'fetch-css-from-google-fonts.js'), 'if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {}');
      assert.equal(preflightFontMock(proj).status, 'supported');
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });
  await t('scanFontHosts: derleme çıktısında Google Fonts alan adını bulur (bilgi amaçlı)', () => {
    const d = mkdtempSync(join(tmpdir(), 'f0-sf-'));
    try { writeFileSync(join(d, 'a.js'), 'x https://fonts.gstatic.com/s/a.woff2'); writeFileSync(join(d, 'b.js'), 'temiz'); const r = scanFontHosts(d); assert.equal(r.hits.length, 1); assert.equal(r.files, 2); }
    finally { rmSync(d, { recursive: true, force: true }); }
  });
  await t('M00: build günlüğünde Google Fonts hatası/engel varsa infra FAIL; temiz günlükte PASS; lockfile uyarısı yalnızca bilgi', async () => {
    const mk = (output: string) => ({ code: 0, output, ms: 1, requests: [] });
    const ctxOf = (o: string): Ctx => ({ builds: { cms: mk(o), static: mk(o) }, sandboxes: { cms: { dir: 'x', name: 'c' }, static: { dir: 'x', name: 's' } } } as unknown as Ctx);
    const bad = await m00(ctxOf('F0_EGRESS_BLOCKED: tls.connect -> fonts.googleapis.com:443\nFailed to fetch `Inter` from Google Fonts.\n'));
    assert.equal(bad.checks.filter((c) => /Google Fonts erişimi/.test(c.name) && c.verdict === 'FAIL').length, 2);
    const ok = await m00(ctxOf('⚠ Warning: Next.js inferred your workspace root, but it may not be correct. We detected multiple lockfiles\n┌ ƒ /\n'));
    assert.equal(ok.checks.filter((c) => /Google Fonts erişimi/.test(c.name) && c.verdict === 'PASS').length, 2);
    const lock = ok.checks.filter((c) => /lockfile/.test(c.name));
    assert.equal(lock.length, 2); assert.ok(lock.every((c) => c.kind === 'info' && c.verdict === 'PASS'));
  });

  console.log('\n[5] rapor');
  await t('rapor: Türkçe başlıklar, özet, kapsam dışı bölümü; req FAIL düzenek geçerliliğini bozmaz', () => {
    const rs: ScenarioResult[] = [{ id: 'X', title: 't', status: 'PASS', observations: [], checks: [
      { kind: 'infra', name: 'a', expected: 'e', observed: 'o', verdict: 'PASS' },
      { kind: 'req', name: 'b', expected: 'e', observed: 'o|x', verdict: 'FAIL' },
      { kind: 'doc', name: 'c', expected: 'e', observed: 'o', verdict: 'NOT RUN' }] }];
    const s = summarize(rs);
    assert.equal(s.valid, true); assert.equal(s.reqFail, 1); assert.equal(s.docNotRun, 1);
    const md = renderMarkdown({ runId: 'r', startedAt: 's', finishedAt: 'f', node: 'v', platform: 'p', ttlSeconds: 60, quick: false, mode: 'mock', fakeUrl: 'http://127.0.0.1:1', notes: [] }, rs);
    assert.match(md, /Kapsam dışı bağlantı yolları/); assert.match(md, /MOCK uygulama/); assert.match(md, /NOT RUN/); assert.ok(md.includes('o\\|x'));
  });

  console.log('\n[5b] M08 sınıflandırıcısı (saf mantık)');
  await t('M08: statik içerik gözlenmişse, penceredeki başka DB istekleri onu "CMS" yapmaz', () => {
    assert.equal(classifyRuntimeSource({ status: 200, cmsMarker: false, staticSeen: true, dbRequests: 7 }), 'static');
    assert.equal(classifyRuntimeSource({ status: 200, cmsMarker: true, staticSeen: true, dbRequests: 0 }), 'cms');
    assert.equal(classifyRuntimeSource({ status: 500, cmsMarker: false, staticSeen: true, dbRequests: 0 }), 'error');
    assert.equal(classifyRuntimeSource({ status: 200, cmsMarker: false, staticSeen: false, dbRequests: 0 }), 'unknown');
    assert.equal(classifyRuntimeSource({ status: 200, cmsMarker: false, staticSeen: false, dbRequests: 2 }), 'cms');
    assert.equal(classifyRuntimeSource({ status: 'ERR', cmsMarker: false, staticSeen: false, dbRequests: 0 }), 'unknown');
  });

  console.log('\n[6] senaryo mantığı — MOCK uygulama (Next DEĞİL), TTL=2 sn');
  const fake2 = await startFakeSupabase(baseWorld());
  const apps: MockApp[] = [];
  try {
    const TTL = 2;
    const ctx: Ctx = {
      fake: fake2, ttl: TTL, quick: true,
      builds: { cms: { code: 0, output: '┌ ƒ /\n├ ƒ /lab\n├ ƒ /notes\n├ ƒ /notes/[slug]\n├ ƒ /lab/[slug]\n└ ƒ /projects/[slug]\n', ms: 1000, requests: [] }, static: { code: 0, output: '┌ ○ /\n', ms: 1000, requests: [] } },
      sandboxes: { cms: { dir: 'mock', name: 'cms' }, static: { dir: 'mock', name: 'static' } },
      async start(label, opts = {}) {
        const variant = opts.variant ?? 'cms';
        const app = await startMockApp({ fakeUrl: fake2.url, ttlMs: TTL * 1000, source: opts.source ?? variant, variantBuiltAs: variant, token: 'tok', diskKey: 'mock', keepCache: !!opts.keepCache });
        apps.push(app);
        return { baseUrl: app.baseUrl, port: app.port, pid: -1, logFile: label, stop: () => app.close() };
      },
      async probe(app, mode) { const r = await fetch(`${app.baseUrl}/f0-probe/revalidate?mode=${mode}`, { method: 'POST', headers: { 'x-f0-token': 'tok' } }); return { status: r.status, body: await r.text() }; },
      wait: sleep,
    };
    const results: ScenarioResult[] = await runScenarios(ctx, ['M00', 'M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09']);
    const byId = new Map(results.map((r) => [r.id, r]));
    const ck = (id: string, name: RegExp) => byId.get(id)?.checks.find((c) => name.test(c.name));
    await t('tüm senaryolar istisnasız tamamlandı (status PASS)', () => {
      for (const r of results) assert.equal(r.status, 'PASS', `${r.id}: ${r.status} ${r.observations.join(' ')} ${r.notRunReason ?? ''}`);
    });
    await t('M00: rota tablosu ayrıştırıldı; dinamik rotalar PASS', () => { assert.equal(byId.get('M00')?.checks.filter((c) => c.name.includes('dinamik') && c.verdict === 'PASS').length, 6); });
    await t('M01: yayınlanmış 200 / taslak 404 / geçersiz slug 404 / 500’de 5xx ve sızıntı yok', () => {
      const m = byId.get('M01')!;
      assert.ok(m.checks.filter((c) => c.kind === 'doc').every((c) => c.verdict === 'PASS'), m.checks.filter((c) => c.verdict === 'FAIL').map((c) => c.name).join('; '));
      assert.ok(m.checks.filter((c) => c.kind === 'req').every((c) => c.verdict === 'PASS'));
    });
    await t('M02/M03/M05: mock’ta SWR gözlemi yakalandı (belge/gereksinim FAIL bulguları üretildi)', () => {
      assert.equal(ck('M02', /TTL sonrası İLK istek/)?.verdict, 'FAIL');
      assert.equal(ck('M03', /İLK istekte görünmemeli/)?.verdict, 'FAIL');
      assert.equal(ck('M05', /SINIRSIZ/)?.verdict, 'FAIL');
      assert.ok(byId.get('M02')!.timeline && byId.get('M05')!.timeline);
    });
    await t('M04: etiketle geçersiz kılma sert miss; unpublish sonrası 404; kesintide eski içerik yok', () => {
      for (const c of byId.get('M04')!.checks.filter((x) => x.kind !== 'info')) assert.equal(c.verdict, 'PASS', c.name + ' → ' + c.observed);
    });
    await t('M06: hang → zaman aşımı yok bulgusu; 500/503/401/malformed/null/drop → 5xx', () => {
      assert.equal(ck('M06', /hang/)?.verdict, 'FAIL');
      for (const m of ['http500', 'http503', 'unauthorized', 'malformed', 'null', 'drop']) assert.equal(ck('M06', new RegExp(`mod ${m}:`))?.verdict, 'PASS', m);
    });
    await t('M08: static build + runtime cms → sessiz statik bulgusu; M09 disk önbelleği gözlemi', () => {
      const m8 = byId.get('M08')!.checks.find((c) => c.kind === 'req');
      assert.equal(m8?.verdict, 'FAIL', `M08 req gözlemi: ${m8?.observed}\nM08 info: ${byId.get('M08')!.checks.filter((c) => c.kind === 'info').map((c) => c.observed).join(' || ')}`);
      assert.ok(byId.get('M09')!.observations.length > 0, `M09 gözlemleri boş: ${JSON.stringify(byId.get('M09'))}`);
    });
    await t('sahte sunucu ihlali yok (mock uygulama yalnız izinli sorgular yaptı)', () => { assert.deepEqual(fake2.violations, []); assert.equal(fake2.stats.noStatusFilter, 0); });
    const mockOut = mkdtempSync(join(tmpdir(), 'f0-selftest-out-'));
    const md = renderMarkdown({ runId: 'selftest-mock', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), node: process.version, platform: process.platform, ttlSeconds: TTL, quick: true, mode: 'mock', fakeUrl: fake2.url, notes: ['MOCK: bu rapor yalnızca düzenek mantığını örnekler; Next.js davranışı DEĞİLDİR.'] }, results);
    writeFileSync(join(mockOut, 'F0-RESULTS-MOCK.md'), md);
    console.log(`\nMOCK örnek rapor (Next davranışı DEĞİL): ${join(mockOut, 'F0-RESULTS-MOCK.md')}`);
  } finally { for (const a of apps) await a.close().catch(() => undefined); await fake2.close(); }

  console.log(`\n${passed} PASS, ${failures.length} FAIL, ${notRuns.length} NOT RUN.`);
  for (const n of notRuns) console.log('  NOT RUN', n);
  for (const f of failures) console.log('  HATA', f);
  return failures.length ? 1 : 0;
}
