import { createClient } from '@/lib/supabase/server';
import { SITE_CONTENT_KEYS, type SiteContentKey } from '../types';
import { describeSiteLifecycle, sameDoc, type SiteLifecycleView } from './site-lifecycle';

export interface SiteDraftRow {
  key: string;
  data: unknown;
  updated_at: string;
}
export interface SitePublishedRow {
  key: string;
  data: unknown;
  published_at: string;
}

const lifecycleOf = (d: SiteDraftRow | null, p: SitePublishedRow | null): SiteLifecycleView =>
  describeSiteLifecycle({ hasPublished: p !== null, hasDraft: d !== null, draftEqualsPublished: d !== null && p !== null && sameDoc(d.data, p.data) });

export interface SiteListItem {
  key: SiteContentKey;
  lifecycle: SiteLifecycleView;
  /** Son değişiklik: taslak varsa taslağın, yoksa yayının zamanı; hiç içerik yoksa null */
  updatedAt: string | null;
}

export async function listSiteContent(): Promise<{ ok: true; items: SiteListItem[] } | { ok: false }> {
  const supabase = await createClient();
  const [d, p] = await Promise.all([supabase.from('site_content_drafts').select('key, data, updated_at'), supabase.from('site_content_published').select('key, data, published_at')]);
  if (d.error || p.error) {
    console.error('[cms] listSiteContent failed', { draft: d.error?.code, published: p.error?.code });
    return { ok: false };
  }
  const drafts = new Map((d.data as SiteDraftRow[]).map((r) => [r.key, r]));
  const pubs = new Map((p.data as SitePublishedRow[]).map((r) => [r.key, r]));
  return {
    ok: true,
    items: SITE_CONTENT_KEYS.map((key): SiteListItem => {
      const dr = drafts.get(key) ?? null;
      const pr = pubs.get(key) ?? null;
      return { key, lifecycle: lifecycleOf(dr, pr), updatedAt: dr ? dr.updated_at : pr ? pr.published_at : null };
    }),
  };
}

export interface SiteEditorData {
  key: SiteContentKey;
  /** Düzenleyicide gösterilecek belge: taslak varsa taslak, yoksa yayındaki; ikisi de yoksa null (boş iskelet) */
  doc: unknown | null;
  lifecycle: SiteLifecycleView;
  /** Yayının zamanı (form sürüm anahtarı için; Date'e çevrilmez) */
  liveUpdatedAt: string;
  /** Eşzamanlı düzenleme token'ı: taslağın updated_at'i ('' = taslak yok) */
  expectedDraftUpdatedAt: string;
}

export async function loadSiteEditor(key: SiteContentKey): Promise<{ ok: true; data: SiteEditorData } | { ok: false }> {
  const supabase = await createClient();
  const [d, p] = await Promise.all([
    supabase.from('site_content_drafts').select('key, data, updated_at').eq('key', key).maybeSingle(),
    supabase.from('site_content_published').select('key, data, published_at').eq('key', key).maybeSingle(),
  ]);
  if (d.error || p.error) {
    console.error('[cms] loadSiteEditor failed', { draft: d.error?.code, published: p.error?.code });
    return { ok: false };
  }
  const draft = (d.data as SiteDraftRow | null) ?? null;
  const pub = (p.data as SitePublishedRow | null) ?? null;
  return {
    ok: true,
    data: {
      key,
      doc: draft ? draft.data : pub ? pub.data : null,
      lifecycle: lifecycleOf(draft, pub),
      liveUpdatedAt: pub ? pub.published_at : '',
      expectedDraftUpdatedAt: draft ? draft.updated_at : '',
    },
  };
}
