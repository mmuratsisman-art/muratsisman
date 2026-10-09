/**
 * MURAT/LAB FAZ 3B-B — deterministik içerik import aracı (komut satırı).
 *   npx tsx scripts/cms/import/cli.ts <komut> [seçenekler]      (ayrıntı: docs/cms/IMPORT.md)
 *
 * Komutlar:
 *   sql-snapshot [--no-provenance]                         salt-okunur hedef anlık görüntüsü SQL'ini yazdırır
 *   dry-run  (--offline | --snapshot <dosya> | --live) [--out <dizin>]
 *   apply    --plan <plan.json> --confirm <APPLY-…> --yes-write [--out <dizin>]     (admin oturumu, GERÇEK YAZMA)
 *   verify   (--snapshot <dosya> | --live) [--out <dizin>]
 *   rollback-plan (--snapshot <dosya> | --live) [--out <dizin>]
 *   rollback --plan <rollback-plan.json> --confirm <ROLLBACK-…> --yes-write [--out <dizin>]
 *
 * --live: IMPORT_SUPABASE_URL, IMPORT_SUPABASE_KEY (yayınlanabilir anahtar), IMPORT_ADMIN_EMAIL, IMPORT_ADMIN_PASSWORD
 * (parola yoksa gizli istem). Service-role anahtarı reddedilir. Hiçbir kimlik bilgisi yazdırılmaz/raporlanmaz.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { applyPlan } from './executor';
import { applyToken, buildPlan } from './planner';
import { renderApplyMarkdown, renderPlanMarkdown, renderRollbackMarkdown, renderVerifyMarkdown } from './report';
import { applyRollback, planRollback, rollbackToken, type RollbackPlan } from './rollback';
import { emptySnapshot, normalizeSnapshot, snapshotSql } from './snapshot';
import { buildSource } from './source';
import { connectSupabase } from './supabase-target';
import type { ImportTarget } from './target';
import type { Plan, TargetSnapshot } from './types';
import { verifyImport } from './verify';

type Args = { cmd: string; flags: Map<string, string | true> };
function parseArgs(argv: string[]): Args {
  const [cmd = '', ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`Beklenmeyen argüman: ${a}`);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) { flags.set(a.slice(2), next); i++; } else flags.set(a.slice(2), true);
  }
  return { cmd, flags };
}
const flag = (a: Args, n: string): string | undefined => { const v = a.flags.get(n); return typeof v === 'string' ? v : undefined; };
const has = (a: Args, n: string) => a.flags.has(n);

function outDir(a: Args, now: string): string {
  const d = resolve(flag(a, 'out') ?? join('import-reports', now.replace(/[:.]/g, '-')));
  mkdirSync(d, { recursive: true });
  return d;
}
const write = (dir: string, name: string, content: string) => { writeFileSync(join(dir, name), content, 'utf8'); console.log(`  yazıldı: ${join(dir, name)}`); };

async function askHidden(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const w = (rl as unknown as { _writeToOutput: (s: string) => void });
  return new Promise((res) => {
    rl.question(prompt, (v) => { rl.close(); process.stdout.write('\n'); res(v); });
    w._writeToOutput = () => undefined;
  });
}
async function connect(): Promise<ImportTarget> {
  const url = process.env.IMPORT_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.IMPORT_SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.IMPORT_ADMIN_EMAIL;
  if (!url || !key || !email) throw new Error('--live için IMPORT_SUPABASE_URL, IMPORT_SUPABASE_KEY ve IMPORT_ADMIN_EMAIL gerekli (parola: IMPORT_ADMIN_PASSWORD ya da gizli istem).');
  const password = process.env.IMPORT_ADMIN_PASSWORD ?? (await askHidden('Admin parolası (görünmez): '));
  return connectSupabase({ url, key, email, password });
}
async function loadSnapshot(a: Args): Promise<{ snap: TargetSnapshot; target: ImportTarget | null; mode: string }> {
  if (has(a, 'offline')) return { snap: emptySnapshot(true), target: null, mode: 'offline (boş hedef varsayımı; çakışma denetimi YAPILMAZ)' };
  const f = flag(a, 'snapshot');
  if (f) return { snap: normalizeSnapshot(JSON.parse(readFileSync(resolve(f), 'utf8'))), target: null, mode: `snapshot dosyası (${f})` };
  if (has(a, 'live')) { const t = await connect(); return { snap: await t.readSnapshot(), target: t, mode: 'canlı salt-okunur okuma (admin oturumu)' }; }
  throw new Error('Hedef durumu için --offline, --snapshot <dosya> veya --live verin.');
}
const needWrite = (a: Args) => { if (!has(a, 'yes-write')) throw new Error('Bu komut hedefe YAZAR. Onaylıyorsanız --yes-write ekleyin.'); };

async function main(): Promise<number> {
  const a = parseArgs(process.argv.slice(2));
  const now = new Date().toISOString();
  const bundle = buildSource();

  switch (a.cmd) {
    case 'sql-snapshot': {
      process.stdout.write(snapshotSql({ provenance: !has(a, 'no-provenance') }));
      return 0;
    }
    case 'dry-run': {
      const { snap, mode } = await loadSnapshot(a);
      const plan = buildPlan(bundle, snap, { now });
      const dir = outDir(a, now);
      write(dir, 'plan.json', JSON.stringify(plan, null, 2));
      write(dir, 'pre-import-report.md', renderPlanMarkdown(plan, `Import öncesi (dry-run) raporu — hedef: ${mode}`));
      const c = plan.counts;
      console.log(`DRY-RUN (hiçbir şey yazılmadı) — kaynak ${c.source} · hedefte ${c.targetBefore} · eklenecek ${c.create} · devam ${c.resume} · atlanacak ${c.skip} · çakışan ${c.conflict} · doğrulanamayan ${c.unverifiable}`);
      console.log(plan.canApply ? `Uygulanabilir. Onay belirteci: ${applyToken(plan)}` : `UYGULANAMAZ (${plan.blockers.length} engel). Ayrıntı: pre-import-report.md`);
      return plan.canApply ? 0 : 2;
    }
    case 'apply': {
      needWrite(a);
      const planFile = flag(a, 'plan'); const confirm = flag(a, 'confirm');
      if (!planFile || !confirm) throw new Error('apply için --plan <plan.json> ve --confirm <belirteç> gerekli.');
      const approved = JSON.parse(readFileSync(resolve(planFile), 'utf8')) as Plan;
      const target = await connect();
      const result = await applyPlan({ target, bundle, approved, confirm });
      const dir = outDir(a, now);
      write(dir, 'apply-result.json', JSON.stringify(result, null, 2));
      write(dir, 'apply-result.md', renderApplyMarkdown(result));
      if (!result.refused) {
        const post = verifyImport(bundle, await target.readSnapshot(), new Date().toISOString());
        write(dir, 'post-import-verification.json', JSON.stringify(post, null, 2));
        write(dir, 'post-import-report.md', renderVerifyMarkdown(post));
        console.log(`APPLY ${result.ok ? 'BAŞARILI' : 'DURDURULDU'} · doğrulama: ${post.ok ? 'TÜM KAYITLAR DOĞRULANDI' : 'BAŞARISIZ'}`);
        return result.ok && post.ok ? 0 : 3;
      }
      console.error(`APPLY REDDEDİLDİ (hiçbir yazma yapılmadı): ${result.refused}`);
      return 3;
    }
    case 'verify': {
      const { snap } = await loadSnapshot(a);
      const rep = verifyImport(bundle, snap, now);
      const dir = outDir(a, now);
      write(dir, 'verification.json', JSON.stringify(rep, null, 2));
      write(dir, 'verification-report.md', renderVerifyMarkdown(rep, 'Doğrulama raporu'));
      console.log(`VERIFY ${rep.ok ? 'OK' : 'BAŞARISIZ'} · cutover engeli: ${rep.cutoverBlockers.length}`);
      return rep.ok ? 0 : 2;
    }
    case 'rollback-plan': {
      const { snap } = await loadSnapshot(a);
      const rp = planRollback(snap, now);
      const dir = outDir(a, now);
      write(dir, 'rollback-plan.json', JSON.stringify(rp, null, 2));
      write(dir, 'rollback-plan.md', renderRollbackMarkdown(rp));
      if (rp.siteSql) write(dir, 'rollback-site-content.sql', rp.siteSql);
      console.log(`ROLLBACK PLANI (hiçbir şey silinmedi). Onay belirteci: ${rollbackToken(rp)}`);
      return 0;
    }
    case 'rollback': {
      needWrite(a);
      const planFile = flag(a, 'plan'); const confirm = flag(a, 'confirm');
      if (!planFile || !confirm) throw new Error('rollback için --plan <rollback-plan.json> ve --confirm <belirteç> gerekli.');
      const approved = JSON.parse(readFileSync(resolve(planFile), 'utf8')) as RollbackPlan;
      const target = await connect();
      const res = await applyRollback({ target, approved, confirm });
      const dir = outDir(a, now);
      write(dir, 'rollback-result.json', JSON.stringify(res, null, 2));
      console.log(res.ok ? 'ROLLBACK tamam (site belgeleri için SQL dosyasını elle çalıştırın).' : `ROLLBACK ${res.refused ? `REDDEDİLDİ: ${res.refused}` : 'DURDURULDU'}`);
      return res.ok ? 0 : 3;
    }
    default:
      console.error('Komutlar: sql-snapshot | dry-run | apply | verify | rollback-plan | rollback  (docs/cms/IMPORT.md)');
      return 1;
  }
}
main().then((c) => process.exit(c), (e: Error) => { console.error(`HATA: ${e.message}`); process.exit(1); });
