import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnvelopeCache } from '../../../src/lib/content/envelope-cache';
import { deferred, fakeClock, fakeUnstableCache } from './helpers';

const SOFT = 50; const HARD = 60;
function rig(o: { bgTriggers?: boolean; bgWrites?: boolean } = {}) {
  const clock = fakeClock();
  const uc = fakeUnstableCache(clock, o);
  const cache = createEnvelopeCache({ store: uc.store, softSeconds: SOFT, hardSeconds: HARD, keyPrefix: 'k', baseTag: 'cms-public', now: clock.now });
  let queries = 0; let db = 'v1'; let fail: Error | null = null;
  // sorgu bir makro-görev sürer: arka plan yenilemesi, ilk isteğin dönüşünden SONRA biter (gerçek ağ gecikmesi gibi)
  const fn = async () => { queries += 1; await new Promise((res) => setImmediate(res)); if (fail) throw fail; return db; };
  const read = cache.wrap('notes', ['cms-notes'], fn);
  return { clock, uc, cache, read, q: () => queries, setDb: (v: string) => { db = v; }, setFail: (e: Error | null) => { fail = e; } };
}
const S = (s: number) => s * 1000;

test('soğuk ilk istek: 1 sorgu; yumuşak süre içindeki istekler önbellekten (0 sorgu)', async () => {
  const r = rig();
  assert.equal(await r.read(), 'v1');
  r.clock.advance(S(10));
  assert.equal(await r.read(), 'v1');
  assert.equal(r.q(), 1);
});

test('yumuşak süre aşıldı (sert içinde): eski veri döner, arka plan yenilemesi TEK sorgu yapar ve sonraki istek taze görür', async () => {
  const r = rig();
  await r.read();
  r.setDb('v2'); r.clock.advance(S(55));
  assert.equal(await r.read(), 'v1', 'sert sınırın içinde eski veri sunulabilir');
  await r.uc.settle();
  assert.equal(r.q(), 2);
  assert.equal(await r.read(), 'v2');
  assert.equal(r.q(), 2, 'yenilenen kayıt sonraki istekte yeniden sorgu tetiklemez');
});

test('SERT sınır sınırı: 59.999 sn sunulur, 60.000 sn sunulmaz (ilk istek taze veriyi görür)', async () => {
  const r = rig({ bgTriggers: false });
  await r.read();
  r.setDb('v2'); r.clock.advance(S(60) - 1);
  assert.equal(await r.read(), 'v1');
  r.clock.advance(1);
  assert.equal(await r.read(), 'v2');
});

test('M03: yayından kaldırılan içerik (yeni sorgu boş döner) sert sınırdan sonraki İLK istekte görünmez', async () => {
  const clock = fakeClock(); const uc = fakeUnstableCache(clock);
  const cache = createEnvelopeCache({ store: uc.store, softSeconds: SOFT, hardSeconds: HARD, keyPrefix: 'k', baseTag: 't', now: clock.now });
  let rows = ['f0-probe-note'];
  const read = cache.wrap('notes', [], async () => [...rows]);
  assert.deepEqual(await read(), ['f0-probe-note']);
  rows = []; clock.advance(S(61));
  assert.deepEqual(await read(), [], 'TTL sonrası ilk istek: not artık yok → 404');
});

test('M05: sert sınırdan sonra sorgu BAŞARISIZSA hata fırlatılır; eski veri ASLA dönmez (tekrarlayan isteklerde de)', async () => {
  const r = rig();
  await r.read();
  r.setFail(new Error('kesinti')); r.clock.advance(S(61));
  for (let i = 0; i < 5; i++) {
    await assert.rejects(() => r.read(), /kesinti/);
    r.clock.advance(S(5));
    await r.uc.settle();
  }
});

test('sert sınırın içinde kesinti: eski veri sunulur (en çok HARD yaşında), hata sınırdan sonra başlar', async () => {
  const r = rig();
  await r.read();
  r.setFail(new Error('kesinti')); r.clock.advance(S(55));
  assert.equal(await r.read(), 'v1');
  await r.uc.settle();
  r.clock.advance(S(6));
  await assert.rejects(() => r.read(), /kesinti/);
});

test('sert sınırda 20 eşzamanlı istek TEK sorgu paylaşır; hepsi taze veriyi alır', async () => {
  const r = rig({ bgTriggers: false });
  await r.read();
  r.setDb('v2'); r.clock.advance(S(61));
  const before = r.q();
  const out = await Promise.all(Array.from({ length: 20 }, () => r.read()));
  assert.deepEqual(new Set(out), new Set(['v2']));
  assert.equal(r.q() - before, 1);
});

test('yumuşak sınırda 10 eşzamanlı istek: hepsi eski veriyi alır, arka plan yenilemesi TEK sorgu', async () => {
  const r = rig();
  await r.read();
  r.setDb('v2'); r.clock.advance(S(52));
  const before = r.q();
  const out = await Promise.all(Array.from({ length: 10 }, () => r.read()));
  await r.uc.settle();
  assert.deepEqual(new Set(out), new Set(['v1']));
  assert.equal(r.q() - before, 1);
  assert.equal(await r.read(), 'v2');
});

test('arka plan yenilemesi ile sert-sınır sorgusu aynı anda: TEK sorgu (tekilleştirme)', async () => {
  const r = rig();
  await r.read();
  r.setDb('v2'); r.clock.advance(S(61));
  const before = r.q();
  assert.equal(await r.read(), 'v2');
  await r.uc.settle();
  assert.equal(r.q() - before, 1, 'arka plan tetiği ve doğrudan sorgu aynı uçuşu paylaşmalı');
});

test('arka plan yazımı hiç gerçekleşmese bile süresi dolmuş zarf yeniden sorgu YAPTIRMAZ (son sonuç kaydı kullanılır)', async () => {
  const r = rig({ bgTriggers: false, bgWrites: false });
  await r.read();
  r.setDb('v2'); r.clock.advance(S(61));
  const before = r.q();
  assert.equal(await r.read(), 'v2');
  for (let i = 0; i < 10; i++) { r.clock.advance(S(2)); assert.equal(await r.read(), 'v2'); }
  assert.equal(r.q() - before, 1, '22 sn boyunca tek sorgu');
  r.clock.advance(S(45)); // son sonuç kaydı da sert sınıra ulaştı
  r.setDb('v3');
  assert.equal(await r.read(), 'v3');
  assert.equal(r.q() - before, 2);
});

test('bilinen sınır: arka plan yazımı gelmiyor ve tetik her okumada çalışıyorsa istek başına EN ÇOK 1 sorgu (2 değil)', async () => {
  const r = rig({ bgTriggers: true, bgWrites: false });
  await r.read();
  r.clock.advance(S(61));
  const before = r.q();
  for (let i = 0; i < 6; i++) { await r.read(); await r.uc.settle(); r.clock.advance(S(1)); }
  assert.ok(r.q() - before <= 6, `sorgu sayısı ${r.q() - before} > istek sayısı 6`);
});

test('revalidateTag: etiket geçersizleşince ilk istek taze (son sonuç kaydı yeni veriyi ezmez)', async () => {
  const r = rig();
  await r.read();
  r.setDb('v2'); r.clock.advance(S(5));
  r.uc.invalidateTag('cms-public');
  assert.equal(await r.read(), 'v2');
  assert.equal(r.q(), 2);
});

test('revalidateTag sonrası sorgu BAŞARISIZSA hata yayılır; önceki veri (son sonuç kaydı/eski zarf) yedek olarak KULLANILMAZ', async () => {
  const r = rig();
  await r.read();
  r.clock.advance(S(5));
  r.uc.invalidateTag('cms-notes');
  r.setFail(new Error('kesinti'));
  await assert.rejects(() => r.read(), /kesinti/);
});

test('hata önbelleğe yazılmaz: sunucu düzelince bir sonraki istek başarılı', async () => {
  const r = rig();
  r.setFail(new Error('kesinti'));
  await assert.rejects(() => r.read(), /kesinti/);
  r.setFail(null);
  assert.equal(await r.read(), 'v1');
});

test('clearLocal(): önceki uçuşun geç gelen ESKİ sonucu yeni durumu ezmez', async () => {
  const clock = fakeClock(); const uc = fakeUnstableCache(clock, { bgTriggers: false });
  const cache = createEnvelopeCache({ store: uc.store, softSeconds: SOFT, hardSeconds: HARD, keyPrefix: 'k', baseTag: 't', now: clock.now });
  const slow = deferred<string>(); let calls = 0;
  const read = cache.wrap('x', [], () => { calls += 1; return calls === 1 ? slow.promise : Promise.resolve('yeni'); });
  const first = read();          // eski sorgu havada
  cache.clearLocal();            // yayınlama sonrası temizlik
  clock.advance(10);
  assert.equal(await read(), 'yeni');
  slow.resolve('eski');
  await first;
  clock.advance(S(1));
  assert.equal(await read(), 'yeni');
});

test('geçersiz/eski biçimli kayıt (zarf değil) yok sayılır ve doğrudan sorgu yapılır', async () => {
  const clock = fakeClock(); const uc = fakeUnstableCache(clock);
  const cache = createEnvelopeCache({ store: uc.store, softSeconds: SOFT, hardSeconds: HARD, keyPrefix: 'k', baseTag: 't', now: clock.now });
  uc.poison(['k', 'x'], ['ham-eski-deger'], ['t']);
  const read = cache.wrap('x', [], async () => 'taze');
  assert.equal(await read(), 'taze');
});

test('değişmez: hiçbir yanıt HARD saniyeden eski sorgu sonucu içermez (200 sn, 1 sn aralık, her 7 sn veri değişimi, zaman zaman arka plan yazımı kaybı)', async () => {
  for (const o of [{}, { bgWrites: false }, { bgTriggers: false }]) {
    const clock = fakeClock(); const uc = fakeUnstableCache(clock, o);
    const cache = createEnvelopeCache({ store: uc.store, softSeconds: SOFT, hardSeconds: HARD, keyPrefix: 'k', baseTag: 't', now: clock.now });
    let version = 0; let versionAt = clock.now();
    const read = cache.wrap('x', [], async () => ({ version, at: clock.now(), versionAt }));
    for (let t = 0; t <= 200; t++) {
      if (t % 7 === 0) { version += 1; versionAt = clock.now(); }
      const got = await read();
      // got.at = sorgunun başladığı an; hiçbir yanıt HARD'dan eski bir sorgudan gelmemeli
      assert.ok(clock.now() - got.at < S(HARD), `${JSON.stringify(o)} t=${t}: yanıt ${(clock.now() - got.at) / 1000} sn eski`);
      await uc.settle();
      clock.advance(S(1));
    }
  }
});

test('yapılandırma: 0 < soft < hard zorunlu', () => {
  const clock = fakeClock(); const uc = fakeUnstableCache(clock);
  assert.throws(() => createEnvelopeCache({ store: uc.store, softSeconds: 60, hardSeconds: 60, keyPrefix: 'k', baseTag: 't' }), /soft < hard/);
  assert.throws(() => createEnvelopeCache({ store: uc.store, softSeconds: 0, hardSeconds: 60, keyPrefix: 'k', baseTag: 't' }), /soft < hard/);
});
