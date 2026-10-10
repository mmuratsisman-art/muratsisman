import type { MetadataRoute } from 'next';
import { getCaseStudyProjects, getChromeIdentity, getLabEntries, getNotes } from '@/lib/content';
import { ensureDynamicIfCms } from '@/lib/content/dynamic';
import { loadSitemapEntries } from '@/lib/seo/crawl';

/**
 * Yalnızca `@/lib/content` getter'ları (yayın filtresi, 60 sn önbellek, zaman aşımı ve fail-closed hata davranışı aynen geçerli).
 * cms modunda rota her istekte çalışır (ensureDynamicIfCms); veri okunamazsa istek 5xx döner, statik içeriğe DÖNÜLMEZ.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureDynamicIfCms();
  return loadSitemapEntries({ getChromeIdentity, getCaseStudyProjects, getLabEntries, getNotes });
}
