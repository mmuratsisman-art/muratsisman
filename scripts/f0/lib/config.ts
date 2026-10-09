import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Sahte Supabase'in kabul ettiği SAHTE anahtar (gerçek anahtar değildir; JWT biçimi taşımaz). */
export const FAKE_KEY = 'sb_publishable_f0_fake_key_not_real';

/** Alt süreçlere geçirilebilen TEK ana makine değişkenleri (açık allowlist). Başka hiçbir şey miras alınmaz. */
export const ENV_ALLOWLIST = [
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'COMSPEC', 'ComSpec',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'LANG', 'LC_ALL',
] as const;

/** Adı bunlardan birini içeren değişken ASLA taşınmaz (allowlist'e girse bile; savunma derinliği). */
export const FORBIDDEN_ENV_PATTERN = /SUPABASE|SERVICE_ROLE|SECRET|PASSWORD|TOKEN|API_?KEY|ANON|VERCEL|GITHUB|NPM_|PROXY/i;

/** Next'in test amaçlı Google Fonts taklit değişkeni. YALNIZCA sandbox build süreçlerine verilir. */
export const FONT_MOCK_ENV = 'NEXT_FONT_GOOGLE_MOCKED_RESPONSES';

export interface ChildEnvInput {
  guardPath: string;
  guardLog: string;
  fakeUrl: string;
  contentSource: string;
  nodeEnv: NodeEnvName;
  extra?: Record<string, string>;
}

/**
 * Ana makine ortamı (YALNIZCA OKUNUR sözlük). `NodeJS.ProcessEnv` yerine bilinçli olarak kendi tipimiz:
 * Next.js `ProcessEnv`'e zorunlu + salt okunur `NODE_ENV` ekler (next/types/global.d.ts); düz sözlükler ve boş nesneler bu yüzden derlenmezdi.
 */
export type HostEnv = { readonly [name: string]: string | undefined };

export type NodeEnvName = 'production' | 'development' | 'test';

/**
 * Alt sürecin ortamı. NODE_ENV açıkça ve zorunlu olarak tiplidir (ana makineden ASLA devralınmaz); geri kalanı allowlist + F0 değişkenleridir.
 * `NodeJS.ProcessEnv`'e atanabilir (spawn/spawnSync kabul eder), Next'in genişletmesi olsa da olmasa da derlenir.
 */
export type ChildEnv = { readonly NODE_ENV: NodeEnvName; readonly [name: string]: string | undefined };

export function buildChildEnv(input: ChildEnvInput, host: HostEnv = process.env): ChildEnv {
  const env: Record<string, string> = {}; // yalnızca bu fonksiyon içinde değiştirilebilir; dışarıya salt okunur ChildEnv döner
  for (const k of ENV_ALLOWLIST) {
    const v = host[k];
    if (v !== undefined && !FORBIDDEN_ENV_PATTERN.test(k)) env[k] = v;
  }
  // NODE_OPTIONS: yolda boşluk olabilir → tırnakla; ters eğik çizgiler eğik çizgiye çevrilir.
  const g = input.guardPath.replace(/\\/g, '/');
  env.NODE_OPTIONS = `--require "${g}"`;
  env.F0_GUARD_LOG = input.guardLog;
  env.NEXT_TELEMETRY_DISABLED = '1';
  env.NEXT_PUBLIC_SUPABASE_URL = input.fakeUrl;
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = FAKE_KEY;
  env.CONTENT_SOURCE = input.contentSource;
  for (const [k, v] of Object.entries(input.extra ?? {})) env[k] = v;
  // NODE_ENV en SON ve yalnızca girdideki tiplenmiş değerle atanır: ne ana makineden ne de `extra` ile geçersiz kılınabilir.
  return { ...env, NODE_ENV: input.nodeEnv };
}

/** Proje kökünü doğrular (salt okunur). */
export function assertProjectRoot(root: string): void {
  const need = ['package.json', 'src/lib/content/index.ts', 'src/lib/content/cache.ts', 'next.config.mjs'];
  for (const f of need) if (!existsSync(join(root, f))) throw new Error(`Proje kökü geçersiz: ${f} bulunamadı (FAZ 3B-E uygulanmış bir ağaç bekleniyor).`);
}

/** TTL'yi uygulama kaynağından OKUR (varsayım yapmaz). */
export function readTtlSeconds(root: string): number {
  const src = readFileSync(join(root, 'src/lib/content/cache.ts'), 'utf8');
  const m = /CMS_REVALIDATE_SECONDS\s*=\s*(\d+)/.exec(src);
  if (!m) throw new Error('CMS_REVALIDATE_SECONDS cache.ts içinde bulunamadı');
  return Number(m[1]);
}

export interface Args {
  run: boolean;
  selftest: boolean;
  quick: boolean;
  keepSandbox: boolean;
  only: string[] | null;
}
export function parseArgs(argv: string[]): Args {
  const a: Args = { run: false, selftest: false, quick: false, keepSandbox: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--run') a.run = true;
    else if (x === '--selftest') a.selftest = true;
    else if (x === '--quick') a.quick = true;
    else if (x === '--keep-sandbox') a.keepSandbox = true;
    else if (x === '--only') a.only = (argv[++i] ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else throw new Error(`Bilinmeyen bağımsız değişken: ${x}`);
  }
  return a;
}

/** Test ortamına verilecek URL yalnızca loopback olabilir ve hiçbir gerçek Supabase alan adı içeremez. */
export function assertLoopbackUrl(u: string): void {
  const x = new URL(u);
  if (!['127.0.0.1', '[::1]', '::1', 'localhost'].includes(x.hostname)) throw new Error(`Güvenlik: sahte Supabase URL'si loopback değil (${x.hostname}). Ölçüm başlatılmadı.`);
  if (/supabase\.(co|in|com|net)/i.test(u)) throw new Error('Güvenlik: URL gerçek Supabase alan adı içeriyor. Ölçüm başlatılmadı.');
}

/** Ana makinede tanımlı ve alt süreçlere TAŞINMAYACAK hassas görünen değişkenlerin yalnızca ADLARI (değerleri okunmaz/raporlanmaz). */
export function hostSensitiveNames(host: HostEnv = process.env): string[] {
  return Object.keys(host).filter((k) => FORBIDDEN_ENV_PATTERN.test(k)).sort();
}

/**
 * BUILD süreci ortamı = çalışma ortamı + yalnızca çevrimdışı font taklit değişkeni.
 * (`next start` ortamına bu değişken VERİLMEZ; böylece çalışma zamanı davranışı font çözümünden etkilenmez.)
 */
export function buildBuildEnv(input: ChildEnvInput, fontMockPath: string, host: HostEnv = process.env): ChildEnv {
  if (/^[a-z]+:\/\//i.test(fontMockPath) || !fontMockPath.endsWith('google-fonts-mock.cjs')) throw new Error(`Güvensiz font mock yolu: ${fontMockPath}`);
  return buildChildEnv({ ...input, extra: { ...(input.extra ?? {}), [FONT_MOCK_ENV]: fontMockPath } }, host);
}
