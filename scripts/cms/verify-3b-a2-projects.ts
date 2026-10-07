/**
 * FAZ 3B-A2 — PROJECTS regresyon testi (deterministik; Next/Supabase/DB gerekmez).
 *   npx tsx scripts/cms/verify-3b-a2-projects.ts
 *
 * Kapsam: slug normalizasyonu · doğrulama · geçersiz case_study JSON reddi · taslak · onaylı yayın · onaysız yayın (fail-closed) ·
 * eksik/geçersiz intent (fail-closed) · yayında + bekleyen taslak durumu · yaşam döngüsü sonrası form anahtarı · A1 ortak çekirdeğiyle parity.
 */
import assert from 'node:assert/strict';
import { projects } from '@/data/projects';
import { createEntityOps } from '@/lib/cms/admin/entity-actions';
import { editorFormKey } from '@/lib/cms/admin/form-key';
import { INTENT_ERROR_MESSAGE } from '@/lib/cms/admin/intent';
import { describeLifecycle } from '@/lib/cms/admin/lifecycle';
import { coerceProjectDoc, emptyProjectDoc, PROJECT_FIELDS, projectDocToFormValues } from '@/lib/cms/admin/project-form';
import { projectEntityConfig } from '@/lib/cms/admin/projects-config';
import { DB_ERROR_MESSAGES } from '@/lib/cms/db-errors';
import { projectToInsert } from '@/lib/cms/mappers';
import { slugify } from '@/lib/cms/slug';
import type { ContentStatus } from '@/lib/cms/types';
import { validateProjectInput, type ProjectDoc } from '@/lib/cms/validate/projects';
import { formData, harness, names, outcome, runner } from './test-harness';

const { check, finish } = runner();
const ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '2026-10-06T10:00:00.123456+00:00';

const CS = JSON.stringify({ sections: [{ id: 'overview', heading: 'OVERVIEW', kind: 'prose', body: ['Metin.'] }], tags: ['a'] }, null, 2);
const VALID = {
  title: 'Yeni Proje', slug: '', subtitle: 'Alt başlık', summary: 'Özet metni.', accent: 'green', size: 'standard', graphic: 'rings', kind: 'personal',
  type_label: 'PERSONAL PROJECT', category: 'Platform', project_status_label: '', project_status_accent: '', tags: 'a, b', coming_soon: '', sort_order: '2', case_study: CS,
};
const rowToDoc = (p: (typeof projects)[number], i: number): ProjectDoc => {
  const r = projectToInsert(p, i);
  return {
    slug: r.slug, title: r.title, subtitle: r.subtitle ?? '', summary: r.summary ?? '', accent: r.accent, size: r.size ?? 'standard', graphic: r.graphic ?? 'rings',
    tags: r.tags ?? [], coming_soon: r.coming_soon === true, kind: r.kind ?? null, type_label: r.type_label ?? null, category: r.category ?? null,
    project_status_label: r.project_status_label ?? null, project_status_accent: r.project_status_accent ?? null, case_study: r.case_study ?? null, sort_order: r.sort_order ?? 0,
  };
};
function ops(base: { status: ContentStatus; slug: string }, h: ReturnType<typeof harness>, slugTaken = false) {
  return createEntityOps({ ...projectEntityConfig, getBase: async () => ({ ok: true, data: base }), slugTaken: async () => slugTaken }, h.deps);
}
const saveWith = (base: { status: ContentStatus; slug: string }, h: ReturnType<typeof harness>, f: Record<string, string>) =>
  outcome(() => ops(base, h).save({ status: 'idle' }, formData({ id: ID, expected_draft_updated_at: TOKEN, ...f })));

(async () => {
  /* ───── slug ───── */
  await check('slug: Türkçe başlıktan üretilir', () => {
    const r = validateProjectInput({ ...VALID, title: 'Şişman Çözümleri: İğne & Çuvaldız', slug: '' }, 'draft');
    assert.ok(r.ok);
    assert.equal(r.value.slug, 'sisman-cozumleri-igne-cuvaldiz');
  });
  await check('slug: elle girilen normalize edilir (boşluk, büyük harf, Türkçe)', () => {
    const r = validateProjectInput({ ...VALID, slug: '  Yakala İÇ Proje  ' }, 'draft');
    assert.ok(r.ok);
    assert.equal(r.value.slug, 'yakala-ic-proje');
  });
  await check('slug: gerçek 4 projenin slug\'ı slugify ile değişmez (idempotent)', () => {
    for (const p of projects) assert.equal(slugify(p.slug), p.slug);
  });
  await check('slug: üretilemezse hata', () => {
    const r = validateProjectInput({ ...VALID, title: '!!!', slug: '' }, 'draft');
    assert.ok(!r.ok && r.errors.slug);
  });

  /* ───── doğrulama ───── */
  await check('taslak: yalnızca başlık yeterli', () => assert.ok(validateProjectInput({ title: 'Sadece Başlık' }, 'draft').ok));
  await check('başlık zorunlu / en fazla 120', () => {
    assert.ok(!validateProjectInput({ ...VALID, title: '  ' }, 'draft').ok);
    const r = validateProjectInput({ ...VALID, title: 'x'.repeat(121) }, 'draft');
    assert.ok(!r.ok && r.errors.title);
  });
  await check('enum alanlar: geçersiz renk / boyut / grafik / tür reddedilir', () => {
    for (const bad of [{ accent: 'pink' }, { size: 'huge' }, { graphic: 'zigzag' }, { kind: 'hobby' }, { project_status_accent: 'pink', project_status_label: 'X' }]) {
      const r = validateProjectInput({ ...VALID, ...bad }, 'draft');
      assert.ok(!r.ok, JSON.stringify(bad));
    }
  });
  await check('durum etiketi çifti: metin+renk birlikte (DB constraint\'iyle uyumlu)', () => {
    assert.ok(!validateProjectInput({ ...VALID, project_status_label: 'ACTIVE', project_status_accent: '' }, 'draft').ok);
    assert.ok(!validateProjectInput({ ...VALID, project_status_label: '', project_status_accent: 'green' }, 'draft').ok);
    const r = validateProjectInput({ ...VALID, project_status_label: 'ACTIVE', project_status_accent: 'green' }, 'draft');
    assert.ok(r.ok && r.value.project_status_label === 'ACTIVE' && r.value.project_status_accent === 'green');
  });
  await check('sıra 0–9999 tam sayı; etiketler ayrıştırılır', () => {
    assert.ok(!validateProjectInput({ ...VALID, sort_order: '-1' }, 'draft').ok);
    assert.ok(!validateProjectInput({ ...VALID, sort_order: '1.5' }, 'draft').ok);
    assert.ok(!validateProjectInput({ ...VALID, sort_order: '10000' }, 'draft').ok);
    const r = validateProjectInput({ ...VALID, tags: ' AI,  ai , Web ' }, 'draft');
    assert.ok(r.ok);
    assert.deepEqual(r.value.tags, ['AI', 'Web']);
  });
  await check('yayın seviyesi: özet, tür, tür etiketi, kategori, case study zorunlu', () => {
    const r = validateProjectInput({ title: 'X' }, 'publish');
    assert.ok(!r.ok);
    for (const f of ['summary', 'kind', 'type_label', 'category', 'case_study']) assert.ok(r.errors[f], f);
  });
  await check('yayın seviyesi: "Çok yakında" yalnızca başlık ister', () => assert.ok(validateProjectInput({ title: 'Yakında', coming_soon: 'on' }, 'publish').ok));
  await check('GERÇEK 4 PROJE formdan kayıpsız geçer (publish seviyesi, alan alan eşit)', () => {
    assert.equal(projects.length, 4);
    projects.forEach((p, i) => {
      const doc = rowToDoc(p, i);
      const raw = projectDocToFormValues(doc);
      assert.deepEqual(Object.keys(raw).sort(), [...PROJECT_FIELDS].sort());
      const r = validateProjectInput(raw, 'publish');
      assert.ok(r.ok, `${p.slug}: ${r.ok ? '' : JSON.stringify(r.errors)}`);
      assert.deepStrictEqual(r.value, doc, `${p.slug} birebir korunmalı`);
    });
  });
  await check('coerceProjectDoc bozuk jsonb\'da çökmez, güvenli varsayılana düşer', () => {
    const d = coerceProjectDoc({ accent: 'pink', size: 3, tags: 'x', case_study: 'str', kind: 'zzz' }, emptyProjectDoc());
    assert.equal(d.accent, 'blue');
    assert.equal(d.size, 'standard');
    assert.equal(d.kind, null);
    assert.equal(d.case_study, null);
    assert.deepEqual(d.tags, []);
  });

  /* ───── case_study JSON reddi ───── */
  await check('case_study: geçersiz JSON sözdizimi reddedilir (Türkçe, ham ayrıntı yok)', () => {
    const r = validateProjectInput({ ...VALID, case_study: '{ "sections": [' }, 'draft');
    assert.ok(!r.ok);
    assert.match(r.errors.case_study ?? '', /Geçersiz JSON/);
    assert.doesNotMatch(r.errors.case_study ?? '', /Unexpected|position|SyntaxError|token/i);
  });
  await check('case_study: şekil hataları anlaşılır yolla bildirilir', () => {
    const cases: [string, RegExp][] = [
      ['[]', /nesne/],
      ['{"sections":[],"tags":[]}', /sections/],
      ['{"sections":[{"id":"a","heading":"H","kind":"list","items":[{"title":"t"}]}],"tags":[]}', /items\[0\]\.text/],
      ['{"sections":[{"id":"a","heading":"H","kind":"prose","body":["x"]}],"tags":[],"zzz":1}', /bilinmeyen alan "zzz"/],
      ['{"sections":[{"id":"a","heading":"H","kind":"prose","body":["x"]}],"tags":[],"slots":{"diagramAfter":"yok"}}', /slots\.diagramAfter/],
    ];
    for (const [json, re] of cases) {
      const r = validateProjectInput({ ...VALID, case_study: json }, 'draft');
      assert.ok(!r.ok, json);
      assert.match(r.errors.case_study ?? '', re, json);
    }
  });
  await check('case_study: boş = null (taslak serbest)', () => {
    const r = validateProjectInput({ ...VALID, case_study: '   ' }, 'draft');
    assert.ok(r.ok && r.value.case_study === null);
  });

  /* ───── yaşam döngüsü akışları (A1 ortak çekirdeği) ───── */
  await check('CREATE: create_project çağrılır; sahte alanlar (role/isAdmin/status) RPC\'ye girmez', async () => {
    const h = harness();
    const r = await outcome(() => ops({ status: 'draft', slug: '' }, h).create({ status: 'idle' }, formData({ ...VALID, role: 'admin', isAdmin: 'true', status: 'published' })));
    assert.equal(names(h.calls), 'create_project');
    assert.equal(r.redirect, `/admin/projects/${ID}?ok=created`);
    assert.doesNotMatch(JSON.stringify(h.calls[0].args), /isAdmin|"role"|"status"|published/);
    assert.equal((h.calls[0].args.p_data as ProjectDoc).slug, 'yeni-proje');
  });
  await check('CREATE: geçersiz case_study → RPC YOK, alan hatası', async () => {
    const h = harness();
    const r = await outcome(() => ops({ status: 'draft', slug: '' }, h).create({ status: 'idle' }, formData({ ...VALID, case_study: '{bad' })));
    assert.equal(h.calls.length, 0);
    assert.ok((r.state as { fieldErrors?: Record<string, string> }).fieldErrors?.case_study);
  });
  await check('CREATE: slug dolu → kullanıcı dostu hata, RPC yok', async () => {
    const h = harness();
    const r = await outcome(() => createEntityOps({ ...projectEntityConfig, getBase: async () => ({ ok: false, reason: 'not_found' }), slugTaken: async () => true }, h.deps).create({ status: 'idle' }, formData(VALID)));
    assert.equal(h.calls.length, 0);
    assert.equal((r.state as { fieldErrors?: Record<string, string> }).fieldErrors?.slug, DB_ERROR_MESSAGES.slug_taken);
  });
  await check('DRAFT: intent=save → yalnızca save_project_draft; token birebir; ?ok=saved', async () => {
    const h = harness();
    const r = await saveWith({ status: 'published', slug: 'yeni-proje' }, h, { ...VALID, slug: 'yeni-proje', intent: 'save' });
    assert.equal(names(h.calls), 'save_project_draft');
    assert.equal(h.calls[0].args.p_expected_draft_updated_at, TOKEN);
    assert.equal(r.redirect, `/admin/projects/${ID}?ok=saved`);
  });
  await check('PUBLISH + onay → save_project_draft sonra publish_project (yalnızca p_id)', async () => {
    const h = harness();
    const r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, intent: 'publish', confirm_publish: 'on' });
    assert.equal(names(h.calls), 'save_project_draft,publish_project');
    assert.deepEqual(Object.keys(h.calls[1].args), ['p_id']);
    assert.equal(r.redirect, `/admin/projects/${ID}?ok=published`);
  });
  await check('PUBLISH onaysız → fail-closed (RPC yok)', async () => {
    const h = harness();
    const r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, intent: 'publish' });
    assert.equal(h.calls.length, 0);
    assert.ok((r.state as { fieldErrors?: Record<string, string> }).fieldErrors?.confirm_publish);
  });
  await check('PUBLISH: yayın seviyesi doğrulama (özet yok) → RPC yok', async () => {
    const h = harness();
    const r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, summary: '', intent: 'publish', confirm_publish: 'on' });
    assert.equal(h.calls.length, 0);
    assert.ok((r.state as { fieldErrors?: Record<string, string> }).fieldErrors?.summary);
  });
  await check('EKSİK intent (+ confirm_publish=on) → fail-closed, sessiz kayıt YOK', async () => {
    const h = harness();
    const r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, confirm_publish: 'on' });
    assert.equal(h.calls.length, 0);
    assert.equal(r.redirect, null);
    assert.equal((r.state as { message?: string }).message, INTENT_ERROR_MESSAGE);
  });
  await check('GEÇERSİZ intent değerleri → fail-closed', async () => {
    for (const bad of ['', 'PUBLISH', 'publish ', 'delete', 'unpublish', 'save,publish']) {
      const h = harness();
      const r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, intent: bad, confirm_publish: 'on' });
      assert.equal(h.calls.length, 0, JSON.stringify(bad));
      assert.equal((r.state as { message?: string }).message, INTENT_ERROR_MESSAGE);
    }
  });
  await check('SLUG KİLİDİ: yayındaki projede slug değişikliği reddedilir (RPC yok)', async () => {
    const h = harness();
    const r = await saveWith({ status: 'published', slug: 'yakala' }, h, { ...VALID, slug: 'baska', intent: 'publish', confirm_publish: 'on' });
    assert.equal(h.calls.length, 0);
    assert.equal((r.state as { fieldErrors?: Record<string, string> }).fieldErrors?.slug, DB_ERROR_MESSAGES.slug_locked);
  });
  await check('STALE publish → ?err=published_stale; save stale → Türkçe mesaj + girdi korunur', async () => {
    let h = harness({ rpcError: { publish_project: 'stale' } });
    let r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, intent: 'publish', confirm_publish: 'on' });
    assert.equal(r.redirect, `/admin/projects/${ID}?err=published_stale`);
    h = harness({ rpcError: { save_project_draft: 'stale' } });
    r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, intent: 'save' });
    assert.equal((r.state as { message?: string; values?: Record<string, string> }).message, DB_ERROR_MESSAGES.stale);
    assert.equal((r.state as { values?: Record<string, string> }).values?.title, 'Yeni Proje');
  });
  await check('HAM DB HATASI sızmaz: bilinmeyen/atlanmış tür → genel mesaj', async () => {
    const h = harness({ rpcError: { save_project_draft: 'unknown' } });
    const r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, intent: 'save' });
    assert.equal((r.state as { message?: string }).message, DB_ERROR_MESSAGES.unknown);
  });
  await check('admin DEĞİL → hiçbir RPC yok, requireAdmin önce (create/save/publish)', async () => {
    for (const intent of ['save', 'publish', undefined]) {
      const h = harness({ admin: false });
      const r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, ...(intent ? { intent } : {}), confirm_publish: 'on' });
      assert.equal(h.calls.length, 0);
      assert.ok(h.guardCalls() >= 1);
      assert.equal((r.state as { message?: string }).message, DB_ERROR_MESSAGES.forbidden);
    }
    const h = harness({ admin: false });
    await outcome(() => ops({ status: 'draft', slug: '' }, h).create({ status: 'idle' }, formData(VALID)));
    assert.equal(h.calls.length, 0);
  });
  await check('UNPUBLISH / DISCARD: onay şart; doğru RPC; silme RPC\'si yok', async () => {
    let h = harness();
    let r = await outcome(() => ops({ status: 'published', slug: 'x' }, h).unpublish(formData({ id: ID })));
    assert.equal(h.calls.length, 0);
    assert.equal(r.redirect, `/admin/projects/${ID}?err=confirm`);
    h = harness();
    r = await outcome(() => ops({ status: 'published', slug: 'x' }, h).unpublish(formData({ id: ID, confirm_unpublish: 'on' })));
    assert.equal(names(h.calls), 'unpublish_project');
    h = harness();
    r = await outcome(() => ops({ status: 'published', slug: 'x' }, h).discard(formData({ id: ID, confirm_discard: 'on' })));
    assert.equal(names(h.calls), 'discard_project_draft');
    assert.equal(r.redirect, `/admin/projects/${ID}?ok=discarded`);
    assert.ok(!h.calls.some((c) => /delete|remove/i.test(c.name)));
  });

  /* ───── durum + form anahtarı ───── */
  await check('yayında + bekleyen taslak: PUBLISHED · BEKLEYEN DEĞİŞİKLİK; slug kilitli; at/kaldır var', () => {
    const v = describeLifecycle({ status: 'published', publishedAt: TOKEN, hasDraft: true, stale: false });
    assert.equal(v.key, 'published-pending');
    assert.equal(v.label, 'PUBLISHED · BEKLEYEN DEĞİŞİKLİK');
    assert.ok(v.slugLocked && v.canDiscard && v.canUnpublish && v.canPublish);
  });
  await check('form anahtarı: kaydet / at / yayınla / kaldır sonrası DEĞİŞİR; at → yayın durumuyla aynı', () => {
    const T = (n: number) => `2026-10-06T10:00:0${n}.123456+00:00`;
    const key = (status: ContentStatus, live: string, draft: string) =>
      editorFormKey({ id: ID, liveUpdatedAt: live, draftUpdatedAt: draft, lifecycleKey: describeLifecycle({ status, publishedAt: T(0), hasDraft: draft !== '', stale: false }).key });
    const published = key('published', T(1), '');
    const pending = key('published', T(1), T(2));
    const pending2 = key('published', T(1), T(3));
    const discarded = key('published', T(1), '');
    const republished = key('published', T(5), '');
    const unpublished = key('draft', T(6), '');
    assert.notEqual(published, pending);
    assert.notEqual(pending, pending2);
    assert.notEqual(pending, discarded);
    assert.equal(discarded, published);
    assert.notEqual(pending2, republished);
    assert.notEqual(republished, unpublished);
  });
  await check('Projects ile Notes/Lab AYNI çekirdeği paylaşır (parity: aynı senaryo → aynı çağrı deseni)', async () => {
    const pattern = async () => {
      const out: string[] = [];
      for (const [intent, confirm] of [['save', false], ['publish', true], ['publish', false], [undefined, true]] as const) {
        const h = harness();
        const r = await saveWith({ status: 'draft', slug: 'x' }, h, { ...VALID, ...(intent ? { intent } : {}), ...(confirm ? { confirm_publish: 'on' } : {}) });
        out.push(`${intent ?? '∅'}/${confirm}: ${h.calls.length} rpc, ${r.redirect ? 'redirect' : 'state'}`);
      }
      return out.join(' | ');
    };
    assert.equal(await pattern(), 'save/false: 1 rpc, redirect | publish/true: 2 rpc, redirect | publish/false: 0 rpc, state | ∅/true: 0 rpc, state');
  });

  finish('PROJECTS REGRESYON TESTİ GEÇTİ');
})();
