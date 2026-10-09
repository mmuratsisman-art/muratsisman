import { connection } from 'next/server';
import { getContentSource } from './source';

/**
 * cms modunda sayfa HER İSTEKTE sunucuda üretilir (tam-sayfa önbelleği yok); veri, 60 sn'lik ve etiketli veri önbelleğinden gelir.
 * Böylece yayından kaldırılmış bir sayfanın eski HTML'i kalıcı olarak önbellekte KALAMAZ.
 * static modunda hiçbir şey yapmaz (sayfalar bugünkü gibi statik üretilir).
 */
export async function ensureDynamicIfCms(): Promise<void> {
  if (getContentSource() === 'cms') await connection();
}
