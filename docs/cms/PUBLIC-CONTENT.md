# FAZ 3B-E — Public site ← Supabase CMS (yayınlanmış içerik)

## 1. Tek giriş noktası ve anahtar
Public sayfalar/bileşenler içeriği `@/data/*` yerine **`@/lib/content`** üzerinden okur. Kaynak, sunucu tarafı env ile seçilir (NEXT_PUBLIC değil):

| `CONTENT_SOURCE` | Davranış |
|---|---|
| (tanımsız) / `static` | **Varsayılan.** `src/data/*` — bugünkü davranış, DB'ye dokunulmaz, sayfalar statik üretilir. |
| `cms` | Supabase **yayınlanmış** içeriği. Hata → güvenli hata sayfası (statiğe DÖNÜLMEZ). |
| başka bir değer | Yapılandırma hatası (sessizce static/cms seçilmez). |

Bu paket tek başına dağıtılırsa `CONTENT_SOURCE` tanımsız olduğundan **public site değişmez**. Geçiş bilinçli bir env değişikliğidir (bkz. §7).

## 2. Veri kaynakları (yalnız yayınlanmış)
| Bölüm | Tablo | Filtre | Not |
|---|---|---|---|
| Projeler (kartlar, detay, sonraki) | `projects` | `status='published'` | + RLS `projects_public_read` |
| Lab (liste, detay, ana sayfa öne çıkanlar) | `lab_entries` | `status='published'` | |
| Notes (liste, detay, son 3) | `notes` | `status='published'` | tarih = `published_at` |
| Hero, Currently, About, Contact, Social, Lab girişi/sayfası, Notes sayfası, Lab kategorileri, Header/Footer/`<head>` kimliği | `site_content_published` | (yalnız yayınlanmış tablo) | 10 anahtarın **tamamı** gerekir |

`*_drafts` ve `site_content_drafts` tablolarına public kod **asla** dokunmaz (testle doğrulanır). Sorgular açık kolon listesiyle yapılır (`select *` yok), `created_by`/`updated_by`/taslak alanları seçilmez.
Okuma, oturumsuz `anon` istemcisiyle yapılır (`src/lib/supabase/public.ts`); service-role/secret anahtar görülürse istemci kurulmaz. Admin istemcisi (`server.ts`) ve `requireAdmin` public kodda kullanılmaz.

## 3. Yayın durumu güvenliği (üç katman)
1. **RLS**: `anon` yalnız `published` satırları görür (gerçek PG testi: P1–P3).
2. **Sorgu**: `.eq('status','published')` açıkça eklenir.
3. **Mapper (savunma derinliği)**: `status !== 'published'` olan satır, filtre/RLS yanlışlıkla gevşese bile atılır (test T4b). Yayınlanmış nota geçerli `published_at` zorunludur; tarih uydurulmaz.
Durum, satır varlığından çıkarılmaz; `status` alanının kendisi okunur.

## 4. Sıralama (deterministik)
- Projeler / Lab: `sort_order ↑` → başlık (küçük harf, kod noktası) ↑ → `slug ↑`. Slug benzersiz → tam sıralama. Admin listesinin birincil/ikincil sırasıyla aynıdır.
- Notes: `published_at ↓` (zaman damgası olarak karşılaştırılır; `Z` / `+00:00` / `+03:00` biçim farkı sorun çıkarmaz) → `slug ↑`.
- Yerel ayara (ICU/`localeCompare`) bağlı değildir; her ortamda aynı sonuç. Girdi sırası değişse de sonuç aynıdır (T7a–T7d, P1).
Mevcut veride çakışma: `faz-3b-a1-lab-testi` ve `ai-tool-explorations` Lab'da `sort_order=0` (import raporundaki `sort_order_tie`); artık başlık→slug ile çözülür.

## 5. Hata / boş / "yayınlanmış içerik yok" ayrımı
| Durum | Davranış |
|---|---|
| Sorgu hatası (ağ, izin, `data=null`) | `ContentUnavailableError('query')` → `(site)/error.tsx` (sabit, güvenli mesaj + “Tekrar dene”). Boş dizi **dönmez**, statik içerik **dönmez**. Hata önbelleğe yazılmaz. |
| Sorgu başarılı, 0 yayınlanmış kayıt | Boş liste (bugünkü boş durum bileşenleri); detay → 404. |
| Site belgesi eksik/geçersiz | `ContentUnavailableError('invalid')` (kısmi/karışık site gösterilmez). |
| Geçersiz tek satır | Yalnız o satır atlanır (log: tür + slug), diğerleri görünür. |
| Geçersiz slug | `undefined` → `notFound()` (404). |
| Yapılandırma (env yok / service-role anahtar / geçersiz `CONTENT_SOURCE`) | `ContentUnavailableError('config')`. |

### Statik fallback kararı
- **cms modunda içerik için fallback YOKTUR.** Gerekçe: `src/data/*` yayından kaldırılmış kayıtları da içerir; hata anında statiğe dönmek “yayından kaldırılmış içeriğin geri gelmesi” demektir ve sessiz olurdu.
- **Tek istisna — kimlik alanları** (`getChromeIdentity`: marka, ad, alan adı, açıklama): CMS okunamazsa statik değerler kullanılır (`from: 'static-fallback'`). Bunlar yayından-kaldırma hassasiyeti taşımaz; hata/404 sayfası da Header/Footer/`<head>` ister. Alan adı doğrulanır (`DOMAIN_RE`).
- `static` modu bir *fallback* değil, bilinçli yapılandırmadır.

## 6. Cache ve yayın sonrası güncellenme
- Veri: `unstable_cache` + **sert yaş sınırı** (`src/lib/content/envelope-cache.ts`). Her kayıt `{ at, data }` zarfıdır; `at` = sorgunun başladığı an.
  - **Yumuşak süre 50 sn** (`CMS_SOFT_REVALIDATE_SECONDS`): aşılınca eski veri hâlâ sunulabilir, yenileme arka planda başlar (trafik varken sert sınıra düşülmez).
  - **Sert sınır 60 sn** (`CMS_REVALIDATE_SECONDS`): bundan eski veri **ASLA** sunulmaz. İstek, sorguyu eşzamanlı yapar; sorgu başarısızsa **hata** döner (eski içeriğe ya da statik içeriğe dönülmez). Sonuç: yayından kaldırılmış içerik, süre dolduktan sonraki ilk istekte 404 olur; kesintide en geç 60 sn sonra hata sayfası görünür.
  - Aynı anahtar için eşzamanlı sorgular **tek uçuşta** birleştirilir (arka plan yenilemesi ile sert-sınır sorgusu da). Başarılı son sonuç süreç içinde de tutulur; böylece kalıcı kayıt yenilenmese bile süresi dolmuş zarf her istekte yeniden sorgu tetiklemez.
  - Etiketler: `cms-public` (+ `cms-projects|lab|notes|site`). Önbellek anahtar öneki `cms-public-v2` (zarf biçimi; eski kayıtlarla karışmaz).
- Sorgu zaman sınırı: her Supabase sorgusu için **8 sn toplam** (`CMS_QUERY_TIMEOUT_MS`, yeniden denemeler dâhil). Süre dolunca istek `AbortController` ile iptal edilir ve `ContentUnavailableError('query', '<tablo>:timeout')` fırlatılır (hata sayfası/5xx; önbelleğe yazılmaz).
- Sayfa: cms modunda her sayfa `await connection()` ile **dinamik** üretilir (tam-sayfa/ISR önbelleği yok) → yayından kaldırılan sayfanın eski HTML'i önbellekte kalamaz. `generateStaticParams` cms modunda boştur (build'de DB gerekmez).
- Hatalar önbelleğe yazılmaz (cached fonksiyon fırlatır).
- **Yayınla / yayından kaldır** (`publish_*`, `unpublish_*` RPC başarılı olunca, `src/lib/cms/admin/rpc.ts`): `revalidateTag('cms-public')` + `revalidatePath('/', 'layout')` → değişiklik **bir sonraki istekte** görünür. Bu çağrı hata verse bile admin işlemi başarısız olmaz.
- Üst sınır: invalidasyon çalışmazsa (ör. farklı sunucu örneği, edge önbelleği) en geç **60 sn** içinde güncellenir (sert sınır). DB'de doğrudan SQL ile yapılan değişiklikler için de aynı 60 sn sınırı geçerlidir. `revalidatePublicContent()` aynı örnekteki süreç içi kayıtları da temizler; başka örnekler en geç sert sınırda güncellenir.
- Kesinti sırasında: önbellekteki başarılı veri sert sınıra (60 sn) kadar sunulur; sınırdan sonra **hata sayfası** (5xx). Yayından kaldırılmış içerik bu pencere dışında geri gelemez.
- Bilinen sınırlar: örnekler arası saat farkı sert sınırı o kadar kaydırır (NTP ile saniyenin altı); arka plan yenilemesi hiç yazılamıyorsa (beklenmeyen) istek başına en çok 1 sorgu yapılır.
- Not: 404 sayfası ve kök layout `<head>` kimliği build sırasında üretilebilir; kimlik alanları (marka/alan adı) değişirse yeniden deploy gerekebilir. İçerik değişikliklerinden etkilenmez.

### Build ↔ çalışma zamanı `CONTENT_SOURCE` uyumu (FAZ 3B-F1)
`static` derlenen sayfalar build'de üretilip hazır HTML olarak sunulur; çalışma zamanındaki `CONTENT_SOURCE=cms` onlara ulaşmaz. Bunun sessizce olmaması için:
- `next.config.mjs`, build anındaki `CONTENT_SOURCE` sınıfını (`static` | `cms` | `invalid`) `env.BUILT_CONTENT_SOURCE` ile pakete gömer (ham değer gömülmez).
- `src/instrumentation.ts` → `register()` sunucu başlarken bunu çalışma zamanı değeriyle karşılaştırır (`src/lib/content/build-guard.ts`). **Geçerli ve farklıysa (static→cms ya da cms→static) başlatma reddedilir**: günlükte `CONTENT_SOURCE_BUILD_RUNTIME_MISMATCH: build=… runtime=…`, çıkış kodu **78**, sunucu dinlemeye başlamaz.
- Build `static` iken çalışma zamanı değeri geçersizse de reddedilir; build `cms` iken geçersiz değer, istek anında `getContentSource()` ile zaten fail-closed (5xx) olur.
- `next dev`'de (NODE_ENV≠production) kontrol atlanır. Build işareti yoksa (eski build) reddedilmez, günlüğe "doğrulanamadı" uyarısı yazılır.
- Geri alma notu: cms build + `CONTENT_SOURCE=static` ile build'siz geri dönüş artık **çalışmaz** (reddedilir); geri dönüş için `CONTENT_SOURCE`'u değiştirip yeniden derleyin.
- Sınır: Vercel'de build ve çalışma ortamı aynı dağıtımdan gelir, uyumsuzluk normalde oluşmaz; CDN'den sunulan hazır statik sayfalar için fonksiyon hiç çalışmadığından bu kontrol onları korumaz. Asıl kazanç kendi sunucuda (`next start`) ve F0'dadır.

## 7. Geçiş (canlıya almadan önce — bu pakette YAPILMAZ)
1. **Engelleyici:** Post-import raporuna göre (`import-reports/…16-40-23…/post-import-report.md`, 2026-10-08) iki QA kaydı **yayınlanmış** durumda: Lab `faz-3b-a1-lab-testi`, Not `faz-3b-a1-test-notu`. `cms`'e geçilince public sitede görünürler. Admin panelinden yayından kaldırın (bu paket DB'ye yazmaz). Güncel durumu kontrol edin.
2. `site_content_published` 10 anahtarın tamamını içermeli (aksi halde site hata sayfası verir).
3. Önce Preview ortamında `CONTENT_SOURCE=cms` ile deneyin; Vercel'de env değişikliği yeni deploy ister.
4. Doğrulama listesi: ana sayfa, `/lab`, `/notes`, bir proje/lab/not detayı, olmayan slug (404), yayından kaldırılan kaydın URL'si (404, ≤60 sn veya anında), Header/Footer.
5. Sorun olursa `CONTENT_SOURCE` değişkenini silin/`static` yapın ve yeniden deploy edin (geri dönüş).

## 8. Sitemap / robots
Projede `sitemap`/`robots` dosyası **yoktur** (kontrol edildi; test T11c). Bu nedenle bu fazda sızıntı yüzeyi yoktur ve eklenmedi (kapsam dışı, SEO fazı). Eklenirken kaynak olarak `getProjects/getLabEntries/getNotes` kullanılmalı (aynı yayın filtresi). T11c, dosya eklenirse testi bilerek kırar ve bu notu hatırlatır.

## 9. Metadata
Detay sayfalarının `generateMetadata` ve sayfa gövdesi **aynı getter**'ı çağırır; yayınlanmamış/bilinmeyen slug için metadata `{}` ve sayfa 404'tür. Kök `generateMetadata` kimliği `getChromeIdentity()`'den alır. Case-study projelerde `seo_*` boşsa başlık/açıklama projenin kendi alanlarından türetilir (yalnız `<head>`).

## 10. Testler
`scripts/cms/verify-3b-e.ts` (41 kontrol; sahte okuyucu + önbellek simülasyonu + kaynak taraması), `scripts/cms/verify-3b-e-pg.ts` (7 kontrol; yerel geçici PostgreSQL, gerçek şema/RLS, `anon` rolü), `scripts/cms/run-3b-e-tests.sh`.
Bu betikler **doğrulamaz**: sayfaların gerçek render'ı, `next build`, lint, tarayıcıda görünüm, Vercel önbellek davranışı, gerçek Supabase (PostgREST) yanıtları. Bunlar yerelde çalıştırılmalıdır (README-INTEGRATION.md).
