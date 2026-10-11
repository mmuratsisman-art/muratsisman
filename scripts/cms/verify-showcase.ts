/**
 * Showcase / Demo URL (`case_study.showcase.url`) testleri. Next, Supabase ve veritabanı GEREKMEZ.
 * Çalıştırma: TSX_TSCONFIG_PATH=$PWD/tsconfig.json npx tsx scripts/cms/verify-showcase.ts
 * Doğrulanmayanlar: gerçek render/tarayıcı görünümü, `next build`, lint, gerçek Supabase (bkz. docs/cms/PUBLIC-CONTENT.md).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projects } from '@/data/projects';
import { projectToInsert } from '@/lib/cms/mappers';
import { emptyProjectDoc, PROJECT_FIELDS, projectDocToFormValues, coerceProjectDoc } from '@/lib/cms/admin/project-form';
import { validateCaseStudy } from '@/lib/cms/validate/case-study';
import { validateProjectInput, type ProjectDoc, type ProjectRaw } from '@/lib/cms/validate/projects';
import { checkShowcaseUrl, mergeShowcaseField, showcaseUrlOf } from '@/lib/cms/validate/showcase';
import { projectFromRow } from '@/lib/content/rows-map';
import { runner } from './test-harness';

const { check, finish } = runner();
const real = projects.find((p) => !p.comingSoon && p.caseStudy)!;
const baseCs = () => JSON.parse(JSON.stringify(real.caseStudy));
const QMS = 'https://quality.muratsisman.com.tr/';

const rawFor = (over: Record<string, string | undefined> = {}, doc?: Partial<ProjectDoc>): ProjectRaw => {
  const d: ProjectDoc = { ...emptyProjectDoc(), title: 'Test', slug: 'test', summary: 'özet', kind: 'personal', type_label: 'T', category: 'C', case_study: baseCs(), ...doc };
  return { ...projectDocToFormValues(d), ...over };
};
const okCs = (raw: ProjectRaw, mode: 'draft' | 'publish' = 'draft') => {
  const r = validateProjectInput(raw, mode);
  assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.errors));
  return r.value.case_study;
};
const stableWithout = (cs: unknown) => { const o = JSON.parse(JSON.stringify(cs)); delete o.showcase; return o; };

async function main() {
  /* ── URL kuralı ── */
  await check('S1 geçerli: https + muratsisman.com.tr ve gerçek alt alan adları', () => {
    for (const u of [QMS, 'https://quality.muratsisman.com.tr', 'https://muratsisman.com.tr/x?a=1#b', 'https://a.b.muratsisman.com.tr/p', 'https://QUALITY.MuratSisman.com.TR/']) {
      const r = checkShowcaseUrl(u); assert.ok(r.ok, u);
    }
    const r = checkShowcaseUrl('https://Quality.muratsisman.com.tr'); assert.ok(r.ok && r.url === QMS);
  });
  await check('S2 reddedilir: http, javascript:, data:, benzer alan adları, kullanıcı/parola, port, IP, boşluk, punycode, uzun', () => {
    const bad = [
      '', ' ', 'http://quality.muratsisman.com.tr/', 'javascript:alert(1)', 'data:text/html,x', 'ftp://quality.muratsisman.com.tr/', '//quality.muratsisman.com.tr', '/relative', 'quality.muratsisman.com.tr',
      'https://evilmuratsisman.com.tr/', 'https://muratsisman.com.tr.evil.com/', 'https://muratsisman.com/', 'https://example.com/', 'https://muratsisman.com.tr.',
      'https://user@quality.muratsisman.com.tr/', 'https://user:pw@quality.muratsisman.com.tr/', 'https://quality.muratsisman.com.tr:8443/', 'https://127.0.0.1/',
      'https://quality.muratsisman.com.tr/a b', ' https://quality.muratsisman.com.tr/', 'https://quality.muratsisman.com.tr/\u0000', 'https://evil.com\\@quality.muratsisman.com.tr/',
      'https://xn--quality-x.muratsisman.com.tr/', 'https://qüality.muratsisman.com.tr/', 'https://-a.muratsisman.com.tr/', 'https://a..muratsisman.com.tr/',
      'https://quality.muratsisman.com.tr/' + 'a'.repeat(300),
    ];
    for (const u of bad) assert.equal(checkShowcaseUrl(u).ok, false, JSON.stringify(u));
  });

  /* ── validateCaseStudy ── */
  await check('S3 showcase olmayan case study: çıktı DEĞİŞMEZ (gerçek 3 proje); showcase anahtarı eklenmez', () => {
    for (const p of projects.filter((x) => x.caseStudy)) {
      const v = validateCaseStudy(p.caseStudy); assert.ok(v.ok);
      assert.deepEqual(v.value, p.caseStudy); assert.ok(!('showcase' in v.value));
    }
  });
  await check('S4 showcase geçerli → korunur ve normalize; geçersiz/bilinmeyen alan → hata', () => {
    const v = validateCaseStudy({ ...baseCs(), showcase: { url: 'https://Quality.muratsisman.com.tr' } });
    assert.ok(v.ok && v.value.showcase?.url === QMS);
    for (const s of [{ url: 'http://quality.muratsisman.com.tr/' }, { url: 1 }, {}, { url: QMS, label: 'x' }, 'str', null, []]) {
      assert.equal(validateCaseStudy({ ...baseCs(), showcase: s }).ok, false, JSON.stringify(s));
    }
  });
  await check('S5 public okuma: yayınlanmış satırda geçerli showcase görünür; geçersiz URL satırı ATLANIR (null); showcase olmayan aynı', () => {
    const row = (cs: unknown) => ({ ...projectToInsert(real, 0, 'published'), published_at: '2026-01-01T00:00:00Z', case_study: cs });
    assert.equal(projectFromRow(row({ ...baseCs(), showcase: { url: QMS } }))?.caseStudy?.showcase?.url, QMS);
    assert.equal(projectFromRow(row({ ...baseCs(), showcase: { url: 'https://evil.example/' } })), null);
    assert.deepEqual(projectFromRow(row(baseCs()))?.caseStudy, real.caseStudy);
  });

  /* ── Form alanı ↔ JSON birleştirmesi ── */
  await check('S6 EKLE: boş projeye URL yazılır; diğer JSON birebir korunur; form değeri geri okunur', () => {
    const cs = okCs(rawFor({ showcase_url: QMS }));
    assert.equal(cs?.showcase?.url, QMS);
    assert.deepEqual(stableWithout(cs), stableWithout(real.caseStudy));
    const doc = { ...emptyProjectDoc(), case_study: cs };
    assert.equal(projectDocToFormValues(doc).showcase_url, QMS);
    assert.equal(projectDocToFormValues(doc).showcase_url_initial, QMS);
  });
  await check('S7 DEĞİŞTİR: mevcut bağlantı yeni değerle değişir; JSON korunur', () => {
    const doc = { case_study: { ...baseCs(), showcase: { url: QMS } } };
    const cs = okCs(rawFor({ showcase_url: 'https://demo.muratsisman.com.tr/' }, doc));
    assert.equal(cs?.showcase?.url, 'https://demo.muratsisman.com.tr/');
    assert.deepEqual(stableWithout(cs), stableWithout(real.caseStudy));
  });
  await check('S8 SİL: kullanıcı kutuyu boşaltırsa showcase AÇIKÇA kaldırılır; diğer JSON korunur', () => {
    const doc = { case_study: { ...baseCs(), showcase: { url: QMS } } };
    const cs = okCs(rawFor({ showcase_url: '' }, doc));
    assert.ok(cs && !('showcase' in cs));
    assert.deepEqual(cs, real.caseStudy);
  });
  await check('S9 YANLIŞLIKLA SİLME YOK: alan değişmediyse (boş/dolu) JSON\'daki showcase korunur; alanlar hiç gelmezse (eski sekme) de', () => {
    const doc = { case_study: { ...baseCs(), showcase: { url: QMS } } };
    assert.equal(okCs(rawFor({}, doc))?.showcase?.url, QMS); // alan = başlangıç
    assert.equal(okCs(rawFor({ showcase_url: '   ', showcase_url_initial: '   ' }, doc))?.showcase?.url, QMS); // boşluk=boş, değişmedi
    const old = rawFor({}, doc); delete old.showcase_url; delete old.showcase_url_initial; // alanları bilmeyen istemci
    assert.equal(okCs(old)?.showcase?.url, QMS);
    const oldNone = rawFor({}); delete oldNone.showcase_url; delete oldNone.showcase_url_initial;
    assert.ok(!('showcase' in (okCs(oldNone) ?? {})));
    // Başlangıç boş, JSON'a elle showcase yazılmış, alana dokunulmamış → JSON kazanır
    const handJson = rawFor({ case_study: JSON.stringify({ ...baseCs(), showcase: { url: QMS } }) });
    assert.equal(okCs(handJson)?.showcase?.url, QMS);
  });
  await check('S10 ÇELİŞKİ: alan da JSON\'daki showcase da (farklı) değiştirildiyse hata; aynı değerse sorun yok', () => {
    const doc = { case_study: { ...baseCs(), showcase: { url: QMS } } };
    const conflict = rawFor({ showcase_url: 'https://a.muratsisman.com.tr/', case_study: JSON.stringify({ ...baseCs(), showcase: { url: 'https://b.muratsisman.com.tr/' } }) }, doc);
    const r = validateProjectInput(conflict, 'draft'); assert.ok(!r.ok && r.errors.showcase_url);
    const same = rawFor({ showcase_url: 'https://a.muratsisman.com.tr/', case_study: JSON.stringify({ ...baseCs(), showcase: { url: 'https://a.muratsisman.com.tr/' } }) }, doc);
    assert.equal(okCs(same)?.showcase?.url, 'https://a.muratsisman.com.tr/');
  });
  await check('S11 alan hataları showcase_url altında: geçersiz URL, JSON yok iken ekleme, coming_soon; JSON bozuksa case_study hatası', () => {
    const err = (raw: ProjectRaw) => { const r = validateProjectInput(raw, 'draft'); assert.ok(!r.ok); return r.errors; };
    assert.ok(err(rawFor({ showcase_url: 'http://quality.muratsisman.com.tr/' })).showcase_url);
    assert.ok(err(rawFor({ showcase_url: 'https://example.com/' })).showcase_url);
    assert.ok(err(rawFor({ showcase_url: QMS, case_study: '' })).showcase_url);
    assert.ok(err(rawFor({ showcase_url: QMS, coming_soon: 'on' })).showcase_url);
    const e = err(rawFor({ showcase_url: QMS, case_study: '{bozuk' })); assert.ok(e.case_study && !e.showcase_url);
    assert.equal(validateProjectInput(rawFor({ showcase_url: '', case_study: '' }), 'draft').ok, true); // boş+boş: sorun yok
  });
  await check('S12 yayın modu da çalışır; showcase isteğe bağlı (olmayan proje yayınlanabilir)', () => {
    assert.equal(okCs(rawFor({ showcase_url: QMS }), 'publish')?.showcase?.url, QMS);
    assert.ok(okCs(rawFor({}), 'publish'));
  });
  await check('S13 form alan listesi: iki yeni alan var ve projectDocToFormValues tüm alanları üretir; DB/ProjectDoc şekli DEĞİŞMEDİ', () => {
    assert.ok(PROJECT_FIELDS.includes('showcase_url') && PROJECT_FIELDS.includes('showcase_url_initial'));
    assert.deepEqual(Object.keys(projectDocToFormValues(emptyProjectDoc())).sort(), [...PROJECT_FIELDS].sort());
    assert.ok(!('showcase_url' in emptyProjectDoc()));
    const doc = coerceProjectDoc({ case_study: { ...baseCs(), showcase: { url: QMS } } }, emptyProjectDoc());
    assert.equal(showcaseUrlOf(doc.case_study), QMS);
    assert.equal(showcaseUrlOf(null), ''); assert.equal(showcaseUrlOf({ showcase: 'x' }), ''); assert.equal(showcaseUrlOf({ showcase: { url: 5 } }), '');
  });
  await check('S14 mergeShowcaseField: bozuk JSON/dizi dokunulmadan döner (asıl hata case_study doğrulamasında)', () => {
    assert.deepEqual(mergeShowcaseField('{bozuk', QMS, '', false), { ok: true, caseText: '{bozuk' });
    assert.deepEqual(mergeShowcaseField('[1]', QMS, '', false), { ok: true, caseText: '[1]' });
    assert.deepEqual(mergeShowcaseField('x', undefined, '', false), { ok: true, caseText: 'x' });
  });

  /* ── Render sözleşmesi (kaynak taraması; gerçek render yerelde ayrıca doğrulanmalı) ── */
  await check('S15 public sayfa ve admin önizlemesi AYNI ShowcaseLink bileşenini, aynı yerde (tags\'ten sonra, NextProject\'ten önce) ve yalnızca showcase varsa kullanır', () => {
    const page = readFileSync('src/app/(site)/projects/[slug]/page.tsx', 'utf8');
    const prev = readFileSync('src/components/admin/preview/ProjectPreviewView.tsx', 'utf8');
    for (const src of [page, prev]) {
      assert.ok(src.includes("import ShowcaseLink from '@/components/project/ShowcaseLink';"));
      assert.ok(src.includes('{cs.showcase && <ShowcaseLink url={cs.showcase.url}'));
      assert.ok(src.indexOf('<TagList') < src.indexOf('<ShowcaseLink'));
    }
    assert.ok(page.indexOf('<ShowcaseLink') < page.indexOf('<NextProject'));
    assert.ok(!/ShowcaseLink/.test(readFileSync('src/components/admin/preview/ProjectPreviewView.tsx', 'utf8').split('ComingSoonPreview')[1] ?? ''), 'coming-soon önizlemede yok');
  });
  await check('S16 ShowcaseLink: sabit metinler, güvenli bağ öznitelikleri, URL yeniden denetlenir, sabit URL YOK', () => {
    const c = readFileSync('src/components/project/ShowcaseLink.tsx', 'utf8');
    for (const s of ['PROJECT SHOWCASE', 'EXPLORE THE INTERFACE', 'Explore a visual presentation of the project interface using representative, non-production content.', 'VIEW PROJECT SHOWCASE', 'target="_blank"', 'rel="noopener noreferrer"', 'checkShowcaseUrl(url)']) assert.ok(c.includes(s), s);
    assert.ok(c.includes('href={checked.url}') && !c.includes('href={url}'));
    assert.ok(!/quality\./.test(c) && !/quality\./.test(readFileSync('src/app/(site)/projects/[slug]/page.tsx', 'utf8')), 'QMS adresi koda gömülmez');
  });
  await check('S17 SEO ve veritabanı yüzeyi dokunulmadı: sitemap/robots/social aynı; migration dizini ve RPC dosyalarında showcase yok', () => {
    for (const f of ['src/app/sitemap.ts', 'src/app/robots.ts', 'src/lib/seo/crawl.ts', 'src/lib/seo/social.ts']) assert.ok(!/showcase/i.test(readFileSync(f, 'utf8')), f);
    assert.ok(readFileSync('src/app/(site)/projects/[slug]/page.tsx', 'utf8').includes('...socialMetadata({ title: project.seo.title, description: project.seo.description })'));
    for (const f of ['0001_cms_schema', '0005_faz3b_projects_site_content']) assert.ok(!/showcase/i.test(readFileSync(`supabase/migrations/${f}.sql`, 'utf8')));
  });
  finish('Tüm showcase kontrolleri geçti.');
}
main().catch((e) => { console.error(e); process.exit(1); });
