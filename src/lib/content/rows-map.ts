import type { Accent, LabEntry, NoteBlock, NoteEntry, Project } from '@/types';
import { recordToLabEntry, recordToNote, recordToProject } from '@/lib/cms/mappers';
import type { LabEntryRecord, NoteRecord, ProjectRecord } from '@/lib/cms/types';
import { isValidSlug } from '@/lib/cms/status';
import { validateCaseStudy } from '@/lib/cms/validate/case-study';
import { isAccent } from '@/lib/cms/validate/common';
import { LAB_STATUSES, LAB_TYPES, STORY_KEYS } from '@/lib/cms/validate/lab';
import { PROJECT_GRAPHICS, PROJECT_KINDS, PROJECT_SIZES } from '@/lib/cms/validate/projects';

/**
 * Veritabanı satırı (güvenilmeyen jsonb dahil) → public model. SAF fonksiyonlar.
 * Geçersiz satır `null` döner (çağıran atlar ve yalnızca slug + varlık türünü loglar); çökme yok, içerik uydurma yok.
 * Her fonksiyon `status === 'published'` koşulunu SAVUNMA DERİNLİĞİ olarak tekrar kontrol eder (RLS + sorgu filtresi zaten uygular).
 */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => isStr(v) && (list as readonly string[]).includes(v);
const accent = (v: unknown): v is Accent => isStr(v) && isAccent(v);
const nullableStr = (v: unknown): v is string | null => v === null || isStr(v);

export function projectFromRow(row: unknown): Project | null {
  if (!isObj(row)) return null;
  const r = row;
  if (r.status !== 'published' || !isStr(r.slug) || !isValidSlug(r.slug)) return null;
  if (!isStr(r.title) || !isStr(r.subtitle) || !isStr(r.summary) || typeof r.sort_order !== 'number' || !Number.isInteger(r.sort_order) || r.sort_order < 0) return null;
  if (!accent(r.accent) || !oneOf(r.size, PROJECT_SIZES) || !oneOf(r.graphic, PROJECT_GRAPHICS) || !strArr(r.tags) || typeof r.coming_soon !== 'boolean') return null;
  if (!(r.kind === null || oneOf(r.kind, PROJECT_KINDS)) || !nullableStr(r.type_label) || !nullableStr(r.category)) return null;
  if (!nullableStr(r.project_status_label) || !(r.project_status_accent === null || accent(r.project_status_accent)) || !nullableStr(r.seo_title) || !nullableStr(r.seo_description)) return null;
  let caseStudy = null;
  if (r.case_study !== null && r.case_study !== undefined) {
    const v = validateCaseStudy(r.case_study);
    if (!v.ok) return null;
    caseStudy = v.value;
  }
  const p = recordToProject({ ...r, case_study: caseStudy } as unknown as ProjectRecord);
  // Public detay sayfası `seo` ister (tip sözleşmesi). CMS'te seo_* yoksa metadata başlığı/açıklaması projenin kendi alanlarından türetilir
  // (yalnızca <head> metadata'sı için; sayfada gösterilmez). SEO alanı tanımlıysa aynen kullanılır.
  if (p.caseStudy && !p.seo) p.seo = { title: p.title, description: p.description || p.subtitle };
  return p;
}

export function labEntryFromRow(row: unknown): LabEntry | null {
  if (!isObj(row)) return null;
  const r = row;
  if (r.status !== 'published' || !isStr(r.slug) || !isValidSlug(r.slug)) return null;
  if (!isStr(r.title) || !isStr(r.summary) || !isStr(r.description) || !isStr(r.year) || typeof r.sort_order !== 'number') return null;
  if (!oneOf(r.type, LAB_TYPES) || !oneOf(r.experiment_status, LAB_STATUSES) || !accent(r.accent) || !strArr(r.tags) || typeof r.featured !== 'boolean') return null;
  if (!nullableStr(r.short_title)) return null;
  if (!isObj(r.story)) return null;
  const story: Record<string, string[]> = {};
  for (const k of STORY_KEYS) {
    const v = r.story[k];
    if (v === undefined) continue;
    if (!strArr(v)) return null;
    if (v.length) story[k] = v;
  }
  return recordToLabEntry({ ...r, story } as unknown as LabEntryRecord);
}

const validBlock = (b: unknown): b is NoteBlock =>
  isObj(b) && (((b.kind === 'p' || b.kind === 'h' || b.kind === 'quote') && isStr(b.text)) || (b.kind === 'list' && strArr(b.items)));

export function noteFromRow(row: unknown): NoteEntry | null {
  if (!isObj(row)) return null;
  const r = row;
  if (r.status !== 'published' || !isStr(r.slug) || !isValidSlug(r.slug)) return null;
  // Yayınlanmış nota DB kısıtı published_at zorunlu kılar; yine de geçerli bir tarih değilse atla (tarih uydurulmaz)
  if (!isStr(r.published_at) || Number.isNaN(Date.parse(r.published_at))) return null;
  if (!isStr(r.title) || !isStr(r.excerpt) || !strArr(r.tags) || !accent(r.accent)) return null;
  if (!Array.isArray(r.content) || !r.content.every(validBlock)) return null;
  if (!(r.reading_time_minutes === null || (typeof r.reading_time_minutes === 'number' && r.reading_time_minutes > 0))) return null;
  return recordToNote({ ...r, created_at: isStr(r.created_at) ? r.created_at : r.published_at } as unknown as NoteRecord);
}
