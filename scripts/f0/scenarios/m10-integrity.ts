import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FakeSupabase } from '../fake-supabase/server';
import { blockedRecords, readGuardLog } from '../lib/proc';
import { scanFontHosts } from '../lib/fontmock';
import { assertNoSecretsCopied } from '../lib/sandbox';
import { srcDifferences } from '../lib/snapshot';
import { check, info, type ScenarioResult } from '../lib/types';

export interface IntegrityInput {
  projectRoot: string;
  fake: FakeSupabase;
  guardLog: string;
  startedPids: { label: string; pid: number }[];
  builds: number;
  sandboxDirs: string[];
  snapshotBefore: string;
  snapshotAfter: string;
  envFilesBefore: string[];
  envFilesAfter: string[];
  nextBuildPresent: boolean;
}

const REAL_HOST = /[a-z0-9-]{8,}\.supabase\.(co|in|com|net)/i;

function scanBuildOutput(dir: string, fakeUrl: string): { files: number; real: string[]; fakeSeen: boolean } {
  const out = { files: 0, real: [] as string[], fakeSeen: false };
  const walk = (d: string, depth: number): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (depth < 14 && e.name !== 'cache') walk(p, depth + 1); continue; }
      if (!/\.(js|json|html|txt|rsc|mjs|cjs|body|meta)$/.test(e.name)) continue;
      try { if (statSync(p).size > 8_000_000) continue; } catch { continue; }
      const txt = readFileSync(p, 'utf8');
      out.files += 1;
      if (REAL_HOST.test(txt)) out.real.push(p.slice(dir.length));
      if (txt.includes(fakeUrl)) out.fakeSeen = true;
    }
  };
  walk(dir, 0);
  return out;
}

/** Düzenek bütünlüğü: bu kontroller FAIL ise TÜM ölçümler GEÇERSİZ sayılır. */
export function integrity(i: IntegrityInput): ScenarioResult {
  const r: ScenarioResult = { id: 'M10', title: 'Düzenek bütünlüğü ve yalıtım kanıtı', status: 'PASS', checks: [], observations: [] };
  const log = readGuardLog(i.guardLog);
  const loaded = new Set(log.filter((x) => x.kind === 'guard-loaded').map((x) => x.pid));
  const missing = i.startedPids.filter((s) => !loaded.has(s.pid));
  r.checks.push(check('infra', 'guard her `next start` sürecinde yüklü', '0 eksik', `${missing.length} eksik / ${i.startedPids.length}${missing.length ? ' (' + missing.map((m) => m.label).join(',') + ')' : ''}`, missing.length === 0));
  const loadedCount = log.filter((x) => x.kind === 'guard-loaded').length;
  r.checks.push(check('infra', 'guard build süreçlerinde de yüklü (en az 1 kayıt/build)', `≥ ${i.builds}`, `toplam guard-loaded kaydı: ${loadedCount}`, !i.nextBuildPresent || loadedCount >= i.builds + i.startedPids.length));
  const blocked = blockedRecords(i.guardLog);
  r.checks.push(check('infra', 'dış ağ girişimi (engellenen) sayısı', '0', `${blocked.length}${blocked.length ? ': ' + blocked.slice(0, 3).map((b) => `${b.via}->${b.host}`).join('; ') : ''}`, blocked.length === 0));
  r.checks.push(check('infra', 'sahte sunucu ihlalleri (yasak tablo, select=*, geçersiz anahtar, yazma)', '0', `${i.fake.violations.filter((v) => !/beklenmeyen-uç-nokta/.test(v)).length}`, i.fake.violations.filter((v) => !/beklenmeyen-uç-nokta/.test(v)).length === 0));
  const unexpected = i.fake.violations.filter((v) => /beklenmeyen-uç-nokta/.test(v));
  r.checks.push(info('beklenmeyen uç nokta istekleri (örn. /auth/v1)', `${unexpected.length}${unexpected.length ? ': ' + [...new Set(unexpected.map((u) => u.replace(/^#\d+ /, '')))].slice(0, 4).join(', ') : ''}`));
  r.checks.push(check('doc', 'içerik sorguları status=eq.published filtresi taşır (tüm çalıştırma)', '0 filtresiz sorgu', `${i.fake.stats.noStatusFilter} / ${i.fake.stats.contentQueries}`, i.fake.stats.noStatusFilter === 0));
  for (const d of i.sandboxDirs) {
    // Build SONRASI denetim: yalnızca kökteki `.next` (sandbox içinde gerçek dizin) ve `node_modules` (proje node_modules'üne bağlantı) beklenen girdilerdir;
    // `.env*`, `.git`, `.vercel`, *.pem, *.key ve iç içe .next/node_modules hâlâ YASAK (gizli dosya kontrolü korunur).
    const nm = d.split(/[\\/]/).pop();
    try { assertNoSecretsCopied(d, 'built', i.projectRoot); r.checks.push(check('infra', `sandbox gizli/yasak dosya içermez; .next ve node_modules beklenen biçimde (${nm})`, 'temiz', 'temiz', true)); }
    catch (e) { r.checks.push(check('infra', `sandbox gizli/yasak dosya içermez (${nm})`, 'temiz', (e as Error).message, false)); }
    const sd = srcDifferences(i.projectRoot, d);
    r.checks.push(check('infra', `sandbox kaynağı (src) proje kaynağıyla aynı; yalnız probe rotası farklı (${nm})`, '0 fark', sd.length ? sd.slice(0, 4).join('; ') : '0 fark', sd.length === 0));
    const nextDir = join(d, '.next');
    if (existsSync(nextDir)) {
      const s = scanBuildOutput(nextDir, i.fake.url);
      r.checks.push(check('infra', `derleme çıktısında gerçek Supabase alan adı yok (${d.split(/[\\/]/).pop()})`, '0 dosya', `${s.real.length} dosya (${s.files} dosya tarandı)`, s.real.length === 0));
      const fh = scanFontHosts(nextDir);
      r.checks.push(info(`derleme çıktısında Google Fonts alan adı geçen dosya (${d.split(/[\\/]/).pop()})`, `${fh.hits.length} / ${fh.files}${fh.hits.length ? ': ' + fh.hits.slice(0, 3).join(', ') : ''} (çevrimdışı font taklidi: font istekleri ağa çıkmaz; bu sayı yalnızca bilgi)`));
      r.checks.push(info(`derleme çıktısında sahte URL gömülü (${d.split(/[\\/]/).pop()})`, String(s.fakeSeen)));
    }
  }
  r.checks.push(check('infra', 'kullanıcı kaynakları/.next değişmedi (içerik özeti)', 'önce = sonra', i.snapshotBefore === i.snapshotAfter ? 'aynı' : 'FARKLI', i.snapshotBefore === i.snapshotAfter));
  r.checks.push(check('infra', '.env* dosyaları (yalnız adlar) değişmedi, hiçbiri kopyalanmadı/okunmadı', 'aynı', `${i.envFilesBefore.join(',') || '(yok)'} → ${i.envFilesAfter.join(',') || '(yok)'}`, i.envFilesBefore.join() === i.envFilesAfter.join()));
  if (r.checks.some((c) => c.kind === 'infra' && c.verdict === 'FAIL')) r.observations.push('DÜZENEK BÜTÜNLÜĞÜ BOZULDU: bu çalıştırmanın ölçümleri GEÇERSİZ sayılmalıdır.');
  return r;
}
