/**
 * FAZ 3B-F0 — ölçüm düzeneği orkestratörü.
 *
 *   npx tsx scripts/f0/run-f0.ts            → KURU ÇALIŞTIRMA: yalnızca ön koşulları kontrol eder ve planı yazar (hiçbir şey kopyalamaz/derlemez/başlatmaz)
 *   npx tsx scripts/f0/run-f0.ts --selftest → Next GEREKTİRMEYEN öz-testler (guard, sahte sunucu, sandbox, env allowlist, mock uygulama)
 *   npx tsx scripts/f0/run-f0.ts --run      → gerçek ölçüm (sandbox kopyası + next build + next start). YALNIZCA kullanıcı elle çalıştırır.
 *
 * Bu betik paket KURMAZ (npm/npx çağırmaz), gerçek .env* dosyalarına dokunmaz ve gerçek Supabase'e bağlanmaz.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { baseWorld } from './fake-supabase/fixtures';
import { startFakeSupabase } from './fake-supabase/server';
import { runGuardSelftest } from './guard/egress-guard-selftest';
import { assertLoopbackUrl, assertProjectRoot, buildBuildEnv, buildChildEnv, hostSensitiveNames, parseArgs, readTtlSeconds, type Args, type ChildEnv } from './lib/config';
import { installFontMock, preflightFontMock } from './lib/fontmock';
import { sleep } from './lib/http';
import { runBuild, startApp, type AppInstance } from './lib/proc';
import { renderMarkdown, summarize, type RunMeta } from './lib/report';
import { clearNextCache, createBase, createVariant, safeRemoveSandbox, SANDBOX_DIRNAME, type Sandbox } from './lib/sandbox';
import { snapshotProject } from './lib/snapshot';
import type { ScenarioResult } from './lib/types';
import { check } from './lib/types';
import type { BuildInfo, Ctx, StartOpts } from './scenarios/common';
import { runScenarios, SCENARIOS } from './scenarios';
import { integrity } from './scenarios/m10-integrity';

// tsx hem CJS hem ESM modunda çalışabilir; dosya konumu process.argv[1]'den türetilir (komut: npx tsx scripts/f0/run-f0.ts).
const HERE = resolve(process.argv[1] ?? 'scripts/f0/run-f0.ts', '..');

function dryRun(root: string, args: Args): void {
  const nextOk = existsSync(join(root, 'node_modules', 'next', 'dist', 'bin', 'next'));
  console.log('FAZ 3B-F0 KURU ÇALIŞTIRMA (hiçbir şey kopyalanmadı, derlenmedi veya başlatılmadı)\n');
  console.log(`Proje kökü            : ${root}`);
  console.log(`Node                  : ${process.version} (hedef 24; kesin sürüm kullanıcı ortamında doğrulanacak)`);
  console.log(`node_modules/next     : ${nextOk ? 'var' : 'YOK → --run çalışmaz; bu araç paket KURMAZ, önce kendiniz `npm ci` çalıştırın'}`);
  console.log(`TTL (cache.ts)        : ${readTtlSeconds(root)} sn`);
  console.log(`Taşınmayacak ana makine değişken ADLARI: ${hostSensitiveNames().join(', ') || '(yok)'}`);
  console.log(`Sandbox konumu        : ${join(root, SANDBOX_DIRNAME)} (çalışma sonunda silinir)`);
  console.log('\nSenaryolar ve tahmini süre:');
  for (const s of SCENARIOS) console.log(`  ${s.id}  ${s.est}`);
  console.log('\nGerçek ölçüm için: npx tsx scripts/f0/run-f0.ts --run   (hızlı: --quick, seçmeli: --only M01,M04)');
  void args;
}

function loadGuard(guardPath: string, log: string): void {
  const req = createRequire(join(process.cwd(), 'package.json'));
  (req(guardPath) as { install: (p: string) => void }).install(log);
}

async function measure(root: string, args: Args): Promise<number> {
  assertProjectRoot(root);
  const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!existsSync(nextBin)) {
    console.error('node_modules/next bulunamadı. Bu araç paket KURMAZ; önce kendi ortamınızda `npm ci` çalıştırın.');
    return 3;
  }
  const startedAt = new Date().toISOString();
  const runId = startedAt.replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + randomBytes(2).toString('hex');
  const reportDir = join(root, SANDBOX_DIRNAME, 'reports', runId);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(root, SANDBOX_DIRNAME, '.gitignore'), '*\n');
  const logDir = join(reportDir, 'logs');
  mkdirSync(logDir, { recursive: true });
  const guardPath = join(HERE, 'guard', 'egress-guard.cjs');
  const guardLog = join(reportDir, 'egress-guard.jsonl');
  const ttl = readTtlSeconds(root);
  const results: ScenarioResult[] = [];
  const notes: string[] = [];

  // 1) GUARD ön doğrulaması — başarısızsa ölçüm BAŞLAMAZ
  const gs = await runGuardSelftest(guardPath);
  results.push({ id: 'G00', title: 'Egress guard ön doğrulaması', status: gs.ok ? 'PASS' : 'FAIL', checks: gs.checks, observations: [] });
  if (!gs.ok) {
    console.error('GUARD DOĞRULANAMADI — ölçüm başlatılmadı.');
    const meta: RunMeta = { runId, startedAt, finishedAt: new Date().toISOString(), node: process.version, platform: process.platform, ttlSeconds: ttl, quick: args.quick, mode: 'next', fakeUrl: '(başlatılmadı)', notes: ['Guard başarısız: hiçbir sandbox/build/sunucu başlatılmadı.'] };
    writeFileSync(join(reportDir, 'F0-RESULTS.md'), renderMarkdown(meta, results));
    console.error(`Rapor: ${join(reportDir, 'F0-RESULTS.md')}`);
    return 2;
  }
  loadGuard(guardPath, guardLog); // orkestratör sürecini de koru

  // 1b) Çevrimdışı font taklidi ön denetimi (salt okunur). Next bunu tanımıyorsa build boşuna (ve ağ girişimiyle) başarısız olurdu → BAŞLATMA.
  const fp = preflightFontMock(root);
  results.push({ id: 'F00', title: 'Çevrimdışı font taklidi ön denetimi', status: fp.status === 'unsupported' ? 'FAIL' : 'PASS', checks: [check(fp.status === 'unknown' ? 'info' : 'infra', 'Next, NEXT_FONT_GOOGLE_MOCKED_RESPONSES değişkenini tanıyor', 'evet', `${fp.status}: ${fp.detail}`, fp.status !== 'unsupported')], observations: [] });
  if (fp.status === 'unsupported') {
    console.error('FONT TAKLİDİ DESTEKLENMİYOR — ölçüm başlatılmadı.');
    const meta: RunMeta = { runId, startedAt, finishedAt: new Date().toISOString(), node: process.version, platform: process.platform, ttlSeconds: ttl, quick: args.quick, mode: 'next', fakeUrl: '(başlatılmadı)', notes: ['Font ön denetimi başarısız: hiçbir sandbox/build/sunucu başlatılmadı.', fp.detail] };
    writeFileSync(join(reportDir, 'F0-RESULTS.md'), renderMarkdown(meta, results));
    console.error(`Rapor: ${join(reportDir, 'F0-RESULTS.md')}`);
    return 2;
  }

  const before = snapshotProject(root);
  const sens = hostSensitiveNames();
  if (sens.length) notes.push(`Ana makinede hassas görünen ${sens.length} değişken adı var; hiçbiri alt süreçlere TAŞINMADI (yalnızca adlar kontrol edildi, değerler okunmadı).`);

  const fake = await startFakeSupabase(baseWorld());
  let base: string | null = null;
  const started: { label: string; pid: number }[] = [];
  const sandboxes: { cms: Sandbox | null; static: Sandbox | null } = { cms: null, static: null };
  const builds: { cms: BuildInfo | null; static: BuildInfo | null } = { cms: null, static: null };
  let buildCount = 0;
  const token = randomBytes(16).toString('hex');
  try {
    assertLoopbackUrl(fake.url);
    base = createBase(root, runId);
    const probeTpl = readFileSync(join(HERE, 'probe', 'revalidate-route.ts.txt'), 'utf8');
    const fontMock = installFontMock(root, base, join(HERE, 'font-mock', 'google-fonts-mock.cjs')); // yalnız sandbox tabanında; yalnız build env'ine verilir
    sandboxes.cms = createVariant(root, base, 'sbx-cms', probeTpl);
    sandboxes.static = createVariant(root, base, 'sbx-static', null);
    const envInput = (source: string) => ({ guardPath, guardLog, fakeUrl: fake.url, contentSource: source, nodeEnv: 'production' as const, extra: { F0_PROBE_TOKEN: token } });
    const envFor = (source: string): ChildEnv => buildChildEnv(envInput(source)); // `next start`: font değişkeni YOK
    const buildEnvFor = (source: string): ChildEnv => buildBuildEnv(envInput(source), fontMock); // `next build`: + çevrimdışı font taklidi

    if (!args.only || args.only.some((o) => o !== 'M10')) {
      for (const v of ['cms', 'static'] as const) {
        const sbx = sandboxes[v];
        if (!sbx) continue;
        fake.clearLog();
        console.log(`[build] ${v} …`);
        const b = await runBuild(sbx, buildEnvFor(v), join(logDir, `build-${v}.log`));
        buildCount += 1;
        builds[v] = { code: b.code, output: b.output, ms: b.ms, requests: fake.log.map((e) => ({ table: e.table, path: e.path })) };
        console.log(`[build] ${v}: çıkış kodu ${b.code}, ${(b.ms / 1000).toFixed(0)} sn, sahte sunucuya ${fake.log.length} istek`);
      }
    }
    const buildsOk = builds.cms?.code === 0 && builds.static?.code === 0;

    const ctx: Ctx = {
      fake, ttl, quick: args.quick, builds, sandboxes,
      async start(label: string, opts: StartOpts = {}): Promise<AppInstance> {
        const variant = opts.variant ?? 'cms';
        const sbx = sandboxes[variant];
        if (!sbx) throw new Error('varyant yok: ' + variant);
        if (!opts.keepCache) clearNextCache(sbx);
        const app = await startApp(sbx, envFor(opts.source ?? variant), label, logDir, guardLog);
        started.push({ label, pid: app.pid });
        return app;
      },
      async probe(app, mode) {
        const r = await fetch(`${app.baseUrl}/f0-probe/revalidate?mode=${mode}`, { method: 'POST', headers: { 'x-f0-token': token } });
        return { status: r.status, body: await r.text() };
      },
      wait: sleep,
    };

    if (!buildsOk) {
      notes.push('Build başarısız: M00 dışındaki senaryolar çalıştırılmadı (NOT RUN).');
      results.push(...await runScenarios(ctx, ['M00']));
      for (const s of SCENARIOS.filter((x) => x.id !== 'M00')) results.push({ id: s.id, title: s.id, status: 'NOT RUN', checks: [], observations: [], notRunReason: 'Build başarısız' });
    } else {
      results.push(...await runScenarios(ctx, args.only, (r) => console.log(`[${r.id}] ${r.status} — ${r.title}`)));
    }

    const after = snapshotProject(root);
    results.push(integrity({
      projectRoot: root, fake, guardLog, startedPids: started, builds: buildCount,
      sandboxDirs: [sandboxes.cms.dir, sandboxes.static.dir], snapshotBefore: before.hash, snapshotAfter: after.hash,
      envFilesBefore: before.envFileNames, envFilesAfter: after.envFileNames, nextBuildPresent: true,
    }));
    if (args.only && !args.only.includes('M10')) notes.push(`--only kullanıldı (${args.only.join(',')}); yalnız seçilen senaryolar çalıştı.`);
  } catch (e) {
    results.push({ id: 'ERR', title: 'Orkestratör istisnası', status: 'FAIL', checks: [check('infra', 'orkestratör', 'istisnasız', (e as Error).message, false)], observations: [] });
  } finally {
    await fake.close();
    if (base && !args.keepSandbox) {
      try { safeRemoveSandbox(root, base); } catch (e) { notes.push(`Sandbox silinemedi (elle silin: ${base}): ${(e as Error).message}`); }
    } else if (base) notes.push(`--keep-sandbox: sandbox korundu → ${base}. UYARI: kök tsconfig "**/*.ts" içerdiğinden, bu klasör varken \`npm run typecheck/lint\` sandbox kopyalarını da tarar; işiniz bitince silin.`);
  }
  const meta: RunMeta = { runId, startedAt, finishedAt: new Date().toISOString(), node: process.version, platform: process.platform, ttlSeconds: ttl, quick: args.quick, mode: 'next', fakeUrl: fake.url, notes };
  writeFileSync(join(reportDir, 'F0-RESULTS.md'), renderMarkdown(meta, results));
  writeFileSync(join(reportDir, 'f0-results.json'), JSON.stringify({ meta, results, summary: summarize(results) }, null, 2));
  const sum = summarize(results);
  console.log(`\nRapor: ${join(reportDir, 'F0-RESULTS.md')}`);
  console.log(`Düzenek geçerli: ${sum.valid ? 'EVET' : 'HAYIR'} · belge FAIL ${sum.docFail} · gereksinim FAIL ${sum.reqFail} (bulgu)`);
  return sum.valid ? 0 : 2;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  if (args.selftest) {
    const { runSelftests } = await import('./selftest/run-selftest');
    process.exit(await runSelftests(root));
  }
  if (!args.run) { assertProjectRoot(root); dryRun(root, args); return; }
  process.exit(await measure(root, args));
}
main().catch((e) => { console.error(e); process.exit(1); });
