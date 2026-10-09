/**
 * Public sıralama kuralları (saf, yerel ayardan bağımsız → her ortamda aynı sonuç).
 *   Projeler / Lab : sort_order ↑, başlık ↑, slug ↑   (admin listesiyle aynı birincil/ikincil sıra; slug benzersiz olduğundan TAM sıralama)
 *   Notlar         : published_at ↓ (yeni → eski), slug ↑
 * Başlık karşılaştırması kod noktası sırasıdır (localeCompare değil): sunucu ICU/yerel ayarına bağlı değildir.
 */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const lower = (s: string): string => s.toLowerCase();

export interface Orderable {
  slug: string;
  title: string;
  sort_order: number;
}

export function compareBySortOrder(a: Orderable, b: Orderable): number {
  return a.sort_order - b.sort_order || cmp(lower(a.title), lower(b.title)) || cmp(a.slug, b.slug);
}

export function compareNotes(a: { slug: string; published_at: string }, b: { slug: string; published_at: string }): number {
  return Date.parse(b.published_at) - Date.parse(a.published_at) || cmp(a.slug, b.slug);
}

export const sortBySortOrder = <T extends Orderable>(rows: readonly T[]): T[] => [...rows].sort(compareBySortOrder);
export const sortNotes = <T extends { slug: string; published_at: string }>(rows: readonly T[]): T[] => [...rows].sort(compareNotes);
