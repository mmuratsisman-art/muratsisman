# CMS Mimarisi (FAZ 3A)

Durum: **temel altyapı**. Herkese açık site hâlâ yalnızca `src/data/*` dosyalarından beslenir. Supabase'e bağımlılık yoktur.

## Katmanlar

```
Admin (gelecek: /admin/*)  ──►  Supabase (Postgres + Auth + Storage, RLS)
                                      │
                                      ▼  (FAZ 3C+: okuma katmanı)
                         LabEntry / NoteEntry / Project (src/types)
                                      │
                                      ▼
                         Mevcut sunum bileşenleri (değişmez)
```

- **Sunum** (`src/components`, `src/app/*`) yalnızca `src/types` modellerini tüketir; kaynağı bilmez.
- **İçerik kaynağı** şu an `src/data/*`. İleride aynı modelleri döndüren bir okuma katmanı Supabase'den besleyecek (FAZ 3C).
- **Eşleyiciler** (`src/lib/cms/mappers.ts`) dosya modeli ↔ veritabanı satırı çevirir. Saf fonksiyonlardır.
- **Supabase kodu tek klasörde** (`src/lib/supabase/`) ve yalnızca `/admin` rotalarınca içe aktarılır. Herkese açık sayfalar import etmez.

## Dosya haritası

| Yol | Amaç |
|---|---|
| `supabase/migrations/0001..0003_*.sql` | Şema, RLS, storage |
| `supabase/tests/rls_smoke.sql` | RLS ve yaşam döngüsü testi (kendi Supabase projenizde çalıştırılır) |
| `src/lib/supabase/env.ts` | Opsiyonel env okuma (`getSupabaseEnv`, `isSupabaseConfigured`) |
| `src/lib/supabase/server.ts` | İstek bazlı, oturumlu sunucu istemcisi |
| `src/lib/supabase/middleware.ts`, `src/middleware.ts` | Oturum yenileme (**yalnızca `/admin/*`**) |
| `src/lib/supabase/admin-auth.ts` | `requireAdmin()` sunucu tarafı yetki kapısı |
| `src/lib/cms/types.ts` | Veritabanı kayıt tipleri |
| `src/lib/cms/mappers.ts` | Dosya modeli ↔ satır eşleyicileri |
| `src/lib/cms/status.ts` | Yaşam döngüsü ve slug kuralları |
| `src/lib/cms/admin-sections.ts` | Gelecekteki admin bölümleri |
| `src/app/admin/**` | Korumalı admin kabuğu + yer tutucular |
| `scripts/cms/*.ts` | İçerik geçişi için doğrulama ve SQL üretici (isteğe bağlı araçlar) |

## Veritabanı şeması

Genel prensip: **alan başına bir tablo**, "tek dev içerik tablosu" yok. JSONB yalnızca TypeScript'te zaten modellenmiş esnek yapılarda.

| Tablo | Satır | JSONB alanı |
|---|---|---|
| `projects` | bir proje / case study | `case_study` (CaseStudy: bölümler, diyagram, vakalar, etiketler) |
| `lab_entries` | bir deney | `story` (LabStory: yalnızca metin; etiketler şablonda) |
| `notes` | bir not | `content` (NoteBlock[]: p, h, quote, list) |
| `site_content_drafts` / `site_content_published` | tekil doküman (hero, about, ...) | `data` |
| `media_assets` | bir yüklenmiş görsel (metadata) | yok |
| `admin_users` | yetkili kullanıcı allowlist'i | yok |

Ortak kararlar:

- **Sözlük** (accent, size, graphic, kind, type, status ...) `text + CHECK` ile. Enum'dan kolay evrilir.
- **Slug**: tablo başına `UNIQUE` + biçim kısıtı (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 80). Mevcut tüm slug'lar bu biçime uyar (`scripts/cms/verify-roundtrip.ts` doğrular).
- **Etiketler** `text[]` + GIN indeksi. Mevcut etiketlerde ek metadata yok; ayrı `tags` tablosu şu an gereksiz karmaşıklık. İhtiyaç doğarsa `text[]` → ilişki tablosuna geçiş basittir.
- **SEO** (`seo_title`, `seo_description`, `seo_canonical_url`, `seo_og_media_id`, `seo_noindex`) üç içerik tablosunda aynı beş sütun; `cover_media_id` ayrı. `/admin/seo` bunlara tek tip davranır. Alanlar bu fazda *kullanılmaz*, yalnızca yer ayrılmıştır.
- **Medya**: dosya `site-media` bucket'ında, `media_assets` metadata'sı (yol, alt metin, boyut, MIME, bayt). URL saklanmaz, `bucket + path` ile türetilir. Profil fotoğrafı `about` dokümanında `imageMediaId` olarak referanslanır.
- **Zaman damgaları**: `created_at/updated_at` + `created_by/updated_by` (tetikleyiciyle doldurulur).
- **Sıralama**: `sort_order` (projeler, lab). Notlar `published_at desc`.
- **Mevcut `Project.index` ("01") saklanmaz**, `sort_order + 1` olarak türetilir.

### İki farklı "status"

Kod karışmasın diye ayrıldılar:

| Kavram | Sütun | Değerler |
|---|---|---|
| Yayın yaşam döngüsü | `status` | `draft`, `preview`, `published` |
| Proje durum etiketi (case study'deki pill) | `project_status_label` + `project_status_accent` | serbest metin + renk |
| Deney durumu | `experiment_status` | `ACTIVE`, `EXPLORING`, `PAUSED`, `ARCHIVED` |

## Yaşam döngüsü: DRAFT → PREVIEW → PUBLISHED

```
draft ──► preview ──► published
  ▲          │            │
  └──────────┴────────────┘   (preview → draft, published → draft = "unpublish")
```

- Geçişler `enforce_content_status` tetikleyicisiyle **veritabanında** zorlanır (uygulama hatası da atlatamaz): API'den yeni kayıt yalnızca `draft` başlar, `draft → published` atlaması reddedilir.
- Yayına alma ve yayından kaldırma açık işlemlerdir (`status` güncellemesi). `published_at` ilk yayında otomatik atanır.
- **PREVIEW** = "yayına hazır, yalnızca sahibine görünür" durumu. Herkese açık okuma yalnızca `published` döner. Önizleme, admin oturumuyla çalışan bir rota ile (FAZ 3C: `/admin/preview/...`) tüm durumları okur. Paylaşılabilir önizleme bağlantısı (token) kapsam dışıdır.
- **Singleton site içeriği** farklı çalışır: `site_content_drafts` serbestçe düzenlenir; `publish_site_content(key)` fonksiyonu taslağı `site_content_published`'a kopyalar. Yayın tablosuna doğrudan yazma izni kimsede yoktur.

### Bilerek verilen kararlar

- **Yayındaki içerik yerinde düzenlenir** (revizyon yok). Sahibi, canlı bir kaydı düzenlemeden önce taslağa alabilir (`published → draft`). "Yayını etkilemeden taslak revizyon" için `*_revisions` tablosu FAZ 3C+ konusudur; gereksiz karmaşıklık eklenmedi.
- **Slug değişince eski URL'ye yönlendirme yok.** Gerekirse ayrı `redirects` tablosu SEO fazında ele alınır.
- **Sert silme** vardır (`delete`). Çöp kutusu / geri alma FAZ 3B kapsamında değerlendirilecek.

## Admin kabuğu (FAZ 3A)

- `/admin` ve altı **sunucu tarafında** korunur (`requireAdmin()`), istemci gizlemesi yetkilendirme sayılmaz.
- Yapılandırma yoksa production'da `/admin/*` **404** döner; development'ta açıklayıcı mesaj gösterir.
- Giriş: e-posta + parola (server action). **Kayıt akışı yoktur.**
- Yalnızca yer tutucu sayfalar: `/admin/projects|lab|notes|media|site|seo`.
- `/admin/*` her zaman dinamik (`force-dynamic`), `noindex, nofollow` (meta + `X-Robots-Tag`).

## Karar: admin alanı public site chrome'unu (Header/Footer) kullanıyor

`src/app/layout.tsx` Header ve Footer'ı tüm rotalar için render eder; bu yüzden `/admin` sayfalarında da görünür.

**FAZ 3A'da olduğu gibi bırakıldı.** Gerekçe:
- Doğru ayrım route group'lardır (`(site)` ve `(admin)` ayrı layout) ve bu, Faz 2B ile onaylanmış tüm public sayfaların taşınmasını gerektirir. Bu "küçük" bir değişiklik değil; public routing'e dokunur.
- Alternatif (Header/Footer'ı `/admin` altında gizleyen istemci sarmalayıcısı) ise onaylı public kök layout'u değiştirir; görsel olarak doğrulayamadan buna değmez.
- Mevcut durumun güvenlik etkisi yoktur: Header yalnızca herkese açık bağlantılar içerir, yetki kararı vermez.

**FAZ 3B'de** editörlerle birlikte route group ayrımı yapılacak: kök layout yalnızca `<html>/<body>`, tema ve fontları taşır; `(site)` public chrome'u, `(admin)` kendi kabuğunu içerir.

## FAZ 3A'da bilerek YAPILMAYANLAR

Editörler (CRUD), medya yükleme arayüzü, herkese açık sitenin Supabase'den okuması, içerik geçişi (cutover), önizleme rotaları, revizyonlar, SEO uygulaması, sitemap/robots, rol sistemi (tek sahip), `supabase gen types`.
