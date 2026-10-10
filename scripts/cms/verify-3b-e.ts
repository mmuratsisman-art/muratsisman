/**
 * FAZ 3B-E public içerik entegrasyonu testleri. Next, Supabase ve veritabanı GEREKMEZ (sahte okuyucu/önbellek + kaynak taraması).
 * Çalıştırma: TSX_TSCONFIG_PATH=$PWD/tsconfig.json npx tsx scripts/cms/verify-3b-e.ts
 * NOT: Sayfaların gerçek render'ı, gerçek RLS, `next build`, lint ve tarayıcı davranışı bu betikle DOĞRULANMAZ (bkz. docs/cms/PUBLIC-CONTENT.md §Testler).
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { projects } from '@/data/projects';
import { labEntries, labCategories } from '@/data/lab';
import { notes } from '@/data/notes';
import { siteConfig } from '@/data/site';
import { currently } from '@/data/currently';
import { socialLinks } from '@/data/social';
import { labEntryToInsert, noteToInsert, projectToInsert, siteContentToDocuments } from '@/lib/cms/mappers';
import { createContentProvider, type StaticContent } from '@/lib/content/provider';
import type { CacheAdapter } from '@/lib/content/cache';
import { ContentUnavailableError } from '@/lib/content/errors';
import { getContentSource } from '@/lib/content/source';
import { compareBySortOrder, compareNotes } from '@/lib/content/order';
import { supabaseReader, type PublicReader, type QueryClient } from '@/lib/content/reader';
import { PROJECT_COLS, LAB_COLS, NOTE_COLS } from '@/lib/content/columns';
import { buildRobots, buildSitemapEntries, loadSitemapEntries, ROBOTS_DISALLOW, siteBaseUrl } from '@/lib/seo/crawl';
import { socialMetadata } from '@/lib/seo/social';
import { __test as pub } from '@/lib/supabase/public';
import { runner } from './test-harness';

const { check, finish } = runner();
type Row = Record<string, unknown>;

/* ── Fixture: gerçek src/data → DB satırı biçimi ── */
const staticContent: StaticContent = { projects, labEntries, notes, site: { siteConfig, currently, socialLinks, labCategories } };
const pRow = (i: number, over: Row = {}): Row => ({ ...projectToInsert(projects[i], i, 'published'), published_at: '2026-01-01T00:00:00Z', ...over });
const lRow = (i: number, over: Row = {}): Row => ({ ...labEntryToInsert(labEntries[i], i, 'published'), published_at: '2026-01-01T00:00:00Z', ...over });
const nRow = (i: number, over: Row = {}): Row => ({ ...noteToInsert(notes[i], 'published'), ...over });
const siteRows = (): Row[] => Object.entries(siteContentToDocuments(staticContent.site)).map(([key, data]) => ({ key, data }));

interface World { projects: Row[]; lab: Row[]; notes: Row[]; site: Row[] }
const world = (w: Partial<World> = {}): World => ({ projects: [], lab: [], notes: [], site: siteRows(), ...w });

/** Sahte Supabase: RLS'i taklit eder (yalnızca status='published' döner) ve .eq filtresini uygular; çağrıları kaydeder. */
function fakeClient(w: World, opts: { fail?: string; nullData?: boolean } = {}) {
  const calls: { table: string; cols: string; eq?: [string, string] }[] = [];
  const client: QueryClient = {
    from(table) {
      return {
        select(cols) {
          const rec: { table: string; cols: string; eq?: [string, string] } = { table, cols };
          calls.push(rec);
          const rows = (): Row[] => (table === 'projects' ? w.projects : table === 'lab_entries' ? w.lab : table === 'notes' ? w.notes : table === 'site_content_published' ? w.site : []);
          const result = (filter?: [string, string]) => {
            if (opts.fail === table) return { data: null, error: { code: 'PGRST301' } };
            if (opts.nullData) return { data: null, error: null };
            const out = filter ? rows().filter((r) => r[filter[0]] === filter[1]) : rows();
            return { data: out, error: null };
          };
          const base = Promise.resolve(result());
          return Object.assign(base, {
            eq: (col: string, v: string) => {
              rec.eq = [col, v];
              return Promise.resolve(result([col, v]));
            },
          });
        },
      };
    },
  };
  return { client, calls };
}

/** unstable_cache davranışı: yalnızca BAŞARILI sonuç saklanır (fırlatan fn önbelleğe yazılmaz). */
function memoCache() {
  const store = new Map<string, unknown>();
  let hits = 0;
  const adapter: CacheAdapter = {
    wrap: (key, _t, fn) => async () => {
      if (store.has(key)) { hits += 1; return store.get(key) as never; }
      const v = await fn();
      store.set(key, v);
      return v;
    },
  };
  return { adapter, store, hits: () => hits, clear: () => store.clear() };
}

function make(w: World, o: { source?: 'static' | 'cms'; fail?: string; nullData?: boolean; cache?: CacheAdapter } = {}) {
  const f = fakeClient(w, o);
  const skipped: string[] = [];
  const errors: string[] = [];
  const p = createContentProvider({
    source: () => o.source ?? 'cms',
    reader: () => supabaseReader(f.client),
    cache: o.cache ?? memoCache().adapter,
    staticContent,
    onSkip: (e, s) => skipped.push(`${e}:${s}`),
    onError: (c, d) => errors.push(`${c}:${d}`),
  });
  return { p, f, skipped, errors };
}
const slugs = (xs: { slug: string }[]) => xs.map((x) => x.slug);
const rejects = async (fn: () => Promise<unknown>, code?: string) => {
  try { await fn(); } catch (e) {
    assert.ok(e instanceof ContentUnavailableError, `ContentUnavailableError bekleniyordu: ${String(e)}`);
    if (code) assert.equal(e.code, code);
    return;
  }
  assert.fail('fırlatması bekleniyordu');
};

async function main() {
  /* 1–2 Projects */
  await check('T1 published proje listede görünür', async () => {
    const { p } = make(world({ projects: [pRow(0), pRow(1)] }));
    assert.deepEqual(slugs(await p.getProjects()), [projects[0].slug, projects[1].slug]);
    assert.equal((await p.getProject(projects[0].slug))?.title, projects[0].title);
  });
  await check('T2 draft/preview proje görünmez (liste + detay)', async () => {
    const { p } = make(world({ projects: [pRow(0), pRow(1, { status: 'draft', published_at: null }), pRow(2, { status: 'preview', published_at: null })] }));
    assert.deepEqual(slugs(await p.getProjects()), [projects[0].slug]);
    assert.equal(await p.getProject(projects[1].slug), undefined);
    assert.equal(await p.getProject(projects[2].slug), undefined);
  });
  /* 3–4 Lab */
  await check('T3 published Lab görünür', async () => {
    const { p } = make(world({ lab: [lRow(0), lRow(1)] }));
    assert.deepEqual(slugs(await p.getLabEntries()), [labEntries[0].slug, labEntries[1].slug]);
    assert.ok(await p.getLabEntry(labEntries[1].slug));
  });
  await check('T4 unpublished Lab görünmez (draft, preview, status alanı bozuk)', async () => {
    const { p, skipped } = make(world({ lab: [lRow(0), lRow(1, { status: 'draft' }), lRow(2, { status: 'preview' }), lRow(0, { slug: 'lab-nostatus', status: undefined }), lRow(0, { slug: 'lab-upper', status: 'Published' })] }));
    assert.deepEqual(slugs(await p.getLabEntries()), [labEntries[0].slug]);
    assert.equal(await p.getLabEntry(labEntries[1].slug), undefined);
    assert.deepEqual(skipped, []); // sorgu filtresi zaten eler; mapper'a ulaşmaz
  });
  await check('T4b SAVUNMA DERİNLİĞİ: filtre/RLS devre dışı kalsa (tüm satırlar dönse) bile mapper draft/preview/bozuk status\'u eler', async () => {
    const w = world({ projects: [pRow(0), pRow(1, { status: 'draft' })], lab: [lRow(0), lRow(1, { status: 'draft' }), lRow(2, { status: 'preview' })], notes: [nRow(0), nRow(1, { status: 'draft' }), nRow(2, { status: null })] });
    const leaky: PublicReader = { projects: async () => w.projects, labEntries: async () => w.lab, notes: async () => w.notes, siteDocs: async () => w.site };
    const p = createContentProvider({ source: () => 'cms', reader: () => leaky, cache: memoCache().adapter, staticContent });
    assert.deepEqual(slugs(await p.getProjects()), [projects[0].slug]);
    assert.deepEqual(slugs(await p.getLabEntries()), [labEntries[0].slug]);
    assert.deepEqual(slugs(await p.getNotes()), [notes[0].slug]);
  });
  /* 5–6 Notes */
  await check('T5 published Note görünür', async () => {
    const { p } = make(world({ notes: [nRow(0), nRow(1)] }));
    assert.equal((await p.getNotes()).length, 2);
    assert.ok(await p.getNote(notes[0].slug));
  });
  await check('T6 unpublished Note görünmez (liste, detay, son notlar, sonraki)', async () => {
    const { p } = make(world({ notes: [nRow(0), nRow(1, { status: 'draft', published_at: null }), nRow(2, { status: 'preview' })] }));
    assert.deepEqual(slugs(await p.getNotes()), [notes[0].slug]);
    assert.equal(await p.getNote(notes[1].slug), undefined);
    assert.deepEqual(slugs(await p.getLatestNotes(10)), [notes[0].slug]);
    assert.equal((await p.getNextNote(notes[0].slug))?.slug, notes[0].slug);
    assert.equal(await p.getNextNote(notes[1].slug), undefined);
  });
  await check('T6b status filtresi sorguya AÇIKÇA eklenir + yalnız yayın tabloları okunur', async () => {
    const { p, f } = make(world({ projects: [pRow(0)], lab: [lRow(0)], notes: [nRow(0)] }));
    await p.getProjects(); await p.getLabEntries(); await p.getNotes(); await p.getSiteContent();
    const tables = f.calls.map((c) => c.table).sort();
    assert.deepEqual(tables, ['lab_entries', 'notes', 'projects', 'site_content_published']);
    for (const c of f.calls.filter((c) => c.table !== 'site_content_published')) assert.deepEqual(c.eq, ['status', 'published']);
    assert.ok(!f.calls.some((c) => /draft/i.test(c.table)));
    // açık kolon listesi: select('*') yok
    for (const c of f.calls) assert.ok(c.cols !== '*' && !c.cols.includes('*'));
    for (const cols of [PROJECT_COLS, LAB_COLS, NOTE_COLS]) assert.ok(!/created_by|updated_by|draft|admin/i.test(cols));
  });

  /* 7 Determinizm */
  await check('T7a projeler: eşit sort_order → başlık, sonra slug; girdi sırasından bağımsız', async () => {
    const a = pRow(0, { sort_order: 5, title: 'Beta', slug: 'proj-b' });
    const b = pRow(1, { sort_order: 5, title: 'alfa', slug: 'proj-a' });
    const c = pRow(2, { sort_order: 5, title: 'Alfa', slug: 'proj-c' });
    const d = pRow(3, { sort_order: 1, title: 'Zzz', slug: 'proj-z' });
    const expect = ['proj-z', 'proj-a', 'proj-c', 'proj-b'];
    const perms = [[a, b, c, d], [d, c, b, a], [b, d, a, c], [c, a, d, b]];
    for (const rows of perms) assert.deepEqual(slugs(await make(world({ projects: rows })).p.getProjects()), expect);
  });
  await check('T7b Lab: tam eşitlikte (aynı sort_order ve başlık) slug karar verir', async () => {
    const mk = (slug: string) => lRow(0, { slug, sort_order: 3, title: 'Aynı' });
    const expect = ['lab-a', 'lab-b', 'lab-c'];
    for (const rows of [[mk('lab-c'), mk('lab-a'), mk('lab-b')], [mk('lab-b'), mk('lab-c'), mk('lab-a')], [mk('lab-a'), mk('lab-b'), mk('lab-c')]])
      assert.deepEqual(slugs(await make(world({ lab: rows })).p.getLabEntries()), expect);
  });
  await check('T7c Notes: yeni→eski; aynı published_at → slug; saat dilimi biçimi farkı doğru', async () => {
    const mk = (slug: string, at: string) => nRow(0, { slug, published_at: at });
    const rows = [mk('n-b', '2026-03-01T00:00:00Z'), mk('n-a', '2026-03-01T00:00:00+00:00'), mk('n-new', '2026-04-01T00:00:00Z'), mk('n-old', '2026-01-01T00:00:00Z'), mk('n-c', '2026-03-01T03:00:00+03:00')];
    const expect = ['n-new', 'n-a', 'n-b', 'n-c', 'n-old'];
    assert.deepEqual(slugs(await make(world({ notes: rows })).p.getNotes()), expect);
    assert.deepEqual(slugs(await make(world({ notes: [...rows].reverse() })).p.getNotes()), expect);
  });
  await check('T7d karşılaştırıcılar saf ve simetrik (karşılıklı antisimetri, kendisiyle 0)', () => {
    const xs = [{ slug: 'a', title: 'x', sort_order: 1 }, { slug: 'b', title: 'x', sort_order: 1 }, { slug: 'c', title: 'X', sort_order: 1 }, { slug: 'd', title: 'a', sort_order: 2 }];
    for (const a of xs) { assert.equal(compareBySortOrder(a, a), 0); for (const b of xs) assert.equal(Math.sign(compareBySortOrder(a, b)) + Math.sign(compareBySortOrder(b, a)), 0); }
    const ns = [{ slug: 'a', published_at: '2026-01-01T00:00:00Z' }, { slug: 'b', published_at: '2026-01-01T00:00:00Z' }];
    assert.equal(compareNotes(ns[0], ns[1]) < 0, true);
    assert.equal(compareNotes(ns[1], ns[0]) > 0, true);
  });
  await check('T7e static mod sırası bugünkü src/data sırasıyla aynı', async () => {
    const { p } = make(world(), { source: 'static' });
    assert.deepEqual(slugs(await p.getProjects()), slugs(projects));
    assert.deepEqual(slugs(await p.getLabEntries()), slugs(labEntries));
    assert.deepEqual(slugs(await p.getNotes()), slugs(notes));
  });

  /* 8 Geçersiz slug */
  await check('T8 geçersiz/olmayan slug → undefined (sayfa notFound() çağırır)', async () => {
    const { p } = make(world({ projects: [pRow(0)], lab: [lRow(0)], notes: [nRow(0)] }));
    for (const bad of ['', 'YOK', '../etc/passwd', 'a b', 'x'.repeat(200), '%00', 'olmayan-slug', '__proto__', 'constructor']) {
      assert.equal(await p.getProject(bad), undefined, bad);
      assert.equal(await p.getLabEntry(bad), undefined, bad);
      assert.equal(await p.getNote(bad), undefined, bad);
    }
  });
  await check('T8b detay sayfaları getter undefined → notFound() çağırıyor (kaynak taraması)', () => {
    for (const rel of ['projects/[slug]/page.tsx', 'lab/[slug]/page.tsx', 'notes/[slug]/page.tsx']) {
      const src = readFileSync(join('src/app/(site)', rel), 'utf8');
      assert.match(src, /if \(!\w+( \|\| !hasCaseStudy\(\w+\))?\) notFound\(\)/, rel);
    }
  });

  /* 9 Hata yönetimi */
  await check('T9a sorgu hatası ≠ boş: hata fırlatır, boş dizi/statik DÖNMEZ', async () => {
    const m = make(world({ projects: [pRow(0)] }), { fail: 'projects' });
    await rejects(() => m.p.getProjects(), 'query');
    await rejects(() => m.p.getProject(projects[0].slug), 'query');
    assert.ok(m.errors.length >= 1);
    assert.ok(m.errors.every((e) => !/PGRST301.*SELECT|key|token/i.test(e)));
  });
  await check('T9b boş yayın ≠ hata: boş dizi döner, statik içerik GELMEZ', async () => {
    const { p } = make(world());
    assert.deepEqual(await p.getProjects(), []);
    assert.deepEqual(await p.getLabEntries(), []);
    assert.deepEqual(await p.getNotes(), []);
    assert.equal(await p.getProject(projects[0].slug), undefined);
  });
  await check('T9c data=null (hata yok) da hata sayılır, boş sayılmaz', async () => {
    await rejects(() => make(world(), { nullData: true }).p.getNotes(), 'query');
  });
  await check('T9d hata ÖNBELLEĞE YAZILMAZ; kurtarıldığında sonraki çağrı doğru veriyi alır', async () => {
    const mc = memoCache();
    const w = world({ notes: [nRow(0)] });
    const bad = make(w, { fail: 'notes', cache: mc.adapter });
    await rejects(() => bad.p.getNotes());
    assert.equal(mc.store.size, 0);
    const good = make(w, { cache: mc.adapter });
    assert.equal((await good.p.getNotes()).length, 1);
  });
  await check('T9e site: eksik anahtar / geçersiz belge → "invalid" hatası, statikle karışmaz', async () => {
    const miss = siteRows().filter((r) => r.key !== 'about');
    await rejects(() => make(world({ site: miss })).p.getSiteContent(), 'invalid');
    await rejects(() => make(world({ site: [] })).p.getSiteContent(), 'invalid');
    const broken = siteRows().map((r) => (r.key === 'hero' ? { key: 'hero', data: { nope: 1 } } : r));
    await rejects(() => make(world({ site: broken })).p.getSiteContent(), 'invalid');
  });
  await check('T9f site tam → CMS değerleri aynen (statikten değil)', async () => {
    const rows = siteRows().map((r) => (r.key === 'site_meta' ? { key: 'site_meta', data: { ...(r.data as object), name: 'CMS Ad' } } : r));
    const s = await make(world({ site: rows })).p.getSiteContent();
    assert.equal(s.siteConfig.name, 'CMS Ad');
    assert.equal(s.currently.length, currently.length);
  });
  await check('T9g geçersiz CONTENT_SOURCE → hata (sessizce static/cms seçilmez); varsayılan static', () => {
    assert.equal(getContentSource(undefined), 'static');
    assert.equal(getContentSource(''), 'static');
    assert.equal(getContentSource(' CMS '), 'cms');
    for (const bad of ['cmss', 'true', '1', 'supabase']) assert.throws(() => getContentSource(bad), ContentUnavailableError);
  });
  await check('T9h hata kodu çıktısı güvenli: mesajda tablo/ayrıntı sızmaz, kullanıcı mesajı sabit', async () => {
    try { await make(world(), { fail: 'notes' }).p.getNotes(); assert.fail('x'); } catch (e) {
      assert.ok(e instanceof ContentUnavailableError);
      assert.ok(!/notes|PGRST/.test(e.message), e.message);
    }
  });

  /* 10 Fallback / cache ile geri dönüş yok */
  await check('T10a cms modunda hata → statik içerik asla dönmez (3 varlık türü)', async () => {
    for (const fail of ['projects', 'lab_entries', 'notes']) {
      const m = make(world({ projects: [pRow(0)], lab: [lRow(0)], notes: [nRow(0)] }), { fail });
      if (fail === 'projects') await rejects(() => m.p.getProjects());
      if (fail === 'lab_entries') await rejects(() => m.p.getLabEntries());
      if (fail === 'notes') await rejects(() => m.p.getNotes());
    }
  });
  await check('T10b yayından kaldırılan kayıt statik dosyada olsa bile cms modunda görünmez (liste + detay + sonraki)', async () => {
    const hidden = notes[1].slug;
    const { p } = make(world({ notes: [nRow(0)], lab: [lRow(0)], projects: [pRow(0)] }));
    assert.equal(await p.getNote(hidden), undefined);
    assert.ok(!slugs(await p.getNotes()).includes(hidden));
    assert.equal(await p.getLabEntry(labEntries[1].slug), undefined);
    assert.equal(await p.getProject(projects[1].slug), undefined);
    assert.equal(await p.getNextProject(projects[1].slug), undefined);
    assert.equal(await p.getNextLabEntry(labEntries[1].slug), undefined);
  });
  await check('T10c yayından kaldırma → önbellek geçersiz kılınınca kayıt kaybolur; geçersiz kılınmadan TTL sınırı belgelenmiş', async () => {
    const mc = memoCache();
    const w = world({ notes: [nRow(0), nRow(1)] });
    const m = make(w, { cache: mc.adapter });
    assert.equal((await m.p.getNotes()).length, 2);
    w.notes = [nRow(0)]; // admin yayından kaldırdı
    assert.equal((await m.p.getNotes()).length, 2); // önbellek: TTL (60 sn) dolana / etiket geçersiz kılınana dek
    mc.clear(); // revalidateTag(CMS_TAG) etkisi
    assert.equal((await m.p.getNotes()).length, 1);
    assert.equal(await m.p.getNote(notes[1].slug), undefined);
  });
  await check('T10d static modda DB okunmaz (build/dev DB gerektirmez); staticParamSlugs cms modunda boş', async () => {
    const s = make(world(), { source: 'static' });
    await s.p.getProjects(); await s.p.getSiteContent();
    assert.equal(s.f.calls.length, 0);
    assert.ok(s.p.staticParamSlugs('notes').length > 0);
    assert.deepEqual(make(world()).p.staticParamSlugs('notes'), []);
  });
  await check('T10e kimlik (Header/Footer/metadata) fallback: yalnız kimlik alanları, "from" ile işaretli; içerik fallback yok', async () => {
    const ok = await make(world()).p.getChromeIdentity();
    assert.equal(ok.from, 'cms');
    const down = await make(world(), { fail: 'site_content_published' }).p.getChromeIdentity();
    assert.equal(down.from, 'static-fallback');
    assert.deepEqual(Object.keys(down).sort(), ['brand', 'description', 'domain', 'from', 'name']);
    const badDomain = siteRows().map((r) => (r.key === 'site_meta' ? { key: 'site_meta', data: { ...(r.data as object), domain: 'javascript:alert(1)' } } : r));
    assert.equal((await make(world({ site: badDomain })).p.getChromeIdentity()).from, 'static-fallback');
    assert.equal((await make(world(), { source: 'static' }).p.getChromeIdentity()).from, 'static');
  });

  /* 11 Metadata / sitemap */
  await check('T11a metadata ve sayfa AYNI getter\'dan beslenir; yayınlanmamış için metadata boş', async () => {
    for (const [rel, getter] of [['projects/[slug]/page.tsx', 'getProject'], ['lab/[slug]/page.tsx', 'getLabEntry'], ['notes/[slug]/page.tsx', 'getNote']] as const) {
      const src = readFileSync(join('src/app/(site)', rel), 'utf8');
      const md = src.slice(src.indexOf('generateMetadata'), src.indexOf('export default'));
      assert.ok(md.includes(getter + '('), rel);
      assert.ok(!/from '@\/data\//.test(src.replace(/import \{ hasCaseStudy \} from '@\/data\/projects';/, '')), rel + ' @/data import');
      assert.match(md, /return \{\};/, rel);
    }
    const lay = readFileSync('src/app/layout.tsx', 'utf8');
    assert.ok(lay.includes('getChromeIdentity()') && !/@\/data\/site/.test(lay));
  });
  await check('T11b unpublished slug için getter undefined → metadata {} ve sayfa 404 (aynı durum)', async () => {
    const { p } = make(world({ notes: [nRow(0), nRow(1, { status: 'draft', published_at: null })] }));
    assert.equal(await p.getNote(notes[1].slug), undefined);
  });
  await check('T11c sitemap/robots: yalnızca src/app/robots.ts + sitemap.ts var (statik dosya yok); veri yalnızca @/lib/content getter\'larından', () => {
    const files = readdirSync('src/app', { recursive: true }) as string[];
    const found = files.map(String).filter((f) => /(^|[\\/])(sitemap|robots)\.[a-z]+$/.test(f)).map((f) => f.replace(/\\/g, '/')).sort();
    assert.deepEqual(found, ['robots.ts', 'sitemap.ts']);
    assert.ok(!existsSync('public/sitemap.xml') && !existsSync('public/robots.txt'), 'statik dosya, dinamik rotayı gölgeler');
    const sm = readFileSync('src/app/sitemap.ts', 'utf8');
    const rb = readFileSync('src/app/robots.ts', 'utf8');
    const core = readFileSync('src/lib/seo/crawl.ts', 'utf8');
    for (const [name, src] of [['sitemap.ts', sm], ['robots.ts', rb], ['crawl.ts', core]] as const) {
      assert.ok(!/@\/data\//.test(src), name + ' statik veriye dokunmamalı (cms kesintisinde sessiz geçiş yok)');
      assert.ok(!/supabase|fetch\(|process\.env|from 'node:/.test(src), name + ' doğrudan veri/ağ/ortam kullanmamalı');
    }
    for (const g of ['getCaseStudyProjects', 'getLabEntries', 'getNotes', 'getChromeIdentity']) assert.ok(sm.includes(g), 'sitemap.ts ' + g);
    assert.ok(!/\bgetProjects\b/.test(sm), 'coming-soon filtresi için getCaseStudyProjects kullanılmalı');
    assert.ok(sm.indexOf('await ensureDynamicIfCms()') !== -1 && sm.indexOf('await ensureDynamicIfCms()') < sm.indexOf('loadSitemapEntries('), 'cms modunda dinamik olmalı (veri okumasından ÖNCE)');
    assert.ok(rb.indexOf('await ensureDynamicIfCms()') !== -1 && rb.indexOf('await ensureDynamicIfCms()') < rb.indexOf('getChromeIdentity()'));
    assert.ok(!/\btry\s*\{|\bcatch\s*[({]|\.catch\(/.test(sm + core), 'getter hataları yutulmamalı');
  });
  const smSource = (p: ReturnType<typeof make>['p']) => ({ getChromeIdentity: p.getChromeIdentity, getCaseStudyProjects: p.getCaseStudyProjects, getLabEntries: p.getLabEntries, getNotes: p.getNotes });
  const BASE = `https://${siteConfig.domain}`;
  await check('T11e sitemap (cms): yalnızca yayınlanmış + gerçek detay sayfası olanlar; coming-soon, taslak, preview, admin YOK', async () => {
    const comingIdx = projects.findIndex((x) => x.comingSoon);
    assert.ok(comingIdx !== -1);
    const caseIdx = projects.map((x, i) => (x.comingSoon || !x.caseStudy ? -1 : i)).filter((i) => i !== -1);
    const { p } = make(world({
      projects: [pRow(caseIdx[0]), pRow(comingIdx), pRow(caseIdx[1], { status: 'draft', published_at: null }), pRow(caseIdx[2], { status: 'preview', published_at: null })],
      lab: [lRow(0), lRow(1, { status: 'draft', published_at: null })],
      notes: [nRow(0), nRow(1, { status: 'draft', published_at: null })],
    }));
    const got = await loadSitemapEntries(smSource(p));
    assert.deepEqual(got.map((e) => e.url), [
      `${BASE}/`, `${BASE}/lab`, `${BASE}/notes`,
      `${BASE}/projects/${projects[caseIdx[0]].slug}`,
      `${BASE}/lab/${labEntries[0].slug}`,
      `${BASE}/notes/${notes[0].slug}`,
    ]);
    assert.equal(got.find((e) => e.url.endsWith('/notes/' + notes[0].slug))?.lastModified, notes[0].publishedAt);
    assert.ok(got.filter((e) => !e.url.includes('/notes/')).every((e) => e.lastModified === undefined), 'tarih uydurulmaz');
    const all = JSON.stringify(got);
    for (const hidden of [projects[comingIdx].slug, projects[caseIdx[1]].slug, projects[caseIdx[2]].slug, labEntries[1].slug, notes[1].slug, '/admin', 'preview']) assert.ok(!all.includes(hidden), hidden);
  });
  await check('T11f sitemap (cms): veri kaynağı hatası → FIRLATIR (5xx); kısmi sitemap ya da statik içeriğe geçiş YOK', async () => {
    const full = world({ projects: [pRow(0)], lab: [lRow(0)], notes: [nRow(0)] });
    for (const table of ['projects', 'lab_entries', 'notes', 'site_content_published']) {
      const { p } = make(full, { fail: table });
      // site_content_published hatasında yalnızca KİMLİK statik değere döner (belgelenmiş davranış); içerik getter'ları yine de başarılıdır.
      if (table === 'site_content_published') { const got = await loadSitemapEntries(smSource(p)); assert.equal(got[0].url, `${BASE}/`); continue; }
      await rejects(() => loadSitemapEntries(smSource(p)), 'query');
    }
    const nulls = make(full, { nullData: true });
    await rejects(() => loadSitemapEntries(smSource(nulls.p)));
    const { p: q, errors } = make(full, { fail: 'notes' });
    await rejects(() => loadSitemapEntries(smSource(q)), 'query');
    assert.ok(errors.length >= 1 && errors.every((e) => /^query:/.test(e)), 'günlükte yalnızca kod + tablo');
  });
  await check('T11g sitemap (static mod): src/data kaynaklı; coming-soon yok; veritabanına DOKUNULMAZ', async () => {
    const { p, f } = make(world(), { source: 'static' });
    const got = await loadSitemapEntries(smSource(p));
    const cs = projects.filter((x) => !x.comingSoon && x.caseStudy && x.seo);
    assert.equal(got.length, 3 + cs.length + labEntries.length + notes.length);
    assert.ok(!got.some((e) => e.url.endsWith('/projects/' + projects.find((x) => x.comingSoon)!.slug)));
    assert.equal(f.calls.length, 0);
  });
  await check('T11h buildSitemapEntries/siteBaseUrl/buildRobots: tekilleştirme, tarih doğrulaması, geçersiz alan adı reddi, /admin engeli', () => {
    const e = buildSitemapEntries({ baseUrl: 'https://a.example', projects: [{ slug: 'p' }, { slug: 'p' }], labEntries: [{ slug: 'l' }], notes: [{ slug: 'n1', publishedAt: '2026-03-01' }, { slug: 'n2', publishedAt: 'dün' }] });
    assert.deepEqual(e, [
      { url: 'https://a.example/' }, { url: 'https://a.example/lab' }, { url: 'https://a.example/notes' },
      { url: 'https://a.example/projects/p' }, { url: 'https://a.example/lab/l' },
      { url: 'https://a.example/notes/n1', lastModified: '2026-03-01' }, { url: 'https://a.example/notes/n2' },
    ]);
    assert.equal(siteBaseUrl('muratsisman.com.tr'), 'https://muratsisman.com.tr');
    for (const bad of ['', 'localhost', 'a b.com', 'evil.com/x', 'a.com:8080', 'https://a.com', '-a.com']) assert.throws(() => siteBaseUrl(bad), bad);
    const r = buildRobots('https://a.example');
    assert.deepEqual(r, { rules: [{ userAgent: '*', allow: '/', disallow: ['/admin'] }], sitemap: 'https://a.example/sitemap.xml' });
  });
  await check('T11i Open Graph/Twitter: görsel gerektirmeyen `summary` kartı; başlık/açıklama sayfanınkiyle aynı; not = article', () => {
    const a = socialMetadata({ title: 'T', description: 'D' });
    assert.deepEqual(a.openGraph, { type: 'website', siteName: 'MURAT/LAB', locale: 'tr_TR', title: 'T', description: 'D' });
    assert.deepEqual(a.twitter, { card: 'summary', title: 'T', description: 'D' });
    const b = socialMetadata({ title: 'T', description: 'D', publishedTime: '2026-03-01' });
    assert.deepEqual(b.openGraph, { type: 'article', siteName: 'MURAT/LAB', locale: 'tr_TR', title: 'T', description: 'D', publishedTime: '2026-03-01' });
    assert.ok(!JSON.stringify([a, b]).match(/image|"url"/i), 'görsel ya da og:url yazılmaz');
    const pg = (p: string) => readFileSync(join('src/app/(site)', p), 'utf8');
    assert.ok(pg('projects/[slug]/page.tsx').includes('socialMetadata({ title: project.seo.title, description: project.seo.description })'));
    assert.ok(pg('lab/[slug]/page.tsx').includes('socialMetadata({ title: entry.title, description: entry.summary })'));
    assert.ok(pg('notes/[slug]/page.tsx').includes('socialMetadata({ title: note.title, description: note.excerpt, publishedTime: note.publishedAt })'));
    for (const l of ['lab/page.tsx', 'notes/page.tsx']) { const s = pg(l); assert.ok(/^\s+title,$/m.test(s) && /^\s+description,$/m.test(s) && s.includes('socialMetadata({ title, description })'), l); }
    assert.ok(readFileSync('src/app/layout.tsx', 'utf8').includes('socialMetadata({ title: defaultTitle, description: siteConfig.description })'));
    assert.ok(pg('page.tsx').includes("alternates: { canonical: '/' }"));
  });
  await check('T11j admin/preview noindex korumaları aynen yerinde (meta + X-Robots-Tag + matcher); /admin robots\'ta engelli', () => {
    assert.match(readFileSync('src/app/(admin)/admin/layout.tsx', 'utf8'), /robots: \{ index: false, follow: false \}/);
    const prev = readFileSync('src/app/(admin)/admin/preview/layout.tsx', 'utf8');
    assert.ok(prev.includes('export const metadata = PREVIEW_METADATA;'));
    const mw = readFileSync('src/middleware.ts', 'utf8');
    assert.ok(mw.includes("'X-Robots-Tag', 'noindex, nofollow'") && mw.includes("matcher: ['/admin/:path*']"));
    assert.deepEqual([...ROBOTS_DISALLOW], ['/admin']);
  });
  await check('T11d public liste/detay yüzeyleri taslak sızdıracak kaynakları içermez (SEO alanları satırdan, yalnız yayınlanmışta)', async () => {
    const { p } = make(world({ projects: [pRow(0), pRow(1, { status: 'draft', seo_title: 'GİZLİ TASLAK' })] }));
    const all = JSON.stringify(await p.getProjects());
    assert.ok(!all.includes('GİZLİ TASLAK'));
  });

  /* 12 Admin preview */
  await check('T12 admin preview/editör dosyaları bu fazda DEĞİŞMEDİ (yalnız rpc.ts revalidate kancası)', () => {
    const rpc = readFileSync('src/lib/cms/admin/rpc.ts', 'utf8');
    assert.match(rpc, /publish\|unpublish/);
    assert.match(rpc, /revalidatePublicContent/);
    for (const dir of ['src/lib/cms/preview', 'src/app/(admin)']) {
      const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
      for (const f of walk(dir).filter((f) => /\.(ts|tsx)$/.test(f))) assert.ok(!/@\/lib\/content|lib\/content\//.test(readFileSync(f, 'utf8')), `${f} public içerik katmanına bağımlı olmamalı`);
    }
  });
  await check('T12b revalidate kancası yalnız publish_*/unpublish_* RPC\'lerinde', () => {
    const rpc = readFileSync('src/lib/cms/admin/rpc.ts', 'utf8');
    assert.ok(rpc.includes("/^(publish|unpublish)_/.test(name)"));
  });

  /* Güvenlik */
  await check('S1 public istemci: service-role/secret REDDEDİLİR (createClient hiç çağrılmaz); publishable kabul + auth ayarları createClient spy ile doğrulanır', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`;
    // 1) saf anahtar sınıflandırması
    assert.equal(pub.looksLikeServiceKey('sb_secret_abc'), true);
    assert.equal(pub.looksLikeServiceKey(jwt('service_role')), true);
    assert.equal(pub.looksLikeServiceKey(jwt('anon')), false);
    assert.equal(pub.looksLikeServiceKey('sb_publishable_abc'), false);

    // 2) getSupabaseEnv: anahtar önceliği ve eksik yapılandırma (üretim davranışı korunur)
    const ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
    const saved = Object.fromEntries(ENV.map((n) => [n, process.env[n]]));
    const setEnv = (v: Partial<Record<(typeof ENV)[number], string>>) => { for (const n of ENV) { if (v[n] === undefined) delete process.env[n]; else process.env[n] = v[n]; } };
    // 3) createClient spy: gerçek @supabase/supabase-js yerine, public.ts YENİDEN yüklenirken require katmanında araya girer.
    //    (Gerçek istemcinin iç alanlarına — örn. __opts — bağımlı DEĞİL; yalnızca createClient'a geçirilen argümanlara bakar.)
    type Call = { url: string; key: string; opts: { auth?: Record<string, unknown> } | undefined };
    const calls: Call[] = [];
    const nodeRequire = createRequire(join(process.cwd(), 'package.json'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const M = nodeRequire('node:module') as any;
    const origLoad = M._load;
    const target = nodeRequire.resolve(join(process.cwd(), 'src/lib/supabase/public.ts'));
    let fresh: typeof import('@/lib/supabase/public');
    try {
      M._load = function (request: string, ...rest: unknown[]) {
        if (request === '@supabase/supabase-js') return { createClient: (url: string, key: string, opts?: Call['opts']) => { calls.push({ url, key, opts }); return { spy: true }; } };
        return origLoad.call(this, request, ...rest);
      };
      delete nodeRequire.cache[target];
      fresh = nodeRequire(target);
    } finally {
      M._load = origLoad;
      delete nodeRequire.cache[target]; // spy'lı kopya başka yerde kullanılmasın
    }
    try {
      const URL_ = 'https://x.supabase.co';
      // a) eksik yapılandırma → config hatası, createClient çağrılmaz
      for (const e of [{}, { NEXT_PUBLIC_SUPABASE_URL: URL_ }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }]) {
        setEnv(e);
        assert.throws(() => fresh.createPublicClient(), (err) => err instanceof ContentUnavailableError && err.code === 'config');
      }
      assert.equal(calls.length, 0, 'eksik yapılandırmada createClient çağrılmamalı');

      // b) service-role / secret → REDDEDİLİR, createClient ASLA çağrılmaz (her iki env adı için)
      for (const bad of [jwt('service_role'), 'sb_secret_abc']) {
        for (const name of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const) {
          setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, [name]: bad });
          assert.throws(() => fresh.createPublicClient(), (err) => err instanceof ContentUnavailableError && err.code === 'config', `${name} reddedilmeli`);
        }
      }
      // öncelik gevşetilmez: PUBLISHABLE yerinde service-role varsa, geçerli ANON olsa bile reddedilir
      setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('service_role'), NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') });
      assert.throws(() => fresh.createPublicClient(), ContentUnavailableError);
      assert.equal(calls.length, 0, 'reddedilen anahtarla createClient ÇAĞRILMAMALI');

      // c) publishable kabul + auth ayarları
      const authOff = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
      setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' });
      fresh.createPublicClient();
      assert.equal(calls.length, 1, 'spy etkisiz: createClient yakalanamadı (yükleme yöntemi bu ortamda çalışmıyor)');
      assert.equal(calls[0].url, URL_);
      assert.equal(calls[0].key, 'sb_publishable_abc');
      assert.deepEqual(calls[0].opts?.auth, authOff);

      // d) anahtar önceliği: PUBLISHABLE > ANON; yalnız ANON varsa o kullanılır (JWT anon rolü kabul)
      setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_first', NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') });
      fresh.createPublicClient();
      assert.equal(calls[1].key, 'sb_publishable_first');
      const anon = jwt('anon');
      setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon });
      fresh.createPublicClient();
      assert.equal(calls[2].key, anon);
      assert.deepEqual(calls[2].opts?.auth, authOff);
      assert.equal(calls.length, 3);
    } finally {
      setEnv(saved as Partial<Record<(typeof ENV)[number], string>>);
    }
  });
  await check('S2 yeni kod: admin istemcisi, cookie, service-role, taslak tablo, dangerouslySetInnerHTML, istemci Supabase YOK', () => {
    const files = [...readdirSync('src/lib/content').map((f) => join('src/lib/content', f)), 'src/lib/supabase/public.ts'];
    for (const f of files) {
      // public.ts yalnızca service-role anahtarını REDDETMEK için 'service_role' dizesini içerir
      const svc = f.endsWith('public.ts') ? '' : 'service_role|SERVICE_ROLE|';
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.ok(!new RegExp(svc + 'supabase/(server|admin)|next/headers|cookies\\(|_drafts|dangerouslySetInnerHTML|requireAdmin|callRpc').test(code), f);
    }
  });
  await check('S3 public sayfa/bileşenler @/data/* içe aktarmaz (tek istisna: hasCaseStudy tip koruması) ve istemci bileşeni içerik katmanını çağırmaz', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const bad: string[] = [];
    for (const f of [...walk('src/app/(site)'), ...walk('src/components'), 'src/app/layout.tsx'].filter((f) => /\.tsx?$/.test(f))) {
      const s = readFileSync(f, 'utf8');
      // İstisnalar: hasCaseStudy tip koruması; navigation (statik gezinti bağlantıları — CMS anahtarı değil)
      const stripped = s.replace(/import \{ hasCaseStudy \} from '@\/data\/projects';/, '').replace(/import \{ navigation \} from '@\/data\/navigation';/, '');
      if (/from '@\/data\//.test(stripped)) bad.push(relative('.', f));
      if (/^['"]use client['"]/.test(s) && /@\/lib\/content/.test(s)) bad.push(f + ' (client→content)');
    }
    assert.deepEqual(bad, []);
  });
  await check('S4 hata sınırı (error.tsx) var, sabit güvenli mesaj; ayrıntı göstermez', () => {
    const s = readFileSync('src/app/(site)/error.tsx', 'utf8');
    assert.match(s, /^['"]use client['"]/);
    assert.ok(!/error\.message|error\.stack|\.digest/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')));
  });
  await check('S5 static mod: sağlayıcı bugünkü src/data nesnelerini AYNEN döndürür (görünüm değişmez)', async () => {
    const { p } = make(world(), { source: 'static' });
    assert.equal(await p.getProjects(), projects);
    assert.equal(await p.getLabEntries(), labEntries);
    assert.equal(await p.getNotes(), notes);
    assert.equal((await p.getSiteContent()).siteConfig, siteConfig);
    assert.equal((await p.getLatestNotes(3)).length, Math.min(3, notes.length));
  });
  await check('S6 CMS round-trip: yayınlanmış satırlardan okunan model src/data ile eşdeğer (görünüm paritesi)', async () => {
    const w = world({ projects: projects.map((_, i) => pRow(i)), lab: labEntries.map((_, i) => lRow(i)), notes: notes.map((_, i) => nRow(i)) });
    const { p, skipped } = make(w);
    assert.deepEqual(skipped, []);
    assert.deepEqual(slugs(await p.getProjects()), slugs(projects));
    assert.deepEqual(slugs(await p.getLabEntries()), slugs(labEntries));
    const got = await p.getNotes();
    assert.deepEqual(slugs(got).sort(), slugs(notes).sort());
    for (const n of notes) { const g = got.find((x) => x.slug === n.slug)!; assert.equal(g.title, n.title); assert.deepEqual(g.content, n.content); assert.equal(g.publishedAt, n.publishedAt); }
    for (const e of labEntries) assert.deepEqual(await p.getLabEntry(e.slug), e);
    for (const pr of projects) assert.deepEqual((await p.getProject(pr.slug))?.title, pr.title);
  });
  await check('S7 bozuk yayınlanmış satır tüm sayfayı düşürmez: atlanır, diğerleri görünür', async () => {
    const { p, skipped } = make(world({ notes: [nRow(0), nRow(1, { content: 'bozuk' }), nRow(2, { published_at: 'dün' }), { garbage: true }] }));
    assert.deepEqual(slugs(await p.getNotes()), [notes[0].slug]);
    assert.equal(skipped.length, 2); // status'u published olmayan {garbage} sorgu filtresinde elenir
    assert.ok(skipped.every((s) => /^note:[a-z0-9-]+$/.test(s))); // yalnızca tür + slug loglanır
  });

  finish('Tüm 3B-E kontrolleri geçti.');
}
main().catch((e) => { console.error(e); process.exit(1); });
