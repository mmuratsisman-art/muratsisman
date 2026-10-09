import { revalidatePath, revalidateTag } from 'next/cache';
import { CMS_TAG } from './cache';

/**
 * Bir yayınlama / yayından kaldırma başarılı olduktan sonra public veri önbelleğini ve sayfaları geçersiz kılar.
 * Hata verirse (örn. istek bağlamı dışında) sessizce geçer: admin işlemi ASLA bu yüzden başarısız olmaz;
 * en kötü durumda içerik, önbellek süresi (CMS_REVALIDATE_SECONDS) dolunca güncellenir.
 */
export function revalidatePublicContent(): void {
  try {
    revalidateTag(CMS_TAG);
    revalidatePath('/', 'layout');
  } catch {
    /* önbellek geçersiz kılma en iyi çabadır */
  }
}
