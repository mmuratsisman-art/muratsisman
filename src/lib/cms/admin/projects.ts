import { createClient } from '@/lib/supabase/server';
import type { Accent, CaseStudy, ProjectGraphicKind, ProjectKind, ProjectSize } from '@/types';
import type { ContentStatus } from '../types';
import type { ProjectDoc } from '../validate/projects';
import type { BaseLookup } from './entity-actions';
import { describeLifecycle, type LifecycleView } from './lifecycle';
import { coerceProjectDoc } from './project-form';

export interface ProjectBase {
  id: string;
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
  status: ContentStatus;
  published_at: string | null;
  updated_at: string;
}
export interface ProjectDraftRow {
  entity_id: string;
  data: unknown;
  based_on_updated_at: string;
  updated_at: string;
}

const BASE_COLS =
  'id, slug, title, subtitle, summary, accent, size, graphic, tags, coming_soon, kind, type_label, category, project_status_label, project_status_accent, case_study, sort_order, status, published_at, updated_at';
const DRAFT_COLS = 'entity_id, data, based_on_updated_at, updated_at';

export const baseToProjectDoc = (b: ProjectBase): ProjectDoc => ({
  slug: b.slug,
  title: b.title,
  subtitle: b.subtitle,
  summary: b.summary,
  accent: b.accent,
  size: b.size,
  graphic: b.graphic,
  tags: b.tags,
  coming_soon: b.coming_soon,
  kind: b.kind,
  type_label: b.type_label,
  category: b.category,
  project_status_label: b.project_status_label,
  project_status_accent: b.project_status_accent,
  case_study: b.case_study,
  sort_order: b.sort_order,
});

export interface ProjectListItem {
  id: string;
  title: string;
  slug: string;
  kind: ProjectKind | null;
  sortOrder: number;
  comingSoon: boolean;
  updatedAt: string;
  lifecycle: LifecycleView;
}

export async function listProjects(): Promise<{ ok: true; items: ProjectListItem[] } | { ok: false }> {
  const supabase = await createClient();
  const [bases, drafts] = await Promise.all([
    supabase.from('projects').select(BASE_COLS).order('sort_order', { ascending: true }).order('title', { ascending: true }),
    supabase.from('project_drafts').select(DRAFT_COLS),
  ]);
  if (bases.error || drafts.error) {
    console.error('[cms] listProjects failed', { base: bases.error?.code, draft: drafts.error?.code });
    return { ok: false };
  }
  const draftById = new Map((drafts.data as ProjectDraftRow[]).map((d) => [d.entity_id, d]));
  const items = (bases.data as ProjectBase[]).map((b): ProjectListItem => {
    const d = draftById.get(b.id) ?? null;
    const doc = d ? coerceProjectDoc(d.data, baseToProjectDoc(b)) : baseToProjectDoc(b);
    return {
      id: b.id,
      title: doc.title,
      slug: doc.slug,
      kind: doc.kind,
      sortOrder: doc.sort_order,
      comingSoon: doc.coming_soon,
      updatedAt: d ? d.updated_at : b.updated_at,
      lifecycle: describeLifecycle({ status: b.status, publishedAt: b.published_at, hasDraft: d !== null, stale: d !== null && d.based_on_updated_at !== b.updated_at }),
    };
  });
  return { ok: true, items };
}

export interface ProjectEditorData {
  id: string;
  doc: ProjectDoc;
  lifecycle: LifecycleView;
  stale: boolean;
  /** Canlı satırın updated_at'i (form sürüm anahtarı için; Date'e çevrilmez) */
  liveUpdatedAt: string;
  expectedDraftUpdatedAt: string;
}

export async function loadProjectEditor(id: string): Promise<{ ok: true; data: ProjectEditorData } | { ok: false; reason: 'not_found' | 'error' }> {
  const supabase = await createClient();
  const [b, d] = await Promise.all([
    supabase.from('projects').select(BASE_COLS).eq('id', id).maybeSingle(),
    supabase.from('project_drafts').select(DRAFT_COLS).eq('entity_id', id).maybeSingle(),
  ]);
  if (b.error || d.error) {
    console.error('[cms] loadProjectEditor failed', { base: b.error?.code, draft: d.error?.code });
    return { ok: false, reason: 'error' };
  }
  if (!b.data) return { ok: false, reason: 'not_found' };
  const base = b.data as ProjectBase;
  const draft = (d.data as ProjectDraftRow | null) ?? null;
  const doc = draft ? coerceProjectDoc(draft.data, baseToProjectDoc(base)) : baseToProjectDoc(base);
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

export async function getProjectBase(id: string): Promise<BaseLookup> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').select('status, slug').eq('id', id).maybeSingle();
  if (error) {
    console.error('[cms] getProjectBase failed', { code: error.code });
    return { ok: false, reason: 'error' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  return { ok: true, data: data as { status: ContentStatus; slug: string } };
}

export async function projectSlugTaken(slug: string, exceptId?: string): Promise<boolean | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').select('id').eq('slug', slug).limit(2);
  if (error) return null;
  return (data as { id: string }[]).some((r) => r.id !== exceptId);
}
