import type { Accent, CaseStudy, ProjectGraphicKind, ProjectKind, ProjectSize } from '@/types';
import { isSlug, slugify } from '../slug';
import { parseCaseStudyText } from './case-study';
import { clean, hasControlChars, isAccent, parseOptionalInt, parseTags, type Errors, type ValidationMode, type ValidationResult } from './common';

export const PROJECT_SIZES: readonly ProjectSize[] = ['feature', 'standard', 'teaser'];
export const PROJECT_GRAPHICS: readonly ProjectGraphicKind[] = ['rings', 'flow', 'nodes', 'dots'];
export const PROJECT_KINDS: readonly ProjectKind[] = ['personal', 'work', 'ai-experiment'];
const isSize = (v: string): v is ProjectSize => (PROJECT_SIZES as readonly string[]).includes(v);
const isGraphic = (v: string): v is ProjectGraphicKind => (PROJECT_GRAPHICS as readonly string[]).includes(v);
const isKind = (v: string): v is ProjectKind => (PROJECT_KINDS as readonly string[]).includes(v);

/** Taslak dokümanı: veritabanı sütun adlarıyla (publish_project() bu anahtarları okur). Yalnızca MEVCUT şemadaki alanlar. */
export interface ProjectDoc {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  accent: Accent;
  size: ProjectSize;
  graphic: ProjectGraphicKind;
  tags: string[];
  coming_soon: boolean;
  kind: ProjectKind | null;
  type_label: string | null;
  category: string | null;
  project_status_label: string | null;
  project_status_accent: Accent | null;
  case_study: CaseStudy | null;
  sort_order: number;
}

export const PROJECT_LIMITS = { title: 120, subtitle: 160, summary: 600, typeLabel: 40, category: 80, pill: 40, sortMax: 9999 } as const;

export type ProjectRaw = Record<string, string | undefined>;

/**
 * mode='draft': yalnızca "kaydedilebilir olma". mode='publish': yayında görünecek içerik için ek zorunluluklar.
 * "Çok yakında" (coming_soon) projeler detay sayfası olmadığından yalnızca başlık/slug ister.
 */
export function validateProjectInput(raw: ProjectRaw, mode: ValidationMode): ValidationResult<ProjectDoc> {
  const errors: Errors = {};
  const comingSoon = raw.coming_soon === 'on';
  const publish = mode === 'publish';

  const title = clean(raw.title);
  if (!title) errors.title = 'Başlık gerekli.';
  else if (title.length > PROJECT_LIMITS.title) errors.title = `Başlık en fazla ${PROJECT_LIMITS.title} karakter olabilir.`;
  else if (hasControlChars(title) || title.includes('\n')) errors.title = 'Başlık tek satır olmalı.';

  const slug = slugify(clean(raw.slug) || title);
  if (!slug) errors.slug = 'Slug üretilemedi: başlık veya slug alanına harf/rakam içeren bir değer girin.';
  else if (!isSlug(slug)) errors.slug = 'Geçersiz slug.';

  const subtitle = clean(raw.subtitle).replace(/\s*\n\s*/g, ' ');
  if (subtitle.length > PROJECT_LIMITS.subtitle) errors.subtitle = `Alt başlık en fazla ${PROJECT_LIMITS.subtitle} karakter olabilir.`;

  const summary = clean(raw.summary).replace(/\s*\n\s*/g, ' ');
  if (summary.length > PROJECT_LIMITS.summary) errors.summary = `Özet en fazla ${PROJECT_LIMITS.summary} karakter olabilir.`;
  else if (publish && !comingSoon && !summary) errors.summary = 'Yayınlamak için özet gerekli.';

  const accentRaw = clean(raw.accent) || 'blue';
  if (!isAccent(accentRaw)) errors.accent = 'Geçersiz renk.';
  const sizeRaw = clean(raw.size) || 'standard';
  if (!isSize(sizeRaw)) errors.size = 'Geçersiz boyut.';
  const graphicRaw = clean(raw.graphic) || 'rings';
  if (!isGraphic(graphicRaw)) errors.graphic = 'Geçersiz grafik.';

  const kindRaw = clean(raw.kind);
  if (kindRaw && !isKind(kindRaw)) errors.kind = 'Geçersiz tür.';
  else if (publish && !comingSoon && !kindRaw) errors.kind = 'Yayınlamak için proje türü gerekli.';

  const typeLabel = clean(raw.type_label);
  if (typeLabel.length > PROJECT_LIMITS.typeLabel) errors.type_label = `Etiket en fazla ${PROJECT_LIMITS.typeLabel} karakter olabilir.`;
  else if (publish && !comingSoon && !typeLabel) errors.type_label = 'Yayınlamak için tür etiketi gerekli.';

  const category = clean(raw.category);
  if (category.length > PROJECT_LIMITS.category) errors.category = `Kategori en fazla ${PROJECT_LIMITS.category} karakter olabilir.`;
  else if (publish && !comingSoon && !category) errors.category = 'Yayınlamak için kategori gerekli.';

  const pillLabel = clean(raw.project_status_label);
  const pillAccentRaw = clean(raw.project_status_accent);
  if (pillLabel.length > PROJECT_LIMITS.pill) errors.project_status_label = `Durum etiketi en fazla ${PROJECT_LIMITS.pill} karakter olabilir.`;
  if (pillAccentRaw && !isAccent(pillAccentRaw)) errors.project_status_accent = 'Geçersiz renk.';
  else if (pillLabel && !pillAccentRaw) errors.project_status_accent = 'Durum etiketi için bir renk seçin.';
  else if (!pillLabel && pillAccentRaw) errors.project_status_label = 'Renk seçtiniz; durum etiketi metnini de girin (ya da rengi boş bırakın).';

  const tags = parseTags(raw.tags ?? '', errors);
  const sort = parseOptionalInt(raw.sort_order ?? '', 0, PROJECT_LIMITS.sortMax);
  if (!sort.ok) errors.sort_order = `Sıra 0–${PROJECT_LIMITS.sortMax} arası tam sayı olmalı.`;

  const cs = parseCaseStudyText(raw.case_study ?? '');
  if (!cs.ok) errors.case_study = cs.error;
  else if (publish && !comingSoon && cs.value === null) errors.case_study = 'Yayınlamak için case study (JSON) gerekli.';

  if (
    Object.keys(errors).length || !isAccent(accentRaw) || !isSize(sizeRaw) || !isGraphic(graphicRaw) || !sort.ok || !cs.ok ||
    (pillAccentRaw !== '' && !isAccent(pillAccentRaw)) || (kindRaw !== '' && !isKind(kindRaw))
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      slug,
      title,
      subtitle,
      summary,
      accent: accentRaw,
      size: sizeRaw,
      graphic: graphicRaw,
      tags,
      coming_soon: comingSoon,
      kind: kindRaw === '' ? null : (kindRaw as ProjectKind),
      type_label: typeLabel || null,
      category: category || null,
      project_status_label: pillLabel || null,
      project_status_accent: pillLabel ? (pillAccentRaw as Accent) : null,
      case_study: cs.value,
      sort_order: sort.value ?? 0,
    },
  };
}
