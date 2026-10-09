import type { CaseStudyProject, LabEntry, NoteEntry, Project } from '@/types';
import { documentsToSiteContent, type SiteContentSource } from '@/lib/cms/mappers';
import { isValidSlug } from '@/lib/cms/status';
import { SITE_CONTENT_KEYS, type SiteContentKey, type SiteContentMap } from '@/lib/cms/types';
import { validateSiteDoc } from '@/lib/cms/validate/site';
import type { CacheAdapter } from './cache';
import { ContentUnavailableError } from './errors';
import { compareBySortOrder, compareNotes } from './order';
import type { PublicReader } from './reader';
import { labEntryFromRow, noteFromRow, projectFromRow } from './rows-map';
import type { ContentSource } from './source';

/** Mevcut dosya tabanlı içerik (src/data/*) — yalnızca `static` modunda kullanılır; cms modunda ASLA yedek olarak kullanılmaz. */
export interface StaticContent {
  projects: Project[];
  labEntries: LabEntry[];
  notes: NoteEntry[];
  site: SiteContentSource;
}

export interface ProviderDeps {
  source: () => ContentSource;
  reader: () => PublicReader;
  cache: CacheAdapter;
  staticContent: StaticContent;
  /** Geçersiz satır atlandığında çağrılır: yalnızca varlık türü + slug (içerik YOK). */
  onSkip?: (entity: string, slug: string) => void;
  /** Okuma hatası: yalnızca hata kodu ve tablo adı (içerik/sır YOK). */
  onError?: (code: string, detail: string | undefined) => void;
}

export interface ChromeIdentity {
  brand: { left: string; right: string };
  name: string;
  domain: string;
  description: string;
  /** 'static' = static mod · 'cms' = CMS'ten okundu · 'static-fallback' = cms modunda okunamadı (yalnızca kimlik alanları için, bkz. docs/cms/PUBLIC-CONTENT.md) */
  from: 'cms' | 'static' | 'static-fallback';
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function createContentProvider(deps: ProviderDeps) {
  const { staticContent: sc } = deps;
  const isCms = () => deps.source() === 'cms';

  /** Okuma + doğrulama; HATA önbelleğe yazılmaz (fn fırlatır) ve çağırana ContentUnavailableError olarak ulaşır. */
  async function read<T>(key: string, tags: string[], fn: () => Promise<T>): Promise<T> {
    try {
      return await deps.cache.wrap(key, tags, fn)();
    } catch (e) {
      const err = e instanceof ContentUnavailableError ? e : new ContentUnavailableError('query', `${key}:unexpected`);
      deps.onError?.(err.code, err.detail);
      throw err;
    }
  }

  /** Ham satırlardan `slug → alan` eşlemesi (sıralama anahtarı; yalnızca tipi doğru olanlar). */
  function fieldBySlug<V>(rows: unknown[], field: string, ok: (v: unknown) => v is V): Map<string, V> {
    const m = new Map<string, V>();
    for (const r of rows) {
      const o = r as Record<string, unknown> | null;
      if (o && typeof o.slug === 'string' && ok(o[field])) m.set(o.slug, o[field] as V);
    }
    return m;
  }
  const isNum = (v: unknown): v is number => typeof v === 'number';
  const isStrV = (v: unknown): v is string => typeof v === 'string';

  function mapRows<T, O>(entity: string, rows: unknown[], map: (r: unknown) => T | null, ord: (e: T) => O): { e: T; o: O }[] {
    const out: { e: T; o: O }[] = [];
    for (const row of rows) {
      const e = map(row);
      if (e === null) {
        const slug = typeof row === 'object' && row !== null && typeof (row as { slug?: unknown }).slug === 'string' ? (row as { slug: string }).slug : '?';
        deps.onSkip?.(entity, slug.slice(0, 80));
        continue;
      }
      out.push({ e, o: ord(e) });
    }
    return out;
  }

  /* ─────────────── Projects ─────────────── */
  const cmsProjects = () =>
    read<Project[]>('projects', ['cms-projects'], async () => {
      const rows = await deps.reader().projects();
      const order = fieldBySlug(rows, 'sort_order', isNum);
      const items = mapRows('project', rows, projectFromRow, (p) => ({ slug: p.slug, title: p.title, sort_order: order.get(p.slug) ?? 0 }));
      return items.sort((a, b) => compareBySortOrder(a.o, b.o)).map((x) => x.e);
    });

  async function getProjects(): Promise<Project[]> {
    return isCms() ? cmsProjects() : sc.projects;
  }
  const hasCaseStudy = (p: Project): p is CaseStudyProject => !p.comingSoon && !!p.caseStudy && !!p.seo;
  async function getProject(slug: string): Promise<Project | undefined> {
    if (!isValidSlug(slug)) return undefined;
    return (await getProjects()).find((p) => p.slug === slug);
  }
  async function getCaseStudyProjects(): Promise<CaseStudyProject[]> {
    return (await getProjects()).filter(hasCaseStudy);
  }
  /** Bir sonraki gerçek proje (coming-soon atlanır, sona gelince başa döner). */
  async function getNextProject(slug: string): Promise<CaseStudyProject | undefined> {
    const list = await getCaseStudyProjects();
    const i = list.findIndex((p) => p.slug === slug);
    return i === -1 ? undefined : list[(i + 1) % list.length];
  }

  /* ─────────────── Lab ─────────────── */
  const cmsLab = () =>
    read<LabEntry[]>('lab', ['cms-lab'], async () => {
      const rows = await deps.reader().labEntries();
      const order = fieldBySlug(rows, 'sort_order', isNum);
      const items = mapRows('lab_entry', rows, labEntryFromRow, (e) => ({ slug: e.slug, title: e.title, sort_order: order.get(e.slug) ?? 0 }));
      return items.sort((a, b) => compareBySortOrder(a.o, b.o)).map((x) => x.e);
    });
  const getLabEntries = async (): Promise<LabEntry[]> => (isCms() ? cmsLab() : sc.labEntries);
  async function getLabEntry(slug: string): Promise<LabEntry | undefined> {
    if (!isValidSlug(slug)) return undefined;
    return (await getLabEntries()).find((e) => e.slug === slug);
  }
  async function getFeaturedLabEntries(limit = 3): Promise<LabEntry[]> {
    return (await getLabEntries()).filter((e) => e.featured).slice(0, limit);
  }
  async function getNextLabEntry(slug: string): Promise<LabEntry | undefined> {
    const list = await getLabEntries();
    const i = list.findIndex((e) => e.slug === slug);
    return i === -1 ? undefined : list[(i + 1) % list.length];
  }

  /* ─────────────── Notes ─────────────── */
  const cmsNotes = () =>
    read<NoteEntry[]>('notes', ['cms-notes'], async () => {
      const rows = await deps.reader().notes();
      const stamp = fieldBySlug(rows, 'published_at', isStrV);
      const items = mapRows('note', rows, noteFromRow, (n) => ({ slug: n.slug, published_at: stamp.get(n.slug) ?? n.publishedAt }));
      return items.sort((a, b) => compareNotes(a.o, b.o)).map((x) => x.e);
    });
  const getNotes = async (): Promise<NoteEntry[]> => (isCms() ? cmsNotes() : sc.notes);
  async function getNote(slug: string): Promise<NoteEntry | undefined> {
    if (!isValidSlug(slug)) return undefined;
    return (await getNotes()).find((n) => n.slug === slug);
  }
  const getLatestNotes = async (limit = 3): Promise<NoteEntry[]> => (await getNotes()).slice(0, limit);
  /** Bir sonraki (daha eski) not; sona gelince en yeniye döner. */
  async function getNextNote(slug: string): Promise<NoteEntry | undefined> {
    const list = await getNotes();
    const i = list.findIndex((n) => n.slug === slug);
    return i === -1 ? undefined : list[(i + 1) % list.length];
  }

  /* ─────────────── Site içeriği ─────────────── */
  const cmsSite = () =>
    read<SiteContentSource>('site', ['cms-site'], async () => {
      const rows = await deps.reader().siteDocs();
      const docs: Partial<Record<SiteContentKey, unknown>> = {};
      for (const r of rows) {
        const o = r as { key?: unknown; data?: unknown };
        if (typeof o.key === 'string' && (SITE_CONTENT_KEYS as string[]).includes(o.key)) docs[o.key as SiteContentKey] = o.data;
      }
      // Eksik belge = yayınlanmamış site içeriği: statik içerikle TAMAMLANMAZ (fail-closed). Kimse kısmi/karışık site görmez.
      for (const key of SITE_CONTENT_KEYS) {
        if (!(key in docs)) throw new ContentUnavailableError('invalid', `site:${key}:missing`);
        const v = validateSiteDoc(key, docs[key]);
        if (!v.ok) throw new ContentUnavailableError('invalid', `site:${key}:invalid`);
        (docs as Record<string, unknown>)[key] = v.value;
      }
      return documentsToSiteContent(docs as unknown as SiteContentMap);
    });
  const getSiteContent = async (): Promise<SiteContentSource> => (isCms() ? cmsSite() : sc.site);

  /**
   * Header/Footer/<head> kimliği (marka, ad, alan adı, açıklama). cms modunda CMS'ten okunur.
   * YALNIZCA bu alanlar için, CMS okunamazsa statik değerlere dönülür: site belgeleri "yayından kaldırılamaz" ve bu alanlar
   * yayından-kaldırma hassasiyeti taşımaz; ayrıca 404/hata sayfaları bu alanlara ihtiyaç duyar. İçerik alanları için fallback YOKTUR.
   */
  async function getChromeIdentity(): Promise<ChromeIdentity> {
    const fromStatic = (): ChromeIdentity => ({ brand: sc.site.siteConfig.brand, name: sc.site.siteConfig.name, domain: sc.site.siteConfig.domain, description: sc.site.siteConfig.description, from: 'static-fallback' });
    if (!isCms()) return { ...fromStatic(), from: 'static' };
    try {
      const c = (await cmsSite()).siteConfig;
      if (!DOMAIN_RE.test(c.domain)) throw new ContentUnavailableError('invalid', 'site_meta:domain');
      return { brand: c.brand, name: c.name, domain: c.domain, description: c.description, from: 'cms' };
    } catch {
      return fromStatic();
    }
  }

  /** generateStaticParams için: static modunda dosya slug'ları; cms modunda boş (istek anında üretilir, build'de veritabanı gerekmez). */
  const staticParamSlugs = (kind: 'projects' | 'lab' | 'notes'): string[] => {
    if (isCms()) return [];
    if (kind === 'projects') return sc.projects.filter((p) => !p.comingSoon && !!p.caseStudy).map((p) => p.slug);
    if (kind === 'lab') return sc.labEntries.map((e) => e.slug);
    return sc.notes.map((n) => n.slug);
  };

  return {
    getProjects, getProject, getCaseStudyProjects, getNextProject,
    getLabEntries, getLabEntry, getFeaturedLabEntries, getNextLabEntry,
    getNotes, getNote, getLatestNotes, getNextNote,
    getSiteContent, getChromeIdentity, staticParamSlugs,
  };
}

export type ContentProvider = ReturnType<typeof createContentProvider>;
