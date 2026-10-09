import { spawnSync } from 'node:child_process';
/**
 * FAZ 3B-B — GERÇEK PostgreSQL üzerinde yürütme testleri (apply, idempotency, TOCTOU, resume, SEO, tutarsızlık denetimi, rollback).
 * Yerel, geçici bir PostgreSQL gerekir (üretim DB'sine ASLA bağlanmaz). Ortam: PG_TEST_HOST, PG_TEST_PORT, [PG_TEST_USER]
 *   scripts/cms/run-3b-b-tests.sh  geçici bir küme kurup bu betiği çalıştırır.
 * Migration'lar 0001,0002,0004,0005,0006 gerçekten uygulanır; RPC'ler `authenticated` rolü + admin JWT claim'i ile çağrılır
 * (RLS/is_admin() devrede). Supabase'e özgü auth şeması yalnızca küçük bir taklit ile sağlanır (test-fixtures/supabase-stub.sql).
 */
import assert from 'node:assert/strict';
import { runner } from './test-harness';
import { projects } from '@/data/projects';
import { labEntries, labCategories } from '@/data/lab';
import { notes } from '@/data/notes';
import { siteConfig } from '@/data/site';
import { currently } from '@/data/currently';
import { socialLinks } from '@/data/social';
import { documentsToSiteContent, recordToLabEntry, recordToNote, recordToProject } from '@/lib/cms/mappers';
import type { LabEntryRecord, NoteRecord, ProjectRecord, SiteContentMap } from '@/lib/cms/types';
import { buildSource, realSourceInput } from './import/source';
import { applyToken, buildPlan } from './import/planner';
import { applyPlan, type ApplyResult } from './import/executor';
import { normalizeSnapshot, snapshotSql } from './import/snapshot';
import { verifyImport } from './import/verify';
import { applyRollback, planRollback, rollbackToken } from './import/rollback';
import { canonicalize } from './import/canonical';
import { OTHER_ADMIN, buildTemplate, pgEnv, scenarioDb } from './import/test-support';
import type { ImportTarget } from './import/target';
import type { Plan } from './import/types';

const env = pgEnv();
if (!env) {
  console.log('ATLANDI: PG_TEST_HOST/PG_TEST_PORT tanımlı değil. Bu testler ÇALIŞTIRILMADI (PASS sayılmaz). scripts/cms/run-3b-b-tests.sh kullanın.');
  process.exit(0);
}

const t = runner();
const bundle = buildSource();
const now = () => new Date().toISOString();
type Db = ReturnType<typeof scenarioDb>;
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const eq = (a: unknown, b: unknown, m: string) => { if (canonicalize(a) !== canonicalize(b)) throw new Error(`${m}: ${canonicalize(a).slice(0, 200)} ≠ ${canonicalize(b).slice(0, 200)}`); };

async function main() {
  const TMPL = buildTemplate(env!);
  const created: Db[] = [];
  const mk = (userId?: string, seed = true): Db => { const d = scenarioDb(env!, TMPL, userId, seed); created.push(d); return d; };
  const planOf = async (d: Db, b = bundle): Promise<Plan> => buildPlan(b, await d.target.readSnapshot(), { now: now() });
  const applyAll = (d: Db, p: Plan, extra: Partial<Parameters<typeof applyPlan>[0]> = {}): Promise<ApplyResult> =>
    applyPlan({ target: d.target, bundle, approved: p, confirm: applyToken(p), ...extra });
  const crashAt = (key: string, step: string) => { let hit = false; return ({ key: k, step: s }: { key: string; step: string; kind: string }) => { if (!hit && k === key && s === step) { hit = true; throw new Error(`CRASH@${key}:${step}`); } }; };
  const qaProject = async (d: Db, slug: string, publish: boolean, extra: Record<string, unknown> = {}) => {
    const r = await d.target.rpc('create_project', { p_data: { slug, title: `QA ${slug}`, subtitle: '', summary: 'qa', accent: 'blue', size: 'standard', graphic: 'rings', tags: [], coming_soon: false, kind: 'personal', type_label: 't', category: 'c', project_status_label: null, project_status_accent: null, case_study: null, sort_order: 0, ...extra } });
    assert.ok(r.ok, `QA create: ${r.ok ? '' : r.error}`);
    if (publish) assert.ok((await d.target.rpc('publish_project', { p_id: r.data as string })).ok, 'QA publish');
    return r.data as string;
  };
  const rows = <T,>(d: Db, table: string, order: string) => d.json<{ r: T }>(`select to_jsonb(x) as r from public.${table} x order by ${order}`).map((x) => x.r);
  const count = (d: Db, table: string) => Number(d.sql(`select count(*) from public.${table};`));

  /** Bağımsız oracle: 3A mapper'ları (recordTo*) ile DB'den okunan içerik src/data ile deepStrictEqual olmalı. */
  function oracleEqualsFiles(d: Db) {
    const pr = rows<ProjectRecord>(d, 'projects', 'sort_order');
    assert.deepStrictEqual(pr.map(recordToProject), projects);
    const lr = rows<LabEntryRecord>(d, 'lab_entries', 'sort_order');
    assert.deepStrictEqual(lr.map(recordToLabEntry), labEntries);
    const nr = rows<NoteRecord>(d, 'notes', 'published_at desc');
    assert.deepStrictEqual(nr.map(recordToNote), notes);
    const site = Object.fromEntries(d.json<{ key: string; data: unknown }>('select key, data from public.site_content_published').map((x) => [x.key, x.data])) as unknown as SiteContentMap;
    assert.deepStrictEqual(documentsToSiteContent(site), { siteConfig, currently, socialLinks, labCategories });
  }
  const fullApply = async (d: Db) => { const p = await planOf(d); const r = await applyAll(d, p); assert.ok(r.ok, `apply: ${r.refused ?? JSON.stringify(r.results.filter((x) => x.outcome === 'failed'))}`); return { p, r }; };

  // ═════════════ S0: hazırlık doğrulamaları
  await t.check('S0 snapshot SQL (SQL Editor yolu) ile canlı okuyucu AYNI normalleşmiş veriyi üretir (içerik dolu hedefte)', async () => {
    const d = mk();
    await fullApply(d);
    await qaProject(d, 'qa-snapshot-proje', false);
    const viaSql = normalizeSnapshot(JSON.parse(d.sql(snapshotSql({ provenance: true }))));
    const viaReader = await d.target.readSnapshot();
    eq({ ...viaSql, capturedAt: '' }, { ...viaReader, capturedAt: '' }, 'snapshot farkı');
    assert.ok(viaSql.items.length === 20 && viaSql.runs.length === 1);
  });
  await t.check('S0 snapshot SQL gerçekten salt-okunur: çalıştırma sonrası DB parmak izi aynı', async () => {
    const d = mk();
    await qaProject(d, 'qa-readonly', true);
    const before = d.fingerprint();
    d.sql(snapshotSql({ provenance: true }));
    eq(d.fingerprint(), before, 'parmak izi');
  });
  await t.check('S0 0006 yokken (--no-provenance) snapshot okunur, plan uygulanamaz', async () => {
    const d = mk();
    d.sql('drop table public.content_import_items; drop table public.content_import_runs;');
    const snap = normalizeSnapshot(JSON.parse(d.sql(snapshotSql({ provenance: false }))));
    const p = buildPlan(bundle, snap, { now: now() });
    assert.equal(snap.provenanceTable, false);
    assert.ok(!p.canApply && p.blockers[0].startsWith('provenance_table_missing'));
    const live = await d.target.readSnapshot(); // canlı okuyucu tablo yokluğunu tanır
    assert.equal(live.provenanceTable, false);
    const r = await applyPlan({ target: d.target, bundle, approved: { ...p, canApply: true }, confirm: applyToken(p) });
    assert.ok(!r.ok && r.refused !== null && d.sql('select count(*) from public.projects;') === '0', 'apply reddedilmeli ve hiçbir şey yazılmamalı');
  });

  // ═════════════ S1: tam import
  await t.check('S1 tam import: 20 kayıt eklendi, 3A mapper oracle\'ı ile src/data deepStrictEqual, ledger tamam, public (anon) görünümü doğru', async () => {
    const d = mk();
    const p0 = await planOf(d);
    assert.equal(p0.counts.create, 20);
    const r = await applyAll(d, p0);
    assert.ok(r.ok && r.results.every((x) => x.outcome === 'created'), JSON.stringify(r.results.filter((x) => x.outcome !== 'created')));
    oracleEqualsFiles(d); // projeler (SEO dahil), lab, notlar, site belgeleri
    // durumlar / sıra / tarih
    assert.deepEqual(d.json<{ slug: string; status: string; sort_order: number }>('select slug, status, sort_order from public.projects order by sort_order').map((x) => [x.slug, x.status, x.sort_order]), [['yakala', 'published', 0], ['migration-center', 'published', 1], ['ai-lab', 'published', 2], ['coming-soon', 'published', 3]]);
    assert.deepEqual(d.json<{ slug: string; d: string }>("select slug, to_char(published_at at time zone 'utc','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') d from public.notes order by published_at desc").map((x) => [x.slug, x.d]), [['kullanisli-ai-asistani', '2026-10-06T00:00:00Z'], ['otomasyon-surtunmeyi-azaltmali', '2026-10-02T00:00:00Z'], ['buyuk-kurmadan-once-kucuk-kurmak', '2026-09-28T00:00:00Z']]);
    // bekleyen taslak kalmadı
    for (const tbl of ['project_drafts', 'lab_entry_drafts', 'note_drafts']) assert.equal(count(d, tbl), 0, tbl);
    // site: taslak = yayın (bekleyen değişiklik yok)
    assert.equal(d.sql('select count(*) from public.site_content_drafts x join public.site_content_published p using (key) where x.data = p.data;'), '10');
    // ledger
    assert.equal(d.sql("select count(*) from public.content_import_items where state = 'completed';"), '20');
    assert.equal(d.sql("select count(*) from public.content_import_items where state = 'completed' and entity_type = 'project' and seo_hash is not null;"), '3');
    assert.equal(d.sql("select count(*) || '/' || max(status) from public.content_import_runs;"), '1/completed');
    // public (anon) yalnızca yayınlanmışı görür
    assert.equal(d.anon('select (select count(*) from public.projects) || \',\' || (select count(*) from public.lab_entries) || \',\' || (select count(*) from public.notes) || \',\' || (select count(*) from public.site_content_published);'), '4,3,3,10');
    assert.equal(d.try('begin; set local role anon; select count(*) from public.content_import_items; commit;').ok, false, 'anon ledger okuyamamalı');
  });
  await t.check('S1 sonrası doğrulama raporu: 20/20 OK; dry-run raporu 20 atlanıyor', async () => {
    const d = mk();
    await fullApply(d);
    const v = verifyImport(bundle, await d.target.readSnapshot(), now());
    assert.ok(v.ok, JSON.stringify(v.records.filter((x) => x.status !== 'ok')));
    eq(v.counts, { source: 20, targetRows: 20, ok: 20, okUnmanaged: 0, mismatch: 0, missing: 0 }, 'sayımlar');
    assert.deepEqual(v.ledgerFindings, []);
    assert.deepEqual(v.cutoverBlockers, []);
  });

  // ═════════════ S2: idempotency
  await t.check('S2 idempotency: ikinci dry-run 20 SKIP_IMPORTED, ikinci apply HİÇBİR şey yazmaz (parmak izi aynı), özet deterministik', async () => {
    const d = mk();
    await fullApply(d);
    const p1 = await planOf(d); const p1b = await planOf(d);
    eq(p1.counts, { source: 20, targetBefore: 20, create: 0, resume: 0, skip: 20, conflict: 0, unverifiable: 0 }, 'sayımlar');
    assert.ok(p1.items.every((i) => i.decision === 'SKIP_IMPORTED' && i.reasons[0] === 'already_imported'));
    assert.equal(p1.planDigest, p1b.planDigest);
    const before = d.fingerprint();
    const r = await applyAll(d, p1);
    assert.ok(r.ok && r.runId === null && r.results.every((x) => x.outcome === 'skipped'));
    assert.equal(d.fingerprint(), before, 'ikinci apply yazma yapmamalı');
    assert.equal(count(d, 'projects') + count(d, 'notes') + count(d, 'lab_entries'), 10);
  });
  await t.check('S2 dry-run salt-okunur: dry-run öncesi/sonrası DB parmak izi aynı', async () => {
    const d = mk(); await qaProject(d, 'qa-dry', true);
    const before = d.fingerprint();
    await planOf(d); await planOf(d);
    assert.equal(d.fingerprint(), before);
  });

  // ═════════════ S3: QA kayıtları / çakışma
  await t.check('S3 QA kayıtları (yayınlanmış proje, taslak not) varken import dokunmadan sürer; cutover engeli raporlanır', async () => {
    const d = mk();
    await qaProject(d, 'faz-3b-a2-test-projesi', true);
    const qn = await d.target.rpc('create_note', { p_data: { slug: 'a1-test-notu', title: 'A1 test', excerpt: '', content: [], tags: [], accent: 'blue', reading_time_minutes: null, published_at: null } });
    assert.ok(qn.ok);
    const qaBefore = JSON.stringify(d.json("select * from public.projects where slug = 'faz-3b-a2-test-projesi'")) + JSON.stringify(d.json("select * from public.notes where slug = 'a1-test-notu'")) + JSON.stringify(d.json('select * from public.note_drafts'));
    const p = await planOf(d);
    assert.ok(p.canApply);
    assert.deepEqual(p.findings.filter((f) => f.cutoverBlocker).map((f) => f.key), ['faz-3b-a2-test-projesi']);
    await applyAll(d, p);
    const qaAfter = JSON.stringify(d.json("select * from public.projects where slug = 'faz-3b-a2-test-projesi'")) + JSON.stringify(d.json("select * from public.notes where slug = 'a1-test-notu'")) + JSON.stringify(d.json('select * from public.note_drafts'));
    assert.equal(qaAfter, qaBefore, 'QA satırları birebir aynı kalmalı');
    const v = verifyImport(bundle, await d.target.readSnapshot(), now());
    assert.ok(v.ok && v.cutoverBlockers.length === 1, 'doğrulama OK ama cutover engeli raporlanmalı');
    // rollback planı QA satırına dokunmaz
    assert.ok(planRollback(await d.target.readSnapshot(), now()).items.every((i) => i.key !== 'faz-3b-a2-test-projesi' && i.key !== 'a1-test-notu'));
  });
  await t.check('S3 çakışma: QA taslağı gerçek slug\'ı tutuyor → apply REDDEDİLİR, hiçbir şey yazılmaz; sahte "onaylı" plan da işe yaramaz', async () => {
    const d = mk();
    await qaProject(d, 'yakala', false); // QA kabuğu gerçek slug'da
    assert.ok((await d.target.rpc('save_site_content_draft', { p_key: 'hero', p_data: { eyebrow: 'QA hero' }, p_expected_draft_updated_at: null })).ok);
    const p = await planOf(d);
    assert.ok(!p.canApply);
    assert.equal(p.items.find((i) => i.key === 'yakala')!.decision, 'CONFLICT');
    assert.equal(p.items.find((i) => i.key === 'hero')!.decision, 'CONFLICT');
    const before = d.fingerprint();
    const forged: Plan = { ...p, canApply: true, blockers: [] };
    const r = await applyAll(d, forged);
    assert.ok(!r.ok && r.refused !== null && r.runId === null);
    assert.equal(d.fingerprint(), before, 'hiçbir yazma olmamalı');
  });
  await t.check('S3 import\'a ait olmayan ÖZDEŞ taslak otomatik sahiplenilmez', async () => {
    const d = mk();
    const src = bundle.records.find((r) => r.key === 'ai-lab')!;
    assert.ok((await d.target.rpc('create_project', { p_data: src.doc })).ok);
    const p = await planOf(d);
    assert.equal(p.items.find((i) => i.key === 'ai-lab')!.decision, 'CONFLICT');
    assert.ok(p.items.find((i) => i.key === 'ai-lab')!.reasons[0].startsWith('slug_exists_different'));
  });
  await t.check('S3 mevcut yayınlı + özdeş kayıt: SKIP_IDENTICAL_UNMANAGED, apply kalanını yazar, o kayda dokunmaz', async () => {
    const d = mk();
    const src = bundle.records.find((r) => r.key === 'coming-soon')!;
    const id = (await d.target.rpc('create_project', { p_data: src.doc }));
    assert.ok(id.ok && (await d.target.rpc('publish_project', { p_id: id.data })).ok);
    const row0 = JSON.stringify(d.json("select * from public.projects where slug = 'coming-soon'"));
    const p = await planOf(d);
    assert.equal(p.items.find((i) => i.key === 'coming-soon')!.decision, 'SKIP_IDENTICAL_UNMANAGED');
    assert.ok(p.canApply);
    const r = await applyAll(d, p);
    assert.ok(r.ok);
    assert.equal(JSON.stringify(d.json("select * from public.projects where slug = 'coming-soon'")), row0);
    assert.equal(d.sql("select count(*) from public.content_import_items where source_key = 'coming-soon';"), '0', 'sahiplenme yok');
  });

  // ═════════════ S4: TOCTOU
  await t.check('S4 TOCTOU: dry-run\'dan sonra hedefte değişiklik → apply fail-closed, hiçbir yazma yok', async () => {
    const d = mk();
    const p = await planOf(d);
    await qaProject(d, 'migration-center', false); // dry-run ile apply arasında başkası aynı slug'ı aldı
    const before = d.fingerprint();
    const r = await applyAll(d, p);
    assert.ok(!r.ok && /dry-run'dan beri değişmiş|uygulanamaz/.test(r.refused ?? ''), r.refused ?? '');
    assert.equal(d.fingerprint(), before);
  });
  await t.check('S4 TOCTOU: eski snapshot DOSYASINA dayanan plan ile apply reddedilir (apply her zaman canlı yeniden okur)', async () => {
    const d = mk();
    const stale = normalizeSnapshot(JSON.parse(d.sql(snapshotSql({ provenance: true }))));
    const p = buildPlan(bundle, stale, { now: now() });
    assert.ok(p.canApply);
    const note = bundle.records.find((r) => r.key === 'kullanisli-ai-asistani')!;
    assert.ok((await d.target.rpc('create_note', { p_data: { ...note.doc, title: 'Başkası oluşturdu' } })).ok);
    const before = d.fingerprint();
    const r = await applyAll(d, p);
    assert.ok(!r.ok && r.refused !== null);
    assert.equal(d.fingerprint(), before);
  });
  await t.check('S4 TOCTOU: yazma sırasında (kayıt başına yeniden doğrulama) değişiklik → o kayıtta durur, öncekiler sağlam, sonrakiler denenmez', async () => {
    const d = mk();
    const p = await planOf(d);
    let injected = false;
    const inner = d.target;
    const wrapped: ImportTarget = { ...inner, rpc: async (name, args) => {
      const res = await inner.rpc(name, args);
      if (!injected && name === 'create_project') { injected = true; d.sql(`insert into public.notes (slug, title, accent) values ('kullanisli-ai-asistani', 'Araya giren', 'blue');`); }
      return res;
    } };
    const r = await applyPlan({ target: wrapped, bundle, approved: p, confirm: applyToken(p) });
    assert.ok(!r.ok);
    const failed = r.results.filter((x) => x.outcome === 'failed');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].key, 'kullanisli-ai-asistani');
    assert.match(failed[0].error ?? '', /yazmadan hemen önce değişmiş/);
    assert.ok(r.results.filter((x) => x.kind === 'project').every((x) => x.outcome === 'created'), 'önceki kayıtlar tamamlanmış olmalı');
    assert.ok(r.results.filter((x) => x.kind === 'site_content').every((x) => x.outcome === 'not_attempted'));
    assert.equal(d.sql("select title from public.notes where slug = 'kullanisli-ai-asistani';"), 'Araya giren', 'araya giren kayıt değiştirilmedi');
    assert.equal(d.sql("select count(*) from public.content_import_items where source_key = 'kullanisli-ai-asistani';"), '0');
    assert.equal(d.sql('select status from public.content_import_runs;'), 'aborted');
    const p2 = await planOf(d);
    assert.equal(p2.items.find((i) => i.key === 'kullanisli-ai-asistani')!.decision, 'CONFLICT');
  });
  await t.check('S4 onay kapıları: yanlış belirteç, kaynak değişmiş, bozuk özet, okunamayan hedef → hiçbir yazma yok', async () => {
    const d = mk();
    const p = await planOf(d);
    const before = d.fingerprint();
    const bad = await applyPlan({ target: d.target, bundle, approved: p, confirm: 'APPLY-000000000000' });
    assert.ok(!bad.ok && /belirte/.test(bad.refused ?? ''), 'bad:' + bad.refused);
    const i = structuredClone(realSourceInput()); i.projects[0] = { ...i.projects[0], title: 'DEĞİŞTİ' };
    const b2 = buildSource(i);
    const drift = await applyPlan({ target: d.target, bundle: b2, approved: p, confirm: applyToken(p) });
    assert.ok(!drift.ok && /kaynak/.test(drift.refused ?? ''), 'drift:' + drift.refused);
    const tampered = await applyAll(d, { ...p, planDigest: 'f'.repeat(64) }, { confirm: `APPLY-${'f'.repeat(12)}` });
    assert.ok(!tampered.ok && tampered.refused !== null, 'tampered:' + tampered.refused);
    const broken: ImportTarget = { ...d.target, readSnapshot: async () => { throw new Error('ağ hatası'); } };
    const unread = await applyPlan({ target: broken, bundle, approved: p, confirm: applyToken(p) });
    assert.ok(!unread.ok && /fail-closed/.test(unread.refused ?? ''), 'unread:' + unread.refused);
    assert.equal(d.fingerprint(), before);
  });
  await t.check('S4 TOCTOU (sıkı): dry-run sonrası hedefe ilgisiz YAYINLANMIŞ bir kayıt eklenirse bile plan özeti/bulgular değiştiği için apply reddedilir, hiçbir yazma yok (yeni dry-run + yeni onay gerekir)', async () => {
    const d = mk();
    const p = await planOf(d);
    await qaProject(d, 'dry-run-sonrasi-eklenen', true);
    const before = d.fingerprint();
    const r = await applyAll(d, p);
    assert.ok(!r.ok && r.refused !== null && /değişmiş/.test(r.refused), 'refused:' + r.refused);
    assert.equal(d.fingerprint(), before);
  });
  await t.check('S4 onay dosyası üzerinde oynanmış adımlar çalıştırılmaz (yürütme taze plandan yapılır)', async () => {
    const d = mk();
    const p = await planOf(d);
    const evil: Plan = { ...p, items: p.items.map((i, k) => (k === 0 ? { ...i, steps: ['create' as const] } : i)) };
    const r = await applyAll(d, evil);
    assert.ok(r.ok);
    oracleEqualsFiles(d);
  });

  // ═════════════ S5: yarıda kesilme / resume
  const crashMatrix: [string, string][] = [
    ['yakala', 'intent'], ['yakala', 'create'], ['yakala', 'record_created'], ['yakala', 'publish'], ['yakala', 'record_published'], ['yakala', 'seo'],
    ['ai-tool-explorations', 'create'], ['ai-tool-explorations', 'publish'],
    ['otomasyon-surtunmeyi-azaltmali', 'create'], ['otomasyon-surtunmeyi-azaltmali', 'publish'],
    ['hero', 'intent'], ['hero', 'save_draft'], ['hero', 'record_created'], ['hero', 'publish_site'], ['hero', 'record_published'],
  ];
  for (const [key, step] of crashMatrix) {
    await t.check(`S5 resume: ${key} @ ${step} sonrası kesilme → dry-run RESUME, ikinci apply tamamlar (kopya yok, 20/20 doğrulanır)`, async () => {
      const d = mk();
      const p = await planOf(d);
      const r1 = await applyAll(d, p, { afterStep: crashAt(key, step) });
      assert.ok(!r1.ok && r1.results.some((x) => x.outcome === 'failed' && x.key === key));
      const p2 = await planOf(d);
      const it = p2.items.find((i) => i.key === key)!;
      assert.equal(it.decision, 'RESUME', `${it.decision}: ${it.reasons.join()}`);
      assert.ok(p2.canApply, p2.blockers.join(' ; '));
      assert.ok(p2.items.filter((i) => i.decision === 'SKIP_IMPORTED').every((i) => i.reasons[0] === 'already_imported'));
      const r2 = await applyAll(d, p2);
      assert.ok(r2.ok, r2.refused ?? JSON.stringify(r2.results.filter((x) => x.outcome === 'failed')));
      oracleEqualsFiles(d);
      const v = verifyImport(bundle, await d.target.readSnapshot(), now());
      assert.ok(v.ok && v.counts.ok === 20, JSON.stringify(v.records.filter((x) => x.status !== 'ok')));
      assert.equal(d.sql('select count(*) from public.content_import_items;'), '20', 'ledger\'da kopya kalem olmamalı');
      assert.equal(d.sql('select count(*) from public.content_import_runs;'), '2');
      assert.equal(count(d, 'projects') + count(d, 'notes') + count(d, 'lab_entries'), 10, 'kopya satır olmamalı');
      const p3 = await planOf(d);
      assert.equal(p3.counts.skip, 20, 'resume sonrası tamamen idempotent');
    });
  }
  await t.check('S5 SEO yazıldı ama ledger seo_hash yazılamadan kesildi → resume SEO\'yu TEKRAR yazmadan hash\'i kaydeder', async () => {
    const d = mk();
    const p = await planOf(d);
    let failed = false;
    const inner = d.target;
    const wrapped: ImportTarget = { ...inner, updateItem: async (id, patch) => { if (!failed && patch.seoHash !== undefined) { failed = true; return { ok: false, error: 'CRASH ledger' }; } return inner.updateItem(id, patch); } };
    const r1 = await applyPlan({ target: wrapped, bundle, approved: p, confirm: applyToken(p) });
    assert.ok(!r1.ok);
    const seoRow = d.sql("select seo_title is not null from public.projects where slug = 'yakala';");
    assert.equal(seoRow, 't', 'SEO yazılmış olmalı');
    const p2 = await planOf(d);
    const it = p2.items.find((i) => i.key === 'yakala')!;
    assert.equal(it.decision, 'RESUME'); assert.equal(it.seo, 'DONE');
    const writes: string[] = [];
    const spy: ImportTarget = { ...inner, setProjectSeo: async (id, s) => { writes.push(id); return inner.setProjectSeo(id, s); } };
    const r2 = await applyPlan({ target: spy, bundle, approved: p2, confirm: applyToken(p2) });
    assert.ok(r2.ok);
    assert.equal(writes.filter((id) => id === it.entityId).length, 0, 'yakala için SEO ikinci kez yazılmamalı');
    oracleEqualsFiles(d);
  });

  // ═════════════ S5b: sahiplik kanıtlanamayan yarım kayıtlar otomatik sahiplenilmez
  await t.check('S5b taslak içeriği kesilmeden sonra başkası tarafından değiştirilmiş → UNVERIFIABLE, apply reddedilir', async () => {
    const d = mk();
    const p = await planOf(d);
    await applyAll(d, p, { afterStep: crashAt('yakala', 'create') });
    const id = d.sql("select id from public.projects where slug = 'yakala';");
    const src = bundle.records.find((r) => r.key === 'yakala')!;
    const tok = d.sql(`select updated_at from public.project_drafts where entity_id = '${id}';`);
    assert.ok((await d.as(OTHER_ADMIN).rpc('save_project_draft', { p_id: id, p_data: { ...src.doc, title: 'Başkası düzenledi' }, p_expected_draft_updated_at: tok })).ok);
    const p2 = await planOf(d);
    const it = p2.items.find((i) => i.key === 'yakala')!;
    assert.equal(it.decision, 'UNVERIFIABLE'); assert.match(it.reasons[0], /ownership_unproven/);
    assert.ok(!p2.canApply);
    const before = d.fingerprint();
    assert.ok(!(await applyAll(d, p2)).ok);
    assert.equal(d.fingerprint(), before);
  });
  await t.check('S5b kayıt başka bir admin tarafından oluşturulmuş (created_by farklı) → ledger niyeti olsa bile UNVERIFIABLE', async () => {
    const d = mk();
    const p = await planOf(d);
    await applyAll(d, p, { afterStep: crashAt('yakala', 'create') });
    d.sql(`update public.projects set created_by = '${OTHER_ADMIN}' where slug = 'yakala';`);
    const it = (await planOf(d)).items.find((i) => i.key === 'yakala')!;
    assert.equal(it.decision, 'UNVERIFIABLE'); assert.match(it.reasons[0], /oluşturan kullanıcı/);
  });
  await t.check('S5b ledger niyeti + başka admin\'in oluşturduğu birebir aynı taslak → sahiplenilmez (UNVERIFIABLE)', async () => {
    const d = mk();
    const src = bundle.records.find((r) => r.key === 'ai-lab')!;
    // ledger niyeti (a1 koşusu) elle; kayıt ise OTHER_ADMIN tarafından oluşturulmuş
    d.sql(`insert into public.content_import_runs (id, tool_version, source_digest, plan_digest, created_by) values ('00000000-0000-0000-0000-00000000f0f0','3b-b.1','${'a'.repeat(64)}','${'b'.repeat(64)}','${'00000000-0000-0000-0000-0000000000a1'}');
      insert into public.content_import_items (run_id, last_run_id, entity_type, source_key, source_path, source_hash, created_by) values ('00000000-0000-0000-0000-00000000f0f0','00000000-0000-0000-0000-00000000f0f0','project','ai-lab','src/data/projects/ai-lab.ts','${src.docHash}','00000000-0000-0000-0000-0000000000a1');`);
    assert.ok((await d.as(OTHER_ADMIN).rpc('create_project', { p_data: src.doc })).ok);
    const it = (await planOf(d)).items.find((i) => i.key === 'ai-lab')!;
    assert.equal(it.decision, 'UNVERIFIABLE'); assert.match(it.reasons[0], /ownership_unproven/);
  });
  await t.check('S5b ledger entity_id\'si CMS\'te yok (silinmiş) → yeniden oluşturulmaz, UNVERIFIABLE', async () => {
    const d = mk(); await fullApply(d);
    d.sql("delete from public.notes where slug = 'buyuk-kurmadan-once-kucuk-kurmak';");
    const p = await planOf(d);
    const it = p.items.find((i) => i.key === 'buyuk-kurmadan-once-kucuk-kurmak')!;
    assert.equal(it.decision, 'UNVERIFIABLE'); assert.match(it.reasons[0], /entity_missing/);
    assert.ok(p.findings.some((f) => f.code === 'ledger_entity_missing'));
  });

  // ═════════════ S6: SEO
  await t.check('S6 SEO: 3 projede kaynakla birebir, coming-soon\'da boş; ledger seo_hash; verify OK', async () => {
    const d = mk(); await fullApply(d);
    const seo = d.json<{ slug: string; seo_title: string | null; seo_description: string | null }>('select slug, seo_title, seo_description from public.projects order by sort_order');
    assert.deepEqual(seo.map((x) => [x.slug, x.seo_title, x.seo_description]), projects.map((p) => [p.slug, p.seo?.title ?? null, p.seo?.description ?? null]));
    const v = verifyImport(bundle, await d.target.readSnapshot(), now());
    assert.ok(v.ok);
    assert.ok(v.records.filter((r) => r.kind === 'project' && r.key !== 'coming-soon').every((r) => r.checks.some((c) => c.name === 'seo_equals_source' && c.ok)));
    assert.ok(v.records.find((r) => r.key === 'coming-soon')!.checks.some((c) => c.name === 'seo_empty' && c.ok));
  });
  await t.check('S6 SEO adımı korumalı: dolu SEO sütunlarının üzerine YAZMAZ', async () => {
    const d = mk(); await fullApply(d);
    const id = d.sql("select id from public.projects where slug = 'yakala';");
    const r = await d.target.setProjectSeo(id, { seo_title: 'ÜZERİNE YAZ', seo_description: 'x' });
    assert.ok(!r.ok);
    assert.equal(d.sql("select seo_title from public.projects where slug = 'yakala';"), projects[0].seo!.title);
  });
  await t.check('S6 SEO doğrulaması gerçek sapmayı yakalar (mutasyon): SEO bozulursa verify başarısız, audit uyarır, import tekrar yazmaz', async () => {
    const d = mk(); await fullApply(d);
    d.sql("update public.projects set seo_title = 'BOZULDU' where slug = 'ai-lab';");
    const snap = await d.target.readSnapshot();
    const v = verifyImport(bundle, snap, now());
    assert.ok(!v.ok);
    const rec = v.records.find((r) => r.key === 'ai-lab')!;
    assert.equal(rec.status, 'mismatch'); assert.ok(rec.checks.some((c) => c.name === 'seo_equals_source' && !c.ok));
    assert.ok(v.ledgerFindings.some((f) => f.code === 'ledger_seo_mismatch'));
    const p = buildPlan(bundle, snap, { now: now() });
    const it = p.items.find((i) => i.key === 'ai-lab')!;
    assert.equal(it.decision, 'SKIP_IMPORTED'); assert.ok(it.reasons.includes('seo_modified_since_import'));
    const before = d.fingerprint(); await applyAll(d, p); assert.equal(d.fingerprint(), before);
  });
  await t.check('S6 resume sırasında SEO sütunları başka değerle doluysa CONFLICT (seo_conflict), üzerine yazılmaz', async () => {
    const d = mk();
    const p = await planOf(d);
    await applyAll(d, p, { afterStep: crashAt('yakala', 'publish') });
    d.sql("update public.projects set seo_title = 'YABANCI SEO', seo_description = 'x' where slug = 'yakala';");
    const it = (await planOf(d)).items.find((i) => i.key === 'yakala')!;
    assert.equal(it.decision, 'CONFLICT'); assert.match(it.reasons[0], /seo_conflict/);
  });

  // ═════════════ S7: provenance ↔ CMS tutarsızlık denetimi
  await t.check('S7 tutarsızlık denetimi: silinmiş kayıt, değişmiş içerik, bekleyen taslak, takılı koşu, yarım kalmış kalem yakalanır', async () => {
    const d = mk(); await fullApply(d);
    d.sql("delete from public.notes where slug = 'otomasyon-surtunmeyi-azaltmali';");
    d.sql("update public.projects set title = 'Admin değiştirdi' where slug = 'migration-center';");
    const lab = bundle.records.find((r) => r.key === 'automation-playground')!;
    const labId = d.sql("select id from public.lab_entries where slug = 'automation-playground';");
    assert.ok((await d.target.rpc('save_lab_entry_draft', { p_id: labId, p_data: { ...lab.doc, summary: 'taslak' }, p_expected_draft_updated_at: null })).ok);
    d.sql(`insert into public.content_import_runs (id, tool_version, source_digest, plan_digest, started_at) values ('00000000-0000-0000-0000-00000000f0f1','3b-b.1','${'a'.repeat(64)}','${'b'.repeat(64)}', now() - interval '3 hours');`);
    d.sql("alter table public.projects disable trigger projects_protect_slug; update public.projects set slug = 'ai-lab-renamed' where slug = 'ai-lab'; alter table public.projects enable trigger projects_protect_slug;");
    d.sql("delete from public.site_content_published where key = 'social';");
    const codes = new Set(verifyImport(bundle, await d.target.readSnapshot(), now()).ledgerFindings.map((f) => f.code));
    for (const c of ['ledger_entity_missing', 'ledger_content_modified', 'ledger_pending_draft', 'ledger_run_stale', 'ledger_slug_mismatch', 'ledger_site_published_missing']) assert.ok(codes.has(c), `${c} bulunamadı: ${[...codes].join()}`);
    const d2 = mk();
    await applyAll(d2, await planOf(d2), { afterStep: crashAt('yakala', 'record_created') });
    assert.ok(verifyImport(bundle, await d2.target.readSnapshot(), now()).ledgerFindings.some((f) => f.code === 'ledger_item_stuck'));
  });
  await t.check('S7 admin\'in sonradan düzenlediği kayıt: yeniden çalıştırma SKIP eder, DOKUNMAZ (modified_since_import)', async () => {
    const d = mk(); await fullApply(d);
    const src = bundle.records.find((r) => r.key === 'buyuk-kurmadan-once-kucuk-kurmak')!;
    const id = d.sql("select id from public.notes where slug = 'buyuk-kurmadan-once-kucuk-kurmak';");
    assert.ok((await d.target.rpc('save_note_draft', { p_id: id, p_data: { ...src.doc, title: 'Admin düzenlemesi' }, p_expected_draft_updated_at: null })).ok);
    assert.ok((await d.target.rpc('publish_note', { p_id: id })).ok);
    const p = await planOf(d);
    const it = p.items.find((i) => i.key === 'buyuk-kurmadan-once-kucuk-kurmak')!;
    assert.equal(it.decision, 'SKIP_IMPORTED'); assert.ok(it.reasons.some((x) => x.startsWith('modified_since_import')));
    const before = d.fingerprint(); await applyAll(d, p); assert.equal(d.fingerprint(), before);
    assert.equal(d.sql("select title from public.notes where slug = 'buyuk-kurmadan-once-kucuk-kurmak';"), 'Admin düzenlemesi');
  });
  await t.check('S7 kaynak (src/data) import\'tan sonra değişirse CONFLICT source_drift; üzerine yazılmaz', async () => {
    const d = mk(); await fullApply(d);
    const i = structuredClone(realSourceInput()); i.labEntries[0] = { ...i.labEntries[0], summary: 'Yeni özet' };
    const p = await planOf(d, buildSource(i));
    const it = p.items.find((x) => x.key === 'ai-tool-explorations')!;
    assert.equal(it.decision, 'CONFLICT'); assert.match(it.reasons[0], /source_drift/);
    assert.ok(!p.canApply);
  });

  // ═════════════ S8: rollback
  await t.check('S8 rollback planı kapsamlı: yalnızca ledger kayıtları; admin\'in değiştirdiği/bekleyen taslaklı kayıtlar ve QA SKIP/dışarıda; site = SQL_MANUAL', async () => {
    const d = mk();
    await qaProject(d, 'faz-3b-a2-test-projesi', true);
    await fullApply(d);
    const nsrc = bundle.records.find((r) => r.key === 'buyuk-kurmadan-once-kucuk-kurmak')!;
    const nid = d.sql("select id from public.notes where slug = 'buyuk-kurmadan-once-kucuk-kurmak';");
    assert.ok((await d.target.rpc('save_note_draft', { p_id: nid, p_data: { ...nsrc.doc, title: 'Admin düzenlemesi' }, p_expected_draft_updated_at: null })).ok);
    assert.ok((await d.target.rpc('publish_note', { p_id: nid })).ok);
    const lsrc = bundle.records.find((r) => r.key === 'automation-playground')!;
    const lid = d.sql("select id from public.lab_entries where slug = 'automation-playground';");
    assert.ok((await d.target.rpc('save_lab_entry_draft', { p_id: lid, p_data: { ...lsrc.doc, summary: 'taslak' }, p_expected_draft_updated_at: null })).ok);

    const rp = planRollback(await d.target.readSnapshot(), now());
    const dec = (k: string) => rp.items.find((i) => i.key === k)!.decision;
    assert.equal(rp.items.length, 20);
    assert.equal(dec('buyuk-kurmadan-once-kucuk-kurmak'), 'SKIP');
    assert.equal(dec('automation-playground'), 'SKIP');
    for (const k of ['yakala', 'migration-center', 'ai-lab', 'coming-soon', 'ai-tool-explorations', 'web-product-experiments', 'kullanisli-ai-asistani', 'otomasyon-surtunmeyi-azaltmali']) assert.equal(dec(k), 'DELETE', k);
    assert.ok(rp.items.filter((i) => i.kind === 'site_content').every((i) => i.decision === 'SQL_MANUAL'));
    assert.ok(rp.items.every((i) => i.key !== 'faz-3b-a2-test-projesi'));
    assert.ok(rp.siteSql && rp.siteSql.includes('begin;') && rp.siteSql.includes('commit;'));
    const before = d.fingerprint();
    planRollback(await d.target.readSnapshot(), now()); // plan salt-okunur
    assert.equal(d.fingerprint(), before);
  });
  await t.check('S8 rollback uygulaması: yalnızca değişmemiş import kayıtları silinir; QA, admin düzenlemesi ve bekleyen taslak aynen kalır; site SQL\'i korumalı çalışır; yeniden import mümkün', async () => {
    const d = mk();
    await qaProject(d, 'faz-3b-a2-test-projesi', true);
    await fullApply(d);
    const nsrc = bundle.records.find((r) => r.key === 'buyuk-kurmadan-once-kucuk-kurmak')!;
    const nid = d.sql("select id from public.notes where slug = 'buyuk-kurmadan-once-kucuk-kurmak';");
    assert.ok((await d.target.rpc('save_note_draft', { p_id: nid, p_data: { ...nsrc.doc, title: 'Admin düzenlemesi' }, p_expected_draft_updated_at: null })).ok);
    assert.ok((await d.target.rpc('publish_note', { p_id: nid })).ok);
    const qaRow = JSON.stringify(d.json("select * from public.projects where slug = 'faz-3b-a2-test-projesi'"));
    const noteRow = JSON.stringify(d.json("select * from public.notes where slug = 'buyuk-kurmadan-once-kucuk-kurmak'"));

    const rp = planRollback(await d.target.readSnapshot(), now());
    // yanlış belirteç → reddedilir, hiçbir şey silinmez
    const before = d.fingerprint();
    const refused = await applyRollback({ target: d.target, approved: rp, confirm: 'ROLLBACK-000000000000' });
    assert.ok(!refused.ok); assert.equal(d.fingerprint(), before);

    const res = await applyRollback({ target: d.target, approved: rp, confirm: rollbackToken(rp) });
    assert.ok(res.ok, JSON.stringify(res));
    assert.deepEqual(d.json<{ slug: string }>('select slug from public.projects order by slug').map((x) => x.slug), ['faz-3b-a2-test-projesi'], 'yalnızca QA projesi kalmalı');
    assert.equal(JSON.stringify(d.json("select * from public.projects where slug = 'faz-3b-a2-test-projesi'")), qaRow, 'QA satırı birebir aynı');
    assert.equal(JSON.stringify(d.json("select * from public.notes where slug = 'buyuk-kurmadan-once-kucuk-kurmak'")), noteRow, 'admin düzenlemesi korunmalı');
    assert.deepEqual(d.json<{ slug: string }>('select slug from public.lab_entries order by slug').map((x) => x.slug), []);
    assert.equal(d.sql("select count(*) from public.content_import_items where state = 'rolled_back';"), '9');
    assert.equal(d.sql("select count(*) from public.content_import_items where entity_type = 'note' and state = 'completed';"), '1');
    assert.equal(count(d, 'site_content_published'), 10, 'site belgeleri API ile silinmez');

    // site SQL: önce guard — yayınlanmış belge değişmişse HİÇBİR şey silinmez
    const hero = d.sql("select data::text from public.site_content_published where key = 'hero';");
    d.sql("update public.site_content_published set data = data || '{\"x\":1}'::jsonb where key = 'hero';");
    const bad = d.try(rp.siteSql!);
    assert.ok(!bad.ok && /FAIL site_content_published/.test(bad.error ?? ''), String(bad.error));
    assert.equal(count(d, 'site_content_published'), 10, 'korumalı SQL hiçbir şey silmemeli');
    assert.equal(d.sql("select count(*) from public.content_import_items where entity_type = 'site_content' and state = 'rolled_back';"), '0');
    d.sql(`update public.site_content_published set data = $j$${hero}$j$::jsonb where key = 'hero';`);
    const good = d.try(rp.siteSql!);
    assert.ok(good.ok, String(good.error));
    assert.equal(count(d, 'site_content_published'), 0); assert.equal(count(d, 'site_content_drafts'), 0);
    assert.equal(d.sql("select count(*) from public.content_import_items where state = 'rolled_back';"), '19');

    // yeniden import: geri alınanlar tekrar CREATE, admin düzenlemesi SKIP
    const p = await planOf(d);
    assert.equal(p.items.find((i) => i.key === 'yakala')!.decision, 'CREATE');
    assert.equal(p.items.find((i) => i.key === 'buyuk-kurmadan-once-kucuk-kurmak')!.decision, 'SKIP_IMPORTED');
    assert.ok(p.canApply);
    assert.ok((await applyAll(d, p)).ok);
    assert.equal(d.sql("select title from public.notes where slug = 'buyuk-kurmadan-once-kucuk-kurmak';"), 'Admin düzenlemesi');
    assert.equal(count(d, 'projects'), 5);
  });
  await t.check('S8 rollback TOCTOU: plandan sonra bir kayıt değişirse reddedilir; silme anında değişirse korumalı silme 0 satır → silinmez', async () => {
    const d = mk(); await fullApply(d);
    const rp = planRollback(await d.target.readSnapshot(), now());
    d.sql("update public.projects set subtitle = 'araya giren düzenleme' where slug = 'yakala';");
    const before = d.fingerprint();
    const r = await applyRollback({ target: d.target, approved: rp, confirm: rollbackToken(rp) });
    assert.ok(!r.ok && /rollback planından beri değişmiş/.test(r.refused ?? ''), 'rb:' + r.refused);
    assert.equal(d.fingerprint(), before);
    // yarış: plan geçerli, ama deleteRow'dan hemen önce satır değişir
    const rp2 = planRollback(await d.target.readSnapshot(), now());
    const inner = d.target; let raced = false;
    const racing: ImportTarget = { ...inner, deleteRow: async (kind, id, ts) => { if (!raced && kind === 'project') { raced = true; d.sql(`update public.projects set subtitle = 'yarış' where id = '${id}';`); } return inner.deleteRow(kind, id, ts); } };
    const r2 = await applyRollback({ target: racing, approved: rp2, confirm: rollbackToken(rp2) });
    assert.ok(!r2.ok && r2.results.some((x) => x.outcome === 'failed' && /değişmiş/.test(x.error ?? '')), 'rb2:' + JSON.stringify(r2).slice(0, 600));
    assert.equal(d.sql("select subtitle from public.projects where subtitle = 'yarış';"), 'yarış', 'yarışa girmiş satır silinmemeli');
  });
  await t.check('S8 yarım kalmış koşu da geri alınabilir: kanıtlanmış taslak kabuğu silinir, kanıtlanamayan SKIP', async () => {
    const d = mk();
    const p = await planOf(d);
    await applyAll(d, p, { afterStep: crashAt('yakala', 'record_created') });
    const rp = planRollback(await d.target.readSnapshot(), now());
    assert.equal(rp.items.find((i) => i.key === 'yakala')!.decision, 'DELETE');
    const r = await applyRollback({ target: d.target, approved: rp, confirm: rollbackToken(rp) });
    assert.ok(r.ok);
    assert.equal(count(d, 'projects'), 0);
  });

  // ═════════════ S9: mevcut CMS yaşam döngüsü regresyonu (SQL) + 0006 additive kanıtı
  const smokes = ['rls_smoke', 'rls_smoke_3b', 'rls_smoke_3b_a2', 'rls_smoke_3b_b'];
  for (const s of smokes) {
    await t.check(`S9 SQL regresyon: supabase/tests/${s}.sql 0001-0006 uygulanmış DB'de PASS`, async () => {
      const d = mk(undefined, false);
      const pr = spawnSync('psql', ['-h', env!.host, '-p', String(env!.port), '-U', env!.superUser, '-d', d.db, '-X', '-v', 'ON_ERROR_STOP=1', '-f', `supabase/tests/${s}.sql`], { encoding: 'utf8' });
      const log = `${pr.stdout ?? ''}\n${pr.stderr ?? ''}`;
      assert.equal(pr.status, 0, log.slice(-600));
      assert.ok(/PASSED/.test(log), log.slice(-600));
    });
  }
  await t.check('S9 0006 ADDITIVE: mevcut tablo/fonksiyon/policy/tetikleyici/sütunlar 0006 ile DEĞİŞMEZ; yalnızca 2 tablo + 2 fonksiyon eklenir', async () => {
    const catalog = (d: Db) => d.sql(`select md5(string_agg(x, '|' order by x)) from (
      select 'fn:' || p.proname || ':' || md5(p.prosrc) as x from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname not like 'guard_content_import%'
      union all select 'pol:' || tablename || ':' || policyname || ':' || coalesce(qual,'') || ':' || coalesce(with_check,'') from pg_policies where schemaname = 'public' and tablename not like 'content_import_%'
      union all select 'trg:' || c.relname || ':' || t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relname not like 'content_import_%' and c.relnamespace = 'public'::regnamespace
      union all select 'col:' || table_name || ':' || column_name || ':' || data_type from information_schema.columns where table_schema = 'public' and table_name not like 'content_import_%'
      union all select 'con:' || conrelid::regclass || ':' || conname from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text not like '%content_import_%'
    ) q;`);
    const names = (d: Db) => d.sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace;");
    const withSix = mk();
    const without = mk();
    without.sql('drop table public.content_import_items; drop table public.content_import_runs; drop function public.guard_content_import_item(); drop function public.guard_content_import_run();');
    assert.equal(catalog(withSix), catalog(without), 'mevcut nesneler farklı');
    const added = names(withSix).split(',').filter((n) => !names(without).split(',').includes(n));
    assert.deepEqual(added, ['guard_content_import_item', 'guard_content_import_run']);
    assert.equal(withSix.sql("select count(*) from information_schema.routines where routine_schema = 'public' and security_type = 'DEFINER' and routine_name like '%import%';"), '0', '0006 yeni SECURITY DEFINER fonksiyon eklememeli');
  });
  await t.check('S9 0006_down: yalnızca 0006 nesnelerini kaldırır; sonrasında 3B-A1/A2 SQL smoke testleri hâlâ PASS', async () => {
    const d = mk(undefined, false);
    d.file('supabase/migrations/0006_faz3b_content_import_provenance_down.sql');
    assert.equal(d.sql("select count(*) from pg_tables where tablename like 'content_import_%';"), '0');
    for (const s of ['rls_smoke_3b', 'rls_smoke_3b_a2']) {
      const pr = spawnSync('psql', ['-h', env!.host, '-p', String(env!.port), '-U', env!.superUser, '-d', d.db, '-X', '-v', 'ON_ERROR_STOP=1', '-f', `supabase/tests/${s}.sql`], { encoding: 'utf8' });
      const log = `${pr.stdout ?? ''}\n${pr.stderr ?? ''}`;
      assert.ok(pr.status === 0 && /PASSED/.test(log), `${s}: ${log.slice(-500)}`);
    }
  });

  for (const d of created) { try { d.drop(); } catch { /* temizlik en iyi çabadır */ } }
  try { (await import('node:child_process')).execFileSync('psql', ['-h', env!.host, '-p', String(env!.port), '-U', env!.superUser, '-d', 'postgres', '-X', '-q', '-c', `drop database if exists ${TMPL}`]); } catch { /* */ }
  t.finish('FAZ 3B-B PostgreSQL entegrasyon testleri GEÇTİ.');
}
main().catch((e) => { console.error(e); process.exit(1); });
