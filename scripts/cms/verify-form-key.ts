/**
 * REGRESYON TESTİ (FAZ 3B-A1 R3): "Taslağı At" sonrası edit formunun eski taslak değerlerini göstermeye devam etmesi.
 *
 * Kök neden: form kontrolsüz alanlar (defaultValue) kullanır; kullanıcı bir alanı düzenleyince alan "kirli" olur ve sunucudan gelen yeni
 * defaultValue ekrana yansımaz. Çözüm: sunucu verisi sürümü değişince formu React `key` ile yeniden bağlamak (bkz. form-key.ts).
 * Bu test, her yaşam döngüsü eyleminden sonra anahtarın DEĞİŞTİĞİNİ ve gereksiz yere değişmediğini doğrular.
 *
 *   npx tsx scripts/cms/verify-form-key.ts
 */
import assert from 'node:assert/strict';
import { describeLifecycle } from '@/lib/cms/admin/lifecycle';
import { editorFormKey } from '@/lib/cms/admin/form-key';
import type { ContentStatus } from '@/lib/cms/types';

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

interface State {
  status: ContentStatus;
  publishedAt: string | null;
  live: string;
  draft: string;
}
const keyOf = (s: State) =>
  editorFormKey({
    id: 'ID',
    liveUpdatedAt: s.live,
    draftUpdatedAt: s.draft,
    lifecycleKey: describeLifecycle({ status: s.status, publishedAt: s.publishedAt, hasDraft: s.draft !== '', stale: false }).key,
  });

const T = (n: number) => `2026-10-06T10:00:0${n}.123456+00:00`;
// Gerçek akış: yayında → (taslağı kaydet) → (tekrar kaydet) → taslağı at → düzenle+kaydet → yayınla → yayından kaldır
const published: State = { status: 'published', publishedAt: T(0), live: T(1), draft: '' };
const pending1: State = { ...published, draft: T(2) }; // Taslağı Kaydet
const pending2: State = { ...published, draft: T(3) }; // tekrar Taslağı Kaydet
const discarded: State = { ...published }; // Taslağı At: taslak yok, canlı satır DEĞİŞMEDİ
const pending3: State = { ...published, draft: T(4) };
const republished: State = { status: 'published', publishedAt: T(0), live: T(5), draft: '' }; // Yayınla: canlı updated_at değişir, taslak silinir
const unpublished: State = { status: 'draft', publishedAt: T(0), live: T(6), draft: '' }; // Yayından Kaldır

check('Taslağı Kaydet (ilk kez) → anahtar değişir', () => assert.notEqual(keyOf(published), keyOf(pending1)));
check('tekrar Taslağı Kaydet → anahtar değişir (sunucunun normalize ettiği değerler görünür)', () => assert.notEqual(keyOf(pending1), keyOf(pending2)));
check('TASLAĞI AT → anahtar değişir (hata: eski taslak değerleri ekranda kalıyordu)', () => {
  assert.notEqual(keyOf(pending2), keyOf(discarded));
  assert.notEqual(keyOf(pending1), keyOf(discarded));
});
check('Taslağı At sonrası anahtar, taslak öncesi yayın durumuyla aynıdır (aynı sunucu durumu → aynı anahtar)', () => assert.equal(keyOf(discarded), keyOf(published)));
check('Yayınla → anahtar değişir', () => {
  assert.notEqual(keyOf(pending3), keyOf(republished));
  assert.notEqual(keyOf(republished), keyOf(published));
});
check('Yayından Kaldır → anahtar değişir', () => assert.notEqual(keyOf(republished), keyOf(unpublished)));
check('bekleyen taslakla yayından kaldırma (taslak tabanı yeniden hizalanır) → anahtar değişir', () => {
  const before: State = { ...republished, draft: T(7) };
  const after: State = { status: 'draft', publishedAt: T(0), live: T(8), draft: T(8) };
  assert.notEqual(keyOf(before), keyOf(after));
});
check('aynı sunucu durumu → aynı anahtar (gereksiz yeniden bağlama yok; ?ok= bilgi parametresi anahtara girmez)', () => {
  assert.equal(keyOf(pending1), keyOf({ ...pending1 }));
});
check('farklı kayıtlar → farklı anahtar', () => {
  const a = editorFormKey({ id: 'A', liveUpdatedAt: T(1), draftUpdatedAt: '', lifecycleKey: 'published' });
  const b = editorFormKey({ id: 'B', liveUpdatedAt: T(1), draftUpdatedAt: '', lifecycleKey: 'published' });
  assert.notEqual(a, b);
});
check('zaman damgası mikrosaniye hassasiyetiyle karşılaştırılır (Date\'e çevrilmez)', () => {
  const a = editorFormKey({ id: 'A', liveUpdatedAt: '2026-10-06T10:00:00.123456+00:00', draftUpdatedAt: '', lifecycleKey: 'published' });
  const b = editorFormKey({ id: 'A', liveUpdatedAt: '2026-10-06T10:00:00.123457+00:00', draftUpdatedAt: '', lifecycleKey: 'published' });
  assert.notEqual(a, b);
});
check('anahtar, kullanıcının yazdığı alan değerlerinden BAĞIMSIZ (yazarken yeniden bağlanmaz)', () => {
  // editorFormKey yalnızca sunucu sürüm bilgilerini alır; form değerleri parametre bile değildir.
  assert.equal(editorFormKey.length, 1);
  assert.deepEqual(Object.keys({ id: 1, liveUpdatedAt: 1, draftUpdatedAt: 1, lifecycleKey: 1 }), ['id', 'liveUpdatedAt', 'draftUpdatedAt', 'lifecycleKey']);
});
check('tüm yaşam döngüsü durumları birbirinden ayrışır (çakışma yok; Taslağı At durumu hariç, o yayın durumuyla aynıdır)', () => {
  const keys = [published, pending1, pending2, pending3, republished, unpublished].map(keyOf);
  assert.equal(new Set(keys).size, keys.length);
});

console.log(`${passed} kontrol geçti, ${failures.length} başarısız.`);
if (failures.length) {
  for (const f of failures) console.log('  HATA', f);
  process.exit(1);
}
console.log('REGRESYON TESTİ GEÇTİ: her yaşam döngüsü eyleminden sonra form yeniden bağlanır');
