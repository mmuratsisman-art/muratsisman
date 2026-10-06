// Kullanım: npm i -D playwright && npx playwright install chromium
//           npm run build && npm run start   (başka terminalde)
//           node scripts/qa.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const widths = [320, 360, 375, 390, 412, 430, 768, 1024, 1440];
const routes = [
  '/', '/projects/yakala', '/projects/migration-center', '/projects/ai-lab',
  '/lab', '/lab/ai-tool-explorations', '/lab/automation-playground', '/lab/web-product-experiments',
  '/notes', '/notes/buyuk-kurmadan-once-kucuk-kurmak', '/notes/otomasyon-surtunmeyi-azaltmali', '/notes/kullanisli-ai-asistani',
];
mkdirSync('qa-shots', { recursive: true });

const browser = await chromium.launch();
let problems = 0;

for (const theme of ['light', 'dark']) {
  for (const reduced of [false, true]) {
    for (const route of routes) for (const w of widths) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 900 },
        colorScheme: theme,
        reducedMotion: reduced ? 'reduce' : 'no-preference',
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base + route, { waitUntil: 'networkidle' });

      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const cw = de.clientWidth;
        const offenders = [...document.body.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > cw + 1 && !el.closest('svg'))
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
        const rect = (el) => el.getBoundingClientRect();
        const ctas = [...document.querySelectorAll('[data-qa=hero-cta]')].map(rect);
        const chips = [...document.querySelectorAll('[data-qa=hero-chip]')].map(rect);
        const m = 8; // güvenli boşluk
        const hit = chips.some((c) => ctas.some((b) => c.left < b.right + m && c.right > b.left - m && c.top < b.bottom + m && c.bottom > b.top - m));
        const out = chips.some((c) => c.left < 0 || c.right > cw);
        const nav = document.querySelector('header nav[aria-label="Ana menü"] [aria-current="true"]');
        return { overflow: de.scrollWidth - cw, theme: de.dataset.theme, offenders, hit, out, nav: nav ? nav.textContent.trim() : null };
      });

      // Route'a duyarlı aktif menü (nav yalnızca lg+ görünür)
      const expectedNav = route.startsWith('/lab') ? 'Lab' : route.startsWith('/notes') ? 'Notlar' : null;
      const navOk = !expectedNav || w < 1024 || r.nav === expectedNav;

      const ok = r.overflow <= 0 && r.theme === theme && errors.length === 0 && !r.hit && !r.out && navOk;
      if (!ok) problems++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${route} ${theme}${reduced ? '+reduced-motion' : ''} @${w}px overflow=${r.overflow} data-theme=${r.theme} chip/CTA-collision=${r.hit} chip-out=${r.out} nav=${r.nav ?? '-'}${navOk ? '' : ' (BEKLENEN: ' + expectedNav + ')'} errors=${errors.length}`,
        r.offenders.length ? r.offenders : '');
      await page.screenshot({ path: `qa-shots/${route === '/' ? 'home' : route.split('/').pop()}-${theme}-${reduced ? 'rm' : 'full'}-${w}.png`, fullPage: true });
      await ctx.close();
    }
  }
}
await browser.close();
process.exit(problems ? 1 : 0);
