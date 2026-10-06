import type { CurrentlyItem, LabCategory, LabEntry, NoteEntry, Project, SocialLink } from '@/types';
import type {
  ContentStatus,
  Insertable,
  LabEntryRecord,
  NoteRecord,
  ProjectRecord,
  SiteConfig,
  SiteContentMap,
} from './types';

/**
 * Dosya tabanlı içerik modeli (src/types) ↔ veritabanı satırı eşleyicileri.
 * Saf fonksiyonlardır (Supabase'e bağımlı değil). İki amaçla vardır:
 *   1. scripts/cms/verify-roundtrip.ts: mevcut içeriğin veritabanı şemasına KAYIPSIZ sığdığının kanıtı
 *   2. scripts/cms/generate-seed.ts: ileride tek seferlik geçiş SQL'i üretmek
 * İsteğe bağlı alanlar boşsa anahtar hiç eklenmez (geri dönüşte `undefined` değil, eksik anahtar).
 */

const pad2 = (n: number) => String(n).padStart(2, '0');
const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

/* ───────────── Projects ───────────── */

export function projectToInsert(p: Project, sortOrder: number, status: ContentStatus = 'draft'): Insertable<ProjectRecord> {
  return {
    slug: p.slug,
    status,
    sort_order: sortOrder,
    title: p.title,
    subtitle: p.subtitle,
    summary: p.description,
    accent: p.accent,
    size: p.size,
    graphic: p.graphic,
    tags: p.tags,
    coming_soon: p.comingSoon === true,
    kind: orNull(p.kind),
    type_label: orNull(p.typeLabel),
    category: orNull(p.category),
    project_status_label: p.status ? p.status.label : null,
    project_status_accent: p.status ? p.status.accent : null,
    case_study: orNull(p.caseStudy),
    cover_media_id: null,
    seo_title: p.seo ? p.seo.title : null,
    seo_description: p.seo ? p.seo.description : null,
    seo_canonical_url: null,
    seo_og_media_id: null,
    seo_noindex: false,
  };
}

export function recordToProject(r: ProjectRecord): Project {
  const p: Project = {
    slug: r.slug,
    index: pad2(r.sort_order + 1),
    title: r.title,
    subtitle: r.subtitle,
    description: r.summary,
    accent: r.accent,
    size: r.size,
    tags: r.tags,
    graphic: r.graphic,
  };
  if (r.coming_soon) p.comingSoon = true;
  if (r.kind) p.kind = r.kind;
  if (r.type_label) p.typeLabel = r.type_label;
  if (r.category) p.category = r.category;
  if (r.project_status_label && r.project_status_accent) p.status = { label: r.project_status_label, accent: r.project_status_accent };
  if (r.seo_title !== null && r.seo_description !== null) p.seo = { title: r.seo_title, description: r.seo_description };
  if (r.case_study) p.caseStudy = r.case_study;
  return p;
}

/* ───────────── Lab ───────────── */

export function labEntryToInsert(e: LabEntry, sortOrder: number, status: ContentStatus = 'draft'): Insertable<LabEntryRecord> {
  return {
    slug: e.slug,
    status,
    sort_order: sortOrder,
    title: e.title,
    short_title: orNull(e.shortTitle),
    type: e.type,
    experiment_status: e.status,
    category: null,
    summary: e.summary,
    description: e.description,
    accent: e.accent,
    featured: e.featured === true,
    year: e.year,
    tags: e.tags,
    story: e.story,
    cover_media_id: null,
    seo_title: null,
    seo_description: null,
    seo_canonical_url: null,
    seo_og_media_id: null,
    seo_noindex: false,
  };
}

export function recordToLabEntry(r: LabEntryRecord): LabEntry {
  const e: LabEntry = {
    slug: r.slug,
    title: r.title,
    type: r.type,
    status: r.experiment_status,
    summary: r.summary,
    description: r.description,
    tags: r.tags,
    year: r.year,
    accent: r.accent,
    story: r.story,
  };
  if (r.short_title) e.shortTitle = r.short_title;
  if (r.featured) e.featured = true;
  return e;
}

/* ───────────── Notes ───────────── */

export function noteToInsert(n: NoteEntry, status: ContentStatus = 'draft'): Insertable<NoteRecord> {
  return {
    slug: n.slug,
    status,
    // Not tarihi (YYYY-MM-DD) yayın zamanı olarak UTC gece yarısına eşlenir
    published_at: `${n.publishedAt}T00:00:00Z`,
    title: n.title,
    excerpt: n.excerpt,
    content: n.content,
    tags: n.tags,
    accent: n.accent,
    reading_time_minutes: orNull(n.readingTime),
    cover_media_id: null,
    seo_title: null,
    seo_description: null,
    seo_canonical_url: null,
    seo_og_media_id: null,
    seo_noindex: false,
  };
}

export function recordToNote(r: NoteRecord): NoteEntry {
  const n: NoteEntry = {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    // Yayınlanmamış taslakta tarih yoksa oluşturma tarihi gösterilir
    publishedAt: (r.published_at ?? r.created_at).slice(0, 10),
    tags: r.tags,
    accent: r.accent,
    content: r.content,
  };
  if (r.reading_time_minutes !== null) n.readingTime = r.reading_time_minutes;
  return n;
}

/* ───────────── Site içeriği ───────────── */

export interface SiteContentSource {
  siteConfig: SiteConfig;
  currently: CurrentlyItem[];
  socialLinks: SocialLink[];
  labCategories: LabCategory[];
}

export function siteContentToDocuments(src: SiteContentSource): SiteContentMap {
  const c = src.siteConfig;
  return {
    site_meta: { name: c.name, brand: c.brand, domain: c.domain, description: c.description },
    hero: c.hero,
    about: c.about,
    contact: c.contact,
    lab_intro: c.lab,
    lab_page: c.labPage,
    notes_page: c.notesPage,
    currently: { items: src.currently },
    social: { links: src.socialLinks },
    lab_categories: { items: src.labCategories },
  };
}

export function documentsToSiteContent(d: SiteContentMap): SiteContentSource {
  const { imageMediaId, ...about } = d.about;
  void imageMediaId; // profil görseli referansı henüz sunumda kullanılmıyor
  return {
    siteConfig: {
      ...d.site_meta,
      hero: d.hero,
      about,
      lab: d.lab_intro,
      labPage: d.lab_page,
      notesPage: d.notes_page,
      contact: d.contact,
    },
    currently: d.currently.items,
    socialLinks: d.social.links,
    labCategories: d.lab_categories.items,
  };
}
