/**
 * Edit formu için "sürüm anahtarı". SAF modül (sunucu/istemci).
 *
 * NEDEN VAR: NoteForm / LabForm kontrolsüz (uncontrolled) alanlar kullanır (`defaultValue`). Kullanıcı bir alanı düzenlediğinde
 * alan "kirli" olur ve tarayıcı artık yeni `defaultValue`'yu EKRANA YANSITMAZ. Sunucu bir eylemden (Taslağı At, Yayınla, Yayından
 * Kaldır, Taslağı Kaydet) sonra yeni değerleri `initial` olarak yollasa da React aynı form örneğini yeniden kullanır ve kirli alanlar
 * eski değerini gösterir; yalnızca sert yenileme (Ctrl+F5) bunu düzeltiyordu. Router yenilemesi tek başına yetmez: sorun veride
 * değil, form örneğinin ömründedir.
 *
 * ÇÖZÜM: sunucudan gelen veri sürümü değişince formu YENİDEN BAĞLAMAK (React `key`). Anahtar, sunucunun bildiği sürüm bilgisinden
 * türetilir; değerleri kullanıcı yazdığı için değişmez. Doğrulama hatasında (gezinme yok) anahtar değişmez: hata ve girdi korunur.
 */
export interface EditorFormKeyParts {
  id: string;
  /** Canlı satırın updated_at'i (yayınla / yayından kaldır değiştirir). Metin olarak kalır, Date'e çevrilmez. */
  liveUpdatedAt: string;
  /** Bekleyen taslağın updated_at'i; taslak yoksa ''. (kaydet değiştirir; taslağı at / yayınla '' yapar) */
  draftUpdatedAt: string;
  /** describeLifecycle().key */
  lifecycleKey: string;
}

export const editorFormKey = (p: EditorFormKeyParts): string => [p.id, p.liveUpdatedAt, p.draftUpdatedAt, p.lifecycleKey].join('|');
