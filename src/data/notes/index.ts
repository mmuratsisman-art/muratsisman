import type { NoteEntry } from '@/types';
import { buildingSmall } from './building-small';
import { automationFriction } from './automation-friction';
import { usefulAiAssistant } from './useful-ai-assistant';

/** Yeni not eklemek: ./<slug>.ts dosyası oluştur, buraya ekle. Liste yayın tarihine göre (yeni → eski) sıralanır. */
export const notes: NoteEntry[] = [buildingSmall, automationFriction, usefulAiAssistant].sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt),
);

export const latestNotes = (limit = 3): NoteEntry[] => notes.slice(0, limit);

export const getNote = (slug: string): NoteEntry | undefined => notes.find((n) => n.slug === slug);

/** Bir sonraki (daha eski) not; sona gelince en yeniye döner. */
export function getNextNote(slug: string): NoteEntry | undefined {
  const i = notes.findIndex((n) => n.slug === slug);
  return i === -1 ? undefined : notes[(i + 1) % notes.length];
}
