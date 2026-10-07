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

## FAZ 3B-A0 (layout ayrımı): AI sandbox QA

Çalıştırılan (npm/Next olmadan; React sunucu render testi, Next/Supabase stub'larıyla):

- 12 public rotanın tam belge HTML'i (kök layout + `(site)` layout + sayfa) taşıma **öncesi/sonrası bayt bayt aynı**
- Kök `metadata` / `viewport` ve 12 rotanın metadata'sı öncesi/sonrası aynı
- Dosya sisteminden türetilen public ve admin URL kümeleri öncesi/sonrası aynı
- 9 admin ekranında public Header / Footer / navigasyon yok, tek `<main>`, skip-link var
- 404 bileşeni public kabukla (Header + `<main>` + Footer) render ediliyor
- FAZ 3A yetki senaryoları yeni dosya yollarıyla yeniden geçti

**Çalıştırılamayan** (sandbox'ta npm/Next yok), yerelde ve preview'da doğrulanmalı: `npm run typecheck`, `lint`, `build` (route tablosu); gerçek Next'te 404 davranışı (`/olmayan` ve `/projects/yok` → public kabuk **tek** kez); tarayıcıda görsel kontrol; Vercel preview.

## FAZ 3B-A1 (taslak altyapısı + Notes ve Lab CMS)

**USER-VERIFIED / REAL SUPABASE:** henüz **yok**. Migration 0004 hazırlandı ancak herhangi bir veritabanına uygulanmadı; `rls_smoke_3b.sql` gerçek Postgres'te çalıştırılmadı.

**AI SANDBOX QA** (npm/Next/Postgres yok; React sunucu render + sahte Supabase istemcisi):

- Saf mantık testleri (`scripts/cms/verify-3b-a1.ts`, 74 kontrol): slug, not işaretlemesi gidiş-dönüşü (gerçek 3 not + 3000 rastgele blok dizisi), doğrulama (gerçek 3 not ve 3 lab kaydı formdan geçip içerik korunuyor), DB hata eşleme, yaşam döngüsü görünümü: **geçti**
- Server Action güvenlik/davranış testleri (10 mutation × 3 yetki senaryosu + akışlar + sayfa render): **geçti**. Kapsam: her mutation `requireAdmin()` ile başlar, admin değilse 0 DB çağrısı; sahte rol/isAdmin alanları yok sayılır; ham DB hatası sızmaz; token Date'e çevrilmez; yayında slug değişikliği reddedilir; silme yok.
- Public HTML parity (12 rota) FAZ 3A baseline ile **bayt bayt aynı**; admin sayfalarında public Header/Footer yok (9/9)
- Katı `tsc` (geçici ortam bildirimleriyle, 116 dosya, `noUnusedLocals`): **temiz**. Gerçek `npm run typecheck` değildir.
- SQL: yapısal denetim (`$$`, parantez, tırnak dengesi; yıkıcı ifade yok; 0001–0003 hash'leri değişmedi). **Postgres'te çalıştırılmadı.**

**Çalıştırılamayan (R1 listesi):** `npm install`, `typecheck`, `lint`, `build`; migration 0004 ve `rls_smoke_3b.sql` (gerçek Postgres); gerçek Supabase ile uçtan uca CRUD; tarayıcı/görsel kontrol.

### FAZ 3B-A1 R2 (Yayınla düğmesi hatası düzeltmesi)

**Hata (kullanıcı QA'sında bulundu):** Notes edit ekranında onay kutusu işaretlenip "Yayınla"ya basıldığında kayıt `DRAFT` kalıyor ve `?ok=saved` dönüyordu (`intent: null`, `confirm_publish: 'on'`). **Kök neden:** sunucu işlem türünü gönderen düğmenin `name/value`'sundan okuyordu ve eksikse sessizce "kaydet"e düşüyordu. React'in form action gönderiminde submitter'ın FormData'ya girmesi sürüme bağlı bir uygulama ayrıntısıdır.

**USER-VERIFIED / REAL SUPABASE (R1 sonrası, kullanıcı):** migration 0004 uygulandı; `rls_smoke_3b.sql` hata vermeden tamamlandı; Notes'ta taslak oluşturma ve kaydetme çalıştı.

**AI SANDBOX QA (R2):**
- `scripts/cms/verify-intent-flow.ts` (24 kontrol, Notes ve Lab): Save → yalnızca taslak; Publish + onay → taslak + publish RPC; onaysız Publish, eksik/geçersiz intent, admin değil → hiç RPC yok. **R1 mantığı geri konduğunda aynı test 4 kontrolde başarısız olur** (hatayı yakalıyor).
- **Gerçek Chromium'da gerçek `NoteForm` ve `LabForm`** (React 19.2.5, gerçek tıklamalar): Kaydet → `intent=save`; onaylı Yayınla → `intent=publish` + `confirm_publish=on`; onaysız Yayınla → `intent=publish`, onay yok; başlıkta Enter → `save`; `requestSubmit()` → intent yok (sunucu reddeder); konsol hatası yok.
- Mevcut paketler yeniden: saf mantık (74), eylem/güvenlik/sayfa testleri, public HTML parity (12/12 bayt bayt aynı), admin izolasyonu (9/9), katı `tsc` (ortam bildirimleriyle, 117 dosya).

**Çalıştırılamayan:** `npm install`, `typecheck`, `lint`, `build`; **Next 15.5.27'nin paketlediği React ile** gerçek submit (tarayıcı testi sandbox'taki React 19.2.5 ile yapıldı); gerçek Supabase ile uçtan uca publish.

**Not: refresh token logu.** Yerel dev'de eski bir oturum çerezi `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` (400, `refresh_token_not_found`) loglayabilir. Bu beklenen fail-closed davranıştır: hata Supabase auth-js içinden loglanır ve `getUser()` ile döndürülür (fırlatılmaz); middleware sonucu incelemez, `requireAdmin()` kullanıcıyı yok sayıp `/admin/login`'e yönlendirir (`is_admin` RPC'si çağrılmaz). Çerezin temizlenmesi auth-js/@supabase/ssr'a aittir; yeniden girişle düzelir. Kodda değişiklik gerekmedi. `PackFileCacheStrategy Serializing big strings` webpack dev önbelleği uyarısıdır, işlevi etkilemez.

### FAZ 3B-A1 R3 (Taslağı At sonrası eski form değerleri)

**Bulgu (kullanıcı QA'sı, R2 gerçek Next + Supabase):** yayındaki bir notta gövdeye satır eklenip `Taslağı Kaydet`, ardından `Taslağı At` yapıldı. Durum doğru biçimde `PUBLISHED` oldu, DB'de taslak gerçekten silindi, ancak form alanları eski taslak değerini göstermeye devam etti; `Ctrl+F5` düzeltti. DB/yaşam döngüsü hatası değil, form örneğinin durumu.

**Kök neden:** kontrolsüz alanlar (`defaultValue`) + "kirli" alan davranışı; sunucu yeni `initial` gönderse de aynı form örneği yeniden kullanılır. **Sandbox'ta gerçek Chromium'da yeniden üretildi** (anahtarsız: eski taslak değeri ekranda kaldı; anahtarlı: senkron). Not: bu React sürümünde, normal tamamlanan bir action sonrası React formu kendisi sıfırlar ve hata maskelenir; hata, form sıfırlanmadığında (action `redirect` ile bitip normal tamamlanmadığında; bunu çözülmeyen bir promise ile simüle ettim) ortaya çıkar. Gerçek Next'teki tam tetikleyiciyi sandbox'ta birebir yeniden üretemedim; çözüm her iki duruma da bağımlı değil.

**AI SANDBOX QA (R3):** `scripts/cms/verify-form-key.ts` (12 kontrol); gerçek sayfa bileşenleriyle yayında → bekleyen taslak → at akışı (Notes ve Lab parity: key değişir, `initial` değerleri yayındakiyle birebir, token boşalır, slug kilidi korunur); gerçek Chromium'da gerçek formlarla anahtarsız/anahtarlı karşılaştırma ve doğrulama hatasında yazılan metnin korunması; R2 intent regresyonu (24/24 + tarayıcı 12/12) bozulmadı; public HTML parity 12/12; admin izolasyonu 9/9; katı `tsc`.

**Çalıştırılamayan:** `npm install`, `typecheck`, `lint`, `build`; gerçek Next 15.5.27 + Supabase ile uçtan uca discard akışı.

### FAZ 3B-A2 R1 (Projeler ve Site İçeriği)

**USER-VERIFIED / REAL SUPABASE (A1, kullanıcı):** migration 0004, Notes ve Lab yaşam döngüsü, intent/publish düzeltmesi (R2) ve form yeniden bağlama (R3) gerçek Next 15.5.27 + Supabase'te doğrulandı.

**Henüz doğrulanmadı (gerçek ortam):** migration **0005** uygulanmadı; `rls_smoke_3b_a2.sql` çalıştırılmadı; Projeler/Site İçeriği uçtan uca gerçek Supabase'te denenmedi.

**AI SANDBOX QA (A2):**
- `scripts/cms/verify-3b-a2-projects.ts` (33 kontrol) ve `verify-3b-a2-site.ts` (33 kontrol): doğrulama, geçersiz JSON reddi, taslak, onaylı/onaysız yayın, eksik/geçersiz intent (fail-closed), bekleyen değişiklik, discard, form anahtarı, Notes/Lab ile çekirdek parity'si. **Gerçek `src/data` içeriği** (4 proje, 3 case study, 10 site belgesi) formlardan ve JSON editöründen **alan alan kayıpsız** geçer.
- **Mutasyon testi:** 12 bilinçli bozma (intent fail-open, onay atlama, yanlış token, bilinmeyen anahtar, `javascript:` bağlantı, bilinmeyen JSON alanı, eşit taslağı bekleyen sayma, form anahtarından token çıkarma, case study zorunluluğu, JSON yutma, çekirdek intent kontrolü) betiklerce **yakalandı**.
- Gerçek sayfa bileşenleri + sahte Supabase (Projeler ve Site): liste durumları, bekleyen taslak, **discard sonrası form değerlerinin yayındakiyle birebir olması ve anahtar değişimi**, 404, admin değil → tablo okunmaz.
- **Gerçek Chromium'da gerçek `ProjectForm` ve `SiteContentForm`:** açık intent (Kaydet/Yayınla/Enter/requestSubmit), onay kutusu, discard sonrası yeniden bağlama (sert yenileme yok), doğrulama hatasında yazılanın korunması.
- A1 regresyonları (intent-flow 24, form-key 12, 3b-a1 74) ve public HTML parity (12/12 bayt bayt aynı), admin izolasyonu, katı `tsc`.
- SQL: yapısal denetim. **Postgres'te çalıştırılmadı.**

**Çalıştırılamayan:** `npm install`, `typecheck`, `lint`, `build`; 0005 ve `rls_smoke_3b_a2.sql` (gerçek Postgres); gerçek Next 15.5.27 ile uçtan uca.

### FAZ 3B-A2 R2 (smoke test düzeltmesi)

**USER-VERIFIED / REAL SUPABASE:** migration `0005` başarıyla uygulandı (`Success. No rows returned`). `rls_smoke_3b_a2.sql` (R1) bölüm 1 (anon) ve bölüm 2'yi (admin olmayan kullanıcı) geçti, bölüm 3'ün ilk shell assertion'ında `FAIL draft save must sync only slug/title on the shell (got title Full Proj, summary )` ile durdu.

**Kök neden: TEST HATASI, migration hatası değil.** Test, `create_project()`'e `summary: 's'` verip canlı shell satırında `summary = 's'` bekliyordu. `create_project()` (A1 sözleşmesi: shell = yalnızca şemanın zorunlu kıldığı alanlar) shell'e `slug, title, accent, status` yazar; `projects.summary` `NOT NULL DEFAULT ''` olduğundan zorunlu değildir ve `''` kalır. Gerçek DB'nin döndürdüğü boş `summary` doğru davranıştır. `0005` değişmedi (R1'deki dosyayla bayt bayt aynı); düzeltici migration gerekmez.

**Düzeltmeler (yalnızca `supabase/tests/rls_smoke_3b_a2.sql`):** hatalı assertion, tüm shell semantiğini sınayan kapsamlı bir kontrolle değiştirildi (slug+title yansır; status `draft`, `published_at` NULL; accent create-time değerinde kalır; summary/subtitle/size/graphic/tags/kind/type_label/category/durum etiketi/case_study/sort_order şema varsayılanında; içerik taslakta). `create_project` sonrası "özet shell'e yazılmaz, taslakta durur" kontrolü eklendi. Ön kontrol (yarım kalmış çalıştırmanın artığı) ve `about` anahtarı için belirlenimlilik (`rollback` ile geri alınan silme) eklendi.

**Aynı tip sorun için bütün test gözden geçirildi.** Betik ilk hatada durduğundan bölüm 3'ün kalanı ve bölüm 4–5 gerçek DB'de **hiç çalışmamıştı**. Her assertion gerçek `0001`/`0004` tetikleyici kodları ve `0005` fonksiyon kodlarına karşı satır satır izlendi; ayrıca `0005` fonksiyonları ve tetikleyiciler SQL'den mekanik olarak bir modele çevrilip (fonksiyon hatasında geri alma davranışı dahil) testin adımları yeniden oynatıldı: tüm bölümler beklentilerle uyumlu; eski beklenti modelde aynı hatayı üretiyor. **Bu bir Postgres çalıştırması değildir.**

### FAZ 3B-A2 R3 (doğrulama hatasında select durumu)

**Bulgu (gerçek tarayıcı QA'sı, `/admin/projects/new`):** doğrulama hatasından sonra **Tür** select'i `(seçilmedi)`'ye dönüyor; metin kutuları korunuyor.

**Kök neden:** kontrolsüz `<select defaultValue>` + React'in hata sonrası otomatik form sıfırlaması. React, yeniden render'da `defaultValue` değişimini `<select>` seçeneklerine yansıtmaz (kaynakta yalnızca `multiple` değişirse uygulanır); sıfırlama select'i ilk haline döndürür. **Gerçek Chromium'da yeniden üretildi: 12 kontrolden 10'u (tüm select'ler) kayboluyordu; checkbox'lar etkilenmiyordu.** Etki yalnızca Projects değil: **Notes (1), Lab (3) ve Site/Currently (1) select'leri de** aynı kusura sahipti (A1'den beri; A1 R3'te form durumunu yalnızca metin alanlarıyla doğrulamıştım).

**Düzeltme:** tek ortak `FormSelect` (değere göre anahtarlı); 4 formdaki 10 select buna geçirildi. Sunucu, `form-key`, yaşam döngüsü ve DB koduna dokunulmadı.

**AI SANDBOX QA (R3):** `scripts/cms/verify-form-state.ts` (14 kontrol; FormSelect sözleşmesi, ham `<select>` yasağı taraması, sunucunun select/checkbox değerlerini geri yollaması create ve save yolunda, manuel QA JSON'unun geçerliliği, QA akışı); mutasyon testleri yakalıyor. **Gerçek Chromium'da gerçek formlarla:** düzeltme öncesi 10 başarısız → sonrası 12/12 korunuyor; çok turlu hata senaryoları; A1 intent (Notes/Lab), form-key ve A2 Projects/Site tarayıcı paketleri yeniden geçti. **Çalıştırılamayan:** gerçek `npm run typecheck/lint/build`; gerçek Next 15.5.27'de tarayıcı testi (sandbox React 19.2.5).
