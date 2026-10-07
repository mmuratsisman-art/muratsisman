import type { CaseStudy } from '@/types';
import { isAccent } from '../validate/common';
import { PROJECT_GRAPHICS, PROJECT_KINDS, PROJECT_SIZES, type ProjectDoc } from '../validate/projects';

export const PROJECT_FIELDS = [
  'title', 'slug', 'subtitle', 'summary', 'accent', 'size', 'graphic', 'kind', 'type_label', 'category',
  'project_status_label', 'project_status_accent', 'tags', 'coming_soon', 'sort_order', 'case_study',
] as const;
export type ProjectFormValues = Record<(typeof PROJECT_FIELDS)[number], string>;

export const emptyProjectDoc = (): ProjectDoc => ({
  slug: '', title: '', subtitle: '', summary: '', accent: 'blue', size: 'standard', graphic: 'rings', tags: [], coming_soon: false,
  kind: null, type_label: null, category: null, project_status_label: null, project_status_accent: null, case_study: null, sort_order: 0,
});

export function projectDocToFormValues(doc: ProjectDoc): ProjectFormValues {
  return {
    title: doc.title,
    slug: doc.slug,
    subtitle: doc.subtitle,
    summary: doc.summary,
    accent: doc.accent,
    size: doc.size,
    graphic: doc.graphic,
    kind: doc.kind ?? '',
    type_label: doc.type_label ?? '',
    category: doc.category ?? '',
    project_status_label: doc.project_status_label ?? '',
    project_status_accent: doc.project_status_accent ?? '',
    tags: doc.tags.join(', '),
    coming_soon: doc.coming_soon ? 'on' : '',
    sort_order: String(doc.sort_order),
    case_study: doc.case_study ? JSON.stringify(doc.case_study, null, 2) : '',
  };
}

const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Veritabanından gelen (güvenilmeyen) jsonb'u savunmacı biçimde ProjectDoc'a çevirir (yalnızca GÖSTERİM için). */
export function coerceProjectDoc(data: unknown, fb: ProjectDoc): ProjectDoc {
  const o = isObj(data) ? data : {};
  const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
  const nullable = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);
  return {
    slug: str(o.slug, fb.slug),
    title: str(o.title, fb.title),
    subtitle: str(o.subtitle, fb.subtitle),
    summary: str(o.summary, fb.summary),
    accent: typeof o.accent === 'string' && isAccent(o.accent) ? o.accent : fb.accent,
    size: pick(o.size, PROJECT_SIZES, fb.size),
    graphic: pick(o.graphic, PROJECT_GRAPHICS, fb.graphic),
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : fb.tags,
    coming_soon: o.coming_soon === true,
    kind: nullable(o.kind, PROJECT_KINDS),
    type_label: typeof o.type_label === 'string' && o.type_label ? o.type_label : null,
    category: typeof o.category === 'string' && o.category ? o.category : null,
    project_status_label: typeof o.project_status_label === 'string' && o.project_status_label ? o.project_status_label : null,
    project_status_accent: typeof o.project_status_accent === 'string' && isAccent(o.project_status_accent) ? o.project_status_accent : null,
    case_study: isObj(o.case_study) ? (o.case_study as unknown as CaseStudy) : null,
    sort_order: typeof o.sort_order === 'number' ? o.sort_order : fb.sort_order,
  };
}
