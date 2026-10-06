import type { Accent, NoteBlock } from '@/types';
import { parseNoteMarkup } from '../note-markup';
import { isSlug, slugify } from '../slug';
import {
  clean,
  hasControlChars,
  isAccent,
  parseDateOnly,
  parseOptionalInt,
  parseTags,
  type Errors,
  type ValidationMode,
  type ValidationResult,
} from './common';

/** Taslak dokümanı: veritabanı sütun adlarıyla (publish_note() bu anahtarları okur). */
export interface NoteDoc {
  slug: string;
  title: string;
  excerpt: string;
  content: NoteBlock[];
  tags: string[];
  accent: Accent;
  reading_time_minutes: number | null;
  /** 'YYYY-MM-DDT00:00:00Z' veya null (yayınlanınca otomatik atanır) */
  published_at: string | null;
}

export const NOTE_LIMITS = { title: 160, excerpt: 400, body: 60000, blocks: 400, readingMin: 1, readingMax: 120 } as const;

export type NoteRaw = Partial<Record<'title' | 'slug' | 'excerpt' | 'body' | 'tags' | 'accent' | 'published_at' | 'reading_time', string>>;

/**
 * Sunucu tarafı doğrulama. mode='draft': yalnızca "kaydedilebilir olma" (başlık, slug, biçimler).
 * mode='publish': ayrıca özet ve gövde zorunlu.
 */
export function validateNoteInput(raw: NoteRaw, mode: ValidationMode): ValidationResult<NoteDoc> {
  const errors: Errors = {};

  const title = clean(raw.title);
  if (!title) errors.title = 'Başlık gerekli.';
  else if (title.length > NOTE_LIMITS.title) errors.title = `Başlık en fazla ${NOTE_LIMITS.title} karakter olabilir.`;
  else if (hasControlChars(title) || title.includes('\n')) errors.title = 'Başlık tek satır olmalı.';

  const slugSource = clean(raw.slug) || title;
  const slug = slugify(slugSource);
  if (!slug) errors.slug = 'Slug üretilemedi: başlık veya slug alanına harf/rakam içeren bir değer girin.';
  else if (!isSlug(slug)) errors.slug = 'Geçersiz slug.';

  const excerpt = clean(raw.excerpt).replace(/\s*\n\s*/g, ' ');
  if (excerpt.length > NOTE_LIMITS.excerpt) errors.excerpt = `Özet en fazla ${NOTE_LIMITS.excerpt} karakter olabilir.`;
  else if (mode === 'publish' && !excerpt) errors.excerpt = 'Yayınlamak için özet gerekli.';

  const bodyText = (raw.body ?? '').replace(/\r\n?/g, '\n');
  let content: NoteBlock[] = [];
  if (bodyText.length > NOTE_LIMITS.body) {
    errors.body = `Gövde en fazla ${NOTE_LIMITS.body} karakter olabilir.`;
  } else {
    const parsed = parseNoteMarkup(bodyText);
    if (parsed.issues.length) {
      const first = parsed.issues[0];
      errors.body = `Satır ${first.line}: ${first.message}`;
    } else if (parsed.blocks.length > NOTE_LIMITS.blocks) {
      errors.body = `Gövde en fazla ${NOTE_LIMITS.blocks} blok içerebilir.`;
    } else {
      content = parsed.blocks;
      if (mode === 'publish' && content.length === 0) errors.body = 'Yayınlamak için gövde gerekli.';
    }
  }

  const tags = parseTags(raw.tags ?? '', errors);

  const accentRaw = clean(raw.accent) || 'blue';
  if (!isAccent(accentRaw)) errors.accent = 'Geçersiz renk.';

  const date = parseDateOnly(raw.published_at ?? '');
  if (!date.ok) errors.published_at = 'Geçerli bir tarih girin (YYYY-AA-GG).';

  const reading = parseOptionalInt(raw.reading_time ?? '', NOTE_LIMITS.readingMin, NOTE_LIMITS.readingMax);
  if (!reading.ok) errors.reading_time = `Okuma süresi ${NOTE_LIMITS.readingMin}–${NOTE_LIMITS.readingMax} arası tam sayı olmalı (boş bırakırsanız otomatik hesaplanır).`;

  if (Object.keys(errors).length || !date.ok || !reading.ok || !isAccent(accentRaw)) return { ok: false, errors };

  return {
    ok: true,
    value: {
      slug,
      title,
      excerpt,
      content,
      tags,
      accent: accentRaw,
      reading_time_minutes: reading.value,
      published_at: date.value,
    },
  };
}
