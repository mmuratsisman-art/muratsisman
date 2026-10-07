/**
 * FAZ 3B-A2 — SITE CONTENT regresyon testi (deterministik; Next/Supabase/DB gerekmez).
 *   npx tsx scripts/cms/verify-3b-a2-site.ts
 *
 * Kapsam: kullanıcı dostu form doğrulaması · JSON editörü (ayrıştırma + şekil) · geçersiz JSON reddi · taslak · onaylı yayın ·
 * onaysız yayın (fail-closed) · eksik/geçersiz intent (fail-closed) · bekleyen değişiklik · discard · form yeniden bağlama (sürüm anahtarı).
 */
import assert from 'node:assert/strict';
import { currently } from '@/data/currently';
import { labCategories } from '@/data/lab';
import { siteConfig } from '@/data/site';
import { socialLinks } from '@/data/social';
import { editorFormKey } from '@/lib/cms/admin/form-key';
import { INTENT_ERROR_MESSAGE } from '@/lib/cms/admin/intent';
import { createSiteOps } from '@/lib/cms/admin/site-actions-core';
import { siteDocToFormValues } from '@/lib/cms/admin/site-form';
import { canonicalJson, describeSiteLifecycle, sameDoc } from '@/lib/cms/admin/site-lifecycle';
import { DB_ERROR_MESSAGES } from '@/lib/cms/db-errors';
import { siteContentToDocuments } from '@/lib/cms/mappers';
import { SITE_CONTENT_KEYS } from '@/lib/cms/types';
import { FRIENDLY_SITE_KEYS, isFriendlyKey, JSON_SITE_KEYS, SITE_FIELDS, validateSiteDoc, validateSiteFriendly, validateSiteInput, validateSiteJson } from '@/lib/cms/validate/site';
import { formData, harness, names, outcome, runner } from './test-harness';

const { check, finish } = runner();
const TOKEN = '2026-10-06T10:00:00.123456+00:00';
const docs = siteContentToDocuments({ siteConfig, currently, socialLinks, labCategories });
type St = { message?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

const heroRaw = () => siteDocToFormValues('hero', docs.hero);
const save = (key: string, h: ReturnType<typeof harness>, f: Record<string, string>) =>
  outcome(() => createSiteOps(h.deps).save({ status: 'idle' }, formData({ key, expected_draft_updated_at: TOKEN, ...f })));

(async () => {
  /* ───── kapsam ───── */
  await check('10 belge: 4 form + 6 JSON (kapsam birebir istenen gibi)', () => {
    assert.equal(SITE_CONTENT_KEYS.length, 10);
    assert.deepEqual([...FRIENDLY_SITE_KEYS], ['hero', 'currently', 'about', 'contact']);
    assert.deepEqual([...JSON_SITE_KEYS], ['site_meta', 'social', 'lab_intro', 'lab_page', 'notes_page', 'lab_categories']);
    for (const k of SITE_CONTENT_KEYS) assert.equal(isFriendlyKey(k), (FRIENDLY_SITE_KEYS as readonly string[]).includes(k));
  });

  /* ───── kullanıcı dostu formlar ───── */
  await check('GERÇEK içerik 4 dostça formdan kayıpsız geçer (docs → form → doğrulama → aynı belge)', () => {
    for (const k of FRIENDLY_SITE_KEYS) {
      const raw = siteDocToFormValues(k, docs[k]);
      const r = validateSiteFriendly(k, raw);
      assert.ok(r.ok, `${k}: ${r.ok ? '' : JSON.stringify(r.errors)}`);
      assert.deepStrictEqual(r.value, docs[k], `${k} birebir`);
    }
  });
  await check('hero: kavram etiketi tam 4 olmalı; zorunlu alanlar; güvenli bağlantı', () => {
    let r = validateSiteFriendly('hero', { ...heroRaw(), concepts: 'A\nB\nC' });
    assert.ok(!r.ok && r.errors.concepts);
    r = validateSiteFriendly('hero', { ...heroRaw(), first: '' });
    assert.ok(!r.ok && r.errors.first);
    for (const bad of ['javascript:alert(1)', 'http://example.com', '//evil.com', 'foo', 'https://', 'mailto:yok']) {
      r = validateSiteFriendly('hero', { ...heroRaw(), cta_primary_href: bad });
      assert.ok(!r.ok && r.errors.cta_primary_href, bad);
    }
    for (const good of ['/#projects', '#top', '/lab', 'https://example.com/x', 'mailto:a@b.co']) assert.ok(validateSiteFriendly('hero', { ...heroRaw(), cta_primary_href: good }).ok, good);
  });
  await check('currently: boş satırlar yok sayılır; kimlikler korunur; boş kimlik etiketten üretilir; çakışma ayrılır', () => {
    const raw = siteDocToFormValues('currently', docs.currently);
    const r = validateSiteFriendly('currently', raw);
    assert.ok(r.ok);
    assert.equal((r.value as { items: unknown[] }).items.length, 4);
    const raw2 = { label_1: 'Yeni Kart', value_1: 'x', accent_1: 'green', label_2: 'Yeni Kart', value_2: 'y', accent_2: 'blue' };
    const r2 = validateSiteFriendly('currently', raw2);
    assert.ok(r2.ok);
    assert.deepEqual((r2.value as { items: { id: string }[] }).items.map((i) => i.id), ['yeni-kart', 'yeni-kart-2']);
    assert.ok(!validateSiteFriendly('currently', {}).ok);
  });
  await check('currently: satır hataları DOĞRU form alanına eşlenir', () => {
    const r = validateSiteFriendly('currently', { label_1: 'A', value_1: 'x', accent_1: 'blue', label_3: 'B', value_3: '', accent_3: 'blue' });
    assert.ok(!r.ok);
    assert.ok(r.errors.value_3, JSON.stringify(r.errors));
    const r2 = validateSiteFriendly('currently', { label_2: 'X', value_2: 'y', accent_2: 'pink' });
    assert.ok(!r2.ok && r2.errors.accent_2);
  });
  await check('about: başlık+metin zorunlu; görsel kimliği UUID olmalı; metin ≤600', () => {
    assert.ok(!validateSiteFriendly('about', { title: '', text: 'x' }).ok);
    assert.ok(!validateSiteFriendly('about', { title: 'T', text: 'x'.repeat(601) }).ok);
    const bad = validateSiteFriendly('about', { title: 'T', text: 'x', image_media_id: 'not-a-uuid' });
    assert.ok(!bad.ok && bad.errors.image_media_id);
    assert.ok(validateSiteFriendly('about', { title: 'T', text: 'x', image_media_id: '11111111-1111-4111-8111-111111111111' }).ok);
  });
  await check('contact: başlık satırları ≤3, metin ≤6, düğme bağlantısı güvenli', () => {
    const raw = siteDocToFormValues('contact', docs.contact);
    assert.ok(!validateSiteFriendly('contact', { ...raw, title: 'a\nb\nc\nd' }).ok);
    const r = validateSiteFriendly('contact', { ...raw, cta_href: 'javascript:1' });
    assert.ok(!r.ok && r.errors.cta_href);
  });

  /* ───── JSON editörü ───── */
  await check('JSON: GERÇEK 6 belge (site_meta, social, lab_intro, lab_page, notes_page, lab_categories) birebir geçer', () => {
    for (const k of JSON_SITE_KEYS) {
      const text = siteDocToFormValues(k, docs[k]).json;
      const r = validateSiteJson(k, text);
      assert.ok(r.ok, `${k}: ${r.ok ? '' : JSON.stringify(r.errors)}`);
      assert.deepStrictEqual(r.value, docs[k], `${k} birebir`);
    }
  });
  await check('JSON: geçersiz sözdizimi / boş / aşırı büyük reddedilir (Türkçe, ham ayrıntı yok)', () => {
    for (const bad of ['{', '', '   ', 'not json', '{"links": [}']) {
      const r = validateSiteJson('social', bad);
      assert.ok(!r.ok, JSON.stringify(bad));
      assert.doesNotMatch(r.errors.json ?? '', /Unexpected|position|SyntaxError|JSON\.parse/i);
    }
    const big = validateSiteJson('lab_intro', JSON.stringify({ lines: ['x'.repeat(30_000)] }));
    assert.ok(!big.ok);
  });
  await check('JSON: şekil doğrulaması (bilinmeyen alan, yanlış tür, tekrar eden kimlik, sınır) her anahtarda', () => {
    const cases: [typeof JSON_SITE_KEYS[number], unknown, RegExp][] = [
      ['site_meta', { ...docs.site_meta, extra: 1 }, /bilinmeyen alan "extra"/],
      ['site_meta', { ...(docs.site_meta as object), domain: 'not a domain' }, /alan adı/],
      ['social', { links: [{ id: 'a', label: 'A', href: 'javascript:1' }] }, /bağlantı/],
      ['social', { links: [{ id: 'a', label: 'A', href: '#' }, { id: 'a', label: 'B', href: '#' }] }, /tekrar/],
      ['lab_intro', { lines: [] }, /lines/],
      ['lab_intro', { lines: 'x' }, /liste/],
      ['lab_page', { eyebrow: 'e', note: 'n' }, /projectsLinkLabel/],
      ['notes_page', { eyebrow: 1, intro: 'i' }, /metin/],
      ['lab_categories', { items: [{ id: 'A B', label: 'x', accent: 'blue' }] }, /kimlik/],
      ['lab_categories', { items: [{ id: 'a', label: 'x', accent: 'pink' }] }, /accent/],
    ];
    for (const [k, v, re] of cases) {
      const r = validateSiteJson(k, JSON.stringify(v));
      assert.ok(!r.ok, `${k} ${JSON.stringify(v).slice(0, 40)}`);
      assert.match(r.errors.json ?? '', re, k);
    }
    assert.ok(!validateSiteJson('social', '[]').ok);
    assert.ok(!validateSiteJson('social', 'null').ok);
  });
  await check('JSON: validateSiteDoc yeniden kurar (sızdırma yok): fazladan alan hata, çıktı yalnız bilinen alanlar', () => {
    const r = validateSiteDoc('lab_page', docs.lab_page);
    assert.ok(r.ok);
    assert.deepEqual(Object.keys(r.value).sort(), ['eyebrow', 'note', 'projectsLinkLabel']);
  });
  await check('form alanı allowlist: her anahtar yalnızca tanımlı alanları okur', () => {
    assert.deepEqual(SITE_FIELDS.site_meta, ['json']);
    assert.equal(SITE_FIELDS.currently.length, 24);
    assert.equal(validateSiteInput('hero', heroRaw()).ok, true);
  });

  /* ───── mutation çekirdeği ───── */
  const heroForm = () => ({ ...heroRaw() });
  await check('DRAFT: intent=save → yalnızca save_site_content_draft; token birebir; ?ok=saved', async () => {
    const h = harness();
    const r = await save('hero', h, { ...heroForm(), intent: 'save' });
    assert.equal(names(h.calls), 'save_site_content_draft');
    assert.equal(h.calls[0].args.p_key, 'hero');
    assert.equal(h.calls[0].args.p_expected_draft_updated_at, TOKEN);
    assert.deepStrictEqual(h.calls[0].args.p_data, docs.hero);
    assert.equal(r.redirect, '/admin/site/hero?ok=saved');
  });
  await check('DRAFT: ilk kayıtta (token boş) p_expected = null', async () => {
    const h = harness();
    await outcome(() => createSiteOps(h.deps).save({ status: 'idle' }, formData({ key: 'hero', intent: 'save', expected_draft_updated_at: '', ...heroForm() })));
    assert.equal(h.calls[0].args.p_expected_draft_updated_at, null);
  });
  await check('PUBLISH + onay → save sonra publish_site_content_draft; yayın token\'ı KAYDETMENİN döndürdüğü token', async () => {
    const h = harness({ saveToken: '2026-10-06T11:11:11.654321+00:00' });
    const r = await save('hero', h, { ...heroForm(), intent: 'publish', confirm_publish: 'on' });
    assert.equal(names(h.calls), 'save_site_content_draft,publish_site_content_draft');
    assert.deepEqual(h.calls[1].args, { p_key: 'hero', p_expected_draft_updated_at: '2026-10-06T11:11:11.654321+00:00' });
    assert.equal(r.redirect, '/admin/site/hero?ok=published');
  });
  await check('PUBLISH onaysız → fail-closed (RPC yok)', async () => {
    const h = harness();
    const r = await save('hero', h, { ...heroForm(), intent: 'publish' });
    assert.equal(h.calls.length, 0);
    assert.ok((r.state as St).fieldErrors?.confirm_publish);
  });
  await check('EKSİK intent (+ onay) → fail-closed, SESSİZ KAYIT YOK', async () => {
    const h = harness();
    const r = await save('hero', h, { ...heroForm(), confirm_publish: 'on' });
    assert.equal(h.calls.length, 0);
    assert.equal(r.redirect, null);
    assert.equal((r.state as St).message, INTENT_ERROR_MESSAGE);
  });
  await check('GEÇERSİZ intent → fail-closed', async () => {
    for (const bad of ['', 'PUBLISH', 'publish ', 'unpublish', 'delete', 'save,publish']) {
      const h = harness();
      const r = await save('hero', h, { ...heroForm(), intent: bad, confirm_publish: 'on' });
      assert.equal(h.calls.length, 0, JSON.stringify(bad));
      assert.equal((r.state as St).message, INTENT_ERROR_MESSAGE);
    }
  });
  await check('geçersiz form → RPC yok; girdi korunur; alan hatası görünür', async () => {
    const h = harness();
    const r = await save('hero', h, { ...heroForm(), first: '', intent: 'save' });
    assert.equal(h.calls.length, 0);
    assert.ok((r.state as St).fieldErrors?.first);
    assert.equal((r.state as St).values?.last, docs.hero && (docs.hero as { last: string }).last);
  });
  await check('JSON anahtarı: geçersiz JSON → RPC YOK, Türkçe hata, ham hata yok', async () => {
    const h = harness();
    const r = await save('social', h, { json: '{"links": [', intent: 'save' });
    assert.equal(h.calls.length, 0);
    assert.match((r.state as St).fieldErrors?.json ?? '', /Geçersiz JSON/);
    assert.equal((r.state as St).values?.json, '{"links": [');
  });
  await check('JSON anahtarı: geçerli JSON kaydedilir ve YAYINLANIR', async () => {
    const h = harness();
    const r = await save('lab_page', h, { json: JSON.stringify(docs.lab_page), intent: 'publish', confirm_publish: 'on' });
    assert.equal(names(h.calls), 'save_site_content_draft,publish_site_content_draft');
    assert.equal(r.redirect, '/admin/site/lab_page?ok=published');
  });
  await check('bilinmeyen anahtar → not_found, RPC yok (sunucu allowlist)', async () => {
    for (const bad of ['', 'nope', '../x', 'HERO', 'hero ']) {
      const h = harness();
      const r = await save(bad, h, { ...heroForm(), intent: 'save' });
      assert.equal(h.calls.length, 0, JSON.stringify(bad));
      assert.equal((r.state as St).message, DB_ERROR_MESSAGES.not_found);
    }
  });
  await check('sahte alanlar (role/isAdmin/user_id/published) RPC verisine GİRMEZ', async () => {
    const h = harness();
    await save('hero', h, { ...heroForm(), intent: 'save', role: 'admin', isAdmin: 'true', user_id: 'evil', published: 'true' });
    assert.doesNotMatch(JSON.stringify(h.calls), /isAdmin|"role"|evil|"published"/);
  });
  await check('admin DEĞİL → hiçbir RPC yok (save/publish/intent yok/discard)', async () => {
    for (const intent of ['save', 'publish', undefined]) {
      const h = harness({ admin: false });
      const r = await save('hero', h, { ...heroForm(), ...(intent ? { intent } : {}), confirm_publish: 'on' });
      assert.equal(h.calls.length, 0);
      assert.ok(h.guardCalls() >= 1);
      assert.equal((r.state as St).message, DB_ERROR_MESSAGES.forbidden);
    }
    const h = harness({ admin: false });
    const r = await outcome(() => createSiteOps(h.deps).discard(formData({ key: 'hero', confirm_discard: 'on' })));
    assert.equal(h.calls.length, 0);
    assert.equal(r.redirect, '/admin/site?err=forbidden');
  });
  await check('STALE: kaydet stale → Türkçe mesaj; yayın stale → ?err=published_stale; ham hata sızmaz', async () => {
    let h = harness({ rpcError: { save_site_content_draft: 'stale' } });
    let r = await save('hero', h, { ...heroForm(), intent: 'save' });
    assert.equal((r.state as St).message, DB_ERROR_MESSAGES.stale);
    assert.equal(names(h.calls), 'save_site_content_draft');
    h = harness({ rpcError: { publish_site_content_draft: 'stale' } });
    r = await save('hero', h, { ...heroForm(), intent: 'publish', confirm_publish: 'on' });
    assert.equal(r.redirect, '/admin/site/hero?err=published_stale');
    h = harness({ rpcError: { save_site_content_draft: 'unknown' } });
    r = await save('hero', h, { ...heroForm(), intent: 'save' });
    assert.equal((r.state as St).message, DB_ERROR_MESSAGES.unknown);
  });
  await check('geçersiz token biçimi → reddedilir (RPC yok)', async () => {
    const h = harness();
    const r = await outcome(() => createSiteOps(h.deps).save({ status: 'idle' }, formData({ key: 'hero', intent: 'save', expected_draft_updated_at: '<script>', ...heroForm() })));
    assert.equal(h.calls.length, 0);
    assert.equal((r.state as St).message, DB_ERROR_MESSAGES.unknown);
  });
  await check('DISCARD: onay şart; discard_site_content_draft; silme RPC\'si yok; unpublish YOK', async () => {
    let h = harness();
    let r = await outcome(() => createSiteOps(h.deps).discard(formData({ key: 'hero' })));
    assert.equal(h.calls.length, 0);
    assert.equal(r.redirect, '/admin/site/hero?err=confirm');
    h = harness();
    r = await outcome(() => createSiteOps(h.deps).discard(formData({ key: 'hero', confirm_discard: 'on' })));
    assert.equal(names(h.calls), 'discard_site_content_draft');
    assert.deepEqual(h.calls[0].args, { p_key: 'hero' });
    assert.equal(r.redirect, '/admin/site/hero?ok=discarded');
    h = harness({ rpcError: { discard_site_content_draft: 'invalid_state' } });
    r = await outcome(() => createSiteOps(h.deps).discard(formData({ key: 'hero', confirm_discard: 'on' })));
    assert.equal(r.redirect, '/admin/site/hero?err=invalid_state');
    assert.equal('unpublish' in createSiteOps(harness().deps), false);
    h = harness();
    r = await outcome(() => createSiteOps(h.deps).discard(formData({ key: 'zzz', confirm_discard: 'on' })));
    assert.equal(h.calls.length, 0);
    assert.equal(r.redirect, '/admin/site?err=not_found');
  });

  /* ───── yaşam döngüsü + bekleyen değişiklik + form yeniden bağlama ───── */
  await check('canonicalJson/sameDoc: anahtar sırasından bağımsız, değerde farkı yakalar', () => {
    assert.ok(sameDoc({ a: 1, b: { c: [1, 2], d: 'x' } }, { b: { d: 'x', c: [1, 2] }, a: 1 }));
    assert.ok(!sameDoc({ a: 1 }, { a: 2 }));
    assert.ok(!sameDoc({ l: ['a', 'b'] }, { l: ['b', 'a'] }));
    assert.equal(canonicalJson(null), 'null');
  });
  await check('yaşam döngüsü durumları: BOŞ / DRAFT / PUBLISHED / PUBLISHED · BEKLEYEN DEĞİŞİKLİK', () => {
    const d = (hasPublished: boolean, hasDraft: boolean, eq: boolean) => describeSiteLifecycle({ hasPublished, hasDraft, draftEqualsPublished: eq });
    assert.deepEqual([d(false, false, false).key, d(false, false, false).label], ['empty', 'BOŞ']);
    assert.deepEqual([d(false, true, false).key, d(false, true, false).label], ['draft-new', 'DRAFT']);
    assert.deepEqual([d(true, false, false).key, d(true, false, false).label], ['published', 'PUBLISHED']);
    assert.deepEqual([d(true, true, true).key, d(true, true, true).label], ['published', 'PUBLISHED']);
    const p = d(true, true, false);
    assert.deepEqual([p.key, p.label, p.pending, p.canDiscard, p.canPublish], ['published-pending', 'PUBLISHED · BEKLEYEN DEĞİŞİKLİK', true, true, true]);
    assert.equal(d(true, true, true).canPublish, false);
    assert.equal(d(true, true, true).canDiscard, false);
    assert.equal(d(false, true, false).canDiscard, false);
    for (const v of [d(false, false, false), d(false, true, false), d(true, false, false), p]) assert.equal(v.canUnpublish, false);
  });
  await check('DISCARD davranışı: bekleyen → discard sonrası PUBLISHED; formun değerleri yayındakiyle BİREBİR (taslak değeri kalmaz)', () => {
    const pubDoc = docs.hero;
    const draftDoc = { ...(docs.hero as object), roles: 'TASLAK ROLLER' };
    const before = describeSiteLifecycle({ hasPublished: true, hasDraft: true, draftEqualsPublished: sameDoc(draftDoc, pubDoc) });
    assert.equal(before.key, 'published-pending');
    // discard sonrası sunucu durumu: taslak satırı yok → editör yayındaki belgeyi gösterir
    const after = describeSiteLifecycle({ hasPublished: true, hasDraft: false, draftEqualsPublished: false });
    assert.equal(after.key, 'published');
    assert.deepStrictEqual(siteDocToFormValues('hero', pubDoc), siteDocToFormValues('hero', docs.hero));
    assert.notEqual(siteDocToFormValues('hero', draftDoc).roles, siteDocToFormValues('hero', pubDoc).roles);
  });
  await check('FORM YENİDEN BAĞLAMA: kaydet / at / yayınla sonrası anahtar DEĞİŞİR (Ctrl+F5 gerekmez)', () => {
    const T = (n: number) => `2026-10-06T10:00:0${n}.123456+00:00`;
    const key = (hasPublished: boolean, pubAt: string, draftAt: string, eq: boolean) =>
      editorFormKey({ id: 'hero', liveUpdatedAt: pubAt, draftUpdatedAt: draftAt, lifecycleKey: describeSiteLifecycle({ hasPublished, hasDraft: draftAt !== '', draftEqualsPublished: eq }).key });
    const published = key(true, T(1), '', false);
    const pending1 = key(true, T(1), T(2), false);
    const pending2 = key(true, T(1), T(3), false);
    const discarded = key(true, T(1), '', false);
    const afterPublish = key(true, T(5), T(4), true); // yayın sonrası taslak satırı yayına eşit kalır
    const neverPublished = key(false, '', T(6), false);
    assert.notEqual(published, pending1);
    assert.notEqual(pending1, pending2);
    assert.notEqual(pending2, discarded);
    assert.equal(discarded, published);
    assert.notEqual(pending2, afterPublish);
    assert.notEqual(afterPublish, published);
    assert.notEqual(neverPublished, published);
  });
  await check('doğrulama hatasında anahtar DEĞİŞMEZ (kullanıcının yazdığı korunur): anahtar form değerlerinden bağımsız', () => {
    assert.equal(editorFormKey.length, 1);
    const a = editorFormKey({ id: 'hero', liveUpdatedAt: TOKEN, draftUpdatedAt: '', lifecycleKey: 'published' });
    assert.equal(a, editorFormKey({ id: 'hero', liveUpdatedAt: TOKEN, draftUpdatedAt: '', lifecycleKey: 'published' }));
  });
  await check('BOŞ içerik iskeleti: dosya tabanlı içerikle SESSİZCE birleşmez (null → boş form / boş JSON iskeleti)', () => {
    assert.equal(siteDocToFormValues('hero', null).first, '');
    assert.equal(siteDocToFormValues('currently', null).label_1, '');
    assert.deepEqual(JSON.parse(siteDocToFormValues('social', null).json), { links: [] });
    assert.equal(validateSiteInput('hero', siteDocToFormValues('hero', null)).ok, false);
  });

  finish('SITE CONTENT REGRESYON TESTİ GEÇTİ');
})();
