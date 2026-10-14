# Güvenlik ve RLS Planı (FAZ 3A)

## Tehdit modeli (kısaca)

Tek site sahibi, herkese açık okuyucular. Korunacaklar: taslak içerik, yazma yetkisi, service-role anahtarı, admin yüzeyi.

## Kimlik doğrulama ve yetkilendirme

| Katman | Kural |
|---|---|
| **Kimlik** | Supabase Auth. Açık kayıt **kapalı olmalı** (Dashboard → Authentication → Sign In / Providers → "Allow new users to sign up" kapalı). Kullanıcı yalnızca panelden oluşturulur. |
| **Yetki** | `public.admin_users` allowlist'i. Yetki, kullanıcının düzenleyebildiği `user_metadata`'dan **türetilmez**. |
| **Uygulama** | `requireAdmin()`: `auth.getUser()` (token'ı Auth sunucusuna karşı doğrular, `getSession` kullanılmaz) + `rpc('is_admin')`. Hata olursa **kapalı kalır** (fail-closed). |
| **Veritabanı** | RLS: yazma yalnızca `public.is_admin()` için. Uygulama katmanı atlansa bile veritabanı reddeder. |
| **Parola** | Güçlü parola + **MFA (TOTP) açın** (Supabase destekler). Brute-force sınırlaması Supabase Auth'tadır. |

> Client-side gizleme (ör. menüyü saklamak) yetkilendirme değildir: bu projede hiçbir yetki kararı istemcide verilmez.

## Bağlayıcı kural: layout kontrolü yetmez (FAZ 3B+ için)

Next.js App Router'da bir sayfa ve layout'u birbirinden bağımsız render edilebilir; layout'taki `requireAdmin()` kontrolü, sayfanın veri çekmesini **tek başına** engellemez. Bu yüzden:

1. Admin verisine dokunan **her** Server Action, Route Handler ve veri yükleyici kendi içinde `requireAdmin()` çağırır (layout'a güvenmez).
2. Asıl güvence her zaman **RLS**'tir: uygulama kontrolü atlansa bile admin olmayan oturum yazamaz ve taslak okuyamaz.
3. FAZ 3B-A1'de bu kural uygulanmıştır: Notes ve Lab için her Server Action (`create`, `save`, `publish`, `unpublish`, `discard`) ve her admin sayfası kendi içinde `requireAdmin()` çağırır; admin değilse DB'ye hiç dokunulmaz (sandbox testiyle doğrulandı). Yazma yolu yalnızca `SECURITY DEFINER` fonksiyonlardır (`is_admin()` + satır kilidi). Taslak tablolarına `anon` erişemez, admin olmayan oturum 0 satır görür ve yazamaz (RLS; gerçek Supabase'te `rls_smoke_3b.sql` ile doğrulanmalıdır).

## RLS planı

Tüm tablolarda RLS **açık**. Politikası olmayan tablo kapalıdır.

| Tablo | anon / authenticated (admin değil) | admin |
|---|---|---|
| `projects`, `lab_entries`, `notes` | `select` yalnızca `status = 'published'` | tümü (select/insert/update/delete) |
| `site_content_published` | `select` (hepsi) | `select`; **yazma yok** (yalnızca `publish_site_content()`) |
| `site_content_drafts` | **erişim yok** | tümü |
| `media_assets` | `select` yalnızca *yayınlanmış içerikten referanslananlar* | tümü |
| `admin_users` | **erişim yok** (grant'ler geri alındı) | doğrudan erişim yok; `is_admin()` içeriden okur |
| `storage.objects` (`site-media`) | liste/okuma politikası yok (dosya URL ile okunur) | select/insert/update/delete |

Ek güvenceler:

- `is_admin()` ve `publish_site_content()` `SECURITY DEFINER` + `set search_path = ''`.
- `publish_site_content()` içinde ayrıca `is_admin()` kontrolü vardır (fonksiyon `authenticated`'a açıktır).
- Yaşam döngüsü tetikleyicisi (`enforce_content_status`) admin'in bile `draft → published` atlamasını engeller.
- Grant'ler **açıkça** verilir; Supabase varsayılan ayrıcalıklarına güvenilmez.
- `anon` kullanıcı `site_content_drafts` ve `admin_users`'a `permission denied` alır.

### Taslak içerik public'te görünebilir mi?

Hayır, üç katmanda engellenir: (1) RLS `status = 'published'`, (2) taslak/yayın için ayrı tablolar (site içeriği), (3) uygulama okuma katmanı da `isPublic()` ile filtreler (FAZ 3C).

## Sır yönetimi

| Değişken | Nerede | Not |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | Gizli değil |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (veya eski `..._ANON_KEY`) | Vercel + `.env.local` | Tarayıcıya açılması **tasarım gereği**; güvenlik RLS'ten gelir |
| `SUPABASE_SERVICE_ROLE_KEY` | **Hiçbir yerde uygulamada yok** | RLS'i atlar. `NEXT_PUBLIC_` öneki **asla** almaz. FAZ 3A'da uygulama kodu okumaz; yalnızca yerel araçlar için. Vercel'e eklemeyin. |

- `.env*.local` zaten `.gitignore`'da. `.env.example` yalnızca değişken adlarını içerir.
- Depo herkese açık olabilir: kodda ve dokümanda gerçek değer yoktur.

## Medya güvenliği

- `site-media` bucket'ı **public**: yüklenen her dosya URL'yi bilen herkesçe okunabilir. Gizli dosya yüklemeyin.
- Yalnızca `jpeg, png, webp, avif`; SVG **yok** (script taşıyabilir). Dosya başına 5 MB.
- Yükleme/silme yalnızca admin.

## Bilinen sınırlamalar / sonraki faz

- Yetkili hesap tek e-posta/parola (+MFA önerisi). Rol sistemi yok (tek sahip).
- Public bucket: taslak içeriğe ait görselin URL'si bilinirse okunabilir.
- Inline medya (içerik gövdesinde görsel) henüz yok; eklenince `media_assets` okuma politikası genişletilmeli.
- Denetim kaydı (audit log) yok; yalnızca `created_by/updated_by`.
- `supabase/tests/rls_smoke.sql` proje sahibi tarafından **gerçek Supabase projesinde çalıştırıldı: PASS** (bkz. `VERIFICATION.md`). Şema/RLS her değiştiğinde yeniden çalıştırın.

## FAZ 3B-A2 eklemeleri (Projeler ve Site İçeriği)

- Projeler, Notes/Lab ile aynı ortak çekirdeği kullanır (her Server Action ve her sayfa kendi başına `requireAdmin()`; intent açık ve fail-closed; onay kutusu sunucuda zorunlu; yazma yalnızca `SECURITY DEFINER` fonksiyonlarıyla).
- Site içeriği mutation çekirdeği (`site-actions-core.ts`) aynı ilkelerle yazılmıştır: anahtar sunucuda **allowlist** ile doğrulanır (`isSiteKey`), form alanları anahtara özel allowlist'ten okunur (sahte `role`/`isAdmin` yok sayılır), belge **sunucuda sıkı şekil doğrulamasından** geçer (bilinmeyen alan reddedilir; bağlantılar yalnızca `#`, `/yol`, `https:`, `mailto:`).
- 0005 fonksiyonları `SECURITY DEFINER`, `search_path = ''`, her biri `is_admin()` ile **fail-closed**; `anon` için execute yok; `project_drafts` için RLS yalnızca admin. `_apply_project_doc` API rollerine kapalı. Service-role anahtarı yok.
- Public site Supabase'e **bağlı değildir** (dosya tabanlı); admin'de yapılan hiçbir şey public içeriği etkilemez.

## Ziyaretçi istatistikleri (Analytics, migration 0007)

Ayrıntı: [`ANALYTICS.md`](./ANALYTICS.md). Güvenlik açısından özet:

- **Varsayılan KAPALI.** Endpoint, etkinleştirme bayrakları ve sunucu sırları olmadan veri yazmaz; tarayıcı beacon'ı derleme bayrağı olmadan yüklenmez.
- **`anon` için analytics yazma/okuma yok** (tablo ve fonksiyon). Yeni tablolarda RLS açık, politika yok, API rollerine `REVOKE ALL`. Fonksiyonlar `SECURITY DEFINER` + `search_path = ''`; `record_hit` yalnızca `analytics_writers` kaydındaki **admin olmayan** hesaba, `analytics_summary` yalnızca `is_admin()` hesabına çalışır (fail-closed). Admin hesabı yazıcı olamaz.
- **Service-role anahtarı uygulamaya girmez** (bu özellik için de). Yeni sunucu sırları: `ANALYTICS_HASH_SECRET`, `ANALYTICS_WRITER_EMAIL`, `ANALYTICS_WRITER_PASSWORD` (`NEXT_PUBLIC_` önekli DEĞİL; Vercel'de yalnızca sunucu tarafı).
- **Yazıcı hesabı yetkisi dardır:** yalnızca `record_hit()` ve (her `authenticated` gibi) yayınlanmış içeriği okuma. Mevcut CMS yazma yolları (`is_admin()`) ve admin RPC'leri ona kapalıdır; bu `rls_smoke_analytics.sql` ile her fonksiyon için sınanır. İptal: `analytics_writers` satırını silmek (anında).
- **Sahte isteklerle sayım şişirilmesi tamamen önlenemez** (bkz. ANALYTICS.md §5). `ANALYTICS_WAF_CONFIRMED` gerçek bir WAF doğrulaması değil, manuel onay bayrağıdır.
- **Gizlilik:** IP, User-Agent, hash ve ziyaretçi kimliği saklanmaz; çerez/depolama yok; DNT/GPC saygı görür.

## Proje bölüm görselleri (case_study `figure`, FAZ 1D-2B V1)

- **Ne:** `case_study.sections[]` içindeki her bölüm isteğe bağlı bir `figure` taşıyabilir: `{ path, alt, width, height, caption? }`. Görsel yalnızca CMS modunda gösterilir; statik modda ve Supabase adresi tanımsızken hiçbir şey render edilmez (sayfa hata vermez).
- **`path` bir URL değildir:** `site-media` bucket'ında `projects/` ile başlayan göreli yoldur. Reddedilenler: `http(s)://`, `//`, mutlak yol, `..`, `\`, `%`, boşluk, büyük harf, `projects/` dışı klasörler, `.svg`/`.gif`/`.pdf` ve diğer uzantılar (yalnızca jpg, jpeg, png, webp, avif). Kural tek yerde: `src/lib/cms/validate/figure.ts`; kaydetme, public okuma ve önizleme aynı kuralı kullanır.
- **Uzak görsel kısıtı:** `next.config.mjs` `images.remotePatterns` yalnızca projenin Supabase host'unu ve `/storage/v1/object/public/site-media/projects/**` yolunu (https, port/sorgu yok) kabul eder. Başka hiçbir uzak görsel optimize edilmez.
- **Sınırlar:** bölüm başına 1, projede en çok 6 görsel; `alt` zorunlu (≤200), `width`/`height` zorunlu tam sayı (1–8000), `caption` ≤200. Öne çıkan vakalarda (`cases[].sections`) görsel desteklenmez.
- **Bucket public'tir.** Yüklenen her dosya, adresi bilen herkesçe okunabilir; kaldırılsa bile önbelleklerde kalabilir. Bu bir **süreç** kuralıdır, teknik kilit değil.
- **Work projeleri için yayın öncesi kontrol listesi:** görselde müşteri/çalışan verisi, iç URL ve hostname, API anahtarı/token/oturum bilgisi, e-posta, IP/ağ bilgisi, ticket numarası, tarayıcı sekmesi/yer imi çubuğu, gerçek operasyonel sayılar veya gizlilik anlaşmasına tabi bilgi **yok** mu? Mümkünse gerçek ekran yerine örnek veriyle hazırlanmış (mockup) görsel kullanın. Fotoğraflarda EXIF/konum bilgisini temizleyin.
- **Dosya adı:** sürümlü ve tahmin edilmesi gerekmeyen adlar kullanın (ör. `projects/yakala/overview-v2.webp`); aynı adın üzerine yazmayın (optimize edilmiş kopya ve CDN önbelleği eski görseli gösterebilir).
- **Dağıtım sırası (fail-closed):** önce bu kodu yayına alın, sonra CMS'e `figure` içeren içerik yazın. Eski kod `figure` anahtarını tanımaz; yayınlı bir belgede bulunursa o proje public okumadan düşer. Kodu geri almadan önce CMS'ten `figure` alanlarını kaldırın.
- **V1 sınırı:** yükleme arayüzü yoktur; dosyayı bucket'a yüklemek ayrı bir (elle, yönetici) adımdır. Yükleme doğrulaması (magic byte, gerçek boyut, EXIF) V2 kapsamındadır.
