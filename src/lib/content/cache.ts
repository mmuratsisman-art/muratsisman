import { unstable_cache } from 'next/cache';
import { createEnvelopeCache } from './envelope-cache';

/**
 * Public okumaların veri önbelleği süreleri (saniye) ve etiketi. Yayın/yayından kaldırma eylemleri etiketi anında geçersiz kılar.
 *   CMS_REVALIDATE_SECONDS      = SERT yaş sınırı: bundan eski veri ASLA sunulmaz (F0 bu sabiti TTL olarak okur; değeri tek satırda tutun).
 *   CMS_SOFT_REVALIDATE_SECONDS = YUMUŞAK süre: aşılınca eski veri sunulabilir, yenileme arka planda başlar (trafik varken sert sınıra düşülmez).
 */
export const CMS_REVALIDATE_SECONDS = 60;
export const CMS_SOFT_REVALIDATE_SECONDS = 50;
export const CMS_TAG = 'cms-public';

/**
 * Önbellek bağdaştırıcısı. `fn` hata fırlatırsa HİÇBİR ŞEY önbelleğe yazılmaz (başarısız sorgu/boş sonuç önbelleğe girmez);
 * hatayı çağıran katman yakalar. Yalnızca başarılı, doğrulanmış sonuç saklanır. Ayrıntı: envelope-cache.ts
 */
export interface CacheAdapter {
  wrap<T>(key: string, tags: string[], fn: () => Promise<T>): () => Promise<T>;
}

const envelope = createEnvelopeCache({
  store: (fn, keyParts, options) => unstable_cache(fn, keyParts, options),
  softSeconds: CMS_SOFT_REVALIDATE_SECONDS,
  hardSeconds: CMS_REVALIDATE_SECONDS,
  keyPrefix: 'cms-public-v2',
  baseTag: CMS_TAG,
});

export const nextCache: CacheAdapter = { wrap: (key, tags, fn) => envelope.wrap(key, tags, fn) };

/** Süreç içi tek-uçuş / son-sonuç kayıtlarını sıfırlar (yayınlama sonrası aynı örnekte eski sorgu sonucu kullanılmasın). */
export const clearLocalCacheState = (): void => envelope.clearLocal();

export const noCache: CacheAdapter = { wrap: (_k, _t, fn) => fn };
