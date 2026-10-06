/**
 * FAZ 3B-A1 saf mantık testleri (veritabanı/Next gerektirmez):
 *   slug, not işaretlemesi gidiş-dönüşü, doğrulama, hata eşleme, yaşam döngüsü görünümü.
 *
 * Çalıştırma (isteğe bağlı araç; projeye bağımlılık eklemez):
 *   npx tsx scripts/cms/verify-3b-a1.ts
 */
import assert from 'node:assert/strict';
import { labEntries } from '@/data/lab';
import { notes } from '@/data/notes';
import type { NoteBlock } from '@/types';
import { classifyDbError, DB_ERROR_MESSAGES } from '@/lib/cms/db-errors';
import { describeLifecycle } from '@/lib/cms/admin/lifecycle';
import { parseNoteMarkup, serializeNoteBlocks } from '@/lib/cms/note-markup';
import { isSlug, slugify } from '@/lib/cms/slug';
import { validateLabInput, type LabRaw } from '@/lib/cms/validate/lab';
import { validateNoteInput, type NoteRaw } from '@/lib/cms/validate/notes';
import { estimateReadingMinutes } from '@/lib/format';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message.split('\n')[0]}`);
  }
}
const section = (t: string) => console.log(`\n── ${t}`);

// ───────────────────────────── SLUG
section('SLUG');
check('Türkçe karakterler', () => assert.equal(slugify('Çalışma Şekli: Ğüzel & İyi!'), 'calisma-sekli-guzel-iyi'));
check('büyük I / İ / Ş / Ö', () => assert.equal(slugify('IŞIK ÖĞRETMEN İSTANBUL'), 'isik-ogretmen-istanbul'));
check('apostrof silinir', () => assert.equal(slugify("Murat'ın  Notları"), 'muratin-notlari'));
check('whitespace + tekrarlı tire + kenar tireleri', () => assert.equal(slugify('  --Foo___Bar   baz--  '), 'foo-bar-baz'));
check('noktalama temizliği', () => assert.equal(slugify('Merhaba, dünya! (v2.0)'), 'merhaba-dunya-v2-0'));
check('yalnızca noktalama → boş', () => assert.equal(slugify('!!! ... ???'), ''));
check('boş girdi → boş', () => assert.equal(slugify(''), ''));
check('80 karakter sınırı', () => assert.equal(slugify('a'.repeat(120)).length, 80));
check('80. karakterde tire kalmaz', () => assert.ok(!slugify('x'.repeat(79) + ' y').endsWith('-')));
check('mevcut tüm slug\'lar idempotent', () => {
  for (const s of [...notes.map((n) => n.slug), ...labEntries.map((e) => e.slug)]) assert.equal(slugify(s), s);
});
check('mevcut başlıklardan geçerli slug üretilir', () => {
  for (const t of [...notes.map((n) => n.title), ...labEntries.map((e) => e.title)]) assert.ok(isSlug(slugify(t)), t);
});
check('deterministik', () => assert.equal(slugify('Aynı Başlık'), slugify('Aynı Başlık')));

// ───────────────────────────── NOT İŞARETLEMESİ
section('NOT İŞARETLEMESİ (NoteBlock[] ↔ metin)');
check('mevcut 3 not: blok → metin → blok birebir', () => {
  assert.equal(notes.length, 3);
  for (const n of notes) {
    const text = serializeNoteBlocks(n.content);
    const back = parseNoteMarkup(text);
    assert.deepEqual(back.issues, [], n.slug);
    assert.deepStrictEqual(back.blocks, n.content, n.slug);
  }
});
check('metin → blok → metin kararlı (idempotent)', () => {
  for (const n of notes) {
    const t1 = serializeNoteBlocks(n.content);
    assert.equal(serializeNoteBlocks(parseNoteMarkup(t1).blocks), t1);
  }
});
check('tüm blok türleri mevcut notlarda kullanılıyor', () => {
  const kinds = new Set(notes.flatMap((n) => n.content.map((b) => b.kind)));
  for (const k of ['p', 'h', 'quote', 'list']) assert.ok(kinds.has(k as NoteBlock['kind']), `${k} kapsanmıyor`);
});
check('sözdizimi', () => {
  const r = parseNoteMarkup('Paragraf bir\nhâlâ aynı paragraf\n\n## Başlık\n> Alıntı\n- bir\n- iki\n\nSon');
  assert.deepStrictEqual(r.blocks, [
    { kind: 'p', text: 'Paragraf bir hâlâ aynı paragraf' },
    { kind: 'h', text: 'Başlık' },
    { kind: 'quote', text: 'Alıntı' },
    { kind: 'list', items: ['bir', 'iki'] },
    { kind: 'p', text: 'Son' },
  ]);
});
check('kaçış: işaretle başlayan paragraf', () => {
  assert.deepStrictEqual(parseNoteMarkup('\\## başlık değil\n\n\\- madde değil\n\n\\> alıntı değil\n\n\\\\ ters bölü').blocks, [
    { kind: 'p', text: '## başlık değil' },
    { kind: 'p', text: '- madde değil' },
    { kind: 'p', text: '> alıntı değil' },
    { kind: 'p', text: '\\ ters bölü' },
  ]);
});
check('"-5" ve "###" ve ">=" paragraf kalır', () => {
  assert.deepStrictEqual(parseNoteMarkup('-5 derece\n\n### üç\n\n>=5').blocks, [
    { kind: 'p', text: '-5 derece' },
    { kind: 'p', text: '### üç' },
    { kind: 'p', text: '>=5' },
  ]);
});
check('CRLF', () => assert.deepStrictEqual(parseNoteMarkup('a\r\n\r\n## b\r\n').blocks, [{ kind: 'p', text: 'a' }, { kind: 'h', text: 'b' }]));
check('boş başlık / alıntı / madde hata verir', () => {
  assert.equal(parseNoteMarkup('##').issues.length, 1);
  assert.equal(parseNoteMarkup('## ').issues.length, 1);
  assert.equal(parseNoteMarkup('>').issues.length, 1);
  assert.equal(parseNoteMarkup('-').issues.length, 1);
  assert.equal(parseNoteMarkup('a\n\n- ').issues[0].line, 3);
});
check('fuzz: 3000 rastgele blok dizisi gidiş-dönüşte kayıpsız', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const tokens = ['##', '>', '-', '\\', 'a', 'bc', 'Çş', '5', '#', '>=', '- x', '\\## y', '"q"', 'x  y'];
  const text = () => {
    const n = 1 + Math.floor(rnd() * 4);
    return Array.from({ length: n }, () => tokens[Math.floor(rnd() * tokens.length)]).join(' ').trim();
  };
  for (let i = 0; i < 3000; i++) {
    const blocks: NoteBlock[] = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (): NoteBlock => {
      const k = Math.floor(rnd() * 4);
      if (k === 0) return { kind: 'h', text: text() };
      if (k === 1) return { kind: 'quote', text: text() };
      if (k === 2) return { kind: 'list', items: Array.from({ length: 1 + Math.floor(rnd() * 3) }, text) };
      return { kind: 'p', text: text() };
    });
    const out = parseNoteMarkup(serializeNoteBlocks(blocks));
    assert.deepEqual(out.issues, [], JSON.stringify(blocks));
    assert.deepStrictEqual(out.blocks, blocks, JSON.stringify(blocks));
  }
});
check('okuma süresi: mevcut notlar için hesaplanır (≥1)', () => {
  for (const n of notes) assert.ok(estimateReadingMinutes(n.content) >= 1);
  assert.equal(estimateReadingMinutes([{ kind: 'p', text: 'kelime '.repeat(450) }]), 3);
});

// ───────────────────────────── DOĞRULAMA: NOTLAR
section('DOĞRULAMA — Notes');
const noteBase: NoteRaw = { title: 'Başlık', slug: '', excerpt: 'Özet', body: 'Merhaba', tags: 'AI, Ideas', accent: 'blue', published_at: '', reading_time: '' };
const nv = (o: NoteRaw, mode: 'draft' | 'publish' = 'draft') => validateNoteInput({ ...noteBase, ...o }, mode);
const errOf = (r: ReturnType<typeof nv>) => (r.ok ? {} : r.errors);
check('geçerli taslak', () => {
  const r = nv({});
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.slug, 'baslik');
    assert.deepEqual(r.value.tags, ['AI', 'Ideas']);
    assert.equal(r.value.reading_time_minutes, null);
    assert.equal(r.value.published_at, null);
  }
});
check('başlık eksik', () => assert.ok('title' in errOf(nv({ title: '   ' }))));
check('başlık çok uzun', () => assert.ok('title' in errOf(nv({ title: 'x'.repeat(161) }))));
check('slug üretilemez (yalnızca noktalama)', () => assert.ok('slug' in errOf(nv({ title: '!!!', slug: '' }))));
check('slug normalize edilir', () => {
  const r = nv({ slug: ' Yeni  Çok Güzel Slug ' });
  assert.ok(r.ok && r.value.slug === 'yeni-cok-guzel-slug');
});
check('geçersiz tarih', () => {
  for (const d of ['2026-02-31', '31-01-2026', '2026/01/01', '1999-01-01', 'abc', '2026-13-01']) assert.ok('published_at' in errOf(nv({ published_at: d })), d);
});
check('geçerli tarih → UTC gece yarısı', () => {
  const r = nv({ published_at: '2026-10-06' });
  assert.ok(r.ok && r.value.published_at === '2026-10-06T00:00:00Z');
});
check('okuma süresi: geçersizler', () => {
  for (const v of ['0', '121', 'abc', '3.5', '-2', '1e3']) assert.ok('reading_time' in errOf(nv({ reading_time: v })), v);
});
check('okuma süresi: geçerli ve boş', () => {
  const a = nv({ reading_time: '7' });
  const b = nv({ reading_time: '' });
  assert.ok(a.ok && a.value.reading_time_minutes === 7 && b.ok && b.value.reading_time_minutes === null);
});
check('etiketler: 13 etiket', () => assert.ok('tags' in errOf(nv({ tags: Array.from({ length: 13 }, (_, i) => `t${i}`).join(',') }))));
check('etiketler: uzun etiket', () => assert.ok('tags' in errOf(nv({ tags: 'x'.repeat(31) }))));
check('etiketler: tekilleştirme (büyük/küçük harf)', () => {
  const r = nv({ tags: 'AI, ai, Ideas\nIDEAS' });
  assert.ok(r.ok && r.value.tags.length === 2);
});
check('geçersiz renk', () => assert.ok('accent' in errOf(nv({ accent: 'pink' }))));
check('gövde: boş başlık satırı', () => assert.ok('body' in errOf(nv({ body: 'a\n\n##' }))));
check('gövde: çok uzun', () => assert.ok('body' in errOf(nv({ body: 'x'.repeat(60001) }))));
check('taslak: özet ve gövde boş olabilir', () => assert.ok(nv({ excerpt: '', body: '' }).ok));
check('yayın: özet zorunlu', () => assert.ok('excerpt' in errOf(nv({ excerpt: '' }, 'publish'))));
check('yayın: gövde zorunlu', () => assert.ok('body' in errOf(nv({ body: '' }, 'publish'))));
check('özet çok uzun', () => assert.ok('excerpt' in errOf(nv({ excerpt: 'x'.repeat(401) }))));
check('mevcut 3 not formdan geçer ve içerik KORUNUR', () => {
  for (const n of notes) {
    const r = validateNoteInput(
      { title: n.title, slug: n.slug, excerpt: n.excerpt, body: serializeNoteBlocks(n.content), tags: n.tags.join(', '), accent: n.accent, published_at: n.publishedAt, reading_time: '' },
      'publish',
    );
    assert.ok(r.ok, n.slug);
    if (r.ok) {
      assert.deepStrictEqual(r.value.content, n.content);
      assert.equal(r.value.title, n.title);
      assert.equal(r.value.excerpt, n.excerpt);
      assert.deepEqual(r.value.tags, n.tags);
      assert.equal(r.value.slug, n.slug);
    }
  }
});

// ───────────────────────────── DOĞRULAMA: LAB
section('DOĞRULAMA — Lab');
const labBase: LabRaw = { title: 'Deney', slug: '', type: 'EXPERIMENT', experiment_status: 'ACTIVE', summary: 'Özet', description: '', accent: 'green', year: '2026', tags: '', sort_order: '' };
const lv = (o: LabRaw, mode: 'draft' | 'publish' = 'draft') => validateLabInput({ ...labBase, ...o }, mode);
const lerr = (r: ReturnType<typeof lv>) => (r.ok ? {} : r.errors);
check('geçerli taslak', () => {
  const r = lv({});
  assert.ok(r.ok && r.value.slug === 'deney' && r.value.sort_order === 0 && r.value.featured === false);
});
check('başlık eksik / çok uzun', () => {
  assert.ok('title' in lerr(lv({ title: '' })));
  assert.ok('title' in lerr(lv({ title: 'x'.repeat(121) })));
});
check('geçersiz tür / durum / renk', () => {
  assert.ok('type' in lerr(lv({ type: 'NOPE' })));
  assert.ok('experiment_status' in lerr(lv({ experiment_status: 'DONE' })));
  assert.ok('accent' in lerr(lv({ accent: 'red' })));
});
check('yıl', () => {
  for (const y of ['', '26', '20266', 'abcd', '1999']) assert.ok('year' in lerr(lv({ year: y })), y);
});
check('sort_order', () => {
  for (const v of ['-1', '10000', 'a', '1.5']) assert.ok('sort_order' in lerr(lv({ sort_order: v })), v);
  const ok = lv({ sort_order: '12' });
  assert.ok(ok.ok && ok.value.sort_order === 12);
});
check('yayın: özet zorunlu, taslak: değil', () => {
  assert.ok('summary' in lerr(lv({ summary: '' }, 'publish')));
  assert.ok(lv({ summary: '' }, 'draft').ok);
});
check('hikâye: boş alanlar kaydedilmez, paragraflar ayrılır', () => {
  const r = lv({ story_why: 'bir\n\niki', story_how: '   ' });
  assert.ok(r.ok);
  if (r.ok) assert.deepStrictEqual(r.value.story, { why: ['bir', 'iki'] });
});
check('hikâye: çok uzun paragraf', () => assert.ok('story_why' in lerr(lv({ story_why: 'x'.repeat(1201) }))));
check('featured checkbox', () => {
  const r = lv({ featured: 'on' });
  assert.ok(r.ok && r.value.featured === true);
});
check('mevcut 3 lab kaydı formdan geçer ve içerik KORUNUR', () => {
  for (const e of labEntries) {
    const r = validateLabInput(
      {
        title: e.title, slug: e.slug, short_title: e.shortTitle ?? '', type: e.type, experiment_status: e.status, category: '',
        summary: e.summary, description: e.description, accent: e.accent, featured: e.featured ? 'on' : '', year: e.year,
        tags: e.tags.join(', '), sort_order: '',
        story_why: (e.story.why ?? []).join('\n\n'), story_how: (e.story.how ?? []).join('\n\n'),
        story_learned: (e.story.learned ?? []).join('\n\n'), story_state: (e.story.state ?? []).join('\n\n'),
      },
      'publish',
    );
    assert.ok(r.ok, e.slug);
    if (r.ok) {
      assert.deepStrictEqual(r.value.story, e.story);
      assert.equal(r.value.summary, e.summary);
      assert.equal(r.value.description, e.description);
      assert.deepEqual(r.value.tags, e.tags);
      assert.equal(r.value.type, e.type);
      assert.equal(r.value.experiment_status, e.status);
      assert.equal(r.value.short_title, e.shortTitle ?? null);
    }
  }
});

// ───────────────────────────── DB HATA EŞLEME
section('DB HATA EŞLEME (ham hata kullanıcıya gösterilmez)');
const cases: [string, { code?: string; message?: string }, string][] = [
  ['duplicate slug', { code: '23505', message: 'duplicate key value violates unique constraint "notes_slug_key"' }, 'slug_taken'],
  ['stale', { code: '40001', message: 'stale_draft' }, 'stale'],
  ['stale (kod yok)', { message: 'stale_draft' }, 'stale'],
  ['forbidden (fn)', { code: '42501', message: 'forbidden' }, 'forbidden'],
  ['forbidden (RLS)', { code: '42501', message: 'new row violates row-level security policy for table "x"' }, 'forbidden'],
  ['published slug', { code: '23514', message: 'published content slug cannot be changed' }, 'slug_locked'],
  ['geçersiz geçiş', { code: '23514', message: 'invalid status transition published -> preview' }, 'invalid_state'],
  ['nothing_to_publish', { code: '23514', message: 'nothing_to_publish' }, 'invalid_state'],
  ['not_published', { code: '23514', message: 'not_published' }, 'invalid_state'],
  ['nothing_to_discard', { code: '23514', message: 'nothing_to_discard' }, 'invalid_state'],
  ['not_found', { code: 'P0002', message: 'not_found' }, 'not_found'],
  ['not null', { code: '23502', message: 'null value in column "title"' }, 'invalid_data'],
  ['check', { code: '23514', message: 'new row violates check constraint "notes_slug_format"' }, 'invalid_data'],
  ['bilinmeyen', { code: 'XX000', message: 'boom: connection to server at "10.0.0.1" failed' }, 'unknown'],
  ['boş', {}, 'unknown'],
];
for (const [name, err, kind] of cases) check(`${name} → ${kind}`, () => assert.equal(classifyDbError(err), kind));
check('mesajlar iç ayrıntı içermez', () => {
  for (const m of Object.values(DB_ERROR_MESSAGES)) assert.ok(!/postgres|constraint|violates|sql|10\.0|supabase|stack/i.test(m), m);
});

// ───────────────────────────── YAŞAM DÖNGÜSÜ GÖRÜNÜMÜ
section('YAŞAM DÖNGÜSÜ GÖRÜNÜMÜ');
const lc = (status: 'draft' | 'preview' | 'published', publishedAt: string | null, hasDraft: boolean, stale = false) => describeLifecycle({ status, publishedAt, hasDraft, stale });
check('yeni taslak: yayınlanabilir, atılamaz, kaldırılamaz', () => {
  const v = lc('draft', null, true);
  assert.deepEqual([v.label, v.canPublish, v.canDiscard, v.canUnpublish, v.slugLocked], ['DRAFT', true, false, false, false]);
});
check('yayında, bekleyen yok: yalnızca kaldırılabilir, slug kilitli', () => {
  const v = lc('published', '2026-01-01T00:00:00Z', false);
  assert.deepEqual([v.label, v.canPublish, v.canDiscard, v.canUnpublish, v.slugLocked], ['PUBLISHED', false, false, true, true]);
});
check('yayında + bekleyen değişiklik: yayınlanabilir, atılabilir', () => {
  const v = lc('published', '2026-01-01T00:00:00Z', true);
  assert.deepEqual([v.label, v.canPublish, v.canDiscard, v.canUnpublish], ['PUBLISHED · BEKLEYEN DEĞİŞİKLİK', true, true, true]);
});
check('eskimiş taslak yayınlanamaz', () => assert.equal(lc('published', '2026-01-01T00:00:00Z', true, true).canPublish, false));
check('yayından kaldırılmış: slug serbest, yeniden yayınlanabilir', () => {
  const v = lc('draft', '2026-01-01T00:00:00Z', false);
  assert.deepEqual([v.label, v.slugLocked, v.canPublish, v.canDiscard], ['DRAFT · YAYINDAN KALDIRILDI', false, true, false]);
});
check('yayından kaldırılmış + bekleyen taslak: atılabilir', () => assert.equal(lc('draft', '2026-01-01T00:00:00Z', true).canDiscard, true));

// ───────────────────────────── SONUÇ
console.log(`\n${passed} kontrol geçti, ${failures.length} başarısız.`);
if (failures.length) {
  for (const f of failures) console.log('  HATA', f);
  process.exit(1);
}
console.log('TÜM 3B-A1 SAF MANTIK TESTLERİ GEÇTİ');
