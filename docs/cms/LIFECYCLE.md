# İçerik yaşam döngüsü (FAZ 3B-A1: Notes ve Lab)

> **Public site bu aşamada henüz dosya tabanlı içerik (`src/data/*`) kullanıyor.** Admin'de yaptığınız hiçbir değişiklik (taslak, yayınla, yayından kaldır) herkese açık sayfalara yansımaz. Gerçek public cutover **FAZ 3B-E**'de, ayrı ve kontrollü bir adımda yapılacaktır. Bu bilinçli bir güvenlik kararıdır.

## Kavramlar

| Terim | Anlamı |
|---|---|
| **Canlı (base/live) satır** | `public.notes` / `public.lab_entries` tablosundaki satır. Public RLS onu **yalnızca `status = 'published'`** iken gösterir. |
| **Taslak (draft) doküman** | `note_drafts` / `lab_entry_drafts` tablosunda, varlık başına **en fazla bir** bekleyen çalışma kopyası (admin-only). Tüm düzenlemeler buraya yazılır. |
| **Shell satır** | Admin'den yeni oluşturulan içeriğin canlı tablodaki iskeleti: yalnızca şemanın zorunlu kıldığı alanlar (slug, başlık, ...), `status = 'draft'`, hiçbir zaman public değil. Gerçek içerik taslak dokümandadır. |
| **Eskimiş (stale) taslak** | Taslak başladıktan sonra canlı satırın değiştiği durum. Yayınlanamaz (aşağıda). |
| **Yayından kaldır (unpublish)** | `published → draft`. İçerik silinmez. |
| **Taslağı at (discard)** | Bekleyen taslak dokümanı kaldırır; canlı sürüm olduğu gibi kalır. **İçerik silme değildir.** |

**Silme işlemi yoktur.** Admin arayüzünde "içeriği sil" düğmesi bulunmaz ve uygulama hiçbir tabloya doğrudan yazmaz; tüm yazmalar yalnızca 0004 fonksiyonlarından geçer.

## Akışlar

```
Yeni içerik   create_*()  → shell satır (draft) + taslak doküman        (tek transaction, yarım kayıt olmaz)
Düzenleme     save_*_draft() → yalnızca taslak doküman                  (canlı satıra DOKUNMAZ)
Yayınla       save_*_draft() + publish_*()                              (form içeriği önce taslağa, sonra atomik yayına)
Yayından kaldır   unpublish_*()   published → draft
Taslağı at    discard_*_draft()   taslak silinir, canlı sürüm kalır
```

- **Yayındaki içeriği düzenlemek** canlı satırı değiştirmez. Liste durumu `PUBLISHED · BEKLEYEN DEĞİŞİKLİK` olur. `Yayınla` ile taslak, atomik olarak canlıya kopyalanır ve taslak silinir.
- **Yeni içerik** önce `DRAFT`'tır. `Yayınla` yeni içerikte `draft → preview → published` geçişini tek fonksiyonda yürütür (veritabanı tetikleyicisi geçiş kurallarını zorlar). Önizleme sayfası **FAZ 3B-D**'dir; bu fazda yoktur.
- **Hiç yayınlanmamış** içerikte "Taslağı At" gösterilmez (geri dönülecek bir canlı sürüm yoktur).

## Form işlem türü (kaydet / yayınla): deterministik ve fail-closed

Formda iki düğme vardır (**Taslağı Kaydet**, **Yayınla**). Sunucunun hangisine basıldığını bilmesi için işlem türü (`intent`) **FormData'ya istemci tarafından açıkça yazılır**: her düğme `formAction={submitAs('save' | 'publish')}` kullanır (`components/admin/useIntentAction.ts`, Notes ve Lab için ortak). Gönderen düğmenin `name/value`'suna **güvenilmez**: React'in sentetik form gönderiminde submitter bilgisinin FormData'ya girmesi sürüme bağlı bir iç ayrıntıdır (düğmede `formAction` varsa React submitter'ı bilerek atar, yoksa geçici bir `<input>` hilesiyle ekler). R1'de bu varsayım Next 15.5.27'nin paketlediği React'te tutmadı ve sunucu sessizce "kaydet"e düştü.

**Sunucu** (`entity-actions.ts`, `intent.ts`): `intent` yalnızca tam olarak `save` veya `publish` ise kabul edilir. **Eksik veya geçersizse hiçbir şey yapılmaz** ve *"İşlem türü belirlenemedi; hiçbir değişiklik yapılmadı."* döner. Düğmesiz gönderim (ör. `requestSubmit()`) de bu yüzden reddedilir; başlık alanında Enter ise ilk düğmeyi (Kaydet) tetikler, asla Yayınla'yı değil. `Yayınla` için `confirm_publish` onay kutusu sunucuda ayrıca zorunludur.

Regresyon testi: `scripts/cms/verify-intent-flow.ts` (`npx tsx ...`).

## Eylem sonrası formun yenilenmesi (form sürüm anahtarı)

Edit formları kontrolsüz alanlar (`defaultValue`) kullanır. Kullanıcı bir alanı düzenleyince alan "kirli" olur ve tarayıcı, sunucu sonradan yeni `defaultValue` gönderse bile ekrandaki değeri değiştirmez. Bu yüzden **Taslağı At** (veya Yayınla / Yayından Kaldır / Taslağı Kaydet) sonrasında form eski değerleri göstermeye devam edebilirdi; yalnızca sert yenileme düzeltiyordu. Router yenilemesi tek başına yetmez: sorun veride değil, form örneğinin ömründedir.

Çözüm: edit sayfası formu sunucu veri sürümünden türetilen bir React `key` ile render eder (`lib/cms/admin/form-key.ts`: `id | canlı updated_at | taslak updated_at | yaşam döngüsü durumu`). Her yaşam döngüsü eylemi bu sürümü değiştirir, form yeniden bağlanır ve sunucunun gönderdiği değerleri gösterir. **Doğrulama hatasında** gezinme olmadığı için anahtar değişmez: hata mesajı ve kullanıcının yazdığı korunur. Regresyon: `scripts/cms/verify-form-key.ts`.

## Eşzamanlı düzenleme ve eskimiş taslak

Taslak başlarken `based_on_updated_at = canlı.updated_at` kaydedilir. `publish_*()`, bunu **güncel** canlı `updated_at` ile karşılaştırır; farklıysa yayın reddedilir:
> "İçerik siz düzenlerken değişmiş. Yenileyip tekrar deneyin."

İki sekme senaryosu için formdaki gizli `expected_draft_updated_at` token'ı, kaydederken taslağın güncel `updated_at`'iyle veritabanında karşılaştırılır; uyuşmazlıkta kayıt reddedilir (sessiz ezme yok). Token **hiçbir zaman `Date`'e çevrilmez** (mikrosaniye hassasiyeti korunur).

`unpublish_*()` canlı `updated_at`'i değiştirir ama içeriği değiştirmez; bu nedenle bekleyen taslağın tabanını yeniden hizalar (yayından kaldırmak taslağı eskitmez).

## Yayınlanmış slug koruması

- **Veritabanı**: `protect_published_slug` tetikleyicisi (`projects`, `lab_entries`, `notes`): `status = 'published'` iken slug değişikliği **reddedilir**: doğrudan `UPDATE` ile de, taslak üzerinden `publish_*()` ile de.
- **Arayüz**: yayındaki içerikte slug alanı salt-okunur ve açıklamalıdır. Değiştirmek için önce yayından kaldırın. Yönlendirme geçmişi (redirect) yoktur.

## Yetkilendirme (üç katman)

1. Korumalı layout.
2. **Her Server Action ve her admin sayfası kendi başına `requireAdmin()`** çağırır; admin değilse DB'ye hiç dokunulmaz.
3. **RLS + fonksiyonlar**: taslak tablolarına `anon` erişemez, admin olmayan oturum 0 satır görür ve yazamaz; tüm fonksiyonlar `SECURITY DEFINER`, sabit `search_path` ve `is_admin()` ile fail-closed çalışır. İstemciden gelen kullanıcı kimliği/rol/isAdmin hiçbir yerde kullanılmaz. Service-role anahtarı yoktur.

## Gerçek Supabase'te manuel QA kontrol listesi (migration 0004 uygulandıktan sonra)

`supabase/tests/rls_smoke_3b.sql` tek transaction'da çalışır ve `now()` sabit olduğundan şunları **kapsayamaz**; admin panelinden elle doğrulayın:

1. Yayındaki bir notu düzenleyip **Taslağı Kaydet**: liste `PUBLISHED · BEKLEYEN DEĞİŞİKLİK` olmalı; veritabanında canlı satır (`select title from notes ...`) **eski** kalmalı.
2. Aynı notu **Yayınla** (onay kutusuyla): canlı satır güncellenmeli, taslak kaybolmalı.
3. Bekleyen taslak varken **Yayından Kaldır**, sonra düzenleme sayfasında **Yayınla**: *"değişmiş"* hatası **vermemeli** (taslak yeniden hizalanır).
4. İki tarayıcı sekmesinde aynı taslağı aç, birinde kaydet, diğerinde kaydet: ikincisi *"İçerik siz düzenlerken değişmiş..."* demeli.
5. Eskimiş taslak: SQL ile canlı satırı değiştirin (`update notes set excerpt='x' where ...`), sonra panelden aynı notu Yayınla: reddedilmeli, canlı satır değişmemeli.
6. Yayındaki notta slug alanı salt-okunur olmalı; `update notes set slug='x' where status='published'` SQL'i hata vermeli.
7. Yeni not oluştur: yarım/çift kayıt oluşmamalı (`select count(*) from notes where slug = ...` = 1); aynı slug ile ikinci oluşturma kullanıcı dostu hata vermeli.
8. Admin olmayan bir Auth kullanıcısıyla `/admin/notes` açılırsa "Erişim yok" görünmeli.
9. Public siteyi (`/notes`, `/lab`) kontrol edin: **hiçbir değişiklik yansımamalı** (dosya tabanlı).
