# Supabase migration iş akışı

## Mevcut durum

`0001_cms_schema.sql`, `0002_cms_rls.sql`, `0003_cms_storage.sql` proje sahibi tarafından **gerçek Supabase projesinde, SQL Editor ile sırayla uygulanmıştır** (`Success. No rows returned`) ve `tests/rls_smoke.sql` PASS vermiştir. Bu üç dosya **uygulanmış sayılır: içeriğini değiştirmeyin** (stil/refactor dahil).

## Kurallar

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
