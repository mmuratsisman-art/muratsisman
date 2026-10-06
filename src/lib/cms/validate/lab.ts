import type { Accent, LabStatus, LabStory, LabType } from '@/types';
import { isSlug, slugify } from '../slug';
import {
  clean,
  hasControlChars,
  isAccent,
  parseOptionalInt,
  parseTags,
  toParagraphs,
  type Errors,
  type ValidationMode,
  type ValidationResult,
} from './common';

export const LAB_TYPES: readonly LabType[] = ['EXPERIMENT', 'PROTOTYPE', 'CONCEPT'];
export const LAB_STATUSES: readonly LabStatus[] = ['ACTIVE', 'EXPLORING', 'PAUSED', 'ARCHIVED'];
const isLabType = (v: string): v is LabType => (LAB_TYPES as readonly string[]).includes(v);
const isLabStatus = (v: string): v is LabStatus => (LAB_STATUSES as readonly string[]).includes(v);

/** Taslak dokümanı: veritabanı sütun adlarıyla (publish_lab_entry() bu anahtarları okur). */
export interface LabDoc {
  slug: string;
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
  sort_order: number;
}

export const LAB_LIMITS = { title: 120, shortTitle: 40, category: 60, summary: 300, description: 1200, paragraph: 1200, story: 6000, sortMax: 9999 } as const;

export const STORY_KEYS = ['why', 'how', 'learned', 'state'] as const;
export type StoryKey = (typeof STORY_KEYS)[number];

export type LabRaw = Partial<
  Record<
    | 'title' | 'slug' | 'short_title' | 'type' | 'experiment_status' | 'category' | 'summary' | 'description'
    | 'accent' | 'featured' | 'year' | 'tags' | 'sort_order' | 'story_why' | 'story_how' | 'story_learned' | 'story_state',
    string
  >
>;

export function validateLabInput(raw: LabRaw, mode: ValidationMode): ValidationResult<LabDoc> {
  const errors: Errors = {};

  const title = clean(raw.title);
  if (!title) errors.title = 'Başlık gerekli.';
  else if (title.length > LAB_LIMITS.title) errors.title = `Başlık en fazla ${LAB_LIMITS.title} karakter olabilir.`;
  else if (hasControlChars(title) || title.includes('\n')) errors.title = 'Başlık tek satır olmalı.';

  const slug = slugify(clean(raw.slug) || title);
  if (!slug) errors.slug = 'Slug üretilemedi: başlık veya slug alanına harf/rakam içeren bir değer girin.';
  else if (!isSlug(slug)) errors.slug = 'Geçersiz slug.';

  const shortTitle = clean(raw.short_title);
  if (shortTitle.length > LAB_LIMITS.shortTitle) errors.short_title = `Kısa başlık en fazla ${LAB_LIMITS.shortTitle} karakter olabilir.`;

  const typeRaw = clean(raw.type) || 'EXPERIMENT';
  if (!isLabType(typeRaw)) errors.type = 'Geçersiz tür.';
  const statusRaw = clean(raw.experiment_status) || 'EXPLORING';
  if (!isLabStatus(statusRaw)) errors.experiment_status = 'Geçersiz durum.';

  const category = clean(raw.category);
  if (category.length > LAB_LIMITS.category) errors.category = `Kategori en fazla ${LAB_LIMITS.category} karakter olabilir.`;

  const summary = clean(raw.summary).replace(/\s*\n\s*/g, ' ');
  if (summary.length > LAB_LIMITS.summary) errors.summary = `Özet en fazla ${LAB_LIMITS.summary} karakter olabilir.`;
  else if (mode === 'publish' && !summary) errors.summary = 'Yayınlamak için özet gerekli.';

  const description = clean(raw.description).replace(/\s*\n\s*/g, ' ');
  if (description.length > LAB_LIMITS.description) errors.description = `Açıklama en fazla ${LAB_LIMITS.description} karakter olabilir.`;

  const accentRaw = clean(raw.accent) || 'blue';
  if (!isAccent(accentRaw)) errors.accent = 'Geçersiz renk.';

  const year = clean(raw.year);
  if (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2100) errors.year = 'Yıl 4 haneli olmalı (ör. 2026).';

  const tags = parseTags(raw.tags ?? '', errors);

  const sort = parseOptionalInt(raw.sort_order ?? '', 0, LAB_LIMITS.sortMax);
  if (!sort.ok) errors.sort_order = `Sıra 0–${LAB_LIMITS.sortMax} arası tam sayı olmalı.`;

  // Hikâye: dört ayrı alan, boş satırla ayrılmış paragraflar. Boş alanlar kaydedilmez.
  const story: LabStory = {};
  let storyTotal = 0;
  const storyRaw: Record<StoryKey, string | undefined> = { why: raw.story_why, how: raw.story_how, learned: raw.story_learned, state: raw.story_state };
  for (const key of STORY_KEYS) {
    const paragraphs = toParagraphs(storyRaw[key] ?? '');
    if (paragraphs.some((p) => p.length > LAB_LIMITS.paragraph)) {
      errors[`story_${key}`] = `Her paragraf en fazla ${LAB_LIMITS.paragraph} karakter olabilir.`;
      continue;
    }
    storyTotal += paragraphs.reduce((n, p) => n + p.length, 0);
    if (paragraphs.length) story[key] = paragraphs;
  }
  if (storyTotal > LAB_LIMITS.story) errors.story_why = `Hikâye alanları toplamda en fazla ${LAB_LIMITS.story} karakter olabilir.`;

  if (Object.keys(errors).length || !isLabType(typeRaw) || !isLabStatus(statusRaw) || !isAccent(accentRaw) || !sort.ok) return { ok: false, errors };

  return {
    ok: true,
    value: {
      slug,
      title,
      short_title: shortTitle || null,
      type: typeRaw,
      experiment_status: statusRaw,
      category: category || null,
      summary,
      description,
      accent: accentRaw,
      featured: raw.featured === 'on',
      year,
      tags,
      story,
      sort_order: sort.value ?? 0,
    },
  };
}
