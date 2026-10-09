import type { NoteBlock, NoteEntry } from '@/types';
import { estimateReadingMinutes } from '@/lib/format';
import { noteDocToFormValues } from '../admin/note-form';
import { validateNoteInput, type NoteDoc } from '../validate/notes';
import { isObj } from './common';

/**
 * `content` veritabanından güvenilmeyen jsonb olarak gelir (coerceNoteDoc yalnızca dizi olup olmadığına bakar).
 * NoteBody bozuk bir bloğu (örn. items'ı olmayan liste) render ederken çökebilir; bu yüzden geçerli blokları süzer,
 * geçersizleri SAYAR (uyarı için) ve içerik uydurmaz.
 */
export function sanitizeNoteBlocks(raw: unknown): { blocks: NoteBlock[]; dropped: number } {
  const blocks: NoteBlock[] = [];
  let dropped = 0;
  if (!Array.isArray(raw)) return { blocks, dropped: raw === undefined || raw === null ? 0 : 1 };
  for (const b of raw) {
    if (!isObj(b)) { dropped++; continue; }
    if ((b.kind === 'p' || b.kind === 'h' || b.kind === 'quote') && typeof b.text === 'string') blocks.push({ kind: b.kind, text: b.text });
    else if (b.kind === 'list' && Array.isArray(b.items) && b.items.every((i) => typeof i === 'string')) blocks.push({ kind: 'list', items: b.items as string[] });
    else dropped++;
  }
  return { blocks, dropped };
}

export interface NotePreviewModel {
  note: NoteEntry;
  /** published_at atanmamış (null): yayınlanınca otomatik atanır; önizlemede tarih UYDURULMAZ */
  hasDate: boolean;
  readingMinutes: number;
  warnings: string[];
}

export function buildNotePreview(doc: NoteDoc): NotePreviewModel {
  const { blocks, dropped } = sanitizeNoteBlocks(doc.content);
  const safeDoc: NoteDoc = { ...doc, content: blocks };
  const warnings: string[] = [];
  if (dropped > 0) warnings.push(`${dropped} içerik bloğu geçersiz biçimde olduğu için önizlemede gösterilemedi.`);

  const res = validateNoteInput(noteDocToFormValues(safeDoc), 'publish');
  if (!res.ok) warnings.push(...Object.values(res.errors).map(String));

  const hasDate = !!doc.published_at && !Number.isNaN(new Date(doc.published_at).getTime());
  const note: NoteEntry = {
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt,
    publishedAt: hasDate ? (doc.published_at as string) : '',
    tags: doc.tags,
    accent: doc.accent,
    content: blocks,
  };
  if (doc.reading_time_minutes !== null) note.readingTime = doc.reading_time_minutes;
  return { note, hasDate, readingMinutes: note.readingTime ?? estimateReadingMinutes(blocks), warnings };
}
