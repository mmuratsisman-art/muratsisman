/**
 * FAZ 3B-B — PLANLAYICI / EŞLEME / SNAPSHOT birim testleri. Veritabanı, Next ve Supabase GEREKTİRMEZ.
 *   npx tsx scripts/cms/verify-3b-b.ts
 * (Gerçek PostgreSQL üzerindeki yürütme/resume/rollback senaryoları: verify-3b-b-pg.ts)
 */
import { existsSync } from 'node:fs';
import { runner } from './test-harness';
import { realSourceInput, buildSource, sourcePathOf, siteSourcePath } from './import/source';
import { PROJECT_MAP, LAB_MAP, NOTE_MAP } from './import/mapping';
import { buildPlan, applyToken } from './import/planner';
import { emptySnapshot, normalizeSnapshot, snapshotSql } from './import/snapshot';
import { hashOf, normTs, canonicalize } from './import/canonical';
import { readFile } from './import/test-support';
import type { LiveRow, TargetSnapshot } from './import/types';

const t = runner();
const NOW = '2026-10-08T09:00:00.000Z';
const eq = (a: unknown, b: unknown, m: string) => { if (canonicalize(a) !== canonicalize(b)) throw new Error(`${m}: ${canonicalize(a).slice(0, 160)} ≠ ${canonicalize(b).slice(0, 160)}`); };
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };

const bundle = buildSource();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const input = () => clone(realSourceInput());

async function main() {
// ───────────── eşleme tamlığı
await t.check('kaynak: 20 kayıt (4 proje, 3 lab, 3 not, 10 site) ve hepsi hedef doğrulayıcılardan geçiyor', () => {
  eq(bundle.records.length, 20, 'kayıt sayısı');
  eq(['project', 'lab_entry', 'note', 'site_content'].map((k) => bundle.records.filter((r) => r.kind === k).length), [4, 3, 3, 10], 'tür dağılımı');
  const bad = bundle.records.filter((r) => !r.validation.ok);
  ok(bad.length === 0, `geçersiz kayıtlar: ${bad.map((b) => `${b.kind}:${b.key} ${b.validation.errors.join(' | ')}`).join(' ; ')}`);
  eq(bundle.globalErrors, [], 'genel hata');
});
await t.check('eşleme tamlığı: gerçek kaynak nesnelerin HER anahtarı eşleme tablosunda var', () => {
  const src = realSourceInput();
  for (const p of src.projects) for (const k of Object.keys(p)) ok(k in PROJECT_MAP, `Project.${k} eşlenmemiş`);
  for (const e of src.labEntries) for (const k of Object.keys(e)) ok(k in LAB_MAP, `LabEntry.${k} eşlenmemiş`);
  for (const n of src.notes) for (const k of Object.keys(n)) ok(k in NOTE_MAP, `NoteEntry.${k} eşlenmemiş`);
});
await t.check('eşleme tamlığı (negatif): eşlenmemiş yeni kaynak alanı sessizce geçmez, kayıt geçersiz sayılır', () => {
  const i = input();
  (i.projects[0] as unknown as Record<string, unknown>).newField = 'x';
  (i.notes[0] as unknown as Record<string, unknown>).cover = 'x';
  (i.labEntries[0] as unknown as Record<string, unknown>).owner = 'x';
  (i.siteConfig as unknown as Record<string, unknown>).footer = {};
  const b = buildSource(i);
  const errs = b.records.flatMap((r) => r.validation.errors).join(' | ');
  for (const f of ['newField', 'cover', 'owner', 'footer']) ok(errs.includes(`"${f}"`), `${f} yakalanmadı`);
  const plan = buildPlan(b, emptySnapshot(), { now: NOW });
  ok(!plan.canApply && plan.blockers.some((x) => x.startsWith('source_invalid')), 'geçersiz kaynak apply\'ı engellemeli');
});
await t.check('doğrulama (negatif): hedef doğrulayıcının reddettiği içerik engel üretir', () => {
  const i = input();
  i.notes[1].excerpt = ''; // yayın modunda özet zorunlu
  i.labEntries[0].year = '26';
  i.projects[1].tags = Array.from({ length: 13 }, (_, k) => `t${k}`);
  const b = buildSource(i);
  const bad = b.records.filter((r) => !r.validation.ok).map((r) => r.key);
  for (const k of ['otomasyon-surtunmeyi-azaltmali', 'ai-tool-explorations', 'migration-center']) ok(bad.includes(k), `${k} reddedilmedi`);
});
await t.check('kaynak: index = konum + 1, tarih sırası, tekrar eden slug denetimi', () => {
  const i = input();
  i.projects[2].index = '09';
  ok(buildSource(i).records.some((r) => r.key === 'ai-lab' && r.validation.errors.some((e) => e.includes('index'))), 'index tutarsızlığı yakalanmalı');
  const j = input();
  j.notes[2].publishedAt = j.notes[1].publishedAt;
  ok(buildSource(j).globalErrors.length > 0, 'tarih eşitliği yakalanmalı');
  const k = input();
  k.labEntries[1].slug = k.labEntries[0].slug;
  ok(buildSource(k).globalErrors.some((e) => e.includes('tekrar eden')), 'kopya slug yakalanmalı');
});
await t.check('kaynak yolları gerçek: dosya var ve slug/anahtar içeriğinde geçiyor', () => {
  for (const r of bundle.records) {
    ok(existsSync(r.sourcePath), `${r.sourcePath} yok`);
    if (r.kind === 'site_content') continue;
    ok(readFile(r.sourcePath).includes(`"${r.key}"`) || readFile(r.sourcePath).includes(`'${r.key}'`), `${r.sourcePath} içinde ${r.key} yok`);
  }
  eq(sourcePathOf('note', 'kullanisli-ai-asistani'), 'src/data/notes/useful-ai-assistant.ts', 'yol');
  eq(siteSourcePath('currently'), 'src/data/currently.ts', 'yol');
});
await t.check('navigation.ts bilerek taşınmıyor (raporlanır)', () => {
  eq(bundle.notImported.map((n) => n.source), ['src/data/navigation.ts'], 'taşınmayan');
  ok(!bundle.records.some((r) => r.key === 'navigation'), 'navigation kaydı olmamalı');
});
await t.check('sıra/slug/tarih/SEO korunuyor: sort_order konumdan, not tarihi UTC gece yarısı, SEO yalnız 3 projede', () => {
  eq(bundle.records.filter((r) => r.kind === 'project').map((r) => [r.key, r.doc.sort_order]), [['yakala', 0], ['migration-center', 1], ['ai-lab', 2], ['coming-soon', 3]], 'proje sırası');
  eq(bundle.records.filter((r) => r.kind === 'lab_entry').map((r) => [r.key, r.doc.sort_order]), [['ai-tool-explorations', 0], ['automation-playground', 1], ['web-product-experiments', 2]], 'lab sırası');
  eq(bundle.records.filter((r) => r.kind === 'note').map((r) => [r.key, r.doc.published_at]), [['kullanisli-ai-asistani', '2026-10-06T00:00:00Z'], ['otomasyon-surtunmeyi-azaltmali', '2026-10-02T00:00:00Z'], ['buyuk-kurmadan-once-kucuk-kurmak', '2026-09-28T00:00:00Z']], 'not tarihleri');
  eq(bundle.records.filter((r) => r.seo).map((r) => r.key), ['yakala', 'migration-center', 'ai-lab'], 'SEO\'lu projeler');
  ok(bundle.records.filter((r) => r.seo).every((r) => r.seo!.seo_title.length > 0 && r.seo!.seo_description.length > 0), 'SEO alanları dolu olmalı');
  ok(!('seo_title' in bundle.records[0].doc), 'SEO draft doc\'a konmaz (RPC yazmaz); ayrı adımdır');
});

// ───────────── planlayıcı: boş hedef, determinizm
const empty = emptySnapshot();
await t.check('planlayıcı: boş hedefte 20 CREATE, adım sırası ve onay belirteci', () => {
  const p = buildPlan(bundle, empty, { now: NOW });
  eq(p.counts, { source: 20, targetBefore: 0, create: 20, resume: 0, skip: 0, conflict: 0, unverifiable: 0 }, 'sayımlar');
  ok(p.canApply, 'uygulanabilir olmalı');
  const proj = p.items.find((i) => i.key === 'yakala')!;
  eq(proj.steps, ['intent', 'create', 'record_created', 'publish', 'record_published', 'seo', 'verify_complete'], 'proje adımları');
  eq(p.items.find((i) => i.key === 'coming-soon')!.steps.includes('seo'), false, 'SEO\'suz projede seo adımı yok');
  eq(p.items.find((i) => i.key === 'hero')!.steps, ['intent', 'save_draft', 'record_created', 'publish_site', 'record_published', 'verify_complete'], 'site adımları');
  eq(p.items.map((i) => i.kind), [...p.items.map((i) => i.kind)].sort((a, b) => ['project', 'lab_entry', 'note', 'site_content'].indexOf(a) - ['project', 'lab_entry', 'note', 'site_content'].indexOf(b)), 'tür sırası');
  ok(/^APPLY-[0-9a-f]{12}$/.test(applyToken(p)), 'belirteç biçimi');
});
await t.check('planlayıcı: aynı girdi → aynı özet (deterministik); kaynak değişince özet değişir', () => {
  const a = buildPlan(bundle, empty, { now: NOW });
  const b = buildPlan(buildSource(), empty, { now: '2030-01-01T00:00:00.000Z' });
  eq(a.planDigest, b.planDigest, 'özet zamandan bağımsız olmalı');
  const i = input(); i.projects[0].title = 'YAKALA!';
  ok(buildPlan(buildSource(i), empty, { now: NOW }).planDigest !== a.planDigest, 'kaynak değişimi özeti değiştirmeli');
  ok(buildPlan(bundle, emptySnapshot(false), { now: NOW }).planDigest !== a.planDigest, '0006 durumu özeti değiştirmeli');
});
await t.check('0006 yoksa dry-run serbest ama apply engelli (fail-closed)', () => {
  const p = buildPlan(bundle, emptySnapshot(false), { now: NOW });
  ok(!p.canApply && p.blockers.some((b) => b.startsWith('provenance_table_missing')), '0006 yokluğu engel olmalı');
  eq(p.counts.create, 20, 'plan yine de hesaplanır');
});

// ───────────── çakışma: sentetik QA satırları
const live = (over: Partial<LiveRow> & { slug: string; id: string }, doc: Record<string, unknown> = {}): LiveRow => ({
  status: 'published', published_at: '2026-10-01T00:00:00.000000Z', created_at: '2026-10-01T00:00:00.000000Z', updated_at: '2026-10-01T00:00:00.000000Z',
  created_by: 'aaaaaaaa-0000-4000-8000-000000000001', doc: { slug: over.slug, title: 'QA', sort_order: 0, ...doc }, seo: null, ...over,
});
const withRows = (f: (s: TargetSnapshot) => void): TargetSnapshot => { const s = emptySnapshot(); f(s); return s; };

await t.check('çakışma: aynı slug başka içerikte → CONFLICT, apply engellenir, QA benzerliği işaretlenir', () => {
  const s = withRows((x) => x.rows.project.push(live({ id: 'q1', slug: 'yakala', status: 'draft', published_at: null }, { title: 'faz 3b test' })));
  const p = buildPlan(bundle, s, { now: NOW });
  const it = p.items.find((i) => i.key === 'yakala')!;
  eq(it.decision, 'CONFLICT', 'karar');
  ok(it.reasons.join().includes('slug_exists_different') && it.reasons.join().includes('farklı alanlar'), 'gerekçe alanları listelemeli');
  ok(!p.canApply && p.counts.conflict === 1, 'apply engelli olmalı');
  eq(p.counts.create, 19, 'çakışmayan 19 CREATE kalır ama apply yine de hiç yazmaz (kapı)');
});
await t.check('çakışma: başka kaydın bekleyen taslağı bu slug\'ı istiyor → CONFLICT draft_slug_claim', () => {
  const s = withRows((x) => {
    x.rows.note.push(live({ id: 'n9', slug: 'baska-not', status: 'draft', published_at: null }));
    x.drafts.note.push({ entity_id: 'n9', data: { slug: 'kullanisli-ai-asistani', title: 'x' }, based_on_updated_at: '2026-10-01T00:00:00.000000Z', created_at: '2026-10-01T00:00:00.000000Z', updated_at: '2026-10-01T00:00:00.000000Z', updated_by: null });
  });
  eq(buildPlan(bundle, s, { now: NOW }).items.find((i) => i.key === 'kullanisli-ai-asistani')!.decision, 'CONFLICT', 'karar');
});
await t.check('çakışma: site anahtarında farklı yayınlanmış/taslak belge → CONFLICT (üzerine yazılmaz)', () => {
  const s = withRows((x) => {
    x.sitePublished.push({ key: 'hero', data: { eyebrow: 'QA' }, published_at: '2026-10-01T00:00:00.000000Z', published_by: null });
    x.siteDrafts.push({ key: 'about', data: { title: 'QA' }, updated_at: '2026-10-01T00:00:00.000000Z', updated_by: null });
  });
  const p = buildPlan(bundle, s, { now: NOW });
  eq(p.items.find((i) => i.key === 'hero')!.decision, 'CONFLICT', 'hero');
  eq(p.items.find((i) => i.key === 'about')!.decision, 'CONFLICT', 'about');
  ok(p.items.find((i) => i.key === 'hero')!.reasons[0].startsWith('published_exists_different'), 'gerekçe');
});
await t.check('özdeş ama import\'a ait olmayan kayıt/belge SAHİPLENİLMEZ (SKIP_IDENTICAL_UNMANAGED)', () => {
  const hero = bundle.records.find((r) => r.key === 'hero')!;
  const proj = bundle.records.find((r) => r.key === 'coming-soon')!;
  const s = withRows((x) => {
    x.sitePublished.push({ key: 'hero', data: hero.doc, published_at: '2026-10-01T00:00:00.000000Z', published_by: null });
    x.rows.project.push(live({ id: 'p4', slug: 'coming-soon' }, proj.doc));
  });
  const p = buildPlan(bundle, s, { now: NOW });
  eq(p.items.find((i) => i.key === 'hero')!.decision, 'SKIP_IDENTICAL_UNMANAGED', 'hero');
  eq(p.items.find((i) => i.key === 'coming-soon')!.decision, 'SKIP_IDENTICAL_UNMANAGED', 'coming-soon');
  eq(p.items.find((i) => i.key === 'hero')!.steps, [], 'yazma adımı yok');
});
await t.check('cutover riski: kaynakta olmayan YAYINLANMIŞ QA satırı raporlanır ve 3B-E engeli işaretlenir; yayınlanmamış olan yalnız bilgi', () => {
  const s = withRows((x) => {
    x.rows.project.push(live({ id: 'qa1', slug: 'faz-3b-a2-test-projesi' }, { title: 'A2 test', sort_order: 0 }));
    x.rows.note.push(live({ id: 'qa2', slug: 'a1-test-notu', status: 'draft', published_at: null }));
  });
  const p = buildPlan(bundle, s, { now: NOW });
  const cut = p.findings.filter((f) => f.cutoverBlocker);
  eq(cut.map((f) => f.key), ['faz-3b-a2-test-projesi'], 'cutover engelleri');
  ok(p.findings.some((f) => f.code === 'foreign_nonpublished_rows'), 'yayınlanmamış QA bilgisi');
  ok(p.findings.some((f) => f.code === 'sort_order_tie'), 'sort_order=0 çakışması (yakala ile) raporlanmalı');
  ok(p.canApply, 'QA satırı apply\'ı engellemez (dokunulmaz, yalnızca raporlanır)');
  ok(p.items.every((i) => i.key !== 'faz-3b-a2-test-projesi'), 'QA satırı plan kalemi olmaz');
});

// ───────────── snapshot
await t.check('normTs: PostgREST ve SQL biçimleri aynı kanonik biçime iner (mikrosaniye korunur)', () => {
  const a = normTs('2026-10-08T08:11:03.123456+00:00'); const b = normTs('2026-10-08T08:11:03.123456Z'); const c = normTs('2026-10-08 11:11:03.123456+03');
  eq([a, b, c], ['2026-10-08T08:11:03.123456Z', '2026-10-08T08:11:03.123456Z', '2026-10-08T08:11:03.123456Z'], 'normTs');
  eq(normTs('2026-10-06T00:00:00Z'), '2026-10-06T00:00:00.000000Z', 'kesir yok');
  let threw = false; try { normTs('dün'); } catch { threw = true; } ok(threw, 'tanınmayan biçim fail-closed olmalı');
});
await t.check('snapshot doğrulaması: bozuk/eksik girdi reddedilir (fail-closed)', () => {
  for (const bad of [null, {}, { version: 2 }, { version: 1, capturedAt: 'x', projects: 'x' }]) {
    let threw = false; try { normalizeSnapshot(bad); } catch { threw = true; } ok(threw, `reddedilmedi: ${JSON.stringify(bad)}`);
  }
});
await t.check('salt-okunur snapshot SQL: tek SELECT, yazma/DDL ifadesi içermez; --no-provenance 0006 tablolarını okumaz', () => {
  for (const withProv of [true, false]) {
    const sql = snapshotSql({ provenance: withProv });
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    ok(!/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do)\b/i.test(code), 'yazma/DDL anahtar sözcüğü bulundu');
    eq((code.match(/;/g) ?? []).length, 1, 'tek ifade');
    ok(/^\s*select /i.test(code.trim()), 'SELECT ile başlamalı');
    eq(code.includes('content_import_items'), withProv, '0006 tablosu yalnızca provenance modunda');
  }
});
await t.check('hashOf kanonik: anahtar sırasından bağımsız, içerikten bağımlı', () => {
  eq(hashOf({ a: 1, b: [1, 2] }), hashOf({ b: [1, 2], a: 1 }), 'sıra');
  ok(hashOf({ a: 1 }) !== hashOf({ a: 2 }), 'içerik');
});

t.finish('FAZ 3B-B birim testleri GEÇTİ.');
}
main().catch((e) => { console.error(e); process.exit(1); });
