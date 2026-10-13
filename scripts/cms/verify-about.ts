/**
 * ABOUT 2.0 REGRESYON TESTİ. Next, Supabase ve veritabanı GEREKMEZ (saf fonksiyonlar, kaynak taraması, mevcut doğrulayıcı).
 *
 *   npx tsx scripts/cms/verify-about.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ABOUT_AREAS, ABOUT_EYEBROW, ABOUT_LINKS, ABOUT_PHOTO, ABOUT_SLOGAN, aboutParagraphs } from '@/components/sections/about-content';
import { siteConfig } from '@/data/site';
import { validateSiteDoc } from '@/lib/cms/validate/site';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function yes(c: unknown, m: string) { if (!c) throw new Error(m); }

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const about = read('src/components/sections/About.tsx');
const visual = read('src/components/sections/AboutVisual.tsx');
const data = read('src/components/sections/about-content.ts');

// ── içerik ──
check('A1 başlık ve üst etiket', () => { eq(siteConfig.about.title, 'WHO IS MURAT?', 'title'); eq(ABOUT_EYEBROW, 'ABOUT / MURAT/LAB', 'eyebrow'); });
check('A2 onaylı giriş metni (3 paragraf)', () => {
  eq(aboutParagraphs(siteConfig.about.text), [
    'Fikirleri çalışan dijital ürünlere dönüştürmeyi seviyorum.',
    'Teknoloji, yapay zekâ ve otomasyon benim için yalnızca araçlar. Asıl ilgilendiğim şey, gerçek bir problemi anlamak ve ona işe yarayan bir çözüm geliştirmek.',
    'MURAT/LAB ise bu fikirleri denediğim, geliştirdiğim ve hayata geçirdiğim kişisel çalışma alanım.',
  ], 'text');
});
check('A3 statik metin mevcut CMS doğrulayıcısından geçer (şema genişletilmedi)', () => {
  const r = validateSiteDoc('about', { title: siteConfig.about.title, text: siteConfig.about.text });
  yes(r.ok, 'about doğrulaması başarısız');
  yes(siteConfig.about.text.length <= 600, '600 karakter sınırı');
});
check('A4 eski tek cümlelik CMS metni tek paragraf olur; boş/CRLF güvenli', () => {
  eq(aboutParagraphs('Tek cümle.'), ['Tek cümle.'], 'tek');
  eq(aboutParagraphs('A\r\n\r\nB'), ['A', 'B'], 'crlf');
  eq(aboutParagraphs('  \n \n'), [], 'boş');
});
check('A5 dört çalışma alanı, onaylı sırayla', () => eq(ABOUT_AREAS.map((a) => [a.label, a.text]), [
  ['AI TOOLS', 'Yapay zekâ destekli araçlar ve asistanlar'],
  ['AUTOMATION', 'İş süreçlerini kolaylaştıran otomasyonlar'],
  ['DIGITAL PRODUCTS', 'Web uygulamaları ve dijital ürünler'],
  ['OPERATIONS', 'Teknik destek, süreç ve kalite geliştirme'],
], 'areas'));
check('A6 slogan ve alt metin', () => eq(ABOUT_SLOGAN, { lead: 'IDEAS INTO', accent: 'REALITY.', note: 'Fikirden çalışan ürüne.' }, 'slogan'));
check('A7 iki bağlantı: /#projects ve /lab', () => eq(ABOUT_LINKS.map((l) => l.href), ['/#projects', '/lab'], 'links'));
check('A8 fotoğraf ayarı varsayılan null (sahte fotoğraf yok)', () => eq(ABOUT_PHOTO, null, 'photo'));

// ── bileşen kaynağı ──
check('B1 id="about" ve aria-labelledby korunur, başlık id\'si uyumlu', () => {
  yes(about.includes('<section id="about" aria-labelledby="about-title"'), 'section');
  yes(about.includes('id="about-title"'), 'title id');
});
check('B2 başlık ve metin CMS kaynağından (getSiteContent), kodda sabitlenmemiş', () => {
  yes(about.includes('getSiteContent') && about.includes('siteConfig.about.title') && about.includes('siteConfig.about.text'), 'cms');
  yes(!about.includes('WHO IS MURAT') && !about.includes('Fikirleri çalışan'), 'sabit metin');
});
check('B3 "FOTOĞRAF İÇİN AYRILDI" ve placeholder etiketi tamamen kalktı', () => {
  for (const s of [about, visual, data]) yes(!/FOTOĞRAF|Fotoğraf için/.test(s), 'placeholder');
  yes(!/role="img"/.test(about + visual), 'role=img');
});
check('B4 geometrik görsel dekoratif: aria-hidden, mobilde gizli', () => yes(visual.includes('aria-hidden="true"') && visual.includes('hidden') && visual.includes('lg:block'), 'a11y'));
check('B5 turuncu/mor ve ham hex renk yok; yalnız marka token\'ları', () => {
  yes(!/bg-hot|bg-volt|border-volt|border-hot|text-hot|text-volt/.test(about + visual), 'hot/volt');
  yes(!/#[0-9a-fA-F]{3,8}\b/.test(about + visual), 'hex');
});
check('B6 neon yeşil yalnız zemin/dekor (metin rengi olarak değil)', () => yes(!/text-acid/.test(about + visual), 'text-acid'));
check('B7 semantik: dl/dt/dd ve h3 (sr-only), tek h2 SectionHeading\'den', () => {
  yes(about.includes('<dl') && about.includes('<dt') && about.includes('<dd'), 'dl');
  yes(!/<h1|<h2/.test(about), 'h1/h2');
});
check('B8 fotoğraf yolu: next/image yalnız ABOUT_PHOTO varsa, alt metin zorunlu', () => yes(visual.includes("from 'next/image'") && visual.includes('alt={ABOUT_PHOTO.alt}'), 'image'));
check('B9 bağlantılar next/link, içerik ABOUT_LINKS\'ten', () => yes(about.includes("from 'next/link'") && about.includes('ABOUT_LINKS[0]') && about.includes('ABOUT_LINKS[1]'), 'link'));
check('B10 import listesi: yeni bağımlılık yok (next, lucide-react zaten var)', () => {
  const imps = [...(about + '\n' + visual + '\n' + data).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]).sort();
  eq(imps, ['./AboutVisual', './about-content', './about-content', '@/components/ui/SectionHeading', '@/lib/cn', '@/lib/content', 'lucide-react', 'next/image', 'next/link'].sort(), 'imports');
});
check('B11 animasyon/istemci kodu yok', () => yes(!/animate-|framer|motion|useEffect|useState|'use client'/.test(about + visual), 'anim'));
check('B12 Header/Footer/Contact/Analytics bağlantısı yok', () => yes(!/Header|Footer|Contact|analytics|HitBeacon/i.test(about + visual + data), 'bağımlılık'));
check('B13 CMS şeması/mapper bu bileşenlerde import edilmez; @/data/* içe aktarılmaz (3B-E S3 kuralı)', () => yes(!/lib\/cms/.test(about + visual + data) && !/from '@\/data\//.test(about + visual + data), 'import'));

console.log(failures.length ? failures.map((f) => 'FAIL ' + f).join('\n') : '');
console.log(`${passed} kontrol geçti, ${failures.length} başarısız.`);
if (failures.length) process.exit(1);
console.log('Tüm about kontrolleri geçti.');
