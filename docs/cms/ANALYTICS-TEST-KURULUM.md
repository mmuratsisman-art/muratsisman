# Analytics — TEST Supabase kurulum rehberi ve etkinleştirme sırası

> **Kural:** Önce yalnızca **TEST** Supabase projesinde doğrulayın. **Production'a migration uygulanmaz, production ortam değişkenleri değiştirilmez, WAF kuralı ve production etkinleştirmesi ayrı onay gerektirir.**
> Bu rehberdeki hiçbir adımı geliştirme aracı (Claude) yapmaz; hepsi sizin tarafınızdan elle yapılır.

## A. TEST projesi hazırlığı (tek seferlik)

1. Ayrı bir Supabase **TEST** projesi kullanın (production'dan bağımsız). Bu projede `0001`–`0006` zaten uygulanmış olmalı (içerik şeması); değilse `supabase/README.md` sırasını izleyin.
2. **Authentication → Sign In / Providers → "Allow new users to sign up" = KAPALI** olduğunu doğrulayın.
3. SQL Editor'de `supabase/migrations/0007_analytics.sql` dosyasının **tamamını** çalıştırın. Beklenen: `Success. No rows returned`. İkinci kez çalıştırmayın (idempotent değildir; `already exists` ile durur).
4. **Smoke testi:** SQL Editor'de `supabase/tests/rls_smoke_analytics.sql` çalıştırın. Beklenen NOTICE: `ALL ANALYTICS SMOKE TESTS PASSED`. Test tek işlemde çalışır ve ROLLBACK ile biter (veri kalmaz). Bir `FAIL` ile yarım kalırsa önce bir kez `rollback;` çalıştırıp yeniden deneyin.
   - Bu test özellikle şunları sınar: `anon` hiçbir şey yapamaz; yazıcı olmayan `authenticated` yapamaz; **yazıcı hesabı mevcut her admin RPC'sinde `42501` ile reddedilir**; admin hesabı `record_hit` çağıramaz; günlük tavanlar; satır silince anında iptal; tablolarda RLS açık/politika yok/API hakkı yok; fonksiyonlarda `search_path = ''`.

## B. Yazıcı hesabı (TEST)

1. **Authentication → Users → Add user**: **sizin kontrolünüzdeki** bir e-posta ve ≥ 32 karakter rastgele parola; "Auto Confirm User" işaretli. (Bu hesabı `admin_users`'a **eklemeyin**.)
2. Kullanıcının UUID'sini kopyalayın ve SQL Editor'de ekleyin:
   ```sql
   insert into public.analytics_writers (user_id) values ('<yazıcı-kullanıcı-uuid>');
   ```
   (Admin hesabını eklemeye çalışırsanız tetikleyici reddeder.)
3. Kontrol: `select count(*) from public.analytics_writers w join public.admin_users a using (user_id);` → **0** olmalı.

## C. Yerel/TEST uygulama değişkenleri

Değerleri yalnızca yerel `.env.local` veya TEST ortamına girin (depoya asla):

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   → TEST projesinin değerleri
ANALYTICS_HASH_SECRET      → ≥ 32 karakter rastgele
ANALYTICS_WRITER_EMAIL / ANALYTICS_WRITER_PASSWORD
ANALYTICS_ENABLED=1
ANALYTICS_WAF_CONFIRMED=1  → TEST'te yerel doğrulama için; bu bir beyandır, gerçek WAF doğrulaması değildir
NEXT_PUBLIC_ANALYTICS_BEACON=1   → derleme zamanında
CONTENT_SOURCE=cms
```

## D. TEST doğrulama kontrol listesi

- [ ] `npm run build` ve `npm run lint` ve `npm run typecheck` geçiyor.
- [ ] Bayraklar kapalıyken: tarayıcı ağ sekmesinde `/api/hit` isteği **yok**; sunucuda yazma yok.
- [ ] Bayraklar açıkken bir proje sayfası açın → ağ sekmesinde tek `POST /api/hit` → `204`. `analytics_daily` tablosunda (SQL Editor) bir satır artar.
- [ ] Tarayıcıda **Global Privacy Control** veya **Do Not Track** açık → hiçbir istek gitmez.
- [ ] Showcase bağlantısına tıklayın (yeni sekmede açılır; `rel="noopener noreferrer"` korunur) → `kind='showcase'` sayaç artar.
- [ ] Admin ve önizleme sayfaları gezildiğinde sayaç ARTMAZ.
- [ ] `/admin/analytics`: kartlar, grafik, tablolar görünür; admin olmayan hesapla 404/erişim yok.
- [ ] Yazıcıyı geçici olarak silin (`delete from analytics_writers ...`) → yeni ziyaretler sayılmaz (uygulama hata vermez); yeniden ekleyin.
- [ ] Sahte istek denemesi: `curl -X POST …/api/hit` (Origin yok) → `204` ama sayaç artmaz.
- [ ] Veritabanında IP/User-Agent/hash tutulmadığını doğrulayın: `\d analytics_daily`, `\d analytics_day`.
- [ ] Çıktıyı (hata mesajları dahil, **sırsız**) geliştirme tarafına iletin.

## E. Production etkinleştirme sırası (HER ADIM AYRI ONAY)

| Kapı | Adım | Not |
|---|---|---|
| **G1** | TEST doğrulaması tamamlandı ve raporlandı | Yukarıdaki liste |
| **G2** | Production migration `0007` (siz uygularsınız) + `rls_smoke_analytics.sql` **yalnızca test amaçlı rollback'li** çalıştırma kararı | Önce yedek/zaman planı; `_down` hazır |
| **G3** | Production'da yazıcı kullanıcı + `analytics_writers` satırı; Vercel ortam değişkenleri (**`ANALYTICS_ENABLED` BOŞ/KAPALI** bırakılarak) | Kod bayraklar kapalıyken deploy edilebilir: etkisi yoktur |
| **G4** | Vercel WAF hız sınırı kuralı: `/api/hit`, IP başına örn. 60 istek/dk. Önce **Log**, doğrulayın, sonra **Deny** | Hobby: proje başına 1 kural, sabit pencere, sayaçlar bölge başına |
| **G5** | `ANALYTICS_WAF_CONFIRMED=1`, `ANALYTICS_ENABLED=1`, sonra `NEXT_PUBLIC_ANALYTICS_BEACON=1` (yeniden deploy) | Bayrak sırası: önce uç nokta, sonra tarayıcı |

**Geri alma / acil durdurma:** `ANALYTICS_ENABLED`'ı kaldırın (uç nokta anında pasif). Tarayıcı isteğini de kesmek için `NEXT_PUBLIC_ANALYTICS_BEACON`'ı kaldırıp yeniden deploy edin. Yazıcıyı iptal etmek için `delete from public.analytics_writers where user_id = …`. Tüm nesneleri kaldırmak için `0007_analytics_down.sql` (toplanan sayaçlar silinir).
