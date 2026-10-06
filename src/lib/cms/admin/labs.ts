import { createClient } from '@/lib/supabase/server';
import type { Accent, LabStatus, LabStory, LabType } from '@/types';
import type { ContentStatus } from '../types';
import type { LabDoc } from '../validate/lab';
import type { BaseLookup } from './entity-actions';
import { coerceLabDoc } from './lab-form';
import { describeLifecycle, type LifecycleView } from './lifecycle';

export interface LabBase {
  id: string;
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
  status: ContentStatus;
  published_at: string | null;
  updated_at: string;
}
export interface LabDraftRow {
  entity_id: string;
  data: unknown;
  based_on_updated_at: string;
  updated_at: string;
}

const BASE_COLS =
  'id, slug, title, short_title, type, experiment_status, category, summary, description, accent, featured, year, tags, story, sort_order, status, published_at, updated_at';
const DRAFT_COLS = 'entity_id, data, based_on_updated_at, updated_at';

export const baseToLabDoc = (b: LabBase): LabDoc => ({
  slug: b.slug,
  title: b.title,
  short_title: b.short_title,
  type: b.type,
  experiment_status: b.experiment_status,
  category: b.category,
  summary: b.summary,
  description: b.description,
  accent: b.accent,
  featured: b.featured,
  year: b.year,
  tags: b.tags,
  story: b.story,
  sort_order: b.sort_order,
});

export interface LabListItem {
  id: string;
  title: string;
  slug: string;
  type: LabType;
  sortOrder: number;
  updatedAt: string;
  lifecycle: LifecycleView;
}

export async function listLabEntries(): Promise<{ ok: true; items: LabListItem[] } | { ok: false }> {
  const supabase = await createClient();
  const [bases, drafts] = await Promise.all([
    supabase.from('lab_entries').select(BASE_COLS).order('sort_order', { ascending: true }).order('title', { ascending: true }),
    supabase.from('lab_entry_drafts').select(DRAFT_COLS),
  ]);
  if (bases.error || drafts.error) {
    console.error('[cms] listLabEntries failed', { base: bases.error?.code, draft: drafts.error?.code });
    return { ok: false };
  }
  const draftById = new Map((drafts.data as LabDraftRow[]).map((d) => [d.entity_id, d]));
  const items = (bases.data as LabBase[]).map((b): LabListItem => {
    const d = draftById.get(b.id) ?? null;
    const doc = d ? coerceLabDoc(d.data, baseToLabDoc(b)) : baseToLabDoc(b);
    return {
      id: b.id,
      title: doc.title,
      slug: doc.slug,
      type: doc.type,
      sortOrder: doc.sort_order,
      updatedAt: d ? d.updated_at : b.updated_at,
      lifecycle: describeLifecycle({ status: b.status, publishedAt: b.published_at, hasDraft: d !== null, stale: d !== null && d.based_on_updated_at !== b.updated_at }),
    };
  });
  return { ok: true, items };
}

export interface LabEditorData {
  id: string;
  doc: LabDoc;
  lifecycle: LifecycleView;
  stale: boolean;
  /** Canlı satırın updated_at'i (form sürüm anahtarı için; Date'e çevrilmez) */
  liveUpdatedAt: string;
  expectedDraftUpdatedAt: string;
}

export async function loadLabEditor(id: string): Promise<{ ok: true; data: LabEditorData } | { ok: false; reason: 'not_found' | 'error' }> {
  const supabase = await createClient();
  const [b, d] = await Promise.all([
    supabase.from('lab_entries').select(BASE_COLS).eq('id', id).maybeSingle(),
    supabase.from('lab_entry_drafts').select(DRAFT_COLS).eq('entity_id', id).maybeSingle(),
  ]);
  if (b.error || d.error) {
    console.error('[cms] loadLabEditor failed', { base: b.error?.code, draft: d.error?.code });
    return { ok: false, reason: 'error' };
  }
  if (!b.data) return { ok: false, reason: 'not_found' };
  const base = b.data as LabBase;
  const draft = (d.data as LabDraftRow | null) ?? null;
  const doc = draft ? coerceLabDoc(draft.data, baseToLabDoc(base)) : baseToLabDoc(base);
  const stale = draft !== null && draft.based_on_updated_at !== base.updated_at;
  return {
    ok: true,
    data: {
      id,
      doc,
      stale,
      liveUpdatedAt: base.updated_at,
      lifecycle: describeLifecycle({ status: base.status, publishedAt: base.published_at, hasDraft: draft !== null, stale }),
      expectedDraftUpdatedAt: draft ? draft.updated_at : '',
    },
  };
}

export async function getLabBase(id: string): Promise<BaseLookup> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('lab_entries').select('status, slug').eq('id', id).maybeSingle();
  if (error) {
    console.error('[cms] getLabBase failed', { code: error.code });
    return { ok: false, reason: 'error' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  return { ok: true, data: data as { status: ContentStatus; slug: string } };
}

export async function labSlugTaken(slug: string, exceptId?: string): Promise<boolean | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('lab_entries').select('id').eq('slug', slug).limit(2);
  if (error) return null;
  return (data as { id: string }[]).some((r) => r.id !== exceptId);
}
