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
| `src/app/(admin)/admin/**` | Korumalı admin kabuğu + yer tutucular (URL'ler `/admin/*`; route group URL'e yansımaz) |
| `src/app/(site)/**` | Herkese açık sayfalar (URL'ler değişmedi) ve public kabuğu (`SiteChrome`) |
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

## Admin / public layout ayrımı (FAZ 3B-A0 ile çözüldü)

```
src/app/
  layout.tsx          ← yalnızca <html>/<body>, tema script'i, fontlar, metadata/viewport
  not-found.tsx       ← 404 (public kabukla)
  manifest.ts
  (site)/layout.tsx   ← SiteChrome: skip-link + Header + <main id="main"> + Footer
  (site)/page.tsx, projects/…, lab/…, notes/…   ← URL'ler aynı
  (admin)/admin/…     ← kendi <main> + AdminShell; Header/Footer/navigasyon YOK
```

- Route group adları URL'e yansımaz: public ve admin URL'leri değişmedi.
- `SiteChrome` işaretlemesi eski kök layout ile birebirdir; public sayfaların HTML çıktısı taşıma öncesi/sonrası bayt bayt aynıdır (bkz. `VERIFICATION.md`).
- **404:** eşleşmeyen URL'ler ve `notFound()` çağrıları kök `not-found.tsx`'e düşer ve `(site)` layout'unu kullanmaz; bu yüzden bu dosya kabuğu açıkça sarar. Production'da admin yapılandırılmamışken `/admin` de aynı 404'e düşer.
- Admin kabuğu: "Siteyi gör" bağlantısı, mevcut tema anahtarı (`ThemeToggle`), çıkış, `noindex`.

## Taslak modeli (FAZ 3B-A1)

Notes ve Lab için "Edit → Publish" gerçek bir taslak modeliyle çalışır: **canlı satır yayındayken düzenleme canlıyı değiştirmez**; değişiklikler `note_drafts` / `lab_entry_drafts` tablosundaki tek bir bekleyen dokümanda tutulur, `publish_*()` bunu atomik olarak canlıya kopyalar. Ayrıntılar, akışlar, eskime koruması ve manuel QA için: **`docs/cms/LIFECYCLE.md`**. Migration: `supabase/migrations/0004_faz3b_drafts_and_publish.sql`.

Karar: `project_drafts` 0004'te **oluşturulmadı**; şekli Projects formuna bağlıdır ve `publish_project()` ile birlikte 3B-A2'nin `0005` migration'ında gelecek (kullanılmayan, test edilemeyen şema bırakılmadı). Yayınlanmış slug koruma tetikleyicisi ise `projects`'e de bağlandı (yalnızca tetikleyici; tablo değişmedi).

## FAZ 3A'da bilerek YAPILMAYANLAR

Editörler (CRUD), medya yükleme arayüzü, herkese açık sitenin Supabase'den okuması, içerik geçişi (cutover), önizleme rotaları, revizyonlar, SEO uygulaması, sitemap/robots, rol sistemi (tek sahip), `supabase gen types`.
