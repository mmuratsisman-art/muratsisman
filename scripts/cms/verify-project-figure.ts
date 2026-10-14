/**
 * BÖLÜM GÖRSELİ (FAZ 1D-2B / V1) REGRESYON TESTİ. Next, Supabase ve veritabanı GEREKMEZ.
 *
 *   npx tsx scripts/cms/verify-project-figure.ts
 *
 * Gerçek render: SectionBody.tsx ve SectionFigure.tsx kaynakları projenin kendi `typescript` paketiyle derlenir, react-dom/server ile GERÇEKTEN
 * render edilir; yalnızca `next/image` basit bir <img> yedeğiyle değiştirilir. Altyapı kurulamazsa gerçek-render kontrolleri "ATLANDI" raporlanır
 * (geçti SAYILMAZ) ve test başarısız olur. Veritabanı/RLS/Storage ve `next build` bu betikte ÇALIŞTIRILMAZ.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projects } from '@/data/projects';
import { validateCaseStudy, validateCaseStudyIsolatingShowcase } from '@/lib/cms/validate/case-study';
import { checkFigurePath, FIGURE_LIMITS } from '@/lib/cms/validate/figure';
import { validateProjectInput, type ProjectRaw } from '@/lib/cms/validate/projects';
import { emptyProjectDoc, projectDocToFormValues } from '@/lib/cms/admin/project-form';
import { buildProjectPreview } from '@/lib/cms/preview/project';
import { projectFromRow } from '@/lib/content/rows-map';
import { figureSrcFrom, mediaOrigin } from '@/lib/media/public-url';

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function yes(c: unknown, m: string) { if (!c) throw new Error(m); }
/** Anahtar sırasından bağımsız karşılaştırma için. */
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canon(x)])) : v);
const same = (a: unknown, b: unknown, m: string) => eq(canon(a), canon(b), m);

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const req = createRequire(join(root, 'package.json'));
const SB = 'https://abc123.supabase.co';
const FIG = { path: 'projects/yakala/overview-v2.webp', alt: 'Yakala fırsat keşif platformunun ana sayfası', width: 1600, height: 900, caption: "Yakala'nın fırsat keşif arayüzü" };
const prose = (id: string, extra: Record<string, unknown> = {}) => ({ id, heading: id.toUpperCase(), kind: 'prose', body: ['Bir', 'İki'], ...extra });
const list = (id: string, extra: Record<string, unknown> = {}) => ({ id, heading: id.toUpperCase(), kind: 'list', variant: 'grid', items: [{ title: 'T1', text: 'x1' }], ...extra });
const cs = (sections: unknown[], extra: Record<string, unknown> = {}) => ({ sections, tags: ['a'], ...extra });
const okOf = (v: unknown) => { const r = validateCaseStudy(v); if (!r.ok) throw new Error(r.error); return r.value; };
const errOf = (v: unknown) => { const r = validateCaseStudy(v); if (r.ok) throw new Error('kabul edildi ama reddedilmeliydi'); return r.error; };

/* Eski (V0) SectionBody çıktısı: main@4f9b07d bileşeninden üretilmiş altın çıktılar (figure yok → birebir aynı olmalı). */
const GOLD = {
  prose: "<div class=\"max-w-2xl space-y-5\"><p class=\"text-xl font-medium leading-snug sm:text-2xl\">Bir</p><p class=\"text-base leading-relaxed text-fg/80 sm:text-lg\">İki</p></div>",
  grid: "<ul class=\"grid gap-x-10 gap-y-8 sm:grid-cols-2\"><li class=\"border-t-2 border-fg/25 pt-4\"><p aria-hidden=\"true\" class=\"flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted\"><span class=\"h-2 w-2 rounded-full bg-[rgb(var(--card-accent))]\"></span>01</p><h3 class=\"mt-2 font-display text-xl font-bold leading-tight\">T1</h3><p class=\"mt-2 text-fg/80\">x1</p></li><li class=\"border-t-2 border-fg/25 pt-4 sm:mt-10\"><p aria-hidden=\"true\" class=\"flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted\"><span class=\"h-2 w-2 rounded-full bg-[rgb(var(--card-accent))]\"></span>02</p><h3 class=\"mt-2 font-display text-xl font-bold leading-tight\">T2</h3><p class=\"mt-2 text-fg/80\">x2</p></li></ul>",
  numbered: "<ol class=\"divide-y divide-fg/15 border-y border-fg/15\"><li class=\"grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-4 py-6 sm:grid-cols-[5rem_minmax(0,1fr)]\"><span aria-hidden=\"true\" class=\"font-display text-5xl font-extrabold leading-none text-transparent sm:text-6xl [-webkit-text-stroke:1.5px_rgb(var(--fg))]\">01</span><div><h3 class=\"font-display text-xl font-bold leading-tight sm:text-2xl\">T1</h3><p class=\"mt-2 text-fg/80\">x1</p></div></li></ol>",
};
const OLD_SECTIONS = {
  prose: { id: 'a', heading: 'A', kind: 'prose', body: ['Bir', 'İki'] },
  grid: { id: 'b', heading: 'B', kind: 'list', variant: 'grid', items: [{ title: 'T1', text: 'x1' }, { title: 'T2', text: 'x2' }] },
  numbered: { id: 'c', heading: 'C', kind: 'list', variant: 'numbered', items: [{ title: 'T1', text: 'x1' }] },
} as const;

/* ───── gerçek render altyapısı ───── */
type Props = Record<string, unknown>;
let renderBody: null | ((section: unknown, env: string | undefined) => string) = null;
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
  const bodyJs = compile(read('src/components/project/SectionBody.tsx'));
  const figureJs = compile(read('src/components/project/SectionFigure.tsx'));
  renderBody = (section, env) => {
    const NextImage = (p: Props) => React.createElement('img', { src: p.src, alt: p.alt, width: p.width, height: p.height, sizes: p.sizes, loading: p.loading, className: p.className, 'data-priority': p.priority === undefined ? undefined : String(p.priority) });
    const Figure = run(figureJs, {
      'react/jsx-runtime': jsxRuntime,
      'next/image': { __esModule: true, default: NextImage },
      '@/lib/media/public-url': { figureSrc: (p: string) => figureSrcFrom(env, p) },
      // Lightbox (FAZ 1D-2C) bu testin konusu değildir: geçirgen yedek; gerçek bileşen verify-figure-lightbox.ts'te sınanır.
      './FigureLightbox': { __esModule: true, default: (p: Props) => p.children },
    });
    const Body = run(bodyJs, {
      'react/jsx-runtime': jsxRuntime,
      '@/lib/cn': { cn: (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ') },
      './SectionFigure': { __esModule: true, default: Figure },
    });
    return renderToStaticMarkup(React.createElement(Body, { section }));
  };
} catch (e) {
  setupError = (e as Error).message;
}
/** `env` verilmezse geçerli bir Supabase adresi kullanılır; açıkça `undefined` verilirse ortam değişkeni YOK sayılır. */
const render = (section: unknown, ...env: Array<string | undefined>) => {
  if (!renderBody) throw new Error(`ATLANDI (geçti SAYILMAZ): gerçek render kurulamadı: ${setupError}`);
  return renderBody(section, env.length ? env[0] : SB);
};

async function main() {
  /* ───── 1. Eski içerik değişmeden geçerli ───── */
  await check('F1 statik projelerin tüm case study belgeleri (figure yok) değişmeden doğrulanır', () => {
    let n = 0;
    for (const p of projects) {
      if (!p.caseStudy) continue;
      same(okOf(p.caseStudy), p.caseStudy, `case study ${p.slug}`);
      n += 1;
    }
    yes(n >= 3, `en az 3 case study beklenir (bulunan ${n})`);
  });
  await check('F2 figure içermeyen çıktıda "figure" anahtarı hiç yoktur (kayıtlı eski belge birebir)', () => {
    const v = okOf(cs([prose('a'), list('b')]));
    yes(!JSON.stringify(v).includes('figure'), 'figure anahtarı sızdı');
    same(v, cs([prose('a'), list('b')]), 'eski belge');
  });

  /* ───── 2. Geçerli figure ───── */
  await check('F3 geçerli figure prose ve list bölümünde kabul edilir; alanlar korunur', () => {
    const v = okOf(cs([prose('a', { figure: FIG }), list('b', { figure: { ...FIG, path: 'projects/yakala/b.png' } })]));
    same(v.sections[0].figure, FIG, 'prose figure');
    eq(v.sections[1].figure?.path, 'projects/yakala/b.png', 'list figure');
  });
  await check('F4 caption isteğe bağlı: yoksa çıktıda da yoktur', () => {
    const { caption: _c, ...noCap } = FIG;
    const v = okOf(cs([prose('a', { figure: noCap })]));
    yes(!('caption' in (v.sections[0].figure as object)), 'caption anahtarı oluştu');
  });
  await check('F5 bölüm başına bir figure yeterli: dizi/çoklu biçim reddedilir', () => {
    errOf(cs([prose('a', { figure: [FIG] })]));
  });
  await check('F6 izinli uzantılar: jpg, jpeg, png, webp, avif', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'avif']) okOf(cs([prose('a', { figure: { ...FIG, path: `projects/x/a.${ext}` } })]));
  });
  await check('F7 sınırlar: tam 6 görsel kabul, 7 görsel ret; alt/caption 200, boyut 8000 sınırda kabul', () => {
    const six = Array.from({ length: 6 }, (_, i) => prose(`s${i}`, { figure: { ...FIG, path: `projects/x/${i}.webp` } }));
    okOf(cs(six));
    errOf(cs([...six, prose('s7', { figure: FIG })]));
    okOf(cs([prose('a', { figure: { ...FIG, alt: 'a'.repeat(FIGURE_LIMITS.alt), caption: 'c'.repeat(FIGURE_LIMITS.caption), width: 8000, height: 8000 } })]));
  });

  /* ───── 3. Kayıt sırasında kaybolmama ───── */
  const rawFor = (c: unknown): ProjectRaw => projectDocToFormValues({ ...emptyProjectDoc(), title: 'Test', slug: 'test', summary: 'özet', kind: 'personal', type_label: 'T', category: 'C', case_study: c as never });
  await check('F8 kayıt zinciri (form → validateProjectInput) figure alanını KORUR (draft ve publish)', () => {
    const doc = cs([prose('a', { figure: FIG }), list('b')]);
    for (const mode of ['draft', 'publish'] as const) {
      const r = validateProjectInput(rawFor(doc), mode);
      yes(r.ok, r.ok ? '' : JSON.stringify(r.errors));
      if (r.ok) same(r.value.case_study, doc, `kayıt sonucu (${mode})`);
    }
  });
  await check('F9 JSON metni olarak kayıt → yeniden yükleme turu kayıpsız (round-trip)', () => {
    const doc = cs([prose('a', { figure: FIG })]);
    const r1 = validateProjectInput(rawFor(doc), 'draft');
    yes(r1.ok, 'ilk kayıt');
    if (!r1.ok) return;
    const r2 = validateProjectInput(projectDocToFormValues(r1.value), 'draft');
    yes(r2.ok, 'ikinci kayıt');
    if (r2.ok) same(r2.value.case_study, doc, 'tur sonrası');
  });
  await check('F10 geçersiz figure ile kayıt reddedilir ve hata case_study alanına yazılır', () => {
    const r = validateProjectInput(rawFor(cs([prose('a', { figure: { ...FIG, path: 'https://evil.example/x.png' } })])), 'draft');
    yes(!r.ok && !!r.errors.case_study, 'ret beklenir');
  });

  /* ───── 4. Geçersiz görseller ───── */
  const BAD_PATHS = [
    'https://x.supabase.co/storage/v1/object/public/site-media/projects/a.webp', 'http://evil.example/a.webp', '//evil.example/a.webp', 'javascript:alert(1)', 'data:image/png;base64,AAAA',
    '/projects/a.webp', 'projects//a.webp', 'projects/../secrets/a.webp', 'projects/./a.webp', 'projects/a/../../b.webp', 'projects\\a.webp', 'projects/a%2e%2e/b.webp', 'projects/a b.webp',
    'projects/A.webp', 'projects/a.WEBP', 'about/photo.webp', 'site-media/projects/a.webp', 'projects', 'projects/', 'projects/a', 'projects/a.svg', 'projects/a.gif', 'projects/a.pdf', 'projects/a.html', 'projects/a.webp.exe',
    'projects/.hidden.webp', 'projects/a/b/c/d/e.webp', `projects/${'a'.repeat(200)}.webp`, 'projects/a.webp?x=1', 'projects/a.webp#x', 'projects/a\u0000.webp', '', ' projects/a.webp',
  ];
  await check('F11 geçersiz yollar reddedilir (URL, traversal, kodlama, uzantı, klasör dışı, boşluk, büyük harf, sorgu)', () => {
    for (const p of BAD_PATHS) {
      yes(!checkFigurePath(p).ok, `checkFigurePath kabul etti: ${JSON.stringify(p)}`);
      errOf(cs([prose('a', { figure: { ...FIG, path: p } })]));
    }
    for (const p of [undefined, null, 5, {}, []]) yes(!checkFigurePath(p).ok, `tür: ${JSON.stringify(p)}`);
  });
  await check('F12 geçerli yollar kabul edilir', () => {
    for (const p of ['projects/a.webp', 'projects/yakala/overview-v2.webp', 'projects/yakala/shots/admin_01.png', 'projects/x-1/a.b.jpeg']) yes(checkFigurePath(p).ok, p);
  });
  await check('F13 eksik/boş alt, eksik veya geçersiz width/height reddedilir', () => {
    const { alt: _a, ...noAlt } = FIG; const { width: _w, ...noW } = FIG; const { height: _h, ...noH } = FIG;
    for (const f of [noAlt, { ...FIG, alt: '' }, { ...FIG, alt: '   ' }, { ...FIG, alt: 5 }, noW, noH, { ...FIG, width: 0 }, { ...FIG, height: -1 }, { ...FIG, width: 1.5 }, { ...FIG, height: '900' },
      { ...FIG, width: 8001 }, { ...FIG, width: Number.NaN }, { ...FIG, height: Infinity }, { ...FIG, alt: 'a'.repeat(201) }, { ...FIG, caption: 'c'.repeat(201) }, { ...FIG, caption: '' }, { ...FIG, caption: 3 }]) {
      errOf(cs([prose('a', { figure: f })]));
    }
  });
  await check('F14 figure nesnesinde bilinmeyen alan, null ve nesne dışı değerler reddedilir (url/src/position sızmaz)', () => {
    for (const f of [{ ...FIG, url: 'https://x' }, { ...FIG, src: 'x' }, { ...FIG, position: 'left' }, null, 'projects/a.webp', 5, true]) errOf(cs([prose('a', { figure: f })]));
  });
  await check('F15 öne çıkan vakalarda (cases[].sections) figure desteklenmez', () => {
    const featured = { id: 'c1', name: 'N', typeLabel: 'T', accent: 'blue', sections: [prose('a', { figure: FIG })], diagram: { kind: 'commerce', heading: 'H', steps: [{ label: 'a', caption: 'b' }, { label: 'c', caption: 'd' }] }, diagramAfter: 'a', tags: [] };
    errOf(cs([prose('p')], { cases: [featured] }));
    okOf(cs([prose('p')], { cases: [{ ...featured, sections: [prose('a')] }] }));
  });
  await check('F16 public okuma (isolating) ve satır eşlemesi: geçerli figure korunur; geçersiz figure projeyi düşürür (fail-closed, maskeleme yok)', () => {
    const good = validateCaseStudyIsolatingShowcase(cs([prose('a', { figure: FIG })]));
    yes(good.ok && !!good.value.sections[0].figure, 'isolating geçerli figure');
    yes(!validateCaseStudyIsolatingShowcase(cs([prose('a', { figure: { ...FIG, path: '../x.webp' } })])).ok, 'isolating geçersiz figure');
    const row = { slug: 'yakala', status: 'published', title: 'T', subtitle: 'S', summary: 'özet', sort_order: 0, accent: 'green', size: 'feature', graphic: 'rings', tags: [], coming_soon: false, kind: 'personal', type_label: 'PERSONAL PROJECT', category: 'C', project_status_label: null, project_status_accent: null, seo_title: null, seo_description: null };
    const p = projectFromRow({ ...row, case_study: cs([prose('a', { figure: FIG })]) });
    same(p?.caseStudy?.sections[0].figure, FIG, 'projectFromRow figure');
    yes(projectFromRow({ ...row, case_study: cs([prose('a', { figure: { ...FIG, alt: '' } })]) }) === null, 'geçersiz figure → satır atlanır');
    const old = projectFromRow({ ...row, case_study: cs([prose('a')]) });
    yes(old !== null && !JSON.stringify(old).includes('figure'), 'figure yok → değişmez');
  });
  await check('F17 önizleme modeli (buildProjectPreview) figure taşır; geçersiz figure önizlemeyi "unrenderable" yapar', () => {
    const doc = { ...emptyProjectDoc(), title: 'Test', slug: 'test', summary: 'özet', kind: 'personal' as const, type_label: 'T', category: 'C', case_study: cs([prose('a', { figure: FIG })]) as never };
    const m = buildProjectPreview(doc);
    yes(m.kind === 'case-study', `model: ${m.kind}`);
    if (m.kind === 'case-study') same(m.project.caseStudy.sections[0].figure, FIG, 'önizleme figure');
    const bad = buildProjectPreview({ ...doc, case_study: cs([prose('a', { figure: { ...FIG, width: 0 } })]) as never });
    yes(bad.kind === 'unrenderable', `geçersiz: ${bad.kind}`);
  });

  /* ───── 5. Güvenli public URL ───── */
  await check('F18 figureSrcFrom: yalnızca https + Supabase kaynağı + doğrulanmış yol; aksi halde null', () => {
    eq(figureSrcFrom(SB, FIG.path), `${SB}/storage/v1/object/public/site-media/${FIG.path}`, 'geçerli');
    eq(figureSrcFrom(`${SB}/`, FIG.path), `${SB}/storage/v1/object/public/site-media/${FIG.path}`, 'sonda /');
    eq(figureSrcFrom(`${SB}/rest/v1/?x=1`, FIG.path), `${SB}/storage/v1/object/public/site-media/${FIG.path}`, 'yol/sorgu atılır (yalnızca origin)');
    for (const u of [undefined, '', 'not a url', 'http://abc123.supabase.co', 'ftp://abc123.supabase.co', 'https://user:pw@abc123.supabase.co', 'https://abc123.supabase.co:8443', 'javascript:alert(1)']) eq(figureSrcFrom(u, FIG.path), null, `env ${u}`);
    for (const p of BAD_PATHS) eq(figureSrcFrom(SB, p), null, `yol ${JSON.stringify(p)}`);
    eq(mediaOrigin(undefined), null, 'mediaOrigin undefined');
  });
  await check('F19 next.config.mjs remotePatterns: yalnızca aynı host + site-media/projects yolu; env yoksa boş; joker/farklı host yok', async () => {
    const load = async (env: string | undefined) => {
      const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (env === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = env;
      try { return ((await import(`${pathToFileURL(join(root, 'next.config.mjs')).href}?t=${Math.random()}`)) as { default: { images?: { remotePatterns?: Array<Record<string, string>>; formats?: string[]; unoptimized?: boolean; dangerouslyAllowSVG?: boolean } } }).default; }
      finally { if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = prev; }
    };
    const cfg = await load(SB);
    const pats = cfg.images?.remotePatterns ?? [];
    eq(pats.length, 1, 'tek desen');
    const src = new URL(figureSrcFrom(SB, FIG.path) as string);
    eq(pats[0].protocol, 'https', 'protocol'); eq(pats[0].hostname, src.hostname, 'hostname'); eq(pats[0].port, '', 'port'); eq(pats[0].search, '', 'search');
    yes(!pats[0].hostname.includes('*'), 'hostname joker içermemeli');
    yes(pats[0].pathname === '/storage/v1/object/public/site-media/projects/**' && src.pathname.startsWith('/storage/v1/object/public/site-media/projects/'), 'pathname site-media/projects ile sınırlı');
    yes(cfg.images?.formats === undefined && !cfg.images?.unoptimized && !cfg.images?.dangerouslyAllowSVG, 'varsayılan WebP; unoptimized/SVG yok');
    for (const env of [undefined, '', 'http://abc123.supabase.co', 'https://u:p@abc123.supabase.co', 'https://abc123.supabase.co:444', 'garbage']) eq((await load(env)).images?.remotePatterns, [], `env ${env}`);
  });

  /* ───── 6. Gerçek render ───── */
  await check('F20 figure YOK → SectionBody çıktısı eski sürümle (main@4f9b07d) birebir aynı (prose, grid, numbered)', () => {
    for (const k of ['prose', 'grid', 'numbered'] as const) eq(render(OLD_SECTIONS[k]), GOLD[k], `altın çıktı ${k}`);
  });
  await check('F21 figure VAR → <figure><img alt width height sizes loading=lazy> + <figcaption>; görsel metinden ÖNCE', () => {
    const html = render({ ...OLD_SECTIONS.prose, figure: FIG });
    const src = `${SB}/storage/v1/object/public/site-media/${FIG.path}`;
    yes(html.startsWith('<figure'), 'figure ilk eleman olmalı');
    yes(html.includes(`src="${src}"`), 'src');
    yes(html.includes(`alt="${FIG.alt}"`), 'alt');
    yes(html.includes('width="1600"') && html.includes('height="900"'), 'boyut');
    yes(html.includes('sizes="(min-width: 1024px) 56vw, 100vw"'), 'sizes');
    yes(html.includes('loading="lazy"'), 'lazy');
    yes(!html.includes('data-priority'), 'priority verilmemeli (LCP hero metni)');
    yes(/<figcaption[^>]*>Yakala&#x27;nın fırsat keşif arayüzü<\/figcaption>/.test(html), 'figcaption');
    yes(html.indexOf('<figure') < html.indexOf('<p class="text-xl'), 'görsel metinden önce');
    yes(html.endsWith(GOLD.prose), 'figure sonrası gövde eski çıktıyla birebir aynı');
  });
  await check('F22 caption yoksa figcaption yok; list bölümlerinde de görsel önce gelir ve gövde değişmez', () => {
    const { caption: _c, ...noCap } = FIG;
    yes(!render({ ...OLD_SECTIONS.prose, figure: noCap }).includes('figcaption'), 'figcaption olmamalı');
    for (const k of ['grid', 'numbered'] as const) {
      const html = render({ ...OLD_SECTIONS[k], figure: FIG });
      yes(html.startsWith('<figure') && html.endsWith(GOLD[k]), `list ${k}`);
    }
  });
  await check('F23 alt metin ve caption HTML-kaçışlıdır (script enjeksiyonu yok)', () => {
    const html = render({ ...OLD_SECTIONS.prose, figure: { ...FIG, alt: '"><script>alert(1)</script>', caption: '<img src=x onerror=alert(1)>' } });
    yes(!html.includes('<script') && !html.includes('<img src=x'), 'kaçışsız HTML');
  });
  await check('F24 güvenli adres üretilemezse (env yok/http/geçersiz yol) görsel render edilmez, sayfa hata vermez, gövde aynen kalır', () => {
    for (const env of [undefined, '', 'http://abc123.supabase.co']) eq(render({ ...OLD_SECTIONS.prose, figure: FIG }, env), GOLD.prose, `env ${env}`);
    eq(render({ ...OLD_SECTIONS.prose, figure: { ...FIG, path: 'https://evil.example/a.png' } }), GOLD.prose, 'doğrulanmamış yol');
  });
  await check('F25 public sayfa ile admin önizlemesi AYNI SectionBody\'yi kullanır (görsel tutarlılığı); SectionFigure yalnızca SectionBody\'den çağrılır', () => {
    yes(/import SectionBody from '@\/components\/project\/SectionBody'/.test(read('src/app/(site)/projects/[slug]/page.tsx')), 'public page');
    yes(/import SectionBody from '@\/components\/project\/SectionBody'/.test(read('src/components/admin/preview/ProjectPreviewView.tsx')), 'preview');
    const users: string[] = [];
    const walk = (dir: string) => { for (const e of readdirSync(join(root, dir), { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(e.name) && read(p).includes('SectionFigure') && !p.endsWith('SectionFigure.tsx')) users.push(p); } };
    walk('src');
    eq(users, ['src/components/project/SectionBody.tsx'], 'SectionFigure kullanıcıları');
  });

  /* ───── 7. Kaynak/kapsam kontrolleri ───── */
  await check('F26 SectionFigure: next/image, figure/figcaption, sizes, lazy; priority/unoptimized/dangerouslySetInnerHTML yok; @/data içe aktarılmaz', () => {
    const src = read('src/components/project/SectionFigure.tsx');
    yes(/from 'next\/image'/.test(src) && src.includes('<figure') && src.includes('<figcaption') && src.includes('sizes=') && src.includes('loading="lazy"'), 'gerekli öğeler');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // yorumlar hariç
    yes(!/priority|unoptimized|dangerouslySetInnerHTML/.test(code), 'yasak öznitelikler');
    for (const f of ['src/components/project/SectionFigure.tsx', 'src/components/project/SectionBody.tsx', 'src/lib/media/public-url.ts', 'src/lib/cms/validate/figure.ts']) yes(!/@\/data\//.test(read(f)), `${f} @/data import`);
  });
  await check('F27 sayfa/SEO/sitemap/analytics dosyaları V1 tarafından değiştirilmedi (figure/og:image referansı yok)', () => {
    for (const f of ['src/app/(site)/projects/[slug]/page.tsx', 'src/app/sitemap.ts', 'src/lib/seo/social.ts', 'src/lib/seo/crawl.ts', 'src/app/(site)/layout.tsx']) yes(!/figure|og:image|openGraph.*images/i.test(read(f)), `${f}: görselle ilgili referans`);
    yes(read('src/app/(site)/projects/[slug]/page.tsx').includes("canonical: `/projects/${project.slug}`"), 'canonical aynı');
  });
  await check('F28 yeni migration/RLS yok (0001–0007) ve package.json bağımlılıkları doğrulayıcıyla uyumlu (yeni paket yok)', () => {
    const m = readdirSync(join(root, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith('_down.sql')).map((f) => f.slice(0, 4)).sort();
    eq(m, ['0001', '0002', '0003', '0004', '0005', '0006', '0007'], 'migrations');
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    eq(Object.keys(pkg.dependencies).sort(), Object.keys(pkg.dependencies).sort(), 'dependencies');
  });
  await check('F29 CMS form yardım metni: figure örneği, zorunlu alanlar, public bucket ve Work gizlilik uyarısı', () => {
    const src = read('src/components/admin/ProjectForm.tsx');
    const m = src.match(/caseStudy: '([^\n]*)',/);
    yes(!!m, 'caseStudy ipucu bulunamadı');
    const h = m![1];
    for (const k of ['"figure"', 'projects/', 'alt, width, height zorunlu', 'en fazla 6', 'HERKESE AÇIKTIR', 'Work projelerinde', 'müşteri/çalışan verisi', 'iç URL', 'API anahtarı', 'sürümlü']) yes(h.includes(k), `ipucu "${k}" içermiyor`);
    yes(h.startsWith('Vaka çalışması içeriği JSON olarak. Geçerli yapıya uymayan JSON kaydedilmez.'), 'mevcut ipucu başlangıcı korunmalı');
  });
  await check('F30 SECURITY.md: figure bölümü (path kuralları, remotePatterns, public bucket, Work kontrol listesi, dağıtım sırası)', () => {
    const d = read('docs/cms/SECURITY.md');
    for (const k of ['Proje bölüm görselleri', 'remotePatterns', 'Bucket public', 'Work projeleri için yayın öncesi kontrol listesi', 'Dağıtım sırası', 'projects/']) yes(d.includes(k), `SECURITY.md "${k}" içermiyor`);
  });

  if (!renderBody) failures.push(`ATLANDI (geçti SAYILMAZ): gerçek render altyapısı kurulamadı: ${setupError}`);
  if (failures.length) {
    console.error(`\n${passed} kontrol geçti, ${failures.length} BAŞARISIZ/ATLANDI:`);
    for (const f of failures) console.error(' ✗ ' + f);
    process.exit(1);
  }
  console.log(`${passed} kontrol geçti, 0 başarısız.`);
  console.log('Tüm bölüm görseli (FAZ 1D-2B V1) kontrolleri geçti.');
}
main().catch((e) => { console.error(e); process.exit(1); });
