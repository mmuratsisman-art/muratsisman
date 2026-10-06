import type { ContentStatus } from '../types';

export interface LifecycleInput {
  status: ContentStatus;
  /** Canlı satırın published_at'i: dolu ise içerik bir kez yayınlanmıştır (geri dönülecek bir sürüm vardır). */
  publishedAt: string | null;
  hasDraft: boolean;
  /** draft.based_on_updated_at ≠ canlı updated_at */
  stale: boolean;
}

export type LifecycleKey = 'published' | 'published-pending' | 'draft-new' | 'draft-unpublished' | 'preview';
export type LifecycleTone = 'live' | 'pending' | 'draft';

export interface LifecycleView {
  key: LifecycleKey;
  label: string;
  tone: LifecycleTone;
  /** Yayında mı (RLS public okuması için geçerli durum) */
  isPublished: boolean;
  /** Slug alanı kilitli mi (yayındaki içeriğin adresi kırılmasın) */
  slugLocked: boolean;
  canUnpublish: boolean;
  /** Bekleyen taslağı atmak, yalnızca geri dönülecek bir canlı/önceki sürüm varsa anlamlı */
  canDiscard: boolean;
  /** Yayınlanabilir: yayında değilse her zaman; yayındaysa bekleyen değişiklik varsa. Eskimiş taslak yayınlanamaz. */
  canPublish: boolean;
}

export function describeLifecycle(i: LifecycleInput): LifecycleView {
  const isPublished = i.status === 'published';
  const everPublished = i.publishedAt !== null;

  let key: LifecycleKey;
  let label: string;
  let tone: LifecycleTone;
  if (isPublished && i.hasDraft) {
    key = 'published-pending';
    label = 'PUBLISHED · BEKLEYEN DEĞİŞİKLİK';
    tone = 'pending';
  } else if (isPublished) {
    key = 'published';
    label = 'PUBLISHED';
    tone = 'live';
  } else if (i.status === 'preview') {
    key = 'preview';
    label = 'PREVIEW';
    tone = 'draft';
  } else if (everPublished) {
    key = 'draft-unpublished';
    label = 'DRAFT · YAYINDAN KALDIRILDI';
    tone = 'draft';
  } else {
    key = 'draft-new';
    label = 'DRAFT';
    tone = 'draft';
  }

  return {
    key,
    label,
    tone,
    isPublished,
    slugLocked: isPublished,
    canUnpublish: isPublished,
    canDiscard: i.hasDraft && everPublished,
    canPublish: !i.stale && (isPublished ? i.hasDraft : true),
  };
}
