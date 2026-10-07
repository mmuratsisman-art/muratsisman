# Supabase migration iş akışı

## Mevcut durum

`0001_cms_schema.sql`, `0002_cms_rls.sql`, `0003_cms_storage.sql` proje sahibi tarafından **gerçek Supabase projesinde, SQL Editor ile sırayla uygulanmıştır** (`Success. No rows returned`) ve `tests/rls_smoke.sql` PASS vermiştir. Bu üç dosya **uygulanmış sayılır: içeriğini değiştirmeyin** (stil/refactor dahil).

`0004_faz3b_drafts_and_publish.sql` (FAZ 3B-A1) gerçek Supabase'te uygulanmıştır; **içeriğini değiştirmeyin**.

`0005_faz3b_projects_site_content.sql` (FAZ 3B-A2) **hazırlandı, henüz hiçbir veritabanına UYGULANMADI**. Gerçek Supabase'te sizin tarafınızdan, kontrollü olarak çalıştırılacaktır. **0005 zorunludur**: `project_drafts` tablosu ve proje yaşam döngüsü fonksiyonları 0004'te yoktur (A1'de bilinçli olarak ertelenmişti), ve site içeriği için compare-and-set kaydet / kontrollü yayınla / at fonksiyonları gerekir.

## 0005 nasıl uygulanır (FAZ 3B-A2)

1. 0005 yalnızca *ekleyicidir*: 1 tablo (`project_drafts`), 6 proje fonksiyonu, 3 site içeriği fonksiyonu. Mevcut satırları, tabloları, politikaları, tetikleyicileri ve fonksiyonları (0001–0004) değiştirmez/silmez. Mümkünse önce bir geliştirme projesinde deneyin.
2. SQL Editor'de `supabase/migrations/0005_faz3b_projects_site_content.sql` içeriğinin **tamamını** çalıştırın. Beklenen: `Success. No rows returned`. İkinci kez çalıştırmayın (idempotent değildir; `already exists` ile durur, veri silmez).
3. **Doğrulama**: `supabase/tests/rls_smoke_3b_a2.sql` dosyasını çalıştırın. Beklenen: `NOTICE: ALL 3B-A2 SMOKE TESTS PASSED`, hiç `FAIL` istisnası yok. Tek transaction'dadır ve `rollback` eder. **Not:** test, belirlenimli olması için `hero` ve `lab_page` anahtarlarının site içeriği satırlarını transaction içinde siler; bu silmeler `rollback` ile geri alınır (gerçek içeriğiniz etkilenmez). Önceki testler (`rls_smoke.sql`, `rls_smoke_3b.sql`) hâlâ geçmelidir.
4. **Önce migration, sonra uygulama sürümü** (uygulama 0005 fonksiyonlarını çağırır; sürüm önce çıkarsa Projeler/Site kaydı hata verir, Notes/Lab etkilenmez).

**Smoke testi yeniden çalıştırırken:** önceki çalıştırma bir `FAIL` ile yarım kaldıysa önce bir kez `rollback;` çalıştırın. Test, başta bir **ön kontrol** yapar: artık test verisi (`t3b2-%` projeleri, test kullanıcıları) varsa `FAIL PRE-FLIGHT` ile durur ve ne yapılacağını söyler. Smoke test, `0005`'in yazdığı davranışı sınar; `create_project()` shell'e yalnızca `slug`, `title`, `accent` ve `status` yazar, içerik (özet dahil) yalnızca taslak dokümandadır (bkz. `docs/cms/LIFECYCLE.md`).

## 0005 geri alma

`0005_faz3b_projects_site_content_down.sql`: **elle** çalıştırılır. Yalnızca 0005 nesnelerini kaldırır (9 fonksiyon + `project_drafts`). Veri etkisi: bekleyen proje taslakları silinir; admin'den oluşturulmuş projelerin shell satırları kalır; `site_content_*` satırlarına dokunulmaz. Dosyanın başındaki uyarıyı okuyun.

## 0004 nasıl uygulanır (FAZ 3B-A1)

1. **Yedek/önlem**: 0004 yalnızca *ekleyicidir* (mevcut satırları değiştirmez/silmez, 0001–0003 nesnelerini yeniden tanımlamaz). Yine de önce bir geliştirme projesinde denemeniz önerilir.
2. SQL Editor'ü açın, `supabase/migrations/0004_faz3b_drafts_and_publish.sql` içeriğinin **tamamını** yapıştırıp çalıştırın. Beklenen: `Success. No rows returned`.
   - Betik tek istek olarak gönderildiğinden bir ifade hata verirse çalıştırma geri alınır; kısmi uygulama şüphesinde önce durumu kontrol edin (Table Editor: `note_drafts` ve `lab_entry_drafts` var mı?).
   - İkinci kez çalıştırmayın (idempotent değildir; ilk `create trigger/table`'da `already exists` ile durur, veri silmez).
3. **Doğrulama**: `supabase/tests/rls_smoke_3b.sql` dosyasını SQL Editor'de çalıştırın. Beklenen: `NOTICE: ALL 3B-A1 SMOKE TESTS PASSED`, hiçbir `FAIL` istisnası yok. Dosya kendi transaction'ını `rollback` eder (üretim içeriğine dokunmaz). Not: `now()` bir transaction içinde sabit olduğundan zamana bağlı eskime senaryoları test içinde simüle edilir; gerçek çok-istekli davranış için `docs/cms/LIFECYCLE.md` içindeki manuel QA listesini uygulayın.
4. Ardından uygulama sürümünü (3B-A1) yayınlayın. **Önce migration, sonra uygulama** (uygulama 0004 fonksiyonlarını çağırır).

## 0004 geri alma

`0004_faz3b_drafts_and_publish_down.sql`: **elle** çalıştırılır, hiçbir zaman otomatik değil. Yalnızca 0004'ün eklediği nesneleri kaldırır; mevcut tablolarda (`projects`, `lab_entries`, `notes`) yalnızca 0004'ün eklediği **tetikleyicileri** düşürür, tabloları değil. Dikkat: bekleyen taslak dokümanları silinir ve admin'den oluşturulmuş içeriklerin shell satırları (placeholder içerikli, hiç public olmamış) tablolarda kalır. Dosyanın başındaki uyarıyı okuyun.

## Kurallar (tüm migration'lar)

1. **Bir kez, sırayla** uygulanır: `0001 → 0002 → 0003`.
2. **Uygulanmış bir migration asla düzenlenmez.** Değişiklik gerekirse **yeni, ekleyici** bir dosya eklenir (`0004_*.sql`, `0005_*.sql` ...). Bu, canlı veritabanı ile depo arasında sapmayı önler.
3. Migration'lar bilerek **idempotent değildir** (`create table`, `create policy`, `create trigger`, `create index`). Yanlışlıkla ikinci kez çalıştırılırsa ilk bu tür ifadede `already exists` hatasıyla durur. **Yıkıcı değildir**: dosyalarda `drop`, `truncate` veya `delete from` yoktur; yeniden çalıştırmak veri silemez.
   - Yeniden çalıştırılabilen kısımlar: `create or replace function`, `enable row level security`, `grant/revoke`, bucket `on conflict do update`.
   - SQL Editor betiği tek istek olarak gönderdiği için hata durumunda ilgili çalıştırma geri alınır; yine de kısmi uygulama şüphesinde önce durumu kontrol edin (`\d`/Table Editor, Policies sayfası).
4. **Önce geliştirme, sonra production.** Üretim veritabanına dokunmadan önce değişikliği ayrı bir (ücretsiz) geliştirme projesinde deneyin ve `tests/rls_smoke.sql`'i çalıştırın.
5. Her şema/RLS/storage değişikliğinden sonra `tests/rls_smoke.sql` yeniden çalıştırılır; yeni davranış için test eklenir.
6. **Service-role anahtarı** bu iş akışının hiçbir adımında depoya, uygulamaya veya Vercel'e girmez. SQL Editor oturumun kendi yetkisiyle çalışır.

## Uygulama yolları

- **SQL Editor** (şu an kullanılan): dosya içeriğini yapıştırıp çalıştırın.
- **Supabase CLI** (isteğe bağlı): `supabase link` + `supabase db push`. Proje GitHub entegrasyonuna bağlı değildir; migration'lar elle uygulanır.

## Notlar

- Projede "Automatically expose new tables" kapalı olduğundan `0002`'deki **açık `grant` satırları zorunludur** (Data API yalnızca bu izinlerle ve RLS'le erişir). Yeni tablo eklerken (`0004+`) aynı şekilde `grant` + RLS politikası ekleyin.
- Silme davranışı: `on delete cascade` yalnızca `admin_users → auth.users` bağında vardır (kullanıcı silinirse allowlist satırı da gider); medya ve yazar bağlarında `on delete set null`.
