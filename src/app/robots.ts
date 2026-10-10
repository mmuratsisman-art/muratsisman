import type { MetadataRoute } from 'next';
import { getChromeIdentity } from '@/lib/content';
import { ensureDynamicIfCms } from '@/lib/content/dynamic';
import { buildRobots, siteBaseUrl } from '@/lib/seo/crawl';

/** static modunda statik üretilir; cms modunda her istekte (alan adı CMS kimliğinden; okunamazsa YALNIZCA kimlik için statik değer, bkz. getChromeIdentity). */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await ensureDynamicIfCms();
  const identity = await getChromeIdentity();
  return buildRobots(siteBaseUrl(identity.domain));
}
