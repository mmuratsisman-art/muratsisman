import type { LabStory } from '@/types';
import { isAccent } from '../validate/common';
import { LAB_STATUSES, LAB_TYPES, STORY_KEYS, type LabDoc } from '../validate/lab';

export const LAB_FIELDS = [
  'title', 'slug', 'short_title', 'type', 'experiment_status', 'category', 'summary', 'description', 'accent',
  'featured', 'year', 'tags', 'sort_order', 'story_why', 'story_how', 'story_learned', 'story_state',
] as const;
export type LabFormValues = Record<(typeof LAB_FIELDS)[number], string>;

export const emptyLabDoc = (): LabDoc => ({
  slug: '', title: '', short_title: null, type: 'EXPERIMENT', experiment_status: 'EXPLORING', category: null, summary: '',
  description: '', accent: 'blue', featured: false, year: String(new Date().getUTCFullYear()), tags: [], story: {}, sort_order: 0,
});

export function labDocToFormValues(doc: LabDoc): LabFormValues {
  return {
    title: doc.title,
    slug: doc.slug,
    short_title: doc.short_title ?? '',
    type: doc.type,
    experiment_status: doc.experiment_status,
    category: doc.category ?? '',
    summary: doc.summary,
    description: doc.description,
    accent: doc.accent,
    featured: doc.featured ? 'on' : '',
    year: doc.year,
    tags: doc.tags.join(', '),
    sort_order: String(doc.sort_order),
    story_why: (doc.story.why ?? []).join('\n\n'),
    story_how: (doc.story.how ?? []).join('\n\n'),
    story_learned: (doc.story.learned ?? []).join('\n\n'),
    story_state: (doc.story.state ?? []).join('\n\n'),
  };
}

const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const strArr = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);

export function coerceLabDoc(data: unknown, fallback: LabDoc): LabDoc {
  const o = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const storyIn = o.story && typeof o.story === 'object' && !Array.isArray(o.story) ? (o.story as Record<string, unknown>) : null;
  const story: LabStory = {};
  if (storyIn) for (const k of STORY_KEYS) { const a = strArr(storyIn[k]); if (a?.length) story[k] = a; }
  const type = typeof o.type === 'string' && (LAB_TYPES as readonly string[]).includes(o.type) ? (o.type as LabDoc['type']) : fallback.type;
  const status = typeof o.experiment_status === 'string' && (LAB_STATUSES as readonly string[]).includes(o.experiment_status) ? (o.experiment_status as LabDoc['experiment_status']) : fallback.experiment_status;
  return {
    slug: str(o.slug, fallback.slug),
    title: str(o.title, fallback.title),
    short_title: typeof o.short_title === 'string' && o.short_title ? o.short_title : null,
    type,
    experiment_status: status,
    category: typeof o.category === 'string' && o.category ? o.category : null,
    summary: str(o.summary, fallback.summary),
    description: str(o.description, fallback.description),
    accent: typeof o.accent === 'string' && isAccent(o.accent) ? o.accent : fallback.accent,
    featured: o.featured === true,
    year: str(o.year, fallback.year),
    tags: strArr(o.tags) ?? fallback.tags,
    story: storyIn ? story : fallback.story,
    sort_order: typeof o.sort_order === 'number' ? o.sort_order : fallback.sort_order,
  };
}
