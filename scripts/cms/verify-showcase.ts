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
import { validateCaseStudy, validateCaseStudyIsolatingShowcase } from '@/lib/cms/validate/case-study';
import { buildProjectPreview } from '@/lib/cms/preview/project';
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
  /* ── URL kuralı: açık HTTPS politikası ── */
  await check('S1 geçerli: herkese açık https alan adları (www.yakala.com.tr, muratsisman.com.tr ve alt alan adları, sorgu/fragment)', () => {
    for (const u of [
      QMS, 'https://quality.muratsisman.com.tr', 'https://migration.muratsisman.com.tr/', 'https://muratsisman.com.tr/x?a=1#b', 'https://a.b.muratsisman.com.tr/p', 'https://QUALITY.MuratSisman.com.TR/',
      'https://www.yakala.com.tr/', 'https://yakala.com.tr', 'https://example.org/', 'https://demo.some-project.dev/yol/?x=1&y=2#bolum', 'https://yakala.com.tr:443/',
    ]) { const r = checkShowcaseUrl(u); assert.ok(r.ok, u); }
    const r = checkShowcaseUrl('https://Quality.muratsisman.com.tr'); assert.ok(r.ok && r.url === QMS);
  });
  await check('S2 reddedilir: http/javascript:/data:/ftp:, userinfo, port, localhost, IP (v4 sayısal biçimler ve IPv6), iç ağ adları, punycode, noktalı, boşluk, uzun', () => {
    const bad = [
      '', ' ', 'http://www.yakala.com.tr/', 'http://quality.muratsisman.com.tr/', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'ftp://www.yakala.com.tr/', 'file:///etc/passwd', '//www.yakala.com.tr', '/relative', 'www.yakala.com.tr',
      'https://user@www.yakala.com.tr/', 'https://user:pw@www.yakala.com.tr/', 'https://www.yakala.com.tr:8443/', 'https://www.yakala.com.tr:80/',
      'https://localhost/', 'https://localhost:3000/', 'https://foo.localhost/', 'https://127.0.0.1/', 'https://2130706433/', 'https://0x7f.1/', 'https://0177.0.0.1/', 'https://1.2.3/', 'https://10.0.0.1/', 'https://192.168.1.1/', 'https://169.254.169.254/', 'https://[::1]/', 'https://[2001:db8::1]/',
      'https://intranet/', 'https://printer.local/', 'https://app.internal/', 'https://x.intranet/', 'https://nas.lan/', 'https://router.home/', 'https://svc.corp/', 'https://a.test/', 'https://a.example/', 'https://a.invalid/', 'https://1.0.0.127.in-addr.arpa/', 'https://abc.onion/',
      'https://www.yakala.com.tr./', 'https://xn--ykala-4ve.com.tr/', 'https://y\u0430kala.com.tr/', 'https://q\u00fcality.muratsisman.com.tr/', 'https://-a.yakala.com.tr/', 'https://a..yakala.com.tr/', 'https://yakala_x.com.tr/',
      'https://www.yakala.com.tr/a b', ' https://www.yakala.com.tr/', 'https://www.yakala.com.tr/\u0000', 'https://evil.com\\@www.yakala.com.tr/', 'https://', 'https:///www.yakala.com.tr', 'https://intranetsrv/', 'https://foo/',
      'https://www.yakala.com.tr/' + 'a'.repeat(300),
    ];
    for (const u of bad) assert.equal(checkShowcaseUrl(u).ok, false, JSON.stringify(u));
  });
  await check('S2b GERİYE UYUMLULUK: eski kuralın (yalnız muratsisman.com.tr) kabul ettiği her adres, AYNI sonuçla kabul edilmeye devam eder', () => {
    const oldRule = (input: string): string | null => {
      if (!input || input.length > 300 || /[\s\u0000-\u001F\u007F\\]/.test(input)) return null;
      let u: URL; try { u = new URL(input); } catch { return null; }
      if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
      const h = u.hostname;
      if (!(h === 'muratsisman.com.tr' || h.endsWith('.muratsisman.com.tr'))) return null;
      return h.split('.').every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l) && !l.startsWith('xn--')) ? u.href : null;
    };
    const samples = [QMS, 'https://quality.muratsisman.com.tr', 'https://migration.muratsisman.com.tr/', 'https://muratsisman.com.tr', 'https://muratsisman.com.tr/x?a=1#b', 'https://a.b.muratsisman.com.tr/p/', 'https://QUALITY.MuratSisman.com.TR/', 'https://x.muratsisman.com.tr:443/', 'http://x.muratsisman.com.tr/', 'https://evilmuratsisman.com.tr/', 'https://muratsisman.com.tr.evil.com/', 'https://xn--a.muratsisman.com.tr/', 'https://u@x.muratsisman.com.tr/'];
    let accepted = 0;
    for (const s of samples) {
      const old = oldRule(s); const now = checkShowcaseUrl(s);
      if (old !== null) { accepted += 1; assert.ok(now.ok && now.url === old, s); }
    }
    assert.ok(accepted >= 7);
  });
  await check('S2c NORMALİZASYON: kök adreste sondaki / EKLENİR (kaldırılmaz); alt yol/sorgu/fragment korunur; :443 silinir; idempotent', () => {
    const n = (u: string) => { const r = checkShowcaseUrl(u); assert.ok(r.ok, u); return r.url; };
    assert.equal(n('https://www.yakala.com.tr'), 'https://www.yakala.com.tr/');
    assert.equal(n('https://www.yakala.com.tr/a/'), 'https://www.yakala.com.tr/a/');
    assert.equal(n('https://www.yakala.com.tr/a'), 'https://www.yakala.com.tr/a');
    assert.equal(n('https://WWW.Yakala.com.tr:443/x?q=1#f'), 'https://www.yakala.com.tr/x?q=1#f');
    for (const u of ['https://www.yakala.com.tr', QMS, 'https://a.dev/p/?x=1#y']) assert.equal(n(n(u)), n(u));
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
  await check('S5 public okuma: yayınlanmış satırda geçerli showcase görünür; geçersiz URL olsa da proje görünür kalır, bağlantı yok; showcase olmayan aynı', () => {
    const row = (cs: unknown) => ({ ...projectToInsert(real, 0, 'published'), published_at: '2026-01-01T00:00:00Z', case_study: cs });
    assert.equal(projectFromRow(row({ ...baseCs(), showcase: { url: QMS } }))?.caseStudy?.showcase?.url, QMS);
    const bad = projectFromRow(row({ ...baseCs(), showcase: { url: 'http://www.yakala.com.tr/' } })); // geçersiz URL projeyi GİZLEMEZ (bkz. S18)
    assert.ok(bad);
    assert.equal(bad.caseStudy?.showcase, undefined);
    assert.equal(projectFromRow(row({ ...baseCs(), showcase: { url: 'https://www.yakala.com.tr/' } }))?.caseStudy?.showcase?.url, 'https://www.yakala.com.tr/');
    assert.deepEqual(projectFromRow(row(baseCs()))?.caseStudy, real.caseStudy);
  });

  /* ── Hata izolasyonu: geçersiz showcase.url projeyi gizlemez ── */
  const BAD_SHOWCASES: unknown[] = [
    { url: 'http://www.yakala.com.tr/' }, { url: 'javascript:alert(1)' }, { url: 'https://user:pw@example.org/' }, { url: 'https://localhost/' },
    { url: 'https://127.0.0.1/' }, { url: 'https://' + 'a'.repeat(300) + '.com/' }, { url: 1 }, {}, { url: QMS, label: 'x' }, 'str', null, [],
  ];
  const pubRow = (cs: unknown) => ({ ...projectToInsert(real, 0, 'published'), published_at: '2026-01-01T00:00:00Z', case_study: cs });
  await check('S18 public: her geçersiz showcase türünde proje döner, showcase yok, diğer tüm alanlar geçerli satırla birebir aynı', () => {
    const clean = projectFromRow(pubRow(baseCs()));
    assert.ok(clean);
    for (const s of BAD_SHOWCASES) {
      const p = projectFromRow(pubRow({ ...baseCs(), showcase: s }));
      assert.ok(p, JSON.stringify(s));
      assert.equal(p.caseStudy?.showcase, undefined, JSON.stringify(s));
      assert.deepEqual(p, clean, JSON.stringify(s));
    }
  });
  await check('S19 maskeleme yok: showcase geçersiz + başka alan geçersiz → hâlâ null / ok:false (hata başka alanı da söyler)', () => {
    const cs = { ...baseCs(), showcase: { url: 'http://x.com/' }, tags: 'bozuk' };
    assert.equal(projectFromRow(pubRow(cs)), null);
    const r = validateCaseStudyIsolatingShowcase(cs);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.error.includes('tags'));
    assert.equal(projectFromRow(pubRow({ ...baseCs(), sections: 'bozuk', showcase: { url: QMS } })), null); // geçerli showcase başka hatayı kurtarmaz
    assert.equal(validateCaseStudyIsolatingShowcase(null).ok, false);
    assert.equal(validateCaseStudyIsolatingShowcase([]).ok, false);
  });
  await check('S20 geçerli girdi aynen: izolasyonlu doğrulama = sıkı doğrulama; showcaseError yok; girdi nesnesi DEĞİŞMEZ', () => {
    for (const cs of [baseCs(), { ...baseCs(), showcase: { url: QMS } }, { ...baseCs(), showcase: { url: 'https://www.yakala.com.tr/' } }]) {
      const strict = validateCaseStudy(cs);
      const iso = validateCaseStudyIsolatingShowcase(cs);
      assert.deepEqual(iso, strict);
      assert.equal('showcaseError' in iso, false);
    }
    for (const s of BAD_SHOWCASES) {
      const input = { ...baseCs(), showcase: s };
      const before = JSON.stringify(input);
      const r = validateCaseStudyIsolatingShowcase(input);
      assert.equal(JSON.stringify(input), before, 'girdi değişti');
      assert.ok(r.ok && typeof r.showcaseError === 'string' && r.showcaseError.includes('showcase'));
      assert.equal(validateCaseStudy(input).ok, false); // sıkı doğrulama (kaydetme/yayınlama yolu) hâlâ reddeder
    }
  });
  await check('S21 önizleme: geçersiz URL → proje çizilebilir (case-study) + anlaşılır uyarı; başka hata → unrenderable; geçerli URL → uyarı yok', () => {
    const doc = (cs: unknown): ProjectDoc => ({ ...emptyProjectDoc(), title: 'Test', slug: 'test', summary: 'özet', kind: 'personal', type_label: 'T', category: 'C', case_study: cs as ProjectDoc['case_study'] });
    const m = buildProjectPreview(doc({ ...baseCs(), showcase: { url: 'http://www.yakala.com.tr/' } }));
    assert.equal(m.kind, 'case-study');
    assert.equal(m.kind === 'case-study' ? m.project.caseStudy.showcase : 'x', undefined);
    assert.ok(m.warnings.some((w) => w.includes('Showcase bağlantısı geçersiz')));
    assert.equal(buildProjectPreview(doc({ ...baseCs(), showcase: { url: 'http://x.com/' }, tags: 'bozuk' })).kind, 'unrenderable');
    const ok = buildProjectPreview(doc({ ...baseCs(), showcase: { url: QMS } }));
    assert.equal(ok.kind, 'case-study');
    assert.equal(ok.kind === 'case-study' ? ok.project.caseStudy.showcase?.url : '', QMS);
    assert.ok(!ok.warnings.some((w) => w.includes('Showcase bağlantısı geçersiz')));
  });
  await check('S22 kaydetme/yayınlama SIKI kalır: geçersiz showcase.url içeren JSON her iki modda reddedilir; yayın yolu izolasyonlu yardımcıyı kullanmaz', () => {
    for (const mode of ['draft', 'publish'] as const) {
      for (const s of [{ url: 'http://www.yakala.com.tr/' }, { url: 'https://localhost/' }]) {
        const r = validateProjectInput(rawFor({}, { case_study: { ...baseCs(), showcase: s } }), mode);
        assert.equal(r.ok, false, mode);
      }
    }
    const src = (f: string) => readFileSync(f, 'utf8');
    for (const f of ['src/lib/cms/validate/projects.ts', 'src/lib/cms/validate/showcase.ts', 'src/lib/cms/admin/project-form.ts']) {
      assert.equal(/validateCaseStudyIsolatingShowcase/.test(src(f)), false, f);
    }
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
  await check('S6b form: https://www.yakala.com.tr/ kaydedilir (taslak ve yayın modu), JSON korunur; sabit alan adı izni gerekmez', () => {
    for (const mode of ['draft', 'publish'] as const) {
      const cs = okCs(rawFor({ showcase_url: 'https://www.yakala.com.tr/' }), mode);
      assert.equal(cs?.showcase?.url, 'https://www.yakala.com.tr/');
      assert.deepEqual(stableWithout(cs), stableWithout(real.caseStudy));
    }
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
    assert.ok(err(rawFor({ showcase_url: 'https://localhost/' })).showcase_url);
    assert.ok(err(rawFor({ showcase_url: 'https://127.0.0.1/' })).showcase_url);
    assert.ok(err(rawFor({ showcase_url: 'javascript:alert(1)' })).showcase_url);
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
