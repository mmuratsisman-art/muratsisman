# FAZ 3B-B — Deterministik İçerik Import'u (`src/data/*` → CMS)

> **Durum:** Araç ve 0006 migration'ı **hazırdır ama HİÇBİR ŞEY üretime uygulanmamıştır.** Gerçek import, açık yazılı onay olmadan başlatılmaz.
> Dil: Türkçe. Tüm komutlar proje kökünden çalıştırılır.

## 1. Ne yapar / ne yapmaz

- 4 proje, 3 lab girdisi, 3 not ve 10 site belgesini (toplam **20 kayıt**) mevcut CMS RPC'leri ve admin oturumuyla CMS'e aktarır; kaynak kayıtlar doğrudan `published` olur (D7).
- `navigation.ts` **bilerek aktarılmaz** (kod olarak kalır).
- Hedefte zaten olan hiçbir kaydın üzerine **sessizce yazmaz**; başkasının taslağını **otomatik sahiplenmez** (D4).
- Public rotalara, SEO çıktısına ve `src/data/*` içeriğine **dokunmaz**. Public site hâlâ dosya tabanlıdır.
- Service-role anahtarı kullanmaz/kabul etmez; hiçbir sır rapora yazılmaz.

## 2. Güvenlik modeli (özet)

| Risk | Önlem |
|---|---|
| Dry-run ile apply arası değişen hedef (TOCTOU) | Apply, hedefi **yeniden okur**, planı **yeniden kurar**, onaylanan plan özeti (kararlar + kayıt başı parmak izi + hedefteki bulgular) ile karşılaştırır; hedefe araya giren *herhangi* yeni bulgu (ör. ilgisiz yayınlanmış satır) da onayı geçersiz kılar; fark veya okunamayan durum → **fail-closed, yazma yok**. Her kayıttan hemen önce tekrar kontrol. Yürütme onay dosyasından değil, taze plandan yapılır. |
| Yarıda kesilme | Her adım `content_import_items` ledger'ına işlenir (`intent→created→published→completed`). Devam yalnızca **sahiplik kanıtıyla**: ledger niyeti + taslak içerik hash'i = kaynak hash'i + `created_by` = koşuyu başlatan + `created_at ≥ koşu başlangıcı` + hâlâ taslak kabuğu. Kanıtlanamayan → `CONFLICT/UNVERIFIABLE`, durur. |
| Onay | `APPLY-<plan özeti 12 hex>` belirteci + `--yes-write`. Belirteç plan değişince değişir. |
| QA kayıtları | Asla silinmez/değiştirilmez; çakışırsa durur ve raporlar. |
| SEO (projeler) | `_apply_project_doc` `seo_*` yazmaz → yayın sonrası ayrı, korumalı (`where seo_title is null and seo_description is null`) ve doğrulanan adım (D3). |

## 3. Dosyalar

`supabase/migrations/0006_faz3b_content_import_provenance.sql` (+ `_down.sql`), `supabase/tests/rls_smoke_3b_b.sql`, `scripts/cms/import/*`, `scripts/cms/verify-3b-b.ts`, `scripts/cms/verify-3b-b-pg.ts`, `scripts/cms/run-3b-b-tests.sh`, `.gitignore` (`import-reports/`).

## 4. Komutlar (hepsi salt-okunur, yazmaz)

```bash
# Kaynak ve eşleme kendi kendine tutarlı mı, 20 kayıt planlanıyor mu? (hedefe bağlanmaz)
npx tsx scripts/cms/import/cli.ts dry-run --offline

# Önerilen: salt-okunur SQL'i Supabase SQL Editor'da çalıştırıp sonucu snapshot.json olarak kaydedin
npx tsx scripts/cms/import/cli.ts sql-snapshot                  # 0006 uygulanmışsa
npx tsx scripts/cms/import/cli.ts sql-snapshot --no-provenance  # 0006 henüz uygulanmamışsa
npx tsx scripts/cms/import/cli.ts dry-run --snapshot snapshot.json

# Alternatif: admin oturumuyla canlı salt-okunur okuma
IMPORT_SUPABASE_URL=… IMPORT_SUPABASE_KEY=<publishable key> IMPORT_ADMIN_EMAIL=… \
  npx tsx scripts/cms/import/cli.ts dry-run --live      # parola gizli istemle sorulur
```

Çıktı `import-reports/<zaman>/` altına yazılır: `plan.json`, `pre-import-report.md`. Raporda kaynak/hedef/eklenecek/devam/atlanacak/çakışan/doğrulanamayan sayıları, kayıt başı karar ve **cutover engelleri** bulunur. `--offline` modunda çakışma denetimi **yapılmaz**; gerçek karar için snapshot/live gerekir.

> `--live` ile oturum açmak Supabase Auth tarafında bir oturum kaydı oluşturur (içerik tablolarına yazmaz).

## 5. Gerçek import için MANUEL ONAY ADIMLARI

Hiçbiri otomatik değildir; her biri ayrı onay gerektirir.

1. **Yedek:** Supabase'de proje yedeği/PITR durumunu doğrulayın.
2. **0006 onayı:** `0006_faz3b_content_import_provenance.sql` dosyasını inceleyin; onaylarsanız SQL Editor'da **bir kez** çalıştırın. (0001–0005 yeniden çalıştırılmaz.) Ardından `rls_smoke_3b_b.sql` isteğe bağlı olarak **test** veritabanında çalıştırılır, üretimde değil.
3. **Dry-run (0006 sonrası, hedefle):** §4'teki snapshot/live dry-run. `pre-import-report.md` içinde: çakışan = 0, doğrulanamayan = 0, `Uygulanabilir: EVET`. Mevcut QA kayıtlarının **listelendiğini** ve **değiştirilmeyeceğini** kontrol edin.
4. **Karar kapısı:** Raporu gözden geçirip yazılı olarak "bu plan özeti (`APPLY-…`) ile import edilsin" onayı verin.
5. **Apply:**
   ```bash
   npx tsx scripts/cms/import/cli.ts apply --plan import-reports/<zaman>/plan.json --confirm APPLY-<12hex> --yes-write
   ```
   Hedef dry-run'dan beri değiştiyse araç **reddeder**; yeni dry-run + yeni onay gerekir.
6. **Doğrulama:** `verify --live` (veya yeni snapshot ile `verify --snapshot`) → `post-import-report.md`: 20/20 OK, ledger bulgusu yok.
7. Public site bu işlemle **değişmez**; geçiş (cutover) ayrı fazdır (3B-E).

Yarıda kesilirse: aynı komutları baştan izleyin (yeni dry-run → `RESUME` kararları → yeni onay → apply). Kanıtlanamayan kayıtlar için araç durur ve sebebi raporlar.

## 6. Rollback prosedürü (D5)

```bash
npx tsx scripts/cms/import/cli.ts rollback-plan --live          # veya --snapshot
# rollback-plan.md / rollback-plan.json / rollback-site-content.sql incelenir
npx tsx scripts/cms/import/cli.ts rollback --plan import-reports/<zaman>/rollback-plan.json --confirm ROLLBACK-<12hex> --yes-write
```

- Kapsam: **yalnızca ledger'da bu araçla import edilmiş** kayıtlar. QA ve elle oluşturulmuş kayıtlara dokunulmaz.
- Proje/lab/not: korumalı silme (`id` + `updated_at` eşleşmezse silinmez; import sonrası düzenlenmiş kayıtlar `SKIP`).
- **Site belgeleri:** `site_content_published` üzerinde uygulama rolünün yazma/silme yetkisi yoktur. Araç bunlar için `rollback-site-content.sql` üretir; SQL Editor'da **elle** (tek transaction, satır sayısı kontrollü) çalıştırılır.
- Rollback da TOCTOU kapısına sahiptir (plan özeti yeniden doğrulanır).
- Ledger satırları silinmez, `rolled_back` olarak işaretlenir. 0006'nın kendisini geri almak için `_down.sql` (elle, ayrıca onay).

## 7. ÖNEMLİ — 3B-E (cutover) ENGELİ: üretimdeki QA kayıtları

Üretimde önceki fazlardan kalma QA kayıtları bulunuyor (ör. `faz-3b-a2-test-projesi`, `a1-test-notu`). Public site cutover sonrası içeriği veritabanından okuyacağı için **yayınlanmış** (`published`) QA kayıtları ziyaretçilere görünür. Araç bunları `foreign_published_row` (**cutoverBlocker**) olarak raporlar; `sort_order` çakışmaları da (`sort_order_tie`) listelenir. **3B-E öncesi** bu kayıtların sahibi tarafından elle arşivlenmesi/yayından kaldırılması/silinmesi ve sıra çakışmasının çözülmesi gerekir. Bu araç QA kayıtlarına bilerek dokunmaz.

## 8. Testler

```bash
npx tsx scripts/cms/verify-3b-b.ts            # birim (saf mantık)
bash scripts/cms/run-3b-b-tests.sh            # + A1/A2 regresyonları + yerel PostgreSQL entegrasyonu
```

PostgreSQL entegrasyon testleri **gerçek PostgreSQL'e** karşı, Supabase yerine **test amaçlı kalıplarla** (roller, `auth.users`, `auth.uid()`) çalışır; gerçek Supabase (PostgREST/Auth/Storage) ile bire bir aynı DEĞİLDİR. İlk gerçek koşu mutlaka §5'teki dry-run/doğrulama kapılarıyla yapılmalıdır.

## 9. Bilinen sınırlamalar

- Proje ve lab kayıtlarının `published_at` değeri import anıdır (`now()`); RPC'ler bu alanı dokümandan yazmaz. Notlarda `published_at` kaynak tarihidir.
- `--offline` çakışma denetimi yapmaz.
- Üretimde gerçek Supabase ile uçtan uca koşu yapılmadı (yapılması onayınıza bağlı).
- `tsx` projeye bağımlılık olarak eklenmedi (`npx tsx`).
