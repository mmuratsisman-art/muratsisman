/**
 * Çevrimdışı font build desteği (yalnızca F0 sandbox build'leri).
 *  - Gerçek uygulamanın `src/app/layout.tsx` dosyasına DOKUNULMAZ; `next/font/google` aynen kalır.
 *  - Next'in test amaçlı `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` mekanizması kullanılır: CSS yanıtları yerel mock modülünden gelir, font dosyası içeriği yerel/belirleyicidir.
 *  - Mock modülü sandbox TABANINA (<proje>/.f0-sandbox/run-<runId>/f0-font-mock/) kopyalanır; ortam değişkeni YALNIZCA build süreçlerine verilir.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { FONT_MOCK_ENV } from './config';
import { hasMarker, isStrictlyInside } from './sandbox';

export const FONT_MOCK_FILENAME = 'google-fonts-mock.cjs';

/** Mock modülünü işaretli sandbox tabanına kopyalar; kopyanın MUTLAK yolunu döndürür. */
export function installFontMock(projectRoot: string, base: string, templatePath: string): string {
  if (!hasMarker(base)) throw new Error('installFontMock: temel klasörde geçerli işaret dosyası yok');
  if (!existsSync(templatePath)) throw new Error(`installFontMock: mock şablonu yok: ${templatePath}`);
  const dir = join(base, 'f0-font-mock');
  mkdirSync(dir, { recursive: true });
  const target = join(dir, FONT_MOCK_FILENAME);
  copyFileSync(templatePath, target);
  if (!isStrictlyInside(join(projectRoot, '.f0-sandbox'), target)) throw new Error('installFontMock: hedef .f0-sandbox dışında');
  return target;
}

export interface FontPreflight { status: 'supported' | 'unsupported' | 'unknown'; detail: string }

/**
 * Kurulu Next sürümünün font taklidi değişkenini tanıyıp tanımadığını SALT OKUNUR denetler (build'den önce).
 * 'unsupported' → build başlatılmaz (aksi hâlde Google'a çıkma girişimi olurdu; guard engeller ama ölçüm boşa giderdi).
 */
export function preflightFontMock(projectRoot: string): FontPreflight {
  const dir = join(projectRoot, 'node_modules', 'next', 'dist', 'compiled', '@next', 'font');
  if (!existsSync(dir)) return { status: 'unknown', detail: `${dir} bulunamadı; Next’in font yükleyicisi bu yolda doğrulanamadı (build yine denenir).` };
  let scanned = 0;
  const walk = (d: string, depth: number): boolean => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (depth < 6 && walk(p, depth + 1)) return true; continue; }
      if (!/\.js$/.test(e.name)) continue;
      try { if (statSync(p).size > 4_000_000) continue; } catch { continue; }
      scanned += 1;
      if (readFileSync(p, 'utf8').includes(FONT_MOCK_ENV)) return true;
    }
    return false;
  };
  if (walk(dir, 0)) return { status: 'supported', detail: `${FONT_MOCK_ENV} kurulu Next font yükleyicisinde bulundu.` };
  return { status: 'unsupported', detail: `${scanned} dosya tarandı; ${FONT_MOCK_ENV} bulunamadı. Bu Next sürümü font taklidini desteklemiyor olabilir.` };
}

/** Derleme çıktısında Google Fonts alan adı geçen dosyalar (bilgi amaçlı). */
export function scanFontHosts(nextDir: string): { files: number; hits: string[] } {
  const out = { files: 0, hits: [] as string[] };
  const walk = (d: string, depth: number): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (depth < 14 && e.name !== 'cache') walk(p, depth + 1); continue; }
      if (!/\.(js|json|html|css|txt|rsc|mjs|cjs|body|meta)$/.test(e.name)) continue;
      try { if (statSync(p).size > 8_000_000) continue; } catch { continue; }
      out.files += 1;
      if (/fonts\.(googleapis|gstatic)\.com/.test(readFileSync(p, 'utf8'))) out.hits.push(p.slice(nextDir.length));
    }
  };
  if (existsSync(nextDir)) walk(nextDir, 0);
  return out;
}

/** Mock yolu güvenli mi: mutlak, ağ adresi değil, beklenen dosya adı. */
export function assertSafeFontMockPath(p: string): void {
  if (!isAbsolute(p) || /^[a-z]+:\/\//i.test(p) || !p.endsWith(FONT_MOCK_FILENAME)) throw new Error(`Güvensiz font mock yolu: ${p}`);
}
