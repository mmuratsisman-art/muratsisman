import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { isRejectedName } from './sandbox';

/** Kullanıcının gerçek kaynaklarının parmak izi: içerik özeti (src, public, scripts, kök yapılandırma dosyaları) + .next için yalnızca (yol|boyut|mtime). */
const CONTENT_ROOTS = ['src', 'public', 'scripts', 'supabase', 'docs'];
const CONTENT_FILES = ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.mjs', 'postcss.config.mjs', 'tailwind.config.ts', 'eslint.config.mjs', '.gitignore'];

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
}

export function snapshotProject(root: string): { hash: string; files: number; hasNext: boolean; envFileNames: string[] } {
  const h = createHash('sha256');
  let files = 0;
  const list: string[] = [];
  for (const d of CONTENT_ROOTS) walk(join(root, d), list);
  for (const f of CONTENT_FILES) if (existsSync(join(root, f))) list.push(join(root, f));
  list.sort();
  for (const p of list) {
    h.update(relative(root, p).replace(/\\/g, '/') + '\0');
    h.update(createHash('sha256').update(readFileSync(p)).digest());
    files += 1;
  }
  const nextDir = join(root, '.next');
  const hasNext = existsSync(nextDir);
  if (hasNext) {
    const nl: string[] = [];
    walk(nextDir, nl);
    nl.sort();
    for (const p of nl) { const st = lstatSync(p); h.update(`${relative(root, p)}|${st.size}|${Math.floor(st.mtimeMs)}\n`); files += 1; }
  }
  // .env* dosyalarının yalnızca ADLARI (içerikleri OKUNMAZ)
  const envFileNames = existsSync(root) ? readdirSync(root).filter((n) => /^\.env/i.test(n)).sort() : [];
  h.update('env:' + envFileNames.join(','));
  return { hash: h.digest('hex'), files, hasNext, envFileNames };
}

/**
 * Sandbox `src` ağacı proje `src` ağacıyla AYNI mı? (font çözümü dâhil hiçbir kaynak değişikliği yapılmadığının kanıtı)
 * Yalnızca sandbox'a özgü probe rotası (src/app/f0-probe) beklenen farktır.
 */
export function srcDifferences(projectRoot: string, sandboxDir: string): string[] {
  const hashes = (root: string): Map<string, string> => {
    const m = new Map<string, string>();
    const list: string[] = [];
    walk(join(root, 'src'), list);
    // Projede bulunup kopyalamada BİLİNÇLİ reddedilen dosyalar (.env*, *.pem …) fark sayılmaz; sandbox'ta bulunmamaları gerekir.
    for (const p of list) if (!isRejectedName(basename(p))) m.set(relative(root, p).replace(/\\/g, '/'), createHash('sha256').update(readFileSync(p)).digest('hex'));
    return m;
  };
  const a = hashes(projectRoot);
  const b = hashes(sandboxDir); // sandbox'ta reddedilen ad VARSA ayrıca aşağıda (assertNoSecretsCopied) yakalanır
  const diff: string[] = [];
  for (const [k, v] of a) { if (b.get(k) !== v) diff.push(`${k} (${b.has(k) ? 'içerik farklı' : 'sandbox’ta yok'})`); }
  for (const k of b.keys()) { if (!a.has(k) && !k.startsWith('src/app/f0-probe/')) diff.push(`${k} (yalnız sandbox’ta)`); }
  return diff.sort();
}
