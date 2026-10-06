# Mevcut İçerik Geçiş Stratejisi

**Hiçbir şey FAZ 3A'da taşınmaz.** Dosya tabanlı içerik üretimde tek doğru kaynak kalır. Aşağıdaki plan, FAZ 3B+ içindir.

## Kapsam

| Kaynak | Hedef |
|---|---|
| `src/data/projects/*.ts` (4) | `projects` |
| `src/data/lab/*.ts` (3) + `categories.ts` | `lab_entries`, `site_content_*['lab_categories']` |
| `src/data/notes/*.ts` (3) | `notes` |
| `src/data/site.ts` | `site_content_*` (`site_meta, hero, about, contact, lab_intro, lab_page, notes_page`) |
| `src/data/currently.ts`, `social.ts` | `site_content_*['currently' / 'social']` |
| `src/data/navigation.ts` | taşınmaz (yapısal, düzenlenebilir içerik değil) |

## Şimdiden kanıtlananlar

`scripts/cms/verify-roundtrip.ts` (veritabanına bağlanmaz):

1. Her kayıt **içerik → satır → JSON → içerik** gidiş-dönüşünde orijinaline `deepStrictEqual` eşit.
2. Tüm kayıtlar SQL `CHECK` sözlüğüne ve slug biçimine uyuyor; jsonb türleri doğru.
3. Slug'lar benzersiz; site içeriği anahtar kümesi SQL ile aynı.

```bash
npx tsx scripts/cms/verify-roundtrip.ts     # isteğe bağlı araç, bağımlılık eklemez
```

## Geçiş adımları (gelecek)

1. **Hazırlık**: Supabase projesi, migration'lar, admin kullanıcı (bkz. `SETUP.md`), `rls_smoke.sql` çalıştırılır.
2. **Taslak olarak yükleme** (güvenli):
   `npx tsx scripts/cms/generate-seed.ts > seed.sql` → incele → SQL editor'de çalıştır.
   Her şey `draft` gelir; site etkilenmez. Betik idempotent: tekrar çalıştırmak içerik sütunlarını günceller, `status` ve `published_at`'e dokunmaz.
3. **Doğrulama**: admin önizlemesiyle (FAZ 3C) her sayfa dosya tabanlı hâliyle yan yana karşılaştırılır. Otomatik karşılaştırma: veritabanından okunan modeller `recordTo*` ile `src/data` ile `deepStrictEqual`.
4. **Okuma katmanı geçişi** (FAZ 3C) **özellik bayrağıyla**: `CONTENT_SOURCE=files|supabase`. Varsayılan `files`. Supabase boşsa/ulaşılamazsa dosya tabanlı içerik **geri düşüş** olarak kalır.
5. **Kesme günü**: `generate-seed.ts --publish` (ya da admin'den tek tek yayına alma). Bayrak `supabase`'e çevrilir; Vercel'de önizleme dağıtımında doğrulanır, sonra production.
6. **Geri alma**: bayrağı `files`'a çevirmek yeterli; dosyalar silinmediği için kayıpsız.
7. **Temizlik** (en erken FAZ 3D, kararla): `src/data/*` içerik dosyaları arşivlenir veya yalnızca seed kaynağı olarak tutulur.

## Dikkat edilecekler

- Notlarda `readingTime` boşsa içerikten hesaplanır; `reading_time_minutes` yalnızca elle override içindir.
- `Project.index` saklanmaz, `sort_order + 1`'den türetilir.
- Seed çıktısı depoya **commit edilmez** (eskiyen kopya olmasın).
- Service-role anahtarı yalnızca SQL'i çalıştıran kişinin ortamındadır; depoya ve Vercel'e girmez.
