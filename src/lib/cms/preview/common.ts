import type { LifecycleView } from '../admin/lifecycle';

/**
 * Önizleme mantığı SAF fonksiyonlardır: veritabanına, Next.js'e veya Supabase'e bağımlı değildir ve hiçbir şey yazmaz.
 * Veri okuma, mevcut editör yükleyicileriyle (loadProjectEditor vb.) yapılır; burada yalnızca dönüşüm ve uyarı üretimi vardır.
 */

/** Önizlemenin gösterdiği sürüm: taslak varsa taslak, yoksa canlı kayıt. */
export type PreviewSource = 'draft' | 'live';

export interface PreviewMeta {
  source: PreviewSource;
  /** Taslak, yayındaki sürümden sonra değişmiş bir tabana dayanıyor (yayınlanamaz) */
  stale: boolean;
  /** Mevcut yaşam döngüsü etiketi (örn. "Yayında · bekleyen değişiklik var") */
  lifecycleLabel: string;
}

export function previewMeta(i: { expectedDraftUpdatedAt: string; stale: boolean; lifecycle: Pick<LifecycleView, 'label'> }): PreviewMeta {
  return { source: i.expectedDraftUpdatedAt !== '' ? 'draft' : 'live', stale: i.stale, lifecycleLabel: i.lifecycle.label };
}

export const SOURCE_LABEL: Record<PreviewSource, string> = {
  draft: 'Son kaydedilen TASLAK gösteriliyor',
  live: 'Taslak yok: kayıtlı (canlı) sürüm gösteriliyor',
};

/** Her önizleme sayfasında gösterilen sabit dürüstlük notu. */
export const UNSAVED_NOTE = 'Yalnızca sunucuya KAYDEDİLMİŞ veriyi gösterir; formdaki kaydedilmemiş değişiklikler burada görünmez.';

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const pad2 = (n: number): string => String(n).padStart(2, '0');
