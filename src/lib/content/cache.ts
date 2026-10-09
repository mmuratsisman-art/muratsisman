import { unstable_cache } from 'next/cache';

/** Public okumaların veri önbelleği süresi (saniye) ve etiketleri. Yayın/yayından kaldırma eylemleri etiketi anında geçersiz kılar. */
export const CMS_REVALIDATE_SECONDS = 60;
export const CMS_TAG = 'cms-public';

/**
 * Önbellek bağdaştırıcısı. `fn` hata fırlatırsa Next HİÇBİR ŞEY önbelleğe yazmaz (başarısız sorgu/boş sonuç önbelleğe girmez);
 * hatayı çağıran katman yakalar. Yalnızca başarılı, doğrulanmış sonuç saklanır.
 */
export interface CacheAdapter {
  wrap<T>(key: string, tags: string[], fn: () => Promise<T>): () => Promise<T>;
}

export const nextCache: CacheAdapter = {
  wrap: (key, tags, fn) => unstable_cache(fn, ['cms-public', key], { revalidate: CMS_REVALIDATE_SECONDS, tags: [CMS_TAG, ...tags] }),
};

export const noCache: CacheAdapter = { wrap: (_k, _t, fn) => fn };
