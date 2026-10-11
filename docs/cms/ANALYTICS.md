# Ziyaretçi istatistikleri (Visitor Analytics) — FAZ 1

Sade, Supabase tabanlı, admin paneline entegre ziyaretçi sayacı. **Varsayılan KAPALIDIR**: bayraklar ve sırlar tanımlanmadan hiçbir veri toplanmaz.
Kurulum ve etkinleştirme adımları: [`ANALYTICS-TEST-KURULUM.md`](./ANALYTICS-TEST-KURULUM.md). Migration: `supabase/migrations/0007_analytics.sql` (+ `_down`).

## 1. Ne ölçülür

| Metrik | Kaynak | Not |
|---|---|---|
| Toplam / bugünkü / son 7 / son 30 gün sayfa görüntüleme | `analytics_daily` (kind = `page`) | Günlük toplam sayaçlardan |
| Günlük yaklaşık tekil ziyaretçi | `analytics_day.uniq_bits` | **Yalnızca günlük.** 7/30 günlük tekil hesaplanmaz ve gösterilmez |
| Günlük ziyaret grafiği | `analytics_daily` | SVG, bağımlılıksız |
| En çok görüntülenen sayfalar | `analytics_daily` | Seçili aralıkta ilk 10 |
| Showcase bağlantısı tıklamaları | `analytics_daily` (kind = `showcase`) | Proje slug'ı başına; URL saklanmaz |

Sayfalar: `/`, `/lab`, `/notes`, `/projects/<slug>`, `/lab/<slug>`, `/notes/<slug>` (yalnızca **yayınlanmış** içerik). Admin ve önizleme sayılmaz.

## 2. Mimari ve veri akışı

```
Tarayıcı (HitBeacon; yalnızca NEXT_PUBLIC_ANALYTICS_BEACON=1 ile DERLENMİŞSE)
   └─ fetch(keepalive, credentials: omit) POST /api/hit  {"k":"p"|"s","p":"<yol|slug>"}
Next.js route handler (Node runtime; middleware yalnızca /admin için olduğundan dışındadır)
   1. etkinleştirme kapısı (bayraklar + sırlar yoksa: hiçbir iş yapmadan 204)
   2. ucuz süzgeçler: yöntem, GPC/DNT, içerik türü, boyut, Origin/Sec-Fetch-Site, bot UA
   3. gövde ayrıştırma (yalnızca {k,p}) ve yol/slug doğrulama + yayınlanmış içerik varlığı
   4. örnek başına kaba hız sınırı ve "tavan doldu" belleği
   5. kova = HMAC-SHA256(ANALYTICS_HASH_SECRET, gün|IP|UA) → yalnızca ilk 16 bit
   6. yazıcı hesabıyla rpc('record_hit', kind, path, kova)       ← IP/UA bu noktadan öteye gitmez
   └─ her durumda 204 (ret nedeni dışarı verilmez)
Postgres (SECURITY DEFINER, search_path = '')
   record_hit: yazıcı mı? (analytics_writers) → tür/yol/yayınlanmış içerik doğrulama → günlük tavanlar → sayaç + bit işareti
   analytics_summary: yalnızca is_admin()
Admin: /admin/analytics → requireAdmin() → analytics_summary()
```

- **Service-role anahtarı kullanılmaz.** Yazıcı, sıradan bir `authenticated` Supabase Auth kullanıcısıdır (admin DEĞİL). Yetkisi yalnızca veritabanındaki `analytics_writers` kaydından ve `record_hit()` fonksiyonundan gelir.
- **`anon` için hiçbir analytics yazma/okuma yetkisi yoktur** (tablo da fonksiyon da). Supabase `anon` anahtarı herkese açıktır; bu yüzden uç noktadaki doğrulama tek başına koruma sayılmaz: RPC kendi içinde de yetki, tür, yol ve yayınlanmış içerik doğrular.
- **Mevcut CMS admin yetkileri ve RLS kuralları değişmez.** 0007 yalnızca yeni nesneler ekler (3 tablo, 3 fonksiyon, 1 tetikleyici).

## 3. Yazıcı hesabı

- Ayrı, **admin olmayan** bir Supabase Auth kullanıcısı. `analytics_writers(user_id)` tablosunda kayıtlıysa `record_hit` çağırabilir. Admin hesabı yazıcı olarak eklenemez (tetikleyici reddeder) ve admin hesabı `record_hit` çağıramaz.
- **Anında iptal:** `analytics_writers` satırını silmek yeterli. Kontrol her çağrıda yapılır; mevcut JWT süresi dolmasa bile erişim o an kapanır.
- **Yetkisi ne kadar dar?** Yazıcı, diğer her `authenticated` kullanıcı gibi yalnızca yayınlanmış içeriği okuyabilir. CMS tablolarına yazamaz (RLS `is_admin()` ister) ve her admin RPC'si içeride `is_admin()` ile fail-closed reddeder. `supabase/tests/rls_smoke_analytics.sql` bunu **her SECURITY DEFINER admin fonksiyonunu tek tek çağırarak** doğrular.
- **Parola:** ≥ 32 karakter rastgele; yalnızca sunucu ortam değişkeni (`NEXT_PUBLIC_` DEĞİL). **Rotasyon:** Supabase panelinde parolayı değiştir → Vercel değişkenini güncelle → yeniden deploy. Sızıntı şüphesinde önce `analytics_writers` satırını silin (anında iptal), sonra parolayı değiştirin.
- **E-posta:** yazıcı e-postası **sizin kontrolünüzdeki** bir kutuya ait olmalı; aksi halde başkası "parolamı unuttum" ile hesabı ele geçirebilir. Yeni kayıtlar kapalı olmalıdır (`SETUP.md`).
- **Oturum:** modül belleğinde tutulur, süre dolmadan 60 sn önce yeniden giriş yapılır, eşzamanlı istekler tek girişi paylaşır, giriş başarısızsa 2 dk devre kesici açılır (Auth'a yağmur yağmaz; o sürede sayım düşer, site etkilenmez). Parola/token loglanmaz.

## 4. Gizlilik (KVKK) ve veri minimizasyonu

**Saklanmayanlar:** IP adresi, User-Agent, hash, ziyaretçi/oturum kimliği, çerez, `localStorage`/`sessionStorage`, parmak izi. Bunların hiçbiri veritabanına, loglara veya RPC parametrelerine yazılmaz.

**Saklananlar (veri envanteri):**

| Veri | Tablo | İçerik | Kişisel veri mi? | Saklama |
|---|---|---|---|---|
| Günlük sayaç | `analytics_daily` | gün, tür (page/showcase), yol veya proje slug'ı, sayı | Hayır (toplam) | Süresiz (rollback ile silinir) |
| Günlük yaklaşık tekil | `analytics_day` | gün, toplam, tavan bayrağı, 65.536 bitlik bit dizisi | Hayır: yalnızca "bu kova dolu" bilgisi; bir kişiye geri bağlanamaz (kova 16 bit; çok kişiyle paylaşılır) | Süresiz |
| Yazıcı izin listesi | `analytics_writers` | hizmet hesabının kullanıcı kimliği | Hayır (ziyaretçi verisi değil) | Hesap ömrü |

**Geçici işlenen veri:** IP ve User-Agent, yalnızca sunucu fonksiyonunun belleğinde günlük kovayı hesaplamak için kullanılır; yanıt gönderilince atılır. Hash gün tarihini içerir; aynı kişi ertesi gün farklı kovaya düşer, **günler arası bağlanamaz**. 16 bitlik kova numarasından bir kişiye ulaşılamaz.
Not: Vercel kendi altyapı loglarında istek IP'sini tutabilir; bu analytics'ten bağımsızdır ve bu uygulamanın kontrolünde değildir.

**Tercih saygısı:** `Sec-GPC: 1` / `DNT: 1` başlığı gönderen veya tarayıcıda `navigator.globalPrivacyControl` / `doNotTrack` bildiren ziyaretçi **hiç sayılmaz** (hem istemcide hem sunucuda kontrol edilir).

**Yaklaşık tekil ziyaretçi:** 65.536 bitlik bit dizisi + linear counting (`n ≈ −m·ln(boş/m)`). İstatistiksel standart hata ≈ %0,3 (50–50.000 aralığında); gerçek hata kaynağı kimlik gürültüsüdür: aynı ağdaki (NAT) kişiler tek, IP/tarayıcı değiştirenler birden fazla sayılır; JS çalıştıran botlar sayılır; DNT/GPC gönderenler sayılmaz. ~50.000/gün üstünde dizi doyar (bu site için pratikte ilgisiz; dolarsa `null` döner ve arayüz "—" gösterir). **7/30 günlük tekil hesaplanmaz ve gösterilmez**: günlük tekillerin toplamı gerçek tekil ziyaretçi değildir.

**KVKK için sahibin yapması/teyit ettirmesi gerekenler** (hukuki görüş değildir; bir hukukçuyla doğrulayın):
1. **Aydınlatma metni:** veri sorumlusu kimliği; amaç (site kullanımına ilişkin toplu istatistik); IP/User-Agent'ın geçici işlenip saklanmadığı; çerez/depolama kullanılmadığı; işleyenler (Vercel, Supabase) ve veri bölgeleri; ilgili kişi hakları ve başvuru yolu. *(Bu depoda bir gizlilik sayfası bulunmuyor.)*
2. **Hukuki sebep** değerlendirmesi (ör. meşru menfaat, KVKK m.5/2-f) ve gerekiyorsa dengeleme testi notu.
3. **Yurt dışına aktarım:** Vercel fonksiyonunun çalıştığı bölge ve Supabase proje bölgesi; IP'nin geçici işlendiği yer.
4. **VERBİS** yükümlülüğünün sizin için geçerli olup olmadığı.
5. Çerez/depolama kullanılmadığı için onay bandı gerekmediği görüşünün teyidi.
6. Bu belgedeki **veri envanterini** kurumsal envanterinize işleyin; saklama süresi tablosu yukarıdadır.

## 5. Güvenlik katmanları (ve sınırları)

| Katman | Ne yapar | Sınırı |
|---|---|---|
| Etkinleştirme kapısı | Bayraklar/sırlar yoksa endpoint hiçbir iş yapmaz; beacon derlenmemişse tarayıcıya hiçbir şey gitmez | `ANALYTICS_WAF_CONFIRMED` **gerçek WAF doğrulaması DEĞİL, manuel onay bayrağıdır**; uygulama WAF yapılandırmasını okuyamaz |
| Vercel WAF hız sınırı (siz kurarsınız) | IP başına `/api/hit` isteklerini fonksiyon çalışmadan keser | Sayaçlar bölge başınadır; Hobby'de 1 kural; planınıza göre doğrulayın |
| Endpoint süzgeçleri | Yöntem, GPC/DNT, içerik türü, boyut (≤ 512 B), Origin/Sec-Fetch-Site, bot UA, yol biçimi, yayınlanmış içerik varlığı. Reddedilen istek **Auth/DB çağrısı yapmaz** | Başlıklar betikle taklit edilebilir |
| Örnek başına sınırlayıcı + "tavan doldu" belleği | DB çağrı patlamasını keser (dakikada 120, tavan sonrası 5 dk susar) | Sunucusuz örnekler geçicidir; kaba korumadır |
| RPC doğrulaması | Yetki, tür, yol, yayınlanmış içerik, showcase'in gerçekten tanımlı olması | — |
| RPC günlük tavanları | **Toplam 20.000, sayfa başına 5.000, showcase başına 2.000** (Europe/Istanbul günü). Aşılırsa sayım durur, `capped` işaretlenir, admin ekranında uyarı çıkar | Tavan, sahte trafiğin gerçek ziyaretçiyi **dışarıda bırakmasına** yol açabilir |

**Sahte isteklerle sayımın şişirilmesi tamamen önlenemez.** `/api/hit` herkese açıktır ve tüm başlıklar taklit edilebilir; yazıcı kimlik bilgileri yalnızca *kimin RPC'yi çağırabileceğini* sınırlar, *uç noktaya kimin POST yapabileceğini* değil. Bu katmanlar sıradan kötüye kullanımı ve maliyeti sınırlar; JS çalıştıran botlar ve hedefli sahte trafik sayıları şişirebilir. Rakamlar **yaklaşıktır** ve karar için kesin veri değildir. Yapısal sınır: depolama büyümesi içerik sayısı × gün ile sınırlıdır (satır sayısı yayınlanmış içerikle sınırlı); asıl maliyet kalemi sunucusuz fonksiyon çağrı sayısıdır.

## 6. Etkinleştirme bayrakları

| Değişken | Zaman | Anlam |
|---|---|---|
| `NEXT_PUBLIC_ANALYTICS_BEACON=1` | **Derleme** (değişince yeniden deploy) | Tarayıcı beacon'ı yüklenir. Yoksa tarayıcıya hiçbir şey gitmez |
| `ANALYTICS_ENABLED=1` | Çalışma zamanı | Endpoint ana şalteri |
| `ANALYTICS_WAF_CONFIRMED=1` | Çalışma zamanı | "WAF kuralı yayında" beyanı (manuel) |
| `ANALYTICS_HASH_SECRET` | Çalışma zamanı | ≥ 32 karakter, rastgele |
| `ANALYTICS_WRITER_EMAIL`, `ANALYTICS_WRITER_PASSWORD` | Çalışma zamanı | Yazıcı hesabı |

Admin ekranı "Toplama AÇIK/KAPALI" durumunu ve eksik değişken **adlarını** gösterir (değerleri asla).

## 7. Bilinen sınırlamalar

- Sayım, **CMS içerik kaynağında** (`CONTENT_SOURCE=cms`) anlamlıdır: RPC yolları veritabanındaki yayınlanmış satırlara karşı doğrular. `static` modunda dosya tabanlı slug'lar veritabanında yoksa reddedilir.
- Sitenin sahibinin kendi ziyaretleri sayılır (admin ve önizleme hariç).
- JS çalıştırmayan ziyaretçiler ve beacon'ı engelleyen tarayıcılar sayılmaz.
- Günlük satırlar süresiz saklanır (kişisel veri içermez). Silmek için `0007_analytics_down.sql` veya ilgili `DELETE`.
- Gerçek tarayıcıda beacon davranışı, gerçek Supabase Auth girişi ve WAF bu depodaki testlerle **doğrulanmaz** (bkz. test kurulum rehberi).
