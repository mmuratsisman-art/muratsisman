# FAZ 3B-F0 — Ölçüm Düzeneği (Measurement Rig)

Amaç: CMS public içerik katmanının **gerçek Next.js production davranışını** (TTL, stale-while-revalidate, etiketle geçersiz kılma, Supabase hata davranışı, HTTP 200/404/500) **sahte bir Supabase** ile, **izole bir kopyada** ölçmek. Uygulama kodu değiştirilmez (F1 bu pakette YOK).

> Bu paket kendiliğinden hiçbir şey çalıştırmaz. Varsayılan komut **kuru çalıştırmadır**. Gerçek ölçüm (`--run`) yalnızca sizin elle vermenizle başlar.

## Tek komutla çalıştırma (Windows Git Bash, proje kökünden)

```bash
# 1) Kuru çalıştırma — hiçbir şey kopyalamaz/derlemez/başlatmaz; ön koşulları ve planı yazar
npx tsx scripts/f0/run-f0.ts

# 2) Next gerektirmeyen öz-testler (guard, sahte sunucu, sandbox, env allowlist, mock senaryo mantığı)
npx tsx scripts/f0/run-f0.ts --selftest

# 3) Gerçek ölçüm (sandbox kopyası + next build + next start; ~20 dk, --quick ile daha kısa)
npx tsx scripts/f0/run-f0.ts --run
```

Seçenekler: `--quick` (kısa beklemeler), `--only M01,M04` (seçili senaryolar), `--keep-sandbox` (sandbox'ı silme; bkz. uyarı).

Ön koşul: `node_modules` sizin tarafınızdan kurulmuş olmalı (`npm ci`). **Bu araç paket kurmaz.** `node_modules` yoksa `--run` 3 koduyla durur.

Çıktı: `.f0-sandbox/reports/<runId>/F0-RESULTS.md`, `f0-results.json`, `egress-guard.jsonl`, `logs/`. Yalnızca çalışma kopyaları (`.f0-sandbox/<runId>-*`) silinir; **rapor klasörü kalır** (yalnız .md/.json/.log/.jsonl içerir, tsconfig'e takılmaz). Rapor Türkçedir; sonuçlar **PASS / FAIL / NOT RUN** olarak ayrılır. Yol çalışma sonunda yazdırılır.

### Öz-test sonuç dili (Fix 1)
`--selftest` çıktısı **PASS / FAIL / NOT RUN** sayar. Windows'ta dizin bağlantısı **junction** ile (yönetici/Developer Mode gerektirmez) sınanır; gerçek **symlink** oluşturulamazsa o test `NOT RUN` yazılır (PASS sayılmaz, güvenlik kontrolü gevşetilmez). Başarısız testlerin ileti metni artık kesilmeden, beklenen/gerçek değerlerle yazdırılır.

### Çevrimdışı font build'i (Fix 3)
`src/app/layout.tsx` `next/font/google` ile 3 fontu build sırasında Google'dan indirmeye çalışır; egress guard bunu doğru biçimde engeller. Çözüm **yalnızca sandbox build'lerinde**:
- Next'in test amaçlı `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` değişkeni, `.f0-sandbox/run-<id>/f0-font-mock/google-fonts-mock.cjs` dosyasını gösterir (`scripts/f0/font-mock/` içindeki şablonun kopyası). CSS yerelden gelir; font dosyası içeriği yerel/belirleyici yer tutucudur (adresler `.invalid`, ağa çıkılamaz). Tanınmayan URL için mock yanıt vermez → Next "Missing mocked response" ile durur (sessizce ağa çıkmaz).
- Değişken yalnızca `next build` ortamına verilir; `next start` ortamında YOKTUR. `layout.tsx` ve diğer kaynaklar değişmez (M10: sandbox `src` = proje `src`, yalnız probe rotası farklı).
- `--run` başında salt okunur ön denetim: kurulu Next font yükleyicisinde bu değişken bulunamazsa (`unsupported`) build BAŞLATILMAZ.
- Egress guard gevşetilmedi; font nedeniyle engellenen bağlantı olursa M00/M10 FAIL verir.

### Sandbox gizli dosya denetimi iki aşamalıdır
`copy` (kopya hemen sonrası): `.next` ve `node_modules` dâhil hiçbir yasak ad bulunamaz. `built` (build sonrası, M10): yalnızca kökte sandbox içinde gerçek `.next` dizini ve proje `node_modules`'üne bağlantı beklenir; `.env*`, `.git`, `.vercel`, `*.pem`, `*.key` ve iç içe `.next`/`node_modules` yine yasaktır.

### Çoklu lockfile uyarısı
Sandbox proje klasörünün içinde olduğundan Next hem `.f0-sandbox/.../package-lock.json` hem de proje kökündeki `package-lock.json`'u görüp "inferred your workspace root / multiple lockfiles" uyarısı verebilir. Bu yalnızca çıktı izleme (file tracing) kökünü etkiler; `next start`, önbellek ve rotaları etkilemez. Uyarıyı gidermek `next.config`/`outputFileTracingRoot` değişikliği gerektirir (uygulama yapılandırması) — bu yüzden **düzeltilmedi, yalnızca belgelendi**; M00 uyarıyı görürse bilgi olarak raporlar.

## Ne ölçülür

| Kod | Konu |
|---|---|
| M00 | Build çıktısı, rota tablosu (○/●/ƒ), dinamik rotalar |
| M01 | HTTP durum kodları: yayınlanmış 200, taslak/geçersiz 404, Supabase hatasında 5xx, sızıntı yok |
| M02 / M03 | TTL ve stale-while-revalidate gözlemi |
| M04 | Etiketle geçersiz kılma (hard miss), unpublish sonrası 404 |
| M05 | Kesinti sırasında eski içeriğin ne kadar sunulduğu (R1) |
| M06 | Soğuk başlangıçta hata modları: 500/503/401/bozuk/null/boş/bağlantı kopması/hang (zaman aşımı) |
| M07 | metadata ↔ sayfa içeriği tutarlılığı |
| M08 | build `static` + runtime `cms` uyuşmazlığı (R4) |
| M09 | Yeniden başlatma sonrası disk önbelleği |
| M10 | Bütünlük: guard kapsamı, engellenen bağlantı = 0, sahte sunucu ihlali = 0, sızıntı yok, kaynak değişmedi |

Gözlemler "beklenen" değil **ölçülen** davranıştır; `req` türü bulgular FAIL üretebilir — bu F1'in girdisidir, düzeneğin bozuk olduğu anlamına gelmez.

## Sandbox güvenlik mekanizması

1. **Konum**: yalnızca `<proje>/.f0-sandbox/`. Projenin kendi `.next`, `.env*` dosyalarına dokunulmaz.
2. **Allowlist kopya**: yalnız `src, public, package.json, package-lock.json, tsconfig.json, next.config.mjs, postcss.config.mjs, tailwind.config.ts, next-env.d.ts`. `.env*`, `.next`, `node_modules`, `.git`, `.vercel`, `*.pem`, `*.key` vb. **asla** kopyalanmaz; kopya sonrası ikinci bir tarama gizli dosya olmadığını doğrular.
3. **node_modules**: kopyalanmaz/kurulmaz; yalnızca bağlantı (Windows'ta junction, diğerlerinde symlink).
4. **Probe route** (`/f0-probe/revalidate`) yalnızca sandbox kopyasında oluşturulur; gerçek projeye yazılmaz.
5. **Silme**: yalnız `<proje>/.f0-sandbox` altındaki, geçerli **işaret dosyası** (`.f0-sandbox-marker.json`) taşıyan klasörler silinir; sembolik bağlantı hedefleri, proje dışı yollar, işaretsiz klasörler reddedilir. İç bağlantılar önce çözülür ve `node_modules` hedefinin sağlam kaldığı doğrulanır.
6. **Kaynak bütünlüğü**: çalışma öncesi/sonrası `src, public, scripts, supabase, docs` ve kök yapılandırma dosyalarının içerik özeti ile `.next` (yol|boyut|mtime) karşılaştırılır; `.env*` yalnız **adları** listelenir (içerik okunmaz).
7. **Alt süreç ortamı**: ana makine ortamı miras alınmaz; yalnız açık allowlist (PATH, sistem kökü vb.) + F0 değişkenleri taşınır. Gerçek Supabase URL/anahtarı hiçbir yerden gelmez; `NEXT_PUBLIC_SUPABASE_URL` yalnız `http://127.0.0.1:<port>` olabilir, sahte anahtar `sb_publishable_f0_fake_key_not_real`.

## Gerçek Supabase'e istek gitmemesinin katmanları

1. URL yalnız loopback; loopback dışı veya `supabase.*` adresi **reddedilir** (`assertLoopbackUrl`).
2. Gerçek `.env*` kopyalanmaz, env allowlist ile taşınmaz.
3. **Süreç içi egress guard** (`NODE_OPTIONS=--require`): `net.Socket#connect`, `tls.connect`, `dns.*` loopback dışına çıkışı **engeller** ve JSONL'e yazar. Alt süreç başlamadan önce guard'ın yüklendiği (`guard-loaded`) doğrulanır; **yoksa süreç öldürülür, ölçüm başlamaz**.
4. Ölçümden önce **guard öz-testi**: dış fetch/net/tls/dns/https engellenmiyorsa ölçüm başlamaz.
5. Sahte sunucu apikey/authorization'ı, tablo ve kolon listesini doğrular; `select=*`, bilinmeyen kolon, yazma, beklenmeyen uç noktayı reddeder ve `violations`'a kaydeder.
6. Build çıktısı gerçek `supabase.co` adresi için taranır.
7. Engellenen bağlantı sayısı > 0 ise **FAIL**.

## Güvenlik kontrollerinin KAPSAMADIĞI bağlantı yolları (açık beyan)

- Alt süreçlerin başlattığı **harici programlar** (`child_process` ile başka ikili dosyalar) guard dışındadır.
- **Native eklentiler** doğrudan soket açarsa `net`/`dns` yamasından geçmez.
- **UDP** (dgram) engellenmez.
- Unix-domain / named-pipe **yerel IPC** engellenmez, yalnız `local-ipc` olarak günlüğe yazılır.
- İşletim sistemi düzeyinde izolasyon (güvenlik duvarı, ağ ad alanı) **yoktur**; guard süreç içidir.
- Vercel Data Cache kapsamı ve sunucusuz arka plan yeniden doğrulaması **yerelde ölçülemez** (S1/F4).
- supabase-js'in gerçek istek şeklinin sahte sunucuyla uyumu yalnızca sizin `--run` çalıştırmanızda kanıtlanır.

## Uyarılar

- `--keep-sandbox` ile bırakılan `.f0-sandbox/` içindeki `*.ts` dosyalarını `tsconfig.json` (`**/*.ts`) yakalar; `npm run typecheck/lint` bozulabilir. İşiniz bitince `.f0-sandbox/` klasörünü silin (`.gitignore` ile git'e girmez).
- Sandbox'ta `next build` çalışır; `.env*` olmadığından yalnız sahte değerler görür.
- Docker bu aşamada kapsam dışıdır. Hedef Node 24; kesin sürüm sizin ortamınızda doğrulanır (burada yalnız Node 22 ile öz-test yapıldı).
