import type { LifecycleTone } from './lifecycle';

/** Anahtar sırasından bağımsız, kararlı JSON (jsonb anahtar sırasını normalize eder; karşılaştırma bu yüzden kanonik yapılır). */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}
export const sameDoc = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

export type SiteLifecycleKey = 'empty' | 'draft-new' | 'published' | 'published-pending';

export interface SiteLifecycleView {
  key: SiteLifecycleKey;
  label: string;
  tone: LifecycleTone;
  hasPublished: boolean;
  /** Yayında VE taslak yayındakinden farklı */
  pending: boolean;
  canPublish: boolean;
  canDiscard: boolean;
  /** Site içeriğinde "yayından kaldır" YOKTUR: public site bu belgelere ihtiyaç duyar */
  canUnpublish: false;
}

/**
 * Tekil site belgeleri için durum: Draft / Published / Published + Pending Changes.
 * "Bekleyen değişiklik" = taslak satırı var VE içeriği yayındakinden farklı (yayın sonrası taslak satırı yayına eşit kalır).
 */
export function describeSiteLifecycle(i: { hasPublished: boolean; hasDraft: boolean; draftEqualsPublished: boolean }): SiteLifecycleView {
  const pending = i.hasPublished && i.hasDraft && !i.draftEqualsPublished;
  let key: SiteLifecycleKey;
  let label: string;
  let tone: LifecycleTone;
  if (pending) {
    key = 'published-pending';
    label = 'PUBLISHED · BEKLEYEN DEĞİŞİKLİK';
    tone = 'pending';
  } else if (i.hasPublished) {
    key = 'published';
    label = 'PUBLISHED';
    tone = 'live';
  } else if (i.hasDraft) {
    key = 'draft-new';
    label = 'DRAFT';
    tone = 'draft';
  } else {
    key = 'empty';
    label = 'BOŞ';
    tone = 'draft';
  }
  return {
    key,
    label,
    tone,
    hasPublished: i.hasPublished,
    pending,
    canPublish: i.hasDraft && (!i.hasPublished || pending),
    canDiscard: pending,
    canUnpublish: false,
  };
}
