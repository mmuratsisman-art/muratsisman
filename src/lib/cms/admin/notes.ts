import { createClient } from '@/lib/supabase/server';
import type { Accent, NoteBlock } from '@/types';
import { estimateReadingMinutes } from '@/lib/format';
import type { ContentStatus } from '../types';
import type { NoteDoc } from '../validate/notes';
import type { BaseLookup } from './entity-actions';
import { coerceNoteDoc } from './note-form';
import { describeLifecycle, type LifecycleView } from './lifecycle';

export interface NoteBase {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: NoteBlock[];
  tags: string[];
  accent: Accent;
  reading_time_minutes: number | null;
  status: ContentStatus;
  published_at: string | null;
  updated_at: string;
}
export interface DraftRow {
  entity_id: string;
  data: unknown;
  based_on_updated_at: string;
  updated_at: string;
}

const BASE_COLS = 'id, slug, title, excerpt, content, tags, accent, reading_time_minutes, status, published_at, updated_at';
const DRAFT_COLS = 'entity_id, data, based_on_updated_at, updated_at';

export const baseToNoteDoc = (b: NoteBase): NoteDoc => ({
  slug: b.slug,
  title: b.title,
  excerpt: b.excerpt,
  content: b.content,
  tags: b.tags,
  accent: b.accent,
  reading_time_minutes: b.reading_time_minutes,
  published_at: b.published_at,
});

export interface NoteListItem {
  id: string;
  title: string;
  slug: string;
  updatedAt: string;
  lifecycle: LifecycleView;
}

export async function listNotes(): Promise<{ ok: true; items: NoteListItem[] } | { ok: false }> {
  const supabase = await createClient();
  const [bases, drafts] = await Promise.all([
    supabase.from('notes').select(BASE_COLS).order('updated_at', { ascending: false }),
    supabase.from('note_drafts').select(DRAFT_COLS),
  ]);
  if (bases.error || drafts.error) {
    console.error('[cms] listNotes failed', { base: bases.error?.code, draft: drafts.error?.code });
    return { ok: false };
  }
  const draftById = new Map((drafts.data as DraftRow[]).map((d) => [d.entity_id, d]));
  const items = (bases.data as NoteBase[]).map((b): NoteListItem => {
    const d = draftById.get(b.id) ?? null;
    const doc = d ? coerceNoteDoc(d.data, baseToNoteDoc(b)) : baseToNoteDoc(b);
    return {
      id: b.id,
      title: doc.title,
      slug: doc.slug,
      updatedAt: d ? d.updated_at : b.updated_at,
      lifecycle: describeLifecycle({ status: b.status, publishedAt: b.published_at, hasDraft: d !== null, stale: d !== null && d.based_on_updated_at !== b.updated_at }),
    };
  });
  return { ok: true, items };
}

export interface NoteEditorData {
  id: string;
  doc: NoteDoc;
  lifecycle: LifecycleView;
  stale: boolean;
  /** Canlı satırın updated_at'i (form sürüm anahtarı için; Date'e çevrilmez) */
  liveUpdatedAt: string;
  /** Eşzamanlı düzenleme token'ı: taslağın mevcut updated_at'i ('' = henüz taslak yok). Date'e çevrilmez. */
  expectedDraftUpdatedAt: string;
  computedReadingMinutes: number;
}

export async function loadNoteEditor(id: string): Promise<{ ok: true; data: NoteEditorData } | { ok: false; reason: 'not_found' | 'error' }> {
  const supabase = await createClient();
  const [b, d] = await Promise.all([
    supabase.from('notes').select(BASE_COLS).eq('id', id).maybeSingle(),
    supabase.from('note_drafts').select(DRAFT_COLS).eq('entity_id', id).maybeSingle(),
  ]);
  if (b.error || d.error) {
    console.error('[cms] loadNoteEditor failed', { base: b.error?.code, draft: d.error?.code });
    return { ok: false, reason: 'error' };
  }
  if (!b.data) return { ok: false, reason: 'not_found' };
  const base = b.data as NoteBase;
  const draft = (d.data as DraftRow | null) ?? null;
  const doc = draft ? coerceNoteDoc(draft.data, baseToNoteDoc(base)) : baseToNoteDoc(base);
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
      computedReadingMinutes: estimateReadingMinutes(doc.content),
    },
  };
}

export async function getNoteBase(id: string): Promise<BaseLookup> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('notes').select('status, slug').eq('id', id).maybeSingle();
  if (error) {
    console.error('[cms] getNoteBase failed', { code: error.code });
    return { ok: false, reason: 'error' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  return { ok: true, data: data as { status: ContentStatus; slug: string } };
}

/** true/false; okuma hatasında null (çağıran DB kısıtına güvenir). */
export async function noteSlugTaken(slug: string, exceptId?: string): Promise<boolean | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('notes').select('id').eq('slug', slug).limit(2);
  if (error) return null;
  return (data as { id: string }[]).some((r) => r.id !== exceptId);
}
