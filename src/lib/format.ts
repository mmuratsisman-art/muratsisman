import type { NoteBlock, NoteEntry } from '@/types';

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatReading = (min: number) => `${min} dk okuma`;
/** Türkçe metin için ~200 kelime/dk. */
export function estimateReadingMinutes(blocks: NoteBlock[]): number {
  const words = blocks.reduce((n, b) => n + (b.kind === 'list' ? b.items.join(' ') : b.text).split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.ceil(words / 200));
}

/** Elle girilmiş readingTime varsa onu, yoksa içerikten hesaplananı kullanır. */
export const noteReadingMinutes = (note: NoteEntry) => note.readingTime ?? estimateReadingMinutes(note.content);

export const pad = (n: number) => String(n).padStart(2, '0');
