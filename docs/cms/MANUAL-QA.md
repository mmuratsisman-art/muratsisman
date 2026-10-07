# Manuel QA: Projeler formu için geçerli örnekler

Bu dosyadaki JSON blokları **`src/data/projects` içindeki gerçek vaka çalışması modelinden** türetilmiştir (bölüm kimlikleri, `prose` / `list` türleri, `body[]`, `items[{ title, text }]`, `tags[]`). Her blok `scripts/cms/verify-form-state.ts` tarafından doğrulanır: bu dosya geçersiz hale gelirse test kırılır.

Formdaki **Case Study (JSON)** alanına doğrudan yapıştırın.

## Minimal geçerli case study

```json
{
  "sections": [
    {
      "id": "overview",
      "heading": "OVERVIEW",
      "kind": "prose",
      "body": [
        "Faz 3B-A2 proje içerik yönetimi ve yayın yaşam döngüsünü doğrulamak için oluşturulan test projesidir."
      ]
    }
  ],
  "tags": ["CMS", "Test", "MURAT/LAB"]
}
```

## Biraz daha zengin geçerli case study (prose + list + numbered list)

```json
{
  "sections": [
    {
      "id": "overview",
      "heading": "OVERVIEW",
      "kind": "prose",
      "body": [
        "Bu proje, CMS yaşam döngüsünü uçtan uca denemek için oluşturulmuş bir test kaydıdır.",
        "Gerçek bir proje değildir; yayından kaldırılabilir."
      ]
    },
    {
      "id": "capabilities",
      "heading": "KEY CAPABILITIES",
      "kind": "list",
      "items": [
        {
          "title": "Taslak ve yayın ayrımı",
          "text": "Yayındaki sürüm, taslak düzenlenirken değişmez."
        },
        {
          "title": "Açık yayın onayı",
          "text": "Yayınlamak için onay kutusu işaretlenmelidir."
        }
      ]
    },
    {
      "id": "learned",
      "heading": "WHAT I LEARNED",
      "kind": "list",
      "variant": "numbered",
      "items": [
        {
          "title": "Doğrulama sunucuda yapılır",
          "text": "Geçersiz JSON veritabanına yazılmaz."
        }
      ]
    }
  ],
  "tags": ["CMS", "Test", "Lifecycle"]
}
```

## Formun geri kalanı (örnek değerler)

| Alan | Değer |
|---|---|
| Başlık | Faz 3B-A2 Test Projesi |
| Alt başlık | CMS yaşam döngüsü testi |
| Özet | Faz 3B-A2 proje içerik yönetimi ve yayın yaşam döngüsünü doğrulamak için oluşturulan test projesidir. |
| Tür | personal |
| Tür etiketi | TEST PROJECT |
| Kategori | CMS Test |
| Renk / Kart boyutu / Grafik | blue / standard / rings |
| Sıra | 0 |
| Etiketler | CMS, Test, MURAT/LAB |
| Çok yakında | işaretsiz |

**Beklenen:** Geçerli JSON ile "Taslağı Oluştur" taslak kaydeder. Geçersiz JSON ile hata görünür ve **yazdığınız her şey (seçimler dahil) formda kalır**; veritabanına hiçbir şey yazılmaz.
