/**
 * FOOTER 2.0 REGRESYON TESTİ. Next, Supabase ve veritabanı GEREKMEZ (saf fonksiyonlar + kaynak taraması).
 *
 *   npx tsx scripts/cms/verify-footer.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FOOTER_EMAIL, FOOTER_NAV, usableSocialLinks } from '@/components/layout/footer-links';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function yes(c: unknown, m: string) { if (!c) throw new Error(m); }

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const footer = read('src/components/layout/Footer.tsx');
const chrome = read('src/components/layout/SiteChrome.tsx');
const L = (id: string, label: string, href: string) => ({ id, label, href });

// ── saf mantık ──
check('F1 e-posta sabiti', () => eq(FOOTER_EMAIL, 'hello@muratsisman.com.tr', 'email'));
check('F2 navigasyon: 5 öğe, sıra ve hedefler', () => eq(FOOTER_NAV.map((n) => [n.label, n.href]), [['Ana Sayfa', '/'], ['Projeler', '/#projects'], ['Lab', '/lab'], ['Notlar', '/notes'], ['Hakkımda', '/#about']], 'nav'));
check('F3 placeholder (#) ve boş href elenir', () => eq(usableSocialLinks([L('linkedin', 'LinkedIn', '#'), L('github', 'GitHub', ''), L('x', 'X', '   ')]), [], 'placeholder'));
check('F4 gerçek https bağlantılar korunur, sıra korunur', () => {
  const r = usableSocialLinks([L('linkedin', 'LinkedIn', 'https://www.linkedin.com/in/ornek'), L('github', 'GitHub', 'https://github.com/ornek')]);
  eq(r.map((x) => x.label), ['LinkedIn', 'GitHub'], 'labels');
});
check('F5 e-posta kaydı sosyal listeden elenir (footer sabit adresi kullanır)', () => eq(usableSocialLinks([L('email', 'Email', 'mailto:hello@muratsisman.com.tr')]), [], 'email'));
check('F6 tehlikeli/geçersiz şemalar elenir', () => {
  const bad = ['javascript:alert(1)', 'data:text/html,x', 'http://github.com/x', 'ftp://x.com', '/relative', 'github.com/x', 'https://localhost', 'not a url'];
  eq(usableSocialLinks(bad.map((h, i) => L('s' + i, 'S' + i, h))), [], 'bad');
});
check('F7 aynı URL tekrarı tek kez', () => eq(usableSocialLinks([L('a', 'A', 'https://github.com/o'), L('b', 'B', 'https://github.com/o')]).length, 1, 'dup'));
check('F8 boş etiket elenir, bozuk girdi çökmez', () => {
  eq(usableSocialLinks([L('a', '  ', 'https://github.com/o')]), [], 'blank');
  eq(usableSocialLinks(null), [], 'null');
  eq(usableSocialLinks(undefined), [], 'undef');
  eq(usableSocialLinks([null, 5, { id: 1 }] as never), [], 'junk');
});

// ── kaynak taraması ──
check('K1 semantik: <footer>, iki <nav aria-labelledby>, h2 başlıklar', () => {
  yes(/<footer[\s>]/.test(footer), 'footer');
  eq((footer.match(/<nav aria-labelledby=/g) || []).length, 2, 'nav sayısı');
  yes(footer.includes('id="footer-explore"') && footer.includes('id="footer-connect"'), 'başlık id');
  yes(!/<h1/.test(footer), 'h1 olmamalı');
});
check('K2 mailto bağlantısı sabitten kurulur', () => yes(footer.includes('href={`mailto:${FOOTER_EMAIL}`}'), 'mailto'));
check('K3 sosyal okuma try/catch içinde (CMS hatasında çökmez)', () => yes(/try\s*\{[\s\S]*?getSiteContent\(\)[\s\S]*?\}\s*catch\s*\{\s*return \[\];/.test(footer), 'try/catch'));
check('K4 ölü bağlantı yok: href="#" ve gizlilik bağlantısı yok', () => {
  yes(!/href="#"/.test(footer) && !/href=['"]#['"]/.test(footer), 'href #');
  yes(!/gizlilik|aydınlatma|privacy|kvkk/i.test(footer), 'gizlilik bağlantısı');
});
check('K5 dış bağlantılar güvenli: rel=noopener noreferrer, sr-only uyarı', () => yes(footer.includes('rel="noopener noreferrer"') && footer.includes('yeni sekmede açılır'), 'rel'));
check('K6 imza dekoratif: aria-hidden, MURAT/LAB marka prop\'undan', () => yes(footer.includes('aria-hidden="true"') && footer.includes('{brand.left}') && footer.includes('{brand.right}'), 'imza'));
check('K7 sabit koyu zemin (bg-ink), on-color odak halkası, ham hex renk yok', () => {
  yes(footer.includes('bg-ink') && footer.includes('on-color'), 'ink/on-color');
  yes(!/#[0-9a-fA-F]{3,8}\b/.test(footer), 'hex');
});
check('K8 metinler: ana ve alt mesaj', () => yes(footer.includes('ALWAYS IN') && footer.includes('BETA.') && footer.includes('Biten fikir yok, süren deneme var.'), 'mesaj'));
check('K9 "LET\'S BUILD SOMETHING" tekrarlanmıyor', () => yes(!/BUILD\s*SOMETHING/i.test(footer), 'tekrar'));
check('K10 yalnız next/link, @/lib/content ve yerel dosya import edilir (yeni bağımlılık yok)', () => {
  const imps = [...footer.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  eq(imps, ['next/link', '@/lib/content', './footer-links'], 'imports');
  const helper = read('src/components/layout/footer-links.ts');
  eq([...helper.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]), ['@/types'], 'helper imports');
});
check('K11 Header/Contact/Analytics bu dosyalarda yok', () => yes(!/Header|Contact|analytics|HitBeacon/i.test(footer.replace(/Header'daki/g, '')), 'bağımlılık'));
check('K12 SiteChrome footer\'a brand geçirir, Header satırı değişmedi', () => {
  yes(chrome.includes('<Footer name={id.name} domain={id.domain} brand={id.brand} />'), 'prop');
  yes(chrome.includes('<Header brand={id.brand} />'), 'header');
});
check('K13 animasyon/ağır kütüphane yok', () => yes(!/framer|motion|animate-|useEffect|'use client'/.test(footer), 'anim/client'));
check('K14 kapsam: admin/analytics dosyaları footer\'a bağlanmaz', () => {
  yes(!existsSync(join(root, 'src/components/layout/FooterClient.tsx')), 'client footer');
});

console.log(failures.length ? failures.map((f) => 'FAIL ' + f).join('\n') : '');
console.log(`${passed} kontrol geçti, ${failures.length} başarısız.`);
if (failures.length) process.exit(1);
console.log('Tüm footer kontrolleri geçti.');
