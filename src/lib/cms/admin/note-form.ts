import type { NoteBlock } from '@/types';
import { serializeNoteBlocks } from '../note-markup';
import { isAccent } from '../validate/common';
import type { NoteDoc } from '../validate/notes';

export const NOTE_FIELDS = ['title', 'slug', 'excerpt', 'body', 'tags', 'accent', 'published_at', 'reading_time'] as const;
export type NoteFormValues = Record<(typeof NOTE_FIELDS)[number], string>;

export const emptyNoteDoc = (): NoteDoc => ({ slug: '', title: '', excerpt: '', content: [], tags: [], accent: 'blue', reading_time_minutes: null, published_at: null });

export function noteDocToFormValues(doc: NoteDoc): NoteFormValues {
  return {
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    body: serializeNoteBlocks(doc.content),
    tags: doc.tags.join(', '),
    accent: doc.accent,
    published_at: doc.published_at ? doc.published_at.slice(0, 10) : '',
    reading_time: doc.reading_time_minutes === null ? '' : String(doc.reading_time_minutes),
  };
}

const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

/** Veritabanından gelen (güvenilmeyen) jsonb'u savunmacı biçimde NoteDoc'a çevirir. */
export function coerceNoteDoc(data: unknown, fallback: NoteDoc): NoteDoc {
  const o = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return {
    slug: str(o.slug, fallback.slug),
    title: str(o.title, fallback.title),
    excerpt: str(o.excerpt, fallback.excerpt),
    content: Array.isArray(o.content) ? (o.content as NoteBlock[]) : fallback.content,
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : fallback.tags,
    accent: typeof o.accent === 'string' && isAccent(o.accent) ? o.accent : fallback.accent,
    reading_time_minutes: typeof o.reading_time_minutes === 'number' ? o.reading_time_minutes : null,
    published_at: typeof o.published_at === 'string' ? o.published_at : null,
  };
}
