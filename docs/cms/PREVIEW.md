# FAZ 3B-D — Güvenli CMS Önizleme

Yönetici panelinden, **yayınlamadan** projeleri, lab girdilerini, notları ve site belgelerini görüntüler. Public site (dosya tabanlı `src/data/*`) ve veritabanı bu fazda değişmez.

## Rotalar (hepsi `/admin/preview/…`, hepsi SALT OKUMA)

| Rota | Okuma | Çizim |
|---|---|---|
| `/admin/preview/projects/[id]` | `loadProjectEditor(id)` | Public proje bileşenleri: `ProjectHero`, `SectionShell`, `SectionBody`, `FlowDiagram`, `FeaturedCase`, `TagList` (public sayfayla aynı sıra) |
| `/admin/preview/lab/[id]` | `loadLabEditor(id)` | Public lab sayfası düzeni + ortak `LabStatusBadge`, `labTemplate` |
| `/admin/preview/notes/[id]` | `loadNoteEditor(id)` | Public not sayfası düzeni + ortak `NoteBody` |
| `/admin/preview/site/[key]` | `loadSiteEditor(key)` | **Belge önizlemesi** (alan/değer listesi). Ana sayfanın gerçek önizlemesi DEĞİLDİR. |

URL kimlik (`id`) veya site anahtarı (`key`) taşır; slug taşımaz → slug’ı değişmiş taslak yanlış kayda gitmez.

## Yetkilendirme
Mevcut `requireAdmin()` (`src/lib/supabase/admin-auth.ts`). Yeni auth yok.
- `preview/layout.tsx`: oturum yok → `/admin/login`; admin değil → "Erişim yok"; yapılandırma yok → production’da 404.
- **Her page ayrıca** `(await requireAdmin()).kind !== 'admin'` → `notFound()` yapar (Next.js’te layout çocukları korumaz; mevcut editör sayfalarıyla aynı kalıp). Yetki, veri okumadan ÖNCE kontrol edilir.
- Okuma, kullanıcı oturumuyla ve RLS altında yapılır (service-role yok). RLS de admin olmayana taslak satırlarını zaten vermez.

## Taslak / canlı seçimi
Mevcut yükleyiciler aynen kullanılır: taslak varsa **taslak**, yoksa **canlı kayıt** gösterilir. Üstteki şerit hangisinin gösterildiğini, yaşam döngüsü durumunu ve (varsa) "eski sürüme dayanan taslak" uyarısını yazar. **Yalnızca sunucuya kaydedilmiş veri** gösterilir; formdaki kaydedilmemiş değişiklikler görünmez (şeritte ve "Önizle" bağlantısında yazar).

## Veri dönüşümü
`src/lib/cms/preview/*` (saf fonksiyonlar, Next/Supabase bağımlılığı yok):
- Projects: `ProjectDoc → Project` (`recordToProject` ile aynı eşleme: summary→description, coming_soon→comingSoon, type_label→typeLabel, case_study→caseStudy, sort_order→index). `case_study` bileşenlere verilmeden önce `validateCaseStudy` ile doğrulanır (bozuk şekil render’ı çökertmez). **SEO üretilmez**: public tip `seo` ister ama bileşenler okumaz; tip gereği boş değerle doldurulur, hiçbir yere yansıtılmaz (testle doğrulanır).
- Notes: `content` blokları süzülür (geçersiz bloklar sayılır ve uyarılır). Yayın tarihi yoksa tarih uydurulmaz.
- Lab: `LabDoc → LabEntry`; "EXP-xx" önizlemede sıra alanından türetilir.
- Site: belge `validateSiteDoc` ile doğrulanır; değerler **düz metin** düğümleri olarak çizilir (HTML/bağlantı yorumlanmaz; derinlik/boyut sınırı var).

## Eksik / geçersiz içerik
Sayfa çökmez: eksik zorunlu alanlar şeritte "Yayınlama için eksikler" olarak listelenir (yayın doğrulayıcısıyla aynı kurallar); çizilemeyen proje (case study yok/bozuk) anlaşılır bir mesaj gösterir; "Çok yakında" projeleri için detay sayfası olmadığı belirtilir; okuma hatasında güvenli hata mesajı; geçersiz UUID/anahtar/bulunamayan kayıt → 404.

## Güvenlik
`robots: noindex, nofollow, nocache` (layout + her page `PREVIEW_METADATA`); `force-dynamic`; yazma/RPC/publish/fetch/log/`dangerouslySetInnerHTML`/service-role yok (kaynak taraması testi); yeni public API yok; "Önizle" düz GET bağlantısıdır (`target=_blank`, `rel=noopener noreferrer`).

## Bilinen kısıtlar
- "Sonraki proje / deney / not" bölümleri önizlemede yoktur (başka kayıtların taslaklarını okumamak için).
- Lab ve Notes public sayfaları düzeni sayfa dosyası içinde olduğundan (bu faz public sayfalara dokunmadığından) önizleme görünümü o düzeni **yineler**; public sayfa tasarımı değişirse `LabPreviewView`/`NotePreviewView` elle eşlenmelidir (ileride ortak bileşene çıkarmak önerilir).
- Önizleme içindeki bağlantılar (ör. "← LAB") public siteye gider.
- Site belgesi önizlemesi ana sayfayı çizmez.

## Testler
`TSX_TSCONFIG_PATH=$PWD/tsconfig.json npx tsx scripts/cms/verify-3b-d.ts` (24 kontrol). Gerçek render, oturum akışı ve `next build/lint` bu betikle doğrulanmaz; bkz. teslim raporu.
