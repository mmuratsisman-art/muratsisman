# Supabase Kurulum Rehberi (FAZ 3A)

Bu adımlar **şimdi zorunlu değildir**: Supabase olmadan site ve `typecheck / lint / build` çalışır. Admin'i denemek istediğinizde uygulayın.

1. **Proje oluşturun** (supabase.com). Bölgeyi kullanıcı kitlenize yakın seçin.
2. **Kayıtları kapatın**: Authentication → Sign In / Providers → *Allow new users to sign up* = kapalı. MFA'yı etkinleştirin.
3. **Migration'ları sırayla çalıştırın** (SQL editor): `0001_cms_schema.sql` → `0002_cms_rls.sql` → `0003_cms_storage.sql`.
   (Supabase CLI kullanıyorsanız `supabase/migrations` zaten CLI düzenindedir: `supabase db push`.)
4. **Test**: `supabase/tests/rls_smoke.sql` dosyasını çalıştırın. Hiçbir `FAIL` istisnası olmadan bitmeli (sahibi gerçek projede çalıştırdı: PASS). Dosya kendi transaction'ını `rollback` eder.
5. **Sahip kullanıcıyı oluşturun**: Authentication → Users → *Add user* (e-posta + parola).
6. **Admin yetkisi verin** (SQL editor):
   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'SIZIN_EPOSTANIZ';
   ```
7. **Ortam değişkenleri** (adlar için `.env.example`):
   - Yerel: `.env.local` içine `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   - Vercel: aynı iki değişken (Production + Preview). **Service-role anahtarını eklemeyin.**
8. `npm install` (yeni bağımlılıklar: `@supabase/ssr`, `@supabase/supabase-js`) → `npm run dev` → `http://localhost:3000/admin`.

## Beklenen davranış

| Durum | `/admin` |
|---|---|
| Env yok, production | 404 |
| Env yok, development | "Admin yapılandırılmadı" mesajı |
| Env var, oturum yok | `/admin/login`'e yönlendirir |
| Giriş yapıldı, `admin_users`'ta değil | "Erişim yok" + çıkış |
| Giriş yapıldı, admin | Admin kabuğu |

## Not

`package-lock.json` depoda **bulunmalı ve commit edilmelidir**. FAZ 3A için yeni bağımlılıklar (`@supabase/ssr`, `@supabase/supabase-js`) `npm install` ile lock'a işlenmiştir. Bu ZIP'te lock dosyası yoktur; yerelde üretilen dosyayı proje köküne koyun (bkz. `VERIFICATION.md`).

Migration'lar bu projede **bir kez, sırayla** uygulanmıştır: bkz. `supabase/README.md`.
