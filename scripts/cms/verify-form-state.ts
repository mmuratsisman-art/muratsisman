/**
 * FAZ 3B-A2 R3 — FORM DURUMU regresyon testi: doğrulama hatasından sonra kullanıcının seçtiği/yazdığı değerler KAYBOLMAZ.
 *   npx tsx scripts/cms/verify-form-state.ts
 *
 * Kök neden (gerçek tarayıcıda yeniden üretildi): kontrolsüz <select> + React'in hata sonrası otomatik form sıfırlaması.
 * React, yeniden render'da `defaultValue` değişimini <select> seçeneklerine yansıtmaz; sıfırlama select'i ilk haline döndürür.
 * Çözüm: tüm formlar ortak `FormSelect` bileşenini kullanır (değere göre anahtarlanır). Bu test:
 *   1) FormSelect sözleşmesini, 2) HİÇBİR ham <select> kalmadığını (gelecekte tekrar edilmesin), 3) sunucunun gönderilen
 *   değerleri (select/checkbox dahil) geri yolladığını, 4) manuel QA JSON'unun (docs/cms/MANUAL-QA.md) geçerliliğini ve tüm
 *   yaşam döngüsünü doğrular. (Tarayıcı düzeyi kanıt: R3 raporu; Playwright bu repoda bağımlılık değildir.)
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEntityOps } from '@/lib/cms/admin/entity-actions';
import { labEntityConfig } from '@/lib/cms/admin/labs-config';
import { noteEntityConfig } from '@/lib/cms/admin/notes-config';
import { projectEntityConfig } from '@/lib/cms/admin/projects-config';
import { createSiteOps } from '@/lib/cms/admin/site-actions-core';
import { parseCaseStudyText } from '@/lib/cms/validate/case-study';
import { validateProjectInput } from '@/lib/cms/validate/projects';
import { formData, harness, names, outcome, runner } from './test-harness';

const { check, finish } = runner();
type St = { status?: string; message?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };
const ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '2026-10-06T10:00:00.123456+00:00';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/* docs/cms/MANUAL-QA.md içindeki ```json bloklarını al */
const md = readFileSync(join(process.cwd(), 'docs/cms/MANUAL-QA.md'), 'utf8');
const blocks = [...md.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]);

const QA = {
  title: 'Faz 3B-A2 Test Projesi', slug: '', subtitle: 'CMS yaşam döngüsü testi',
  summary: 'Faz 3B-A2 proje içerik yönetimi ve yayın yaşam döngüsünü doğrulamak için oluşturulan test projesidir.',
  kind: 'personal', type_label: 'TEST PROJECT', category: 'CMS Test', accent: 'blue', size: 'standard', graphic: 'rings',
  project_status_label: '', project_status_accent: '', sort_order: '0', tags: 'CMS, Test, MURAT/LAB', coming_soon: '',
};

(async () => {
  /* ───── 1) FormSelect sözleşmesi (statik kaynak denetimi; bileşenin çalışma zamanı davranışı gerçek tarayıcıda doğrulandı) ───── */
  await check('FormSelect: <select>, `value`e göre ANAHTARLI (key={value}), defaultValue={value}; kontrollü `value=` prop\'u YOK', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/admin/FormSelect.tsx'), 'utf8');
    assert.ok(/<select key=\{value\} defaultValue=\{value\}/.test(src), 'key={value} + defaultValue={value} gerekli');
    assert.equal(/<select[^>]* value=\{/.test(src), false, 'select kontrollü olmamalı');
    assert.ok(/value: string;/.test(src), 'value zorunlu string prop');
    assert.ok(/Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' \| 'defaultValue'>/.test(src), 'çağıran value/defaultValue veremez');
  });

  /* ───── 2) ham <select> kalmadı ───── */
  await check('HİÇBİR admin bileşeninde/sayfasında ham <select> yok (hepsi FormSelect)', () => {
    const files = [...walk(join(process.cwd(), 'src/components/admin')), ...walk(join(process.cwd(), 'src/app/(admin)'))];
    assert.ok(files.length > 10);
    for (const f of files) {
      if (f.endsWith('FormSelect.tsx')) continue;
      const src = readFileSync(f, 'utf8');
      assert.equal(/<select[\s>]/.test(src), false, `${f}: ham <select> (kullanın: FormSelect)`);
    }
  });
  await check('FormSelect kullanımlarının hepsi `value=` verir, hiçbiri `defaultValue=` vermez; beklenen sayı: Projects 5, Notes 1, Lab 3, Site 1', () => {
    const expected: Record<string, number> = { 'ProjectForm.tsx': 5, 'NoteForm.tsx': 1, 'LabForm.tsx': 3, 'SiteContentForm.tsx': 1 };
    for (const [f, n] of Object.entries(expected)) {
      const src = readFileSync(join(process.cwd(), 'src/components/admin', f), 'utf8');
      const tags = src.match(/<FormSelect [^>]*>/g) ?? [];
      assert.equal(tags.length, n, f);
      for (const t of tags) {
        assert.ok(/ value=\{/.test(t), `${f}: ${t}`);
        assert.equal(/defaultValue=/.test(t), false, `${f}: ${t}`);
      }
    }
  });

  /* ───── 3) sunucu, gönderilen değerleri (select/checkbox dahil) geri yollar ───── */
  await check('PROJECTS: type=personal + başka alan geçersiz → hata; kind/accent/size/graphic/durum rengi/çok yakında geri döner', async () => {
    const h = harness();
    const r = await outcome(() =>
      createEntityOps({ ...projectEntityConfig, getBase: async () => ({ ok: false, reason: 'not_found' }), slugTaken: async () => false }, h.deps).create(
        { status: 'idle' },
        formData({ ...QA, accent: 'green', size: 'feature', graphic: 'flow', project_status_label: 'ACTIVE', project_status_accent: 'orange', coming_soon: 'on', case_study: '{ "sections": [' }),
      ),
    );
    const s = r.state as St;
    assert.equal(h.calls.length, 0, 'geçersiz case_study DB\'ye gitmemeli');
    assert.equal(s.status, 'error');
    assert.match(s.fieldErrors?.case_study ?? '', /Geçersiz JSON/);
    assert.deepEqual(
      [s.values?.kind, s.values?.accent, s.values?.size, s.values?.graphic, s.values?.project_status_accent, s.values?.coming_soon, s.values?.title, s.values?.type_label, s.values?.tags, s.values?.case_study],
      ['personal', 'green', 'feature', 'flow', 'orange', 'on', QA.title, QA.type_label, QA.tags, '{ "sections": ['],
    );
  });
  await check('PROJECTS (DÜZENLEME / save yolu): geçersiz case_study + seçimler → hata; tüm seçimler geri döner; DB\'ye gitmez', async () => {
    const h = harness();
    const r = await outcome(() =>
      createEntityOps({ ...projectEntityConfig, getBase: async () => ({ ok: true, data: { status: 'draft', slug: 'x' } }), slugTaken: async () => false }, h.deps).save(
        { status: 'idle' },
        formData({ id: ID, expected_draft_updated_at: TOKEN, intent: 'save', ...QA, accent: 'purple', size: 'teaser', graphic: 'dots', kind: 'work', project_status_label: 'X', project_status_accent: 'green', coming_soon: 'on', case_study: '[]' }),
      ),
    );
    assert.equal(h.calls.length, 0);
    const v = (r.state as St).values;
    assert.deepEqual([v?.kind, v?.accent, v?.size, v?.graphic, v?.project_status_accent, v?.coming_soon], ['work', 'purple', 'teaser', 'dots', 'green', 'on']);
  });
  await check('NOTES: geçersiz başlık → accent seçimi geri döner', async () => {
    const h = harness();
    const r = await outcome(() =>
      createEntityOps({ ...noteEntityConfig, getBase: async () => ({ ok: false, reason: 'not_found' }), slugTaken: async () => false }, h.deps).create(
        { status: 'idle' },
        formData({ title: '', slug: '', excerpt: 'e', body: 'b', tags: '', accent: 'purple', published_at: '', reading_time: '' }),
      ),
    );
    assert.equal(h.calls.length, 0);
    assert.equal((r.state as St).values?.accent, 'purple');
  });
  await check('LAB: geçersiz başlık → tür / durum / renk seçimleri ve öne çıkar onay kutusu geri döner', async () => {
    const h = harness();
    const r = await outcome(() =>
      createEntityOps({ ...labEntityConfig, getBase: async () => ({ ok: false, reason: 'not_found' }), slugTaken: async () => false }, h.deps).create(
        { status: 'idle' },
        formData({ title: '', slug: '', type: 'PROTOTYPE', experiment_status: 'PAUSED', summary: 's', description: '', accent: 'orange', featured: 'on', year: '2026', tags: '', sort_order: '', story_why: '' }),
      ),
    );
    assert.equal(h.calls.length, 0);
    const v = (r.state as St).values;
    assert.deepEqual([v?.type, v?.experiment_status, v?.accent, v?.featured], ['PROTOTYPE', 'PAUSED', 'orange', 'on']);
  });
  await check('SITE (currently): geçersiz satır → kart renkleri (select) geri döner', async () => {
    const h = harness();
    const r = await outcome(() =>
      createSiteOps(h.deps).save({ status: 'idle' }, formData({ key: 'currently', intent: 'save', expected_draft_updated_at: '', label_1: 'A', value_1: '', accent_1: 'green', label_2: 'B', value_2: 'x', accent_2: 'purple' })),
    );
    assert.equal(h.calls.length, 0);
    const v = (r.state as St).values;
    assert.deepEqual([v?.accent_1, v?.accent_2], ['green', 'purple']);
  });

  /* ───── 4) manuel QA JSON + kullanıcının QA akışı ───── */
  await check('docs/cms/MANUAL-QA.md: 2 JSON bloğu var ve ikisi de GEÇERLİ case study', () => {
    assert.equal(blocks.length, 2);
    for (const b of blocks) {
      const r = parseCaseStudyText(b);
      assert.ok(r.ok && r.value !== null, r.ok ? '' : r.error);
    }
  });
  await check('MANUEL QA JSON + QA formu → yayın seviyesinde de geçerli (kullanıcının gerçek alan değerleriyle)', () => {
    for (const b of blocks) {
      const r = validateProjectInput({ ...QA, case_study: b }, 'publish');
      assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.errors));
      assert.equal(r.value.slug, 'faz-3b-a2-test-projesi');
    }
  });
  await check('manuel QA JSON gerçek yapıdan TÜREMİŞ: gerçek yakala bölüm kimliği/türleri aynı (overview:prose, capabilities:list, learned:list/numbered)', () => {
    const rich = JSON.parse(blocks[1]) as { sections: { id: string; kind: string; variant?: string }[] };
    assert.deepEqual(rich.sections.map((s) => `${s.id}:${s.kind}${s.variant ? '/' + s.variant : ''}`), ['overview:prose', 'capabilities:list', 'learned:list/numbered']);
  });
  await check('kullanıcının üç geçersiz denemesi reddedilir (DB\'ye hiçbir şey yazılmaz), mesajlar anlaşılır', async () => {
    const tries: [string, RegExp[]][] = [
      ['{"challenge":"x","approach":"y","outcome":"z"}', [/bilinmeyen alan "challenge"/, /sections/]],
      ['{"sections":[{"id":"a","heading":"H","kind":"text","body":["x"]}],"tags":"x"}', [/kind/, /tags/]],
      ['{"sections":[{"id":"a","title":"T","kind":"prose","body":"x"}],"tags":[]}', [/bilinmeyen alan "title"/, /heading/, /body/]],
    ];
    for (const [json, res] of tries) {
      const h = harness();
      const r = await outcome(() =>
        createEntityOps({ ...projectEntityConfig, getBase: async () => ({ ok: false, reason: 'not_found' }), slugTaken: async () => false }, h.deps).create({ status: 'idle' }, formData({ ...QA, case_study: json })),
      );
      assert.equal(h.calls.length, 0, json);
      const msg = (r.state as St).fieldErrors?.case_study ?? '';
      for (const re of res) assert.match(msg, re, `${json} → ${msg}`);
    }
  });
  const base = { status: 'draft' as const, slug: 'faz-3b-a2-test-projesi' };
  const ops = (h: ReturnType<typeof harness>) => createEntityOps({ ...projectEntityConfig, getBase: async () => ({ ok: true, data: base }), slugTaken: async () => false }, h.deps);
  await check('GEÇERLİ create draft çalışır (create_project; case_study taslak dokümanda)', async () => {
    const h = harness();
    const r = await outcome(() => createEntityOps({ ...projectEntityConfig, getBase: async () => ({ ok: false, reason: 'not_found' }), slugTaken: async () => false }, h.deps).create({ status: 'idle' }, formData({ ...QA, case_study: blocks[0] })));
    assert.equal(names(h.calls), 'create_project');
    assert.equal(r.redirect, `/admin/projects/${ID}?ok=created`);
    assert.deepEqual((h.calls[0].args.p_data as { case_study: unknown }).case_study, JSON.parse(blocks[0]));
  });
  await check('publish onaysız → fail-closed; onaylı → kaydet + yayınla; eksik intent → fail-closed', async () => {
    const f = { id: ID, expected_draft_updated_at: TOKEN, ...QA, case_study: blocks[1] };
    let h = harness();
    let r = await outcome(() => ops(h).save({ status: 'idle' }, formData({ ...f, intent: 'publish' })));
    assert.equal(h.calls.length, 0);
    assert.ok((r.state as St).fieldErrors?.confirm_publish);
    h = harness();
    r = await outcome(() => ops(h).save({ status: 'idle' }, formData({ ...f, intent: 'publish', confirm_publish: 'on' })));
    assert.equal(names(h.calls), 'save_project_draft,publish_project');
    assert.equal(r.redirect, `/admin/projects/${ID}?ok=published`);
    h = harness();
    r = await outcome(() => ops(h).save({ status: 'idle' }, formData({ ...f, confirm_publish: 'on' })));
    assert.equal(h.calls.length, 0);
    assert.match((r.state as St).message ?? '', /İşlem türü belirlenemedi/);
  });

  finish('FORM DURUMU REGRESYON TESTİ GEÇTİ: seçimler ve yazılanlar doğrulama hatasından sonra korunur');
})();
