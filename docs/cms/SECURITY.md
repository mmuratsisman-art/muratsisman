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
3. FAZ 3A'daki sayfalar veri okumadığı için bu risk yoktur; kural FAZ 3B'de editörler eklenirken geçerli olur.

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
