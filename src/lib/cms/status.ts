import type { ContentStatus } from './types';

/** Herkese açık sayfalarda yalnızca 'published' içerik gösterilir. RLS ile aynı kural, uygulama katmanında da korunur. */
export const isPublic = (status: ContentStatus): boolean => status === 'published';

/** Veritabanı tetikleyicisiyle (enforce_content_status) aynı geçiş tablosu. */
const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ['preview'],
  preview: ['draft', 'published'],
  published: ['draft'],
};

export const canTransition = (from: ContentStatus, to: ContentStatus): boolean => TRANSITIONS[from].includes(to);

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isValidSlug = (slug: string): boolean => slug.length > 0 && slug.length <= 80 && SLUG_PATTERN.test(slug);
