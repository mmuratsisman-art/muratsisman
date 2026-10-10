import type { CaseStudyProject, LabEntry, NoteEntry } from '@/types';

/**
 * robots.txt ve sitemap.xml için SAF (Next'siz) yapı taşları.
 * Veri yalnızca çağıranın verdiği `@/lib/content` getter sonuçlarından gelir: bu modül statik veri dosyalarını, veritabanını ya da ağı
 * kullanmaz; dolayısıyla yayın filtresi, önbellek ve hata (ContentUnavailableError) davranışı değişmez.
 */

/** `https://<alan-adı>`. Alan adı doğrulaması provider'daki kuralla aynıdır; geçersizse FIRLATIR (5xx), tahmin edilmez. */
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
export function siteBaseUrl(domain: string): string {
  if (!HOST_RE.test(domain)) throw new Error('seo: geçersiz site alan adı');
  return `https://${domain}`;
}

/* ───────── robots.txt ───────── */

export interface RobotsRule { userAgent: string; allow: string; disallow: string[] }
export interface RobotsData { rules: RobotsRule[]; sitemap: string }

/**
 * Herkese açık site taranabilir; yönetim alanı (önizleme dahil: /admin/preview) taranmaz.
 * Bu bir indeks KORUMASI değildir: `noindex` meta + `X-Robots-Tag` (admin layout, preview metadata, middleware) aynen yerinde kalır.
 */
export const ROBOTS_DISALLOW = ['/admin'] as const;
export function buildRobots(baseUrl: string): RobotsData {
  return { rules: [{ userAgent: '*', allow: '/', disallow: [...ROBOTS_DISALLOW] }], sitemap: `${baseUrl}/sitemap.xml` };
}

/* ───────── sitemap.xml ───────── */

export interface SitemapEntry { url: string; lastModified?: string }

export interface SitemapInput {
  baseUrl: string;
  /** YALNIZCA gerçek detay sayfası olan projeler (`getCaseStudyProjects`): coming-soon ve vaka çalışması olmayanlar içeride değildir. */
  projects: readonly Pick<CaseStudyProject, 'slug'>[];
  labEntries: readonly Pick<LabEntry, 'slug'>[];
  notes: readonly Pick<NoteEntry, 'slug' | 'publishedAt'>[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sıra sabittir; aynı URL ikinci kez eklenmez. Tarih yalnızca notlarda bilinir (yayın tarihi); diğerleri için UYDURULMAZ. */
export function buildSitemapEntries(i: SitemapInput): SitemapEntry[] {
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  const add = (path: string, lastModified?: string) => {
    const url = `${i.baseUrl}${path}`;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(lastModified ? { url, lastModified } : { url });
  };
  add('/');
  add('/lab');
  add('/notes');
  for (const p of i.projects) add(`/projects/${encodeURIComponent(p.slug)}`);
  for (const e of i.labEntries) add(`/lab/${encodeURIComponent(e.slug)}`);
  for (const n of i.notes) add(`/notes/${encodeURIComponent(n.slug)}`, ISO_DATE.test(n.publishedAt) ? n.publishedAt : undefined);
  return out;
}

/** `createContentProvider` çıktısının sitemap'in kullandığı alt kümesi (testte gerçek provider verilir). */
export interface SitemapSource {
  getChromeIdentity(): Promise<{ domain: string }>;
  getCaseStudyProjects(): Promise<readonly Pick<CaseStudyProject, 'slug'>[]>;
  getLabEntries(): Promise<readonly Pick<LabEntry, 'slug'>[]>;
  getNotes(): Promise<readonly Pick<NoteEntry, 'slug' | 'publishedAt'>[]>;
}

/**
 * Hiçbir getter hatası yutulmaz: biri fırlatırsa (ör. ContentUnavailableError) bu fonksiyon da fırlatır → rota 5xx döner.
 * Kısmi/boş sitemap ya da statik içeriğe geçiş YOKTUR (kısmi sitemap, arama motoruna "bu sayfalar silindi" sinyali verebilir).
 */
export async function loadSitemapEntries(src: SitemapSource): Promise<SitemapEntry[]> {
  const [identity, projects, labEntries, notes] = await Promise.all([
    src.getChromeIdentity(),
    src.getCaseStudyProjects(),
    src.getLabEntries(),
    src.getNotes(),
  ]);
  return buildSitemapEntries({ baseUrl: siteBaseUrl(identity.domain), projects, labEntries, notes });
}
