/**
 * İzole çalışma kopyası. Kurallar:
 *  - Kopyalama bir ALLOWLIST ile yapılır (gizli dosyalar zaten listede yoktur; ayrıca .env*, .next, node_modules, anahtar dosyaları süzgeçle de reddedilir).
 *  - node_modules KOPYALANMAZ ve kurulum YAPILMAZ: yalnızca kullanıcının mevcut node_modules klasörüne bağlantı (junction/symlink) kurulur.
 *  - Silme yalnızca <proje>/.f0-sandbox/ altında, işaret dosyası doğrulanmış klasörlerde yapılır.
 *  - Kullanıcının kaynak dosyalarına ve .next çıktısına YAZILMAZ.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const SANDBOX_DIRNAME = '.f0-sandbox';
export const MARKER_NAME = '.f0-sandbox-marker.json';
const TOOL = 'muratlab-f0';

/** Kopyalanacak üst düzey girdiler (allowlist). */
export const COPY_ALLOWLIST = ['src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.mjs', 'postcss.config.mjs', 'tailwind.config.ts', 'next-env.d.ts'];

const REJECT_BASENAME = /^(\.env.*|\.next|node_modules|\.git|\.vercel|.*\.pem|.*\.key|.*\.p12|.*\.pfx|id_rsa.*)$/i;

/** Kopyalamada BİLİNÇLİ olarak dışarıda bırakılan adlar (.env*, anahtar dosyaları, .next, node_modules, .git, .vercel …). */
export const isRejectedName = (name: string): boolean => REJECT_BASENAME.test(name);

export interface SandboxMarker { tool: string; runId: string; kind: 'base' | 'variant'; createdAt: string; projectRoot: string }

const writeMarker = (dir: string, m: SandboxMarker): void => writeFileSync(join(dir, MARKER_NAME), JSON.stringify(m, null, 2));
function readMarker(dir: string): SandboxMarker | null {
  try {
    const m = JSON.parse(readFileSync(join(dir, MARKER_NAME), 'utf8')) as SandboxMarker;
    return m && m.tool === TOOL ? m : null;
  } catch { return null; }
}

export const hasMarker = (dir: string): boolean => readMarker(dir) !== null;

/** Yol, kökün ALTINDA mı (kökün kendisi hariç)? Gerçek yola çevirip kontrol eder. */
export function isStrictlyInside(parent: string, child: string): boolean {
  const rel = relative(realpathSync(parent), realpathSync(child));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function createBase(projectRoot: string, runId: string): string {
  const base = join(projectRoot, SANDBOX_DIRNAME, `run-${runId}`);
  mkdirSync(base, { recursive: true });
  // Git'e ve araçlara görünmesin
  writeFileSync(join(projectRoot, SANDBOX_DIRNAME, '.gitignore'), '*\n');
  writeMarker(base, { tool: TOOL, runId, kind: 'base', createdAt: new Date().toISOString(), projectRoot });
  return base;
}

export interface Sandbox { dir: string; name: string }

/** Proje kökünden allowlist ile bir varyant kopyası üretir ve node_modules bağlantısını kurar. */
export function createVariant(projectRoot: string, base: string, name: string, probeTemplate: string | null): Sandbox {
  const baseMarker = readMarker(base);
  if (!baseMarker) throw new Error('createVariant: temel klasörde geçerli işaret dosyası yok');
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  for (const entry of COPY_ALLOWLIST) {
    const from = join(projectRoot, entry);
    if (!existsSync(from)) continue;
    cpSync(from, join(dir, entry), {
      recursive: true,
      dereference: false,
      filter: (src) => !REJECT_BASENAME.test(basename(src)),
    });
  }
  // Güvence: hiçbir gizli/derleme çıktısı sızmadı
  assertNoSecretsCopied(dir);
  // node_modules: yalnızca bağlantı (kurulum YOK)
  const nm = join(projectRoot, 'node_modules');
  if (!existsSync(nm)) throw new Error('node_modules bulunamadı. Bu düzenek paket KURMAZ; önce kendi ortamınızda `npm ci` çalıştırın.');
  symlinkSync(nm, join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  if (probeTemplate !== null) {
    const routeDir = join(dir, 'src', 'app', 'f0-probe', 'revalidate');
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(join(routeDir, 'route.ts'), probeTemplate);
  }
  writeMarker(dir, { tool: TOOL, runId: baseMarker.runId, kind: 'variant', createdAt: new Date().toISOString(), projectRoot });
  return { dir, name };
}

/**
 * Gizli/yasak dosya denetimi. İki AŞAMA vardır (ikisi de gerçek gizli dosya kontrolünü korur):
 *  - 'copy'  : kopya hemen sonrası — `.next` ve `node_modules` dâhil HİÇBİR yasak ad bulunamaz.
 *  - 'built' : build SONRASI — yalnızca KÖK düzeyde, BEKLENEN iki girdiye izin verilir:
 *      `.next`        → sandbox İÇİNDE gerçek dizin (bağlantı değil); içine bakılmaz (derleme çıktısı ayrıca taranır),
 *      `node_modules` → bağlantı ve hedefi `projectRoot/node_modules` (içine İNİLMEZ; bağlantı izlenmez).
 *    Bunların dışında `.env*`, `.git`, `.vercel`, *.pem, *.key … ve iç içe `.next`/`node_modules` yine YASAKTIR.
 */
export function assertNoSecretsCopied(dir: string, phase: 'copy' | 'built' = 'copy', projectRoot?: string): void {
  const bad: string[] = [];
  const walk = (d: string, depth: number): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (phase === 'built' && depth === 0 && e.name === 'node_modules') {
        let okLink = false;
        try { okLink = !!projectRoot && isLinkLike(p) && realpathSync(p).toLowerCase() === realpathSync(join(projectRoot, 'node_modules')).toLowerCase(); } catch { okLink = false; }
        if (!okLink) bad.push(p + ' (beklenen: proje node_modules’üne bağlantı)');
        continue;
      }
      if (phase === 'built' && depth === 0 && e.name === '.next') {
        if (isLinkLike(p) || !e.isDirectory()) bad.push(p + ' (beklenen: sandbox içinde gerçek dizin)');
        continue;
      }
      if (REJECT_BASENAME.test(e.name)) bad.push(p);
      else if (e.isDirectory() && !isLinkLike(p) && depth < 12) walk(p, depth + 1);
    }
  };
  walk(dir, 0);
  if (bad.length) throw new Error(`Sandbox'ta yasak dosya/dizin: ${bad.map((b) => relative(dir, b.split(' (')[0]) + (b.includes(' (') ? ' (' + b.split(' (')[1] : '')).join(', ')}`);
}

/**
 * Yol bir bağlantı mı (symlink VEYA Windows junction)? İki bağımsız kanıt kullanılır:
 *  1) lstat().isSymbolicLink()  2) realpath(yol) ≠ realpath(üst klasör)/ad  (junction/symlink bir yere işaret ediyorsa farklıdır).
 * Biri bile "bağlantı" diyorsa bağlantı sayılır (fail-closed): silme algoritması bağlantının İÇİNE asla girmez.
 */
export function isLinkLike(p: string): boolean {
  try { if (lstatSync(p).isSymbolicLink()) return true; } catch { return false; }
  try {
    const canon = (x: string): string => (process.platform === 'win32' ? x.toLowerCase() : x);
    return canon(realpathSync(p)) !== canon(join(realpathSync(dirname(p)), basename(p)));
  } catch { return false; }
}

/** Bir bağlantıyı (junction/symlink) HEDEFİNE DOKUNMADAN kaldırır. */
export function removeLink(p: string): void {
  try { unlinkSync(p); return; } catch { /* Windows junction */ }
  rmdirSync(p); // özyinelemesiz: yalnızca bağlantı kaldırılır
}

/**
 * Güvenli silme. Reddeder: proje dışı yol, <proje>/.f0-sandbox dışı yol, işaret dosyası olmayan/uyuşmayan klasör, kendisi bağlantı olan klasör.
 * node_modules bağlantısı önce, hedefi silmeden kaldırılır; sonra hedefin yerinde olduğu doğrulanır.
 */
export function safeRemoveSandbox(projectRoot: string, target: string): void {
  const sbRoot = join(projectRoot, SANDBOX_DIRNAME);
  if (!existsSync(target)) return;
  if (isLinkLike(target)) throw new Error('safeRemove: hedef bir bağlantı (symlink/junction); reddedildi');
  if (!existsSync(sbRoot) || !isStrictlyInside(sbRoot, target)) throw new Error('safeRemove: hedef <proje>/.f0-sandbox altında değil; reddedildi');
  const marker = readMarker(target);
  if (!marker) throw new Error('safeRemove: geçerli işaret dosyası yok; reddedildi');
  if (resolve(marker.projectRoot) !== resolve(projectRoot)) throw new Error('safeRemove: işaret dosyası başka bir proje köküne ait; reddedildi');
  const sentinel = join(projectRoot, 'node_modules');
  const before = existsSync(sentinel);
  // iç bağlantıları önce kaldır
  const links: string[] = [];
  const scan = (d: string, depth: number): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (isLinkLike(p)) links.push(p);
      else if (e.isDirectory() && depth < 3) scan(p, depth + 1);
    }
  };
  scan(target, 0);
  for (const l of links) { if (existsSync(l) || isLinkLike(l)) removeLink(l); }
  // Kanıt: hiçbir bağlantı kalmadan özyinelemeli silme YAPILMAZ (aksi hâlde bir hedefin içeriği silinebilir)
  const left = links.filter((l) => existsSync(l) && isLinkLike(l));
  if (left.length) throw new Error(`safeRemove: bağlantı(lar) kaldırılamadı, silme durduruldu: ${left.join(', ')}`);
  rmSync(target, { recursive: true, force: true });
  if (before && !existsSync(sentinel)) throw new Error('KRİTİK: node_modules hedefi kayboldu — silme algoritması hatalı');
  // temel klasör boş kaldıysa .f0-sandbox'ı da topla
  try { if (readdirSync(sbRoot).filter((n) => n !== '.gitignore').length === 0) rmSync(sbRoot, { recursive: true, force: true }); } catch { /* en iyi çaba */ }
}

/** Varyantın `.next/cache` klasörünü (veri önbelleği) temizler; yalnızca işaretli bir varyant içinde. */
export function clearNextCache(sbx: Sandbox): void {
  const marker = readMarker(sbx.dir);
  if (!marker || marker.kind !== 'variant') throw new Error('clearNextCache: geçerli varyant işareti yok');
  const target = join(sbx.dir, '.next', 'cache');
  if (!existsSync(target)) return;
  if (isLinkLike(target) || !isStrictlyInside(sbx.dir, target)) throw new Error('clearNextCache: güvensiz hedef');
  rmSync(target, { recursive: true, force: true });
}
