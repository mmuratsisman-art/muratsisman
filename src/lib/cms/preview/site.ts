import { SITE_CONTENT_KEYS, type SiteContentKey } from '../types';
import { validateSiteDoc } from '../validate/site';
import { isObj } from './common';

/** Güvenli, düz bir gösterim ağacı: her yaprak METİN olarak çizilir (HTML/bağlantı olarak ASLA yorumlanmaz). */
export type SiteNode =
  | { t: 'text'; v: string }
  | { t: 'scalar'; v: string }
  | { t: 'list'; items: SiteNode[] }
  | { t: 'object'; fields: { name: string; node: SiteNode }[] };

const MAX_DEPTH = 8;
const MAX_NODES = 600;

export function toNode(v: unknown, budget = { n: 0 }, depth = 0): SiteNode {
  if (++budget.n > MAX_NODES || depth > MAX_DEPTH) return { t: 'scalar', v: '…' };
  if (typeof v === 'string') return { t: 'text', v };
  if (typeof v === 'number' || typeof v === 'boolean') return { t: 'scalar', v: String(v) };
  if (v === null || v === undefined) return { t: 'scalar', v: '—' };
  if (Array.isArray(v)) {
    const items: SiteNode[] = [];
    for (const x of v) {
      if (budget.n >= MAX_NODES) { items.push({ t: 'scalar', v: '…' }); break; }
      items.push(toNode(x, budget, depth + 1));
    }
    return { t: 'list', items };
  }
  if (isObj(v)) {
    const fields: { name: string; node: SiteNode }[] = [];
    for (const [name, x] of Object.entries(v)) {
      if (budget.n >= MAX_NODES) { fields.push({ name: '…', node: { t: 'scalar', v: '…' } }); break; }
      fields.push({ name, node: toNode(x, budget, depth + 1) });
    }
    return { t: 'object', fields };
  }
  return { t: 'scalar', v: '?' };
}

export type SitePreviewModel =
  | { kind: 'empty' }
  | { kind: 'doc'; node: SiteNode; valid: boolean; problem: string | null };

export function buildSitePreview(key: SiteContentKey, doc: unknown | null): SitePreviewModel {
  if (doc === null || doc === undefined) return { kind: 'empty' };
  const v = validateSiteDoc(key, doc);
  return { kind: 'doc', node: toNode(doc), valid: v.ok, problem: v.ok ? null : v.error };
}

export const isSiteContentKey = (v: string): v is SiteContentKey => (SITE_CONTENT_KEYS as readonly string[]).includes(v);
