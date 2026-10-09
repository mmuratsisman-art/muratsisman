/**
 * FAZ 3B-D önizleme regresyon testleri. Next, Supabase ve veritabanı GEREKMEZ (saf mantık + kaynak taraması).
 * Çalıştırma: TSX_TSCONFIG_PATH=$PWD/tsconfig.json npx tsx scripts/cms/verify-3b-d.ts
 * NOT: Sayfaların gerçek render'ı, oturum/yetki akışı ve `next build` bu betikle DOĞRULANMAZ (bkz. docs/cms/PREVIEW.md §Testler).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { projects } from '@/data/projects';
import { labEntries } from '@/data/lab';
import { notes } from '@/data/notes';
import { siteConfig } from '@/data/site';
import { currently } from '@/data/currently';
import { socialLinks } from '@/data/social';
import { labCategories } from '@/data/lab';
import { labEntryToInsert, noteToInsert, projectToInsert, recordToLabEntry, recordToNote, recordToProject, siteContentToDocuments } from '@/lib/cms/mappers';
import type { LabEntryRecord, NoteRecord, ProjectRecord } from '@/lib/cms/types';
import { baseToProjectDoc, type ProjectBase } from '@/lib/cms/admin/projects';
import { coerceProjectDoc } from '@/lib/cms/admin/project-form';
import { coerceLabDoc } from '@/lib/cms/admin/lab-form';
import { coerceNoteDoc } from '@/lib/cms/admin/note-form';
import { buildProjectPreview } from '@/lib/cms/preview/project';
import { buildLabPreview } from '@/lib/cms/preview/lab';
import { buildNotePreview, sanitizeNoteBlocks } from '@/lib/cms/preview/notes';
import { buildSitePreview, toNode } from '@/lib/cms/preview/site';
import { previewMeta } from '@/lib/cms/preview/common';
import { PREVIEW_METADATA } from '@/lib/cms/preview/metadata';
import { SITE_CONTENT_KEYS } from '@/lib/cms/types';
import type { ProjectDoc } from '@/lib/cms/validate/projects';
import { runner } from './test-harness';

const t = runner();
const ROOT = process.cwd();
const viaJson = <T,>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;

// Veritabanı satırı kalıbı (id/zaman damgaları eklenmiş)
const projRec = (i: number): ProjectRecord => viaJson({ ...projectToInsert(projects[i], i, 'published'), id: `p${i}`, published_at: null, created_at: 'x', updated_at: 'x' });
const projDoc = (i: number): ProjectDoc => baseToProjectDoc(projRec(i) as unknown as ProjectBase);

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const read = (p: string) => readFileSync(p, 'utf8');

async function main() {
  // ───────── PROJECTS
  await t.check('Projects: 3 gerçek vaka projesi → CaseStudyProject; alanlar recordToProject (3A) ile birebir, yalnızca seo uydurulmaz', () => {
    let n = 0;
    projects.forEach((p, i) => {
      if (p.comingSoon) return;
      const m = buildProjectPreview(projDoc(i));
      assert.equal(m.kind, 'case-study', p.slug);
      if (m.kind !== 'case-study') return;
      const oracle = recordToProject(projRec(i)); // 3A mapper'ı bağımsız doğruluk kaynağı (seo_* kayıtta var, belgede yok)
      const { seo: _o, ...oracleRest } = oracle;
      const { seo, ...got } = m.project;
      void _o;
      assert.deepEqual(got, oracleRest, `${p.slug}: önizleme modeli public modelle aynı değil`);
      assert.deepEqual(seo, { title: '', description: '' }, 'seo uydurulmamalı (boş, yalnızca tip gereği)');
      assert.deepEqual(m.warnings, [], `${p.slug}: gerçek içerik yayınlanabilir olmalı`);
      n++;
    });
    assert.equal(n, 3);
  });
  await t.check('Projects: sort_order → index (sıra+1, 2 hane); summary→description; type_label→typeLabel', () => {
    const d = { ...projDoc(0), sort_order: 6, summary: 'Özet X', type_label: 'ETİKET' };
    const m = buildProjectPreview(d);
    assert.equal(m.project.index, '07');
    assert.equal(m.project.description, 'Özet X');
    assert.equal(m.project.typeLabel, 'ETİKET');
  });
  await t.check('Projects: coming_soon → detay sayfası yok mesajı modeli; çökmez', () => {
    const i = projects.findIndex((p) => p.comingSoon);
    const m = buildProjectPreview(projDoc(i));
    assert.equal(m.kind, 'coming-soon');
    assert.equal(m.project.comingSoon, true);
  });
  await t.check('Projects: case_study yok → unrenderable + anlaşılır problem, uydurma içerik yok', () => {
    const m = buildProjectPreview({ ...projDoc(0), case_study: null });
    assert.equal(m.kind, 'unrenderable');
    if (m.kind === 'unrenderable') {
      assert.ok(m.problems[0].includes('Case study yok'));
      assert.equal(m.project.caseStudy, undefined);
    }
    assert.ok(m.warnings.some((w) => w.includes('Case study')));
  });
  await t.check('Projects: bozuk case_study (şekil hatası / yanlış tipler) render modeline GİRMEZ, çökmez', () => {
    const bad: unknown[] = [{ sections: 'x' }, { sections: [{ kind: 'prose' }] }, { sections: [], tags: 5 }, [], 'metin', 42, { sections: [{ kind: 'zzz', id: 'a', heading: 'h' }], tags: [] }];
    for (const cs of bad) {
      const m = buildProjectPreview({ ...projDoc(0), case_study: cs as never });
      assert.equal(m.kind, 'unrenderable', JSON.stringify(cs));
    }
  });
  await t.check('Projects: eksik zorunlu alanlar (tür etiketi/kategori/tür) → çizilir ama UYARI verir; değer UYDURULMAZ', () => {
    const m = buildProjectPreview({ ...projDoc(0), type_label: null, category: null, kind: null });
    assert.equal(m.kind, 'case-study');
    if (m.kind !== 'case-study') return;
    assert.equal(m.project.typeLabel, '');
    assert.equal(m.project.category, '');
    assert.equal(m.project.kind, undefined);
    assert.ok(m.warnings.some((w) => w.startsWith('Tür etiketi')) && m.warnings.some((w) => w.startsWith('Kategori')) && m.warnings.some((w) => w.startsWith('Proje türü')));
  });
  await t.check('Projects: bozuk taslak jsonb (coerce) → fallback + önizleme çökmez', () => {
    const base = projDoc(0);
    for (const junk of [null, 'x', 5, [], {}, { title: 5, tags: 'a', case_study: 'x', accent: 'zzz' }]) {
      const m = buildProjectPreview(coerceProjectDoc(junk, base));
      assert.ok(['case-study', 'unrenderable', 'coming-soon'].includes(m.kind));
    }
  });
  await t.check('Projects: slug değişmiş taslak → model taslağın slug’ını taşır, arama/kimlik id ile (slug’a bağlı değil)', () => {
    const m = buildProjectPreview({ ...projDoc(0), slug: 'yeni-slug' });
    assert.equal(m.project.slug, 'yeni-slug');
  });

  // ───────── LAB
  await t.check('Lab: 3 gerçek girdi → önizleme modeli recordToLabEntry (3A) ile birebir; uyarı yok', () => {
    labEntries.forEach((e, i) => {
      const rec = viaJson<LabEntryRecord>({ ...labEntryToInsert(e, i, 'published'), id: `l${i}`, published_at: null, created_at: 'x', updated_at: 'x' });
      const doc = coerceLabDoc(rec, { slug: '', title: '', short_title: null, type: 'EXPERIMENT', experiment_status: 'ACTIVE', category: null, summary: '', description: '', accent: 'blue', featured: false, year: '', tags: [], story: {}, sort_order: 0 });
      const m = buildLabPreview(doc);
      assert.deepEqual(m.entry, recordToLabEntry(rec), e.slug);
      assert.equal(m.expLabel, `EXP-${String(i + 1).padStart(2, '0')}`);
      assert.deepEqual(m.warnings, [], e.slug);
    });
  });
  await t.check('Lab: eksik/bozuk veri çökmez, uyarı verir', () => {
    const m = buildLabPreview(coerceLabDoc({ title: 'x', story: 'bozuk', tags: 5 }, coerceLabDoc({}, { slug: 's', title: '', short_title: null, type: 'EXPERIMENT', experiment_status: 'ACTIVE', category: null, summary: '', description: '', accent: 'blue', featured: false, year: '', tags: [], story: {}, sort_order: 0 })));
    assert.ok(m.warnings.length > 0);
  });

  // ───────── NOTES
  await t.check('Notes: 3 gerçek not → recordToNote (3A) ile birebir (tarih, içerik, etiketler); uyarı yok', () => {
    notes.forEach((n, i) => {
      const rec = viaJson<NoteRecord>({ ...noteToInsert(n, 'published'), id: `n${i}`, created_at: 'x', updated_at: 'x' });
      const doc = coerceNoteDoc(rec, { slug: '', title: '', excerpt: '', content: [], tags: [], accent: 'blue', reading_time_minutes: null, published_at: null });
      const m = buildNotePreview(doc);
      const oracle = recordToNote(rec);
      assert.equal(m.hasDate, true);
      assert.equal(m.note.slug, oracle.slug);
      assert.deepEqual(m.note.content, oracle.content);
      assert.deepEqual(m.note.tags, oracle.tags);
      assert.equal(m.note.title, oracle.title);
      assert.equal(m.note.publishedAt.slice(0, 10), oracle.publishedAt);
      assert.deepEqual(m.warnings, [], n.slug);
    });
  });
  await t.check('Notes: yayın tarihi atanmamış → hasDate=false, tarih uydurulmaz', () => {
    const m = buildNotePreview({ slug: 'x', title: 'T', excerpt: 'E', content: [{ kind: 'p', text: 'a' }], tags: [], accent: 'blue', reading_time_minutes: null, published_at: null });
    assert.equal(m.hasDate, false);
    assert.equal(m.note.publishedAt, '');
    const bad = buildNotePreview({ slug: 'x', title: 'T', excerpt: 'E', content: [], tags: [], accent: 'blue', reading_time_minutes: null, published_at: 'tarih-degil' });
    assert.equal(bad.hasDate, false);
  });
  await t.check('Notes: bozuk bloklar süzülür ve sayılır (NoteBody çökmez); liste öğesi metin değilse atılır', () => {
    const r = sanitizeNoteBlocks([{ kind: 'p', text: 'ok' }, { kind: 'list' }, { kind: 'list', items: [1] }, { kind: 'h', text: 5 }, null, 'x', { kind: 'zzz', text: 'a' }, { kind: 'list', items: ['a', 'b'] }, { kind: 'quote', text: 'q' }]);
    assert.deepEqual(r.blocks, [{ kind: 'p', text: 'ok' }, { kind: 'list', items: ['a', 'b'] }, { kind: 'quote', text: 'q' }]);
    assert.equal(r.dropped, 6);
    assert.deepEqual(sanitizeNoteBlocks('x'), { blocks: [], dropped: 1 });
    assert.deepEqual(sanitizeNoteBlocks(undefined), { blocks: [], dropped: 0 });
    const m = buildNotePreview({ slug: 'x', title: 'T', excerpt: 'E', content: [{ kind: 'list' }] as never, tags: [], accent: 'blue', reading_time_minutes: null, published_at: null });
    assert.ok(m.warnings.some((w) => w.includes('geçersiz biçimde')));
  });

  // ───────── SITE
  await t.check('Site: 10 gerçek belge doğrulanır (valid) ve düz metin ağacına çevrilir', () => {
    const docs = viaJson<Record<string, unknown>>(siteContentToDocuments({ siteConfig, currently, socialLinks, labCategories }));
    for (const key of SITE_CONTENT_KEYS) {
      const m = buildSitePreview(key, docs[key]);
      assert.equal(m.kind, 'doc', key);
      if (m.kind === 'doc') { assert.equal(m.valid, true, `${key}: ${m.problem}`); assert.equal(m.node.t === 'object' || m.node.t === 'list', true); }
    }
  });
  await t.check('Site: boş belge → empty; geçersiz belge → çökmez, problem döner', () => {
    assert.equal(buildSitePreview('hero', null).kind, 'empty');
    const m = buildSitePreview('hero', { eyebrow: 5 });
    assert.equal(m.kind, 'doc');
    if (m.kind === 'doc') { assert.equal(m.valid, false); assert.ok(m.problem); }
    assert.equal(buildSitePreview('hero', 'metin').kind, 'doc');
  });
  await t.check('Site: XSS dizgeleri yalnızca METİN düğümü olur; derinlik/boyut sınırı vardır', () => {
    const n = toNode({ a: '<img src=x onerror=alert(1)>', b: ['<script>x</script>', 'javascript:alert(1)'] });
    assert.equal(JSON.stringify(n).includes('"t":"text"'), true);
    let deep: unknown = 'x';
    for (let i = 0; i < 50; i++) deep = { k: deep };
    assert.ok(JSON.stringify(toNode(deep)).includes('…'));
    assert.ok(JSON.stringify(toNode(Array.from({ length: 5000 }, (_, i) => i))).length < 60_000);
  });

  // ───────── Yaşam döngüsü kaynağı / meta
  await t.check('Kaynak seçimi: taslak varsa "draft", yoksa "live"; stale iletilir', () => {
    assert.equal(previewMeta({ expectedDraftUpdatedAt: '2026-10-06T10:00:00.123456+00:00', stale: false, lifecycle: { label: 'L' } }).source, 'draft');
    assert.equal(previewMeta({ expectedDraftUpdatedAt: '', stale: false, lifecycle: { label: 'L' } }).source, 'live');
    assert.equal(previewMeta({ expectedDraftUpdatedAt: 'x', stale: true, lifecycle: { label: 'L' } }).stale, true);
  });

  // ───────── Güvenlik (kaynak taraması)
  const previewFiles = [
    ...walk(join(ROOT, 'src/lib/cms/preview')),
    ...walk(join(ROOT, 'src/components/admin/preview')),
    ...walk(join(ROOT, 'src/app/(admin)/admin/preview')),
  ];
  await t.check('Güvenlik: önizleme kodunda yazma/RPC/publish/service-role/dangerouslySetInnerHTML/fetch/log YOK', () => {
    assert.ok(previewFiles.length >= 15, `dosya sayısı: ${previewFiles.length}`);
    const forbidden: [RegExp, string][] = [
      [/\.(insert|update|upsert|delete)\s*\(/, 'yazma çağrısı'],
      [/\.rpc\s*\(/, 'rpc'],
      [/publish_|save_\w*draft|unpublish|discard_|create_(project|lab|note)/i, 'yaşam döngüsü RPC adı'],
      [/service[_-]?role|SERVICE_ROLE/i, 'service role'],
      [/dangerouslySetInnerHTML|innerHTML/, 'ham HTML'],
      [/['"]use server['"]/, 'server action'],
      [/\bfetch\s*\(/, 'ağ çağrısı'],
      [/console\.(log|info|debug|error|warn)/, 'log'],
      [/process\.env/, 'env okuma'],
      [/createClient|@\/lib\/supabase\/server|@supabase/, 'doğrudan Supabase'],
    ];
    for (const f of previewFiles) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const [re, why] of forbidden) assert.ok(!re.test(src), `${relative(ROOT, f)}: yasak (${why})`);
    }
  });
  await t.check('Güvenlik: her preview page requireAdmin()+notFound() ile korunur, noindex metadata dışa aktarır, yalnızca load*Editor okur', () => {
    const pages = previewFiles.filter((f) => f.endsWith('page.tsx'));
    assert.equal(pages.length, 4);
    for (const f of pages) {
      const s = read(f);
      assert.match(s, /\(await requireAdmin\(\)\)\.kind !== 'admin'\) notFound\(\)/, `${f}: yetki kapısı`);
      assert.match(s, /export const metadata = PREVIEW_METADATA/, `${f}: metadata`);
      assert.match(s, /export const dynamic = 'force-dynamic'/, `${f}: dinamik`);
      assert.match(s, /load(Project|Lab|Note|Site)Editor\(/, `${f}: okuma fonksiyonu`);
      // yetki kontrolü ilk await olmalı: veri okumadan önce
      assert.ok(s.indexOf('requireAdmin()') < s.indexOf('Editor('), `${f}: yetki veri okumadan önce`);
    }
    const layout = read(join(ROOT, 'src/app/(admin)/admin/preview/layout.tsx'));
    assert.match(layout, /requireAdmin\(\)/);
    assert.match(layout, /export const metadata = PREVIEW_METADATA/);
  });
  await t.check('Güvenlik: PREVIEW_METADATA noindex,nofollow,nocache', () => {
    const r = PREVIEW_METADATA.robots as { index: boolean; follow: boolean; nocache: boolean };
    assert.equal(r.index, false); assert.equal(r.follow, false); assert.equal(r.nocache, true);
  });
  await t.check('Güvenlik: preview lib dosyaları next/* veya sunucu/DB modülü içe aktarmaz (saf mantık)', () => {
    for (const f of previewFiles.filter((x) => x.includes('/lib/cms/preview/'))) {
      const imports = [...read(f).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const i of imports) assert.ok(!/^next\//.test(i) || (f.endsWith('metadata.ts') && i === 'next'), `${f}: ${i}`);
      assert.ok(!imports.some((i) => /supabase|entity-actions|rpc/.test(i)), f);
    }
  });
  await t.check('Tasarım varsayımı: public proje bileşenleri `seo` alanını okumaz (önizlemedeki boş seo güvenli)', () => {
    for (const f of walk(join(ROOT, 'src/components/project')).concat(walk(join(ROOT, 'src/components/ui')))) assert.ok(!/\.seo\b/.test(read(f)), f);
  });
  await t.check('Editör entegrasyonu: 4 editör sayfasında Önizle bağlantısı (yeni sekme, noopener); bağlantı kimlik/anahtar ile (slug değil)', () => {
    const base = 'src/app/(admin)/admin/(protected)';
    for (const [p, href] of [['projects/[id]', '/admin/preview/projects/${id}'], ['lab/[id]', '/admin/preview/lab/${id}'], ['notes/[id]', '/admin/preview/notes/${id}'], ['site/[key]', '/admin/preview/site/${key}']] as const) {
      const s = read(join(ROOT, base, p, 'page.tsx'));
      assert.ok(s.includes(`<PreviewLink href={\`${href}\`} />`), p);
      assert.ok(!/preview[^`]*slug/.test(s), p);
    }
    const link = read(join(ROOT, 'src/components/admin/preview/PreviewLink.tsx'));
    assert.match(link, /target="_blank"/); assert.match(link, /rel="noopener noreferrer"/);
    assert.match(link, /kaydedilmemiş değişiklikler görünmez/);
  });
  await t.check('Kapsam: public sayfalar ve src/data önizleme dosyalarından içe aktarılmaz/değiştirilmez (preview, (site) rotalarına bağımlı değil)', () => {
    for (const f of previewFiles) assert.ok(!/from '[^']*(app\/\(site\)|@\/data\/)/.test(read(f)), f);
  });

  t.finish('FAZ 3B-D önizleme testleri GEÇTİ.');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
