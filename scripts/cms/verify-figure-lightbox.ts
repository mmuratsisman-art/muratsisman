/**
 * BÖLÜM GÖRSELİ LIGHTBOX (FAZ 1D-2C) KAYNAK + SSR TESTİ. Next, Supabase ve veritabanı GEREKMEZ.
 *
 *   npx tsx scripts/cms/verify-figure-lightbox.ts
 *
 * Gerçek render: SectionFigure.tsx ve FigureLightbox.tsx kaynakları projenin `typescript` paketiyle derlenir, react-dom/server ile GERÇEKTEN render edilir;
 * yalnızca `next/image` ve `lucide-react` basit yedeklerle değiştirilir. Altyapı kurulamazsa gerçek-render kontrolleri "ATLANDI" raporlanır (geçti SAYILMAZ).
 * KAPSAM DIŞI (bu betikte çalışmaz): tarayıcı davranışı (odak, Escape, kaydırma kilidi, mobil görünüm), `next build`, lint, tam typecheck.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { figureSrcFrom } from '@/lib/media/public-url';

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function yes(c: unknown, m: string) { if (!c) throw new Error(m); }
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const req = createRequire(join(root, 'package.json'));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SB = 'https://abc123.supabase.co';
const FIG = { path: 'projects/yakala/overview-v2.webp', alt: 'Yakala fırsat keşif platformunun ana sayfası', width: 1600, height: 900, caption: "Yakala'nın fırsat keşif arayüzü" };
const SRC = `${SB}/storage/v1/object/public/site-media/${FIG.path}`;

type Props = Record<string, unknown>;
let renderFigure: null | ((figure: unknown, env: string | undefined) => string) = null;
let setupError = '';
try {
  const ts = req('typescript') as { transpileModule: (code: string, o: Record<string, unknown>) => { outputText: string }; JsxEmit: { ReactJSX: number }; ModuleKind: { CommonJS: number }; ScriptTarget: { ES2022: number } };
  const React = req('react') as { createElement: (...a: unknown[]) => unknown };
  const { renderToStaticMarkup } = req('react-dom/server') as { renderToStaticMarkup: (n: unknown) => string };
  const jsxRuntime = req('react/jsx-runtime');
  const compile = (src: string) => ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const run = (js: string, stubs: Record<string, unknown>) => {
    const mod: { exports: { default?: unknown } } = { exports: {} };
    new Function('require', 'module', 'exports', js)((id: string) => { if (!(id in stubs)) throw new Error(`beklenmeyen import: ${id}`); return stubs[id]; }, mod, mod.exports);
    return mod.exports.default;
  };
  const lightboxJs = compile(read('src/components/project/FigureLightbox.tsx'));
  const figureJs = compile(read('src/components/project/SectionFigure.tsx'));
  renderFigure = (figure, env) => {
    const NextImage = (p: Props) => React.createElement('img', { src: p.src, alt: p.alt, width: p.width, height: p.height, sizes: p.sizes, loading: p.loading, className: p.className });
    const icon = (name: string) => { function TestIcon() { return React.createElement('svg', { 'data-icon': name }); } return TestIcon; };
    const Lightbox = run(lightboxJs, {
      'react/jsx-runtime': jsxRuntime,
      react: req('react'),
      'next/image': { __esModule: true, default: NextImage },
      'lucide-react': { Maximize2: icon('maximize'), X: icon('x') },
    });
    const Figure = run(figureJs, {
      'react/jsx-runtime': jsxRuntime,
      'next/image': { __esModule: true, default: NextImage },
      '@/lib/media/public-url': { figureSrc: (p: string) => figureSrcFrom(env, p) },
      './FigureLightbox': { __esModule: true, default: Lightbox },
    });
    return renderToStaticMarkup(React.createElement(Figure, { figure }));
  };
} catch (e) {
  setupError = (e as Error).message;
}
const render = (figure: unknown, ...env: Array<string | undefined>) => {
  if (!renderFigure) throw new Error(`ATLANDI (geçti SAYILMAZ): gerçek render kurulamadı: ${setupError}`);
  return renderFigure(figure, env.length ? env[0] : SB);
};

async function main() {
  /* ───── Kapalı durum (sunucu HTML'i) ───── */
  await check('L1 kapalıyken: figure > (kapsayıcı) > button[aria-haspopup=dialog][aria-label=Görseli büyüt: alt] > img; figcaption yerinde', () => {
    const html = render(FIG);
    yes(html.startsWith('<figure'), 'figure ilk eleman');
    const btn = html.match(/<button[^>]*>/)?.[0] ?? '';
    yes(btn.includes('type="button"') && btn.includes('aria-haspopup="dialog"'), `düğme öznitelikleri: ${btn}`);
    yes(btn.includes(`aria-label="Görseli büyüt: ${FIG.alt}"`), 'düğme adı alt metni içermeli');
    yes(/cursor-zoom-in/.test(btn), 'zoom-in imleci');
    yes(/<button[^>]*>\s*<img /.test(html), 'img düğmenin içinde');
    yes(/<figcaption[^>]*>Yakala&#x27;nın fırsat keşif arayüzü<\/figcaption>/.test(html), 'figcaption');
  });
  await check('L2 kapalıyken büyük görsel YOK: tek <img>, dialog boş ve kapalı (ek istek/ek HTML yok); caption yalnızca figcaption\'da', () => {
    const html = render(FIG);
    eq(count(html, /<img /g), 1, '<img> sayısı');
    yes(/<dialog[^>]*><\/dialog>/.test(html), 'dialog boş olmalı');
    yes(!/<dialog[^>]*\sopen/.test(html), 'dialog kapalı olmalı (open yok)');
    yes(!/<dialog[^>]*aria-label/.test(html) && !/<dialog[^>]*aria-labelledby/.test(html), 'kapalı dialog etiketsiz');
    eq(count(html, /fırsat keşif arayüzü/g), 1, 'caption tek yerde');
    eq(count(html, /sizes="100vw"/g), 0, 'dialog görseli (sizes=100vw) kapalıyken yok');
  });
  await check('L3 sayfadaki küçük görsel V1 öznitelikleri korunur: src, alt, width/height, sizes, lazy, priority yok', () => {
    const html = render(FIG);
    const img = html.match(/<img [^>]*>/)?.[0] ?? '';
    for (const k of [`src="${SRC}"`, `alt="${FIG.alt}"`, 'width="1600"', 'height="900"', 'sizes="(min-width: 1024px) 56vw, 100vw"', 'loading="lazy"', 'h-auto w-full']) yes(img.includes(k), `img "${k}" içermiyor`);
    yes(!/priority|fetchpriority/i.test(html), 'priority yok');
  });
  await check('L4 caption yoksa figcaption yok; büyütme düğmesi yine var', () => {
    const { caption: _c, ...noCap } = FIG;
    const html = render(noCap);
    yes(!html.includes('figcaption') && html.includes('aria-haspopup="dialog"'), 'caption yok, düğme var');
  });
  await check('L5 büyütme rozeti dekoratiftir (aria-hidden) ve yalnızca hover destekleyen cihazlarda gizlenir', () => {
    const html = render(FIG);
    const span = html.match(/<span aria-hidden="true"[^>]*>/)?.[0] ?? '';
    yes(span.includes('pointer-events-none') && span.includes('[@media(hover:hover)]:opacity-0') && span.includes('group-focus-visible:opacity-100'), `rozet: ${span}`);
    yes(html.includes('data-icon="maximize"'), 'büyütme ikonu');
  });
  await check('L6 güvenli adres üretilemezse (env yok/http/geçersiz yol) ne düğme ne dialog ne görsel render edilir', () => {
    for (const env of [undefined, '', 'http://abc123.supabase.co']) eq(render(FIG, env), '', `env ${env}`);
    eq(render({ ...FIG, path: 'https://evil.example/a.png' }), '', 'doğrulanmamış yol');
    eq(render({ ...FIG, path: 'projects/../x.webp' }), '', 'traversal');
  });
  await check('L7 alt ve caption HTML-kaçışlıdır (düğme adı dahil)', () => {
    const html = render({ ...FIG, alt: '"><script>alert(1)</script>', caption: '<img src=x onerror=alert(1)>' });
    yes(!html.includes('<script') && !html.includes('<img src=x'), 'kaçışsız HTML');
  });

  /* ───── Kaynak / mimari ───── */
  const lb = read('src/components/project/FigureLightbox.tsx');
  const lbCode = stripComments(lb);
  const sf = read('src/components/project/SectionFigure.tsx');
  await check('L8 SectionFigure Server Component kalır (use client / hook yok); FigureLightbox ilk satırı \'use client\'', () => {
    yes(!/['"]use client['"]/.test(sf), 'SectionFigure use client içermemeli');
    yes(!/\b(useState|useEffect|useRef|useId|useLayoutEffect)\b/.test(stripComments(sf)), 'SectionFigure hook içermemeli');
    yes(lb.split(/\r?\n/)[0].trim() === "'use client';", 'FigureLightbox ilk satırı use client olmalı');
  });
  await check('L9 FigureLightbox URL ÜRETMEZ: figureSrc/process.env/new URL/@/data/@/lib/media yok; adres yalnızca prop', () => {
    for (const bad of ['figureSrc', 'process.env', 'new URL', '@/data', '@/lib/media', 'supabase', 'NEXT_PUBLIC']) yes(!lbCode.includes(bad), `FigureLightbox "${bad}" içermemeli`);
    yes(/interface Props\s*{[\s\S]*?src: string;/.test(lbCode), 'src prop');
  });
  await check('L10 FigureLightbox yalnızca SectionFigure tarafından kullanılır; SectionFigure yalnızca SectionBody tarafından (V1 kuralı korunur)', () => {
    const users: string[] = [];
    const walk = (dir: string) => { for (const e of readdirSync(join(root, dir), { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(e.name) && /FigureLightbox/.test(read(p)) && !p.endsWith('FigureLightbox.tsx') && !p.includes('verify-')) users.push(p); } };
    walk('src');
    eq(users, ['src/components/project/SectionFigure.tsx'], 'FigureLightbox kullanıcıları');
    yes(!lb.includes('SectionFigure'), 'FigureLightbox SectionFigure\'a atıf yapmamalı (V1 F25 kuralı)');
  });
  await check('L11 native <dialog> + showModal; özel focus trap/manuel Tab işleme YOK', () => {
    yes(lbCode.includes('<dialog') && lbCode.includes('showModal()'), 'dialog + showModal');
    yes(!/Tab['"]|keydown|keyCode|tabindex|tabIndex|focusable|querySelectorAll/i.test(lbCode), 'özel focus trap izi bulunmamalı');
    yes(!/role=["']dialog["']|aria-modal/.test(lbCode), 'native dialog: role/aria-modal elle verilmez');
  });
  await check('L12 showModal desteklenmiyorsa doğrulanmış src yeni sekmede noopener ile açılır', () => {
    yes(/typeof dialog\.showModal !== 'function'/.test(lbCode), 'özellik denetimi');
    yes(/window\.open\(src, '_blank', 'noopener,noreferrer'\)/.test(lbCode), 'window.open(src, _blank, noopener)');
    eq(count(lbCode, /window\.open\(/g), 1, 'window.open tek yerde');
  });
  await check('L13 odak: açılışta kapat düğmesi, kapanışta tetikleyici (preventScroll); Escape native (özel keydown yok)', () => {
    yes(/closeRef\.current\?\.focus\(\)/.test(lbCode), 'kapat düğmesine odak');
    yes(/triggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/.test(lbCode), 'tetikleyiciye odak dönüşü');
    yes(/onClose=\{onClose\}/.test(lbCode), 'close olayı dinleniyor (Escape dahil)');
  });
  await check('L14 kaydırma kilidi: sayaçlı, önceki inline değerleri eksiksiz geri yükler; temizlik effect\'te', () => {
    yes(/let lockCount = 0/.test(lbCode) && /lockCount \+= 1/.test(lbCode) && /lockCount -= 1/.test(lbCode), 'sayaç');
    yes(/saved = \{ overflow: el\.style\.overflow, paddingRight: el\.style\.paddingRight \}/.test(lbCode), 'önceki inline değerler saklanıyor');
    yes(/el\.style\.overflow = saved\.overflow/.test(lbCode) && /el\.style\.paddingRight = saved\.paddingRight/.test(lbCode), 'geri yükleme');
    yes(/return unlockScroll;/.test(lbCode), 'effect temizliği kilidi bırakır');
    yes(!/document\.body\.style/.test(lbCode), 'body stiline dokunulmaz');
  });
  await check('L15 arka plan kapanışı: basma VE bırakma arka planda olmalı (yanlışlıkla kapanma engeli)', () => {
    yes(/onPointerDown=\{\(e\) => \{\s*downOnBackdrop\.current = e\.target === e\.currentTarget;/.test(lbCode), 'pointerdown hedefi kaydı');
    yes(/onPointerUp=\{\(e\) => \{\s*upOnBackdrop\.current = e\.target === e\.currentTarget;/.test(lbCode), 'pointerup hedefi kaydı (click hedefi ortak atadır)');
    yes(/if \(downOnBackdrop\.current && upOnBackdrop\.current && e\.target === e\.currentTarget\)/.test(lbCode), 'click koşulu: iki uç da arka planda');
  });
  await check('L16 büyük görsel yalnızca açıkken mount edilir; next/image eager (priority yok), sizes=100vw, alt korunur; caption gösterilir; erişilebilir ad', () => {
    yes(/\{open && \(/.test(lbCode), 'içerik yalnızca open iken');
    yes(/loading="eager"/.test(lbCode) && /sizes="100vw"/.test(lbCode) && /alt=\{alt\}/.test(lbCode), 'görsel öznitelikleri');
    yes(!/priority|unoptimized|dangerouslySetInnerHTML/.test(lbCode), 'yasak öznitelikler');
    yes(/\{caption && \(\s*<p id=\{captionId\}/.test(lbCode), 'caption dialog içinde');
    yes(/aria-labelledby=\{open && caption \? captionId : undefined\}/.test(lbCode) && /aria-label=\{open && !caption \?/.test(lbCode), 'dialog adı (caption veya alt)');
    yes(/aria-label="Kapat"/.test(lbCode), 'Kapat düğmesi adı');
  });
  await check('L17 mobil/kapsam: 44px kapat düğmesi, safe-area, dvh yedekli yükseklik, animasyon/transition-transform/keyframe yok', () => {
    yes(/h-11 w-11/.test(lbCode) && /env\(safe-area-inset-top\)/.test(lbCode), 'dokunma hedefi + safe-area');
    yes(/\[--lb-h:100vh\]/.test(lbCode) && /\[@supports\(height:100dvh\)\]:\[--lb-h:100dvh\]/.test(lbCode), 'vh → dvh yedeği');
    yes(!/animate-|keyframes|duration-|ease-/.test(lbCode), 'animasyon yok');
    yes(/pinch-zoom/.test(lbCode) && /overscroll-contain/.test(lbCode), 'pinch-zoom serbest, kaydırma zinciri kapalı');
  });
  await check('L18 kapsam: yeni paket/migration/config değişikliği yok (next.config, package.json, validator, tipler V1\'deki gibi)', () => {
    const m = readdirSync(join(root, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith('_down.sql')).map((f) => f.slice(0, 4)).sort();
    eq(m, ['0001', '0002', '0003', '0004', '0005', '0006', '0007'], 'migrations');
    const deps = Object.keys((JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies);
    for (const d of ['lucide-react', 'next', 'react']) yes(deps.includes(d), `${d} bağımlılığı`);
    yes(!/lightbox|yet-another|photoswipe|swiper|react-modal|headlessui/i.test(deps.join(' ')), 'yeni galeri/modal paketi yok');
    yes(read('next.config.mjs').includes("pathname: '/storage/v1/object/public/site-media/projects/**'"), 'remotePatterns V1\'deki gibi');
  });

  if (!renderFigure) failures.push(`ATLANDI (geçti SAYILMAZ): gerçek render altyapısı kurulamadı: ${setupError}`);
  if (failures.length) {
    console.error(`\n${passed} kontrol geçti, ${failures.length} BAŞARISIZ/ATLANDI:`);
    for (const f of failures) console.error(' ✗ ' + f);
    process.exit(1);
  }
  console.log(`${passed} kontrol geçti, 0 başarısız.`);
  console.log('Tüm figure lightbox (FAZ 1D-2C) kaynak/SSR kontrolleri geçti. Tarayıcı davranışı bu betikte SINANMAZ.');
}
main().catch((e) => { console.error(e); process.exit(1); });
