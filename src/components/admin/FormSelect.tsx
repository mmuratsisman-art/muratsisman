import type { SelectHTMLAttributes } from 'react';

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'defaultValue'> & {
  /** Sunucunun bildiği / son gönderilen değer (taslak, yayın ya da doğrulama hatasında kullanıcının gönderdiği değer). */
  value: string;
};

/**
 * Kontrolsüz <select> + durum yenileme sorununun TEK çözümü (Projects, Notes, Lab, Site formları kullanır).
 *
 * SORUN: Formlar kontrolsüz alanlar kullanır (`defaultValue`). Doğrulama hatasında React formu otomatik sıfırlar (reset) ve
 * sunucunun geri yolladığı değerleri `defaultValue` olarak yeniden verir. Metin kutularında React `defaultValue`'yu DOM'a yazar,
 * bu yüzden sıfırlamadan sonra da yazılan görünür. <select>'te ise React, yeniden render'da `defaultValue` değişimini seçeneklerin
 * `defaultSelected` durumuna YANSITMAZ (yalnızca `multiple` değişirse yapar); sıfırlama select'i İLK haline döndürür ve kullanıcının
 * seçimi kaybolur.
 *
 * ÇÖZÜM: select'i `value` ile anahtarlayıp yeniden bağlamak. Değer değişince React yeni bir <select> kurar ve `defaultValue`'yu
 * ilk varsayılan olarak uygular; sonraki sıfırlama da o değere döner (metin kutularıyla aynı davranış). Kullanıcı yazarken/seçerken
 * bir şey değişmez: anahtar yalnızca sunucudan gelen değere bağlıdır.
 */
export default function FormSelect({ value, children, ...rest }: Props) {
  return (
    <select key={value} defaultValue={value} {...rest}>
      {children}
    </select>
  );
}
