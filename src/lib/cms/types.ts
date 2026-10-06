import type {
  Accent,
  CaseStudy,
  CurrentlyItem,
  LabCategory,
  LabStatus,
  LabStory,
  LabType,
  NoteBlock,
  ProjectGraphicKind,
  ProjectKind,
  ProjectSize,
  SocialLink,
} from '@/types';
import type { siteConfig } from '@/data/site';

/**
 * Veritabanı kayıt tipleri (supabase/migrations ile birebir). Bilerek elle yazıldı:
 * üretilmiş `Database` generic'i FAZ 3B'de `supabase gen types` ile eklenebilir.
 * Alan adları snake_case (SQL), uygulama modelleri (src/types) camelCase kalır; çeviri mappers.ts'te.
 */

export type ContentStatus = 'draft' | 'preview' | 'published';

export interface SeoColumns {
  seo_title: string | null;
  seo_description: string | null;
  seo_canonical_url: string | null;
  seo_og_media_id: string | null;
  seo_noindex: boolean;
}

export interface BaseColumns extends SeoColumns {
  id: string;
  slug: string;
  status: ContentStatus;
  published_at: string | null;
  cover_media_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ProjectRecord extends BaseColumns {
  sort_order: number;
  title: string;
  subtitle: string;
  summary: string;
  accent: Accent;
  size: ProjectSize;
  graphic: ProjectGraphicKind;
  tags: string[];
  coming_soon: boolean;
  kind: ProjectKind | null;
  type_label: string | null;
  category: string | null;
  project_status_label: string | null;
  project_status_accent: Accent | null;
  case_study: CaseStudy | null;
}

export interface LabEntryRecord extends BaseColumns {
  sort_order: number;
  title: string;
  short_title: string | null;
  type: LabType;
  experiment_status: LabStatus;
  category: string | null;
  summary: string;
  description: string;
  accent: Accent;
  featured: boolean;
  year: string;
  tags: string[];
  story: LabStory;
}

export interface NoteRecord extends BaseColumns {
  title: string;
  excerpt: string;
  content: NoteBlock[];
  tags: string[];
  accent: Accent;
  reading_time_minutes: number | null;
}

export interface MediaAssetRecord {
  id: string;
  bucket: string;
  path: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  size_bytes: number;
  created_at: string;
  created_by: string | null;
}

/** Sunucunun doldurduğu alanlar çıkarılmış ekleme tipi. */
export type Insertable<T extends BaseColumns> = Omit<T, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'published_at'> & {
  published_at?: string | null;
};

/* ───── Site içeriği (tekil dokümanlar) ───── */

export type SiteConfig = typeof siteConfig;

export interface SiteContentMap {
  site_meta: Pick<SiteConfig, 'name' | 'brand' | 'domain' | 'description'>;
  hero: SiteConfig['hero'];
  about: SiteConfig['about'] & { imageMediaId?: string };
  contact: SiteConfig['contact'];
  lab_intro: SiteConfig['lab'];
  lab_page: SiteConfig['labPage'];
  notes_page: SiteConfig['notesPage'];
  currently: { items: CurrentlyItem[] };
  social: { links: SocialLink[] };
  lab_categories: { items: LabCategory[] };
}

export type SiteContentKey = keyof SiteContentMap;

export const SITE_CONTENT_KEYS: SiteContentKey[] = [
  'site_meta',
  'hero',
  'currently',
  'about',
  'contact',
  'social',
  'lab_intro',
  'lab_page',
  'notes_page',
  'lab_categories',
];
