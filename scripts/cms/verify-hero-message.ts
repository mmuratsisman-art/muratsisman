/**
 * HERO ANA MESAJ TİPOGRAFİSİ (FAZ 1D-1B) REGRESYON TESTİ. Next, Supabase ve veritabanı GEREKMEZ.
 *
 *   npx tsx scripts/cms/verify-hero-message.ts
 *
 * Gerçek render: Hero.tsx kaynağı projenin kendi `typescript` paketiyle (devDependency) derlenir ve react-dom/server ile GERÇEKTEN render edilir;
 * yalnızca dış bağımlılıklar (next/link, lucide-react, @/lib/content, HeroVisual, ScrollDock) basit yedeklerle değiştirilir.
 * Derleme/render altyapısı kurulamazsa gerçek-render kontrolleri "ATLANDI" olarak raporlanır (geçti SAYILMAZ) ve test başarısız olur.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { siteConfig } from '@/data/site';
import { siteDocToFormValues } from '@/lib/cms/admin/site-form';
import { validateSiteDoc, validateSiteFriendly } from '@/lib/cms/validate/site';

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function yes(c: unknown, m: string) { if (!c) throw new Error(m); }

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const req = createRequire(join(root, 'package.json'));
const heroSrc = read('src/components/hero/Hero.tsx');
const formSrc = read('src/components/admin/SiteContentForm.tsx');

const EN = 'From real problems to working products.';
const TR = 'Gerçek problemlerden yola çıkarak yapay zekâ destekli çözümler ve kendi dijital ürünlerimi geliştiriyorum.';
const HINT = 'İlk satır büyük ana mesaj, sonraki satırlar daha küçük açıklama olarak gösterilir. Her satırı ayrı yazın (en fazla 6 satır).';
const SECONDARY = ['font-sans', 'text-base', 'font-normal', 'leading-relaxed', 'text-muted', 'sm:text-lg'];

/* ───── gerçek render altyapısı ───── */
type HeroProps = Record<string, unknown>;
type Rendered = { html: string; visualProps: HeroProps | null; dockRendered: boolean; messageKeys: string[] };
let hero: null | ((message: string[]) => Promise<Rendered>) = null;
let setupError = '';
try {
  const ts = req('typescript') as { transpileModule: (code: string, o: Record<string, unknown>) => { outputText: string }; JsxEmit: { ReactJSX: number }; ModuleKind: { CommonJS: number }; ScriptTarget: { ES2022: number } };
  const React = req('react') as { createElement: (...a: unknown[]) => unknown };
  const { renderToStaticMarkup } = req('react-dom/server') as { renderToStaticMarkup: (n: unknown) => string };
  const jsxRuntime = req('react/jsx-runtime');
  const js = ts.transpileModule(heroSrc, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  hero = async (message) => {
    let visualProps: HeroProps | null = null;
    let dockRendered = false;
    const stubs: Record<string, unknown> = {
      'react/jsx-runtime': jsxRuntime,
      'next/link': { __esModule: true, default: (p: { href: string; children?: unknown } & Record<string, unknown>) => React.createElement('a', { ...p, href: p.href }, p.children) },
      'lucide-react': { ArrowDownRight: () => React.createElement('svg', { 'data-icon': 'arrow' }) },
      '@/lib/content': {
        getSiteContent: async () => ({
          siteConfig: { hero: { ...siteConfig.hero, message } },
        }),
      },
      './HeroVisual': { __esModule: true, default: (p: HeroProps) => { visualProps = p; return React.createElement('div', { 'data-visual': true }); } },
      './ScrollDock': { __esModule: true, default: () => { dockRendered = true; return React.createElement('div', { 'data-dock': true }); } },
    };
    const mod: { exports: { default?: () => Promise<unknown> } } = { exports: {} };
    new Function('require', 'module', 'exports', js)((id: string) => { if (!(id in stubs)) throw new Error(`beklenmeyen import: ${id}`); return stubs[id]; }, mod, mod.exports);
    const tree = await mod.exports.default!();
    const html = renderToStaticMarkup(tree);
    return { html, visualProps, dockRendered, messageKeys: messageKeysOf(tree) };
  };
} catch (e) {
  setupError = (e as Error).message;
}

/** Render edilmiş React ağacında mesaj paragrafının (text-2xl) çocuklarının `key` değerleri. */
function messageKeysOf(node: unknown): string[] {
  const walk = (n: unknown): string[] | null => {
    if (!n || typeof n !== 'object') return null;
    if (Array.isArray(n)) { for (const c of n) { const r = walk(c); if (r) return r; } return null; }
    const el = n as { props?: { className?: string; children?: unknown } };
    const cn = el.props?.className;
    if (typeof cn === 'string' && cn.includes('text-2xl') && cn.includes('font-display')) {
      const kids = el.props?.children;
      return (Array.isArray(kids) ? kids.flat() : [kids]).map((k) => String((k as { key?: unknown } | null)?.key));
    }
    return walk(el.props?.children);
  };
  return walk(node) ?? [];
}

/** `<p ... font-display text-2xl ...>` mesaj bloğundaki span'lar (sınıf, metin). */
function spansOf(html: string): Array<{ cls: string; text: string }> {
  const p = html.match(/<p class="[^"]*text-2xl[^"]*">([\s\S]*?)<\/p>/);
  if (!p) throw new Error('mesaj paragrafı bulunamadı');
  return [...p[1].matchAll(/<span class="([^"]*)">([\s\S]*?)<\/span>/g)].map((m) => ({ cls: m[1], text: m[2] }));
}
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

async function main() {
  /* ───── içerik uyumluluğu (statik) ───── */
  await check('H1 statik hero mesajı canlı CMS metniyle aynı (2 satır)', () => eq(siteConfig.hero.message, [EN, TR], 'message'));
  await check('H2 statik hero geçerli: doğrulayıcı kabul eder, form gidiş-dönüşü kayıpsız', () => {
    const d = validateSiteDoc('hero', siteConfig.hero);
    yes(d.ok, d.ok ? '' : d.error);
    const raw = siteDocToFormValues('hero', siteConfig.hero);
    eq(raw.message, `${EN}\n${TR}`, 'form değeri');
    const r = validateSiteFriendly('hero', raw);
    yes(r.ok, 'form doğrulaması');
    if (r.ok) eq(r.value, siteConfig.hero, 'birebir belge');
  });
  await check('H3 diğer statik site içeriği değişmedi (eyebrow, ad, roller, düğmeler, kavramlar)', () => {
    const h = siteConfig.hero;
    eq([h.eyebrow, h.first, h.last, h.roles], ['MURAT/LAB — 2026', 'MURAT', 'ŞİŞMAN', 'Technology / AI / Infrastructure / Digital Products'], 'başlık alanları');
    eq([h.ctaPrimary, h.ctaSecondary], [{ label: 'Projeleri Keşfet', href: '/#projects' }, { label: 'Hakkımda', href: '/#about' }], 'düğmeler');
    eq(h.concepts, ['BUILD', 'LEARN', 'AUTOMATE', 'IDEAS'], 'kavramlar');
    eq(siteConfig.about.title, 'WHO IS MURAT?', 'about');
  });
  await check('H4 doğrulama kuralları değişmedi: 1–6 satır, satır başına 120 karakter', () => {
    const base = { ...siteConfig.hero };
    const ok = (message: string[]) => validateSiteDoc('hero', { ...base, message }).ok;
    yes(ok(['a']) && ok(['a', 'b']) && ok(['a', 'b', 'c', 'd', 'e', 'f']), 'geçerli sayılar reddedildi');
    yes(!ok([]) && !ok(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'sınır dışı sayı kabul edildi');
    yes(ok(['x'.repeat(120)]) && !ok(['x'.repeat(121)]) && !ok(['  ']), 'satır uzunluğu / boş satır kuralı');
    yes(/\{ min: 1, max: 6, item: 120 \}/.test(read('src/lib/cms/validate/site.ts')), 'doğrulayıcı kaynağı değişmiş');
  });
  await check('H5 yeni migration yok (0001–0007)', () => {
    const m = readdirSync(join(root, 'supabase/migrations')).filter((f) => !f.endsWith('_down.sql')).map((f) => f.slice(0, 4)).sort();
    eq(m, ['0001', '0002', '0003', '0004', '0005', '0006', '0007'], 'migrations');
  });

  /* ───── CMS formu ───── */
  await check('H6 ANA MESAJ yardım metni güncel; alan adı, satır sayısı ve diğer alanlar korunur', () => {
    yes(formSrc.includes(`hint: '${HINT}'`), 'yardım metni farklı');
    yes(/f\('message', 'message', 'ANA MESAJ', \{ area: 4,/.test(formSrc), 'ANA MESAJ alanı');
    yes(!formSrc.includes('Her satır ayrı bir satır olarak görünür'), 'eski yardım metni duruyor');
    for (const label of ['ÜST YAZI', 'ROLLER', 'KAVRAM ETİKETLERİ', 'BİRİNCİ DÜĞME · METİN', 'İKİNCİ DÜĞME · BAĞLANTI']) yes(formSrc.includes(`'${label}'`), `${label} yok`);
  });

  /* ───── Hero kaynağı ───── */
  await check('H7 kaynak: sıra tabanlı key (metin değil), ilk satır ek sınıfsız, sonrakiler ikincil', () => {
    yes(!/key=\{line\}/.test(heroSrc), 'key={line} duruyor');
    yes(/hero\.message\.map\(\(line, i\) =>/.test(heroSrc) && /key=\{i\}/.test(heroSrc), 'sıra tabanlı key yok');
    yes(/i === 0 \? 'block'/.test(heroSrc), 'ilk satır sınıfı');
    for (const c of SECONDARY) yes(heroSrc.includes(c), `ikincil sınıf yok: ${c}`);
    yes(/i === 1 \? 'mt-3' : 'mt-1\.5'/.test(heroSrc), 'boşluk kuralı');
    yes(!/from '@\/data/.test(heroSrc), '@/data import (3B-E S3)');
  });
  await check('H8 kaynak: Hero\'nun diğer bölümleri değişmedi (h1, roller, düğmeler, küre, dock, mesaj paragrafı)', () => {
    yes(/id="hero-title" className="hero-title font-display text-\[clamp\(3\.25rem,14\.5vw,9rem\)\] font-extrabold leading-\[0\.85\] tracking-tighter"/.test(heroSrc), 'h1');
    yes(/font-mono text-\[11px\] leading-relaxed tracking-\[0\.18em\] text-muted sm:text-sm">\{hero\.roles\}/.test(heroSrc), 'roller');
    yes((heroSrc.match(/data-qa="hero-cta"/g) ?? []).length === 2, 'düğmeler');
    yes(/<HeroVisual concepts=\{hero\.concepts\} \/>/.test(heroSrc) && /<ScrollDock \/>/.test(heroSrc), 'küre / dock');
    yes(/<p className="mt-8 max-w-xl font-display text-2xl font-bold leading-tight sm:text-3xl">/.test(heroSrc), 'mesaj paragrafı sınıfları');
    yes(/min-h-\[calc\(100svh-4rem\)\]/.test(heroSrc) && /animate-rise/.test(heroSrc), 'düzen/animasyon');
  });

  /* ───── gerçek render ───── */
  if (!hero) {
    failures.push(`ATLANDI (gerçek render yapılamadı, geçti sayılmaz): ${setupError}`);
    return;
  }
  const render = hero;

  await check('R1 tek satır: mevcut görünüm (tek span, yalnızca "block")', async () => {
    const { html } = await render([EN]);
    eq(spansOf(html), [{ cls: 'block', text: EN }], 'tek satır');
  });
  await check('R2 iki satır (canlı içerik): 1. satır "block", 2. satır ikincil + mt-3', async () => {
    const s = spansOf((await render([EN, TR])).html);
    eq(s.length, 2, 'span sayısı');
    eq(s[0], { cls: 'block', text: EN }, '1. satır');
    for (const c of [...SECONDARY, 'mt-3', 'block']) yes(s[1].cls.split(' ').includes(c), `2. satırda ${c} yok: ${s[1].cls}`);
    yes(!s[1].cls.includes('mt-1.5') && !s[1].cls.includes('font-bold') && !s[1].cls.includes('text-2xl'), '2. satırda yanlış sınıf');
    eq(s[1].text, TR, '2. satır metni');
  });
  await check('R3 üç satır: 2. satır mt-3, 3. satır mt-1.5 (ikisi de ikincil)', async () => {
    const s = spansOf((await render([EN, TR, 'Üçüncü.'])).html);
    yes(s[1].cls.includes('mt-3') && !s[1].cls.includes('mt-1.5'), '2. satır boşluğu');
    yes(s[2].cls.includes('mt-1.5') && !s[2].cls.includes('mt-3'), '3. satır boşluğu');
    for (const i of [1, 2]) for (const c of SECONDARY) yes(s[i].cls.split(' ').includes(c), `${i + 1}. satırda ${c} yok`);
  });
  await check('R4 altı satır (üst sınır): 1 ana + 5 ikincil, hepsi render edilir', async () => {
    const lines = ['Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı'];
    const s = spansOf((await render(lines)).html);
    eq(s.map((x) => x.text), lines, 'metinler ve sıra');
    eq(s[0].cls, 'block', 'ilk');
    yes(s.slice(1).every((x) => SECONDARY.every((c) => x.cls.split(' ').includes(c))), 'ikincil sınıflar');
    eq(s.slice(1).map((x) => x.cls.includes('mt-3')), [true, false, false, false, false], 'yalnız 2. satırda mt-3');
  });
  await check('R5 sıra değişirse kural konumsaldır: ilk satır hangisiyse o büyük olur', async () => {
    const s = spansOf((await render([TR, EN])).html);
    eq(s[0], { cls: 'block', text: TR }, 'ilk');
    yes(s[1].cls.includes('text-muted') && s[1].text === EN, 'ikinci');
  });
  await check('R6 tekrarlanan satırlarda React key çakışması yok (gerçek element ağacındaki key değerleri benzersiz)', async () => {
    const r = await render(['Aynı', 'Aynı', 'Aynı']);
    eq(spansOf(r.html).length, 3, 'üç satır render edilmeli');
    eq(r.messageKeys.length, 3, 'key sayısı');
    eq(new Set(r.messageKeys).size, 3, `key'ler benzersiz olmalı: ${JSON.stringify(r.messageKeys)}`);
    const d = await render([EN, TR]);
    eq(new Set(d.messageKeys).size, 2, 'normal içerikte de benzersiz');
  });
  await check('R7 eski statik içerik (3 satır) hâlâ sorunsuz render edilir', async () => {
    const old = ['Fikirleri deniyorum.', 'Problemleri çözüyorum.', 'Dijital şeyler üretiyorum.'];
    eq(spansOf((await render(old)).html).map((x) => x.text), old, 'eski satırlar');
  });
  await check('R8 özel karakterler kaçışlanır (XSS yok), metin korunur', async () => {
    const s = spansOf((await render(['A & B <b>x</b>', '"tırnak" & <i>'])).html);
    yes(!/<b>|<i>/.test(s.map((x) => x.text).join('')), 'ham HTML geçti');
    eq(unescape(s[0].text), 'A & B <b>x</b>', 'metin 1');
  });
  await check('R9 Hero\'nun geri kalanı değişmedi: h1, roller, iki düğme, küre etiketleri, dock', async () => {
    const r = await render([EN, TR]);
    yes(/<h1 id="hero-title" class="hero-title[^"]*"><span class="block">MURAT<\/span><span class="block">ŞİŞMAN<\/span><\/h1>/.test(r.html), 'h1');
    yes(r.html.includes('>Technology / AI / Infrastructure / Digital Products</p>'), 'roller');
    yes(r.html.includes('href="/#projects"') && r.html.includes('Projeleri Keşfet') && r.html.includes('href="/#about"') && r.html.includes('>Hakkımda</a>'), 'düğmeler');
    eq((r.visualProps as { concepts?: string[] } | null)?.concepts, ['BUILD', 'LEARN', 'AUTOMATE', 'IDEAS'], 'küre etiketleri');
    yes(r.dockRendered, 'ScrollDock');
    yes(r.html.includes('MURAT/LAB — 2026'), 'üst yazı');
  });
  await check('R10 mesaj dışındaki işaretleme, mesaj değişince DEĞİŞMEZ (tek satır ve altı satır aynı çevre)', async () => {
    const strip = (h: string) => h.replace(/(<p class="[^"]*text-2xl[^"]*">)[\s\S]*?(<\/p>)/, '$1$2');
    eq(strip((await render([EN])).html), strip((await render(['Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı'])).html), 'çevre işaretleme');
  });
}

main().then(() => {
  if (failures.length) {
    console.error(`${passed} kontrol geçti, ${failures.length} başarısız.`);
    for (const f of failures) console.error(' ✗ ' + f);
    process.exit(1);
  }
  console.log(`${passed} kontrol geçti, 0 başarısız.`);
  console.log('Tüm hero mesajı (FAZ 1D-1B) kontrolleri geçti.');
});
