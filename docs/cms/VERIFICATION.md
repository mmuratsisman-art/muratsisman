# FAZ 3A: Doğrulama durumu

Kim neyi doğruladı **kesin olarak ayrıdır**. Başkasının doğruladığı bir şey "çalıştırdım" diye yazılmaz.

## 1. USER-VERIFIED / REAL SUPABASE (proje sahibi, gerçek Supabase projesi)

| Madde | Sonuç |
|---|---|
| `0001_cms_schema.sql` (SQL Editor) | PASS: `Success. No rows returned` |
| `0002_cms_rls.sql` | PASS |
| `0003_cms_storage.sql` | PASS |
| `supabase/tests/rls_smoke.sql` | PASS: sorgu hiçbir `FAIL` istisnası olmadan bitti, rollback gerçekleşti |
| Auth ayarları | Yeni kullanıcı kaydı **kapalı**, manual linking **kapalı**, anonymous sign-in **kapalı**, e-posta onayı açık, yalnızca Email provider etkin |
| Proje ayarları | Data API açık, "Automatically expose new tables" **kapalı**, "automatic RLS" **açık** (bu yüzden `0002`'deki açık `grant`'ler zorunlu ve yeterli) |
| Admin allowlist | PASS: `public.admin_users.user_id = auth.users.id` (1 satır) |
| Gerçek Next.js girişi (`npm run dev`) | PASS: e-posta/parola → Supabase Auth → oturum cookie'si → `requireAdmin()` → `is_admin()` → `admin_users` → korumalı `/admin` (genel bakış, Projeler, Lab, Notlar, Medya, Site, SEO) |

Uygulamaya yalnızca `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` verildi; `SUPABASE_SERVICE_ROLE_KEY` verilmedi.

## 2. LOCAL USER QA (Windows / Git Bash, R1 paketi)

| Madde | Sonuç |
|---|---|
| `npm install` | PASS: 366 paket eklendi, 11 güvenlik uyarısı raporlandı (aşağıda) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS: Next.js 15.5.27, derleme + tip denetimi + 16/16 statik sayfa |
| Admin rotaları ve middleware build'i | `/admin`, `/admin/login`, `/admin/projects`, `/admin/lab`, `/admin/notes`, `/admin/media`, `/admin/site`, `/admin/seo` + middleware üretildi |
| Public FAZ 2B rotaları | `/`, `/lab`, `/lab/[slug]`, `/notes`, `/notes/[slug]`, `/projects/[slug]` üretilmeye devam etti |

> R2'de `package.json` ve kaynak kodu R1 ile **aynı** olduğundan (R2 yalnızca doküman, `.gitignore` ve test başlığı değiştirir), bu sonuçlar R2 için de geçerlidir; yine de R2 klasöründe `npm run typecheck && npm run lint && npm run build` tekrar çalıştırılması önerilir.

## 3. AI SANDBOX QA (R2 paketini hazırlayan ortam; ağ erişimi YOK)

Çalıştırılan ve geçen:

- İçerik kayıpsız dönüşüm doğrulaması (`scripts/cms/verify-roundtrip.ts`)
- Admin yetki kapısı senaryoları: Supabase ve Next stub'larıyla (yapılandırma yok, oturum yok, admin değil, RPC hatası → fail-closed, admin; giriş action'ları)
- 12 public rotanın sunucu tarafı render testi (stub'larla) ve "public sayfalarda Supabase izi yok" kontrolü
- Statik inceleme: korumalı rota yapısı, middleware matcher, signUp yokluğu, service-role okunmaması, client bundle'a sır sızma yolu, SQL'de yıkıcı ifade yokluğu
- Sır taraması ve ZIP içeriği denetimi

**Çalıştırılamayan** (npm registry erişimi yok): `npm install`, `typecheck`, `lint`, `build`, `npm audit`. Gerçek sonuçlar yukarıdaki 2. bölümdedir (R1 için).

## Bağımlılık güvenlik uyarıları (`npm audit`)

Yerel kurulumda **11 uyarı** raporlandı (3 moderate, 8 high); ek olarak `eslint` için "deprecated" ve `unrs-resolver` için "install script" uyarısı.

- `npm audit fix --force` **çalıştırılmadı ve çalıştırılmamalıdır**: kırıcı yükseltmeler yapabilir.
- Bu ortamda `npm audit` çalıştırılamadığı (ağ yok) ve paket listesi paylaşılmadığı için **paket bazında sınıflandırma yapılmadı**.
- Sınıflandırma için çıktıları alın:
  ```bash
  npm audit --omit=dev     # yalnızca production/runtime bağımlılıkları
  npm audit                # tümü (dev araçları dahil)
  ```
  `--omit=dev` listesinde çıkanlar canlı siteyi doğrudan etkileyebilir (öncelikli). Yalnızca `npm audit`'te görünenler büyük olasılıkla build/lint araç zincirinden (eslint ve eklentileri) gelir ve üretimde çalışmaz.
- FAZ 3A bu uyarılar için bir çözüm içermez; ayrı, kontrollü bir güncelleme turu önerilir.

## package-lock.json

R1'i yerelde `npm install` ile kurduğunuzda üretilen `package-lock.json` R2 için de **geçerlidir**: R2'nin `package.json` dosyası R1 ile bayt bayt aynıdır (SHA-256 eşit). Bu ZIP'e lock dosyası **eklenemedi**: sandbox'ta npm registry'ye erişim yok ve R1'in lock'u bana iletilmedi. Lock dosyasını R1 klasöründen proje köküne kopyalayın ve commit'e dahil edin.
