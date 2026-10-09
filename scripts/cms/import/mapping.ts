import type { LabEntry, NoteEntry, Project } from '@/types';
import type { siteConfig } from '@/data/site';

/**
 * Kaynak alan → hedef eşleme sözleşmesi. `Record<keyof …>` kullanıldığı için kaynak tipine yeni bir alan eklenirse
 * `tsc` burada HATA verir: eşleme güncellenmeden import sessizce alan kaybedemez. Çalışma zamanında da
 * (source.ts) gerçek nesnelerin anahtarları bu tabloya karşı denetlenir.
 */
export type How = 'direct' | 'renamed' | 'derived' | 'seo_step' | 'not_imported';
export interface FieldRule { target: string; how: How; note?: string }

export const PROJECT_MAP: Record<keyof Project, FieldRule> = {
  slug: { target: 'slug', how: 'direct' },
  index: { target: 'sort_order', how: 'derived', note: 'saklanmaz; dizi konumu → sort_order, index = sort_order + 1 (doğrulanır)' },
  title: { target: 'title', how: 'direct' },
  subtitle: { target: 'subtitle', how: 'direct' },
  description: { target: 'summary', how: 'renamed' },
  accent: { target: 'accent', how: 'direct' },
  size: { target: 'size', how: 'direct' },
  tags: { target: 'tags', how: 'direct' },
  graphic: { target: 'graphic', how: 'direct' },
  comingSoon: { target: 'coming_soon', how: 'renamed' },
  kind: { target: 'kind', how: 'direct' },
  typeLabel: { target: 'type_label', how: 'renamed' },
  category: { target: 'category', how: 'direct' },
  status: { target: 'project_status_label + project_status_accent', how: 'renamed' },
  seo: { target: 'seo_title + seo_description', how: 'seo_step', note: 'RPC yolu yazmaz; yayından sonra korumalı doğrudan sütun güncellemesi (D3)' },
  caseStudy: { target: 'case_study', how: 'renamed' },
};

export const LAB_MAP: Record<keyof LabEntry, FieldRule> = {
  slug: { target: 'slug', how: 'direct' },
  title: { target: 'title', how: 'direct' },
  shortTitle: { target: 'short_title', how: 'renamed' },
  type: { target: 'type', how: 'direct' },
  status: { target: 'experiment_status', how: 'renamed' },
  summary: { target: 'summary', how: 'direct' },
  description: { target: 'description', how: 'direct' },
  tags: { target: 'tags', how: 'direct' },
  year: { target: 'year', how: 'direct' },
  accent: { target: 'accent', how: 'direct' },
  featured: { target: 'featured', how: 'direct' },
  story: { target: 'story', how: 'direct' },
};

export const NOTE_MAP: Record<keyof NoteEntry, FieldRule> = {
  slug: { target: 'slug', how: 'direct' },
  title: { target: 'title', how: 'direct' },
  excerpt: { target: 'excerpt', how: 'direct' },
  publishedAt: { target: 'published_at', how: 'renamed', note: 'YYYY-MM-DD → YYYY-MM-DDT00:00:00Z' },
  readingTime: { target: 'reading_time_minutes', how: 'renamed' },
  tags: { target: 'tags', how: 'direct' },
  accent: { target: 'accent', how: 'direct' },
  content: { target: 'content', how: 'direct' },
};

/** `siteConfig` üst düzey anahtarları → site_content anahtarları */
export const SITE_CONFIG_MAP: Record<keyof typeof siteConfig, FieldRule> = {
  name: { target: 'site_meta', how: 'direct' },
  brand: { target: 'site_meta', how: 'direct' },
  domain: { target: 'site_meta', how: 'direct' },
  description: { target: 'site_meta', how: 'direct' },
  hero: { target: 'hero', how: 'direct' },
  about: { target: 'about', how: 'direct' },
  lab: { target: 'lab_intro', how: 'renamed' },
  labPage: { target: 'lab_page', how: 'renamed' },
  notesPage: { target: 'notes_page', how: 'renamed' },
  contact: { target: 'contact', how: 'direct' },
};

/** Bilerek taşınmayan kaynaklar (kayıp değil, tasarım kararı). */
export const NOT_IMPORTED_BY_DESIGN = [{ source: 'src/data/navigation.ts', reason: 'CMS anahtarı yok; yapısal veri (docs/cms/CONTENT-MIGRATION.md)' }] as const;
