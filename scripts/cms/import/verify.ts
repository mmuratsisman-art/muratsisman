import { auditProvenance, seoHashOf } from './audit';
import { hashOf } from './canonical';
import { docHash } from './snapshot';
import type { SourceBundle } from './source';
import { isRowKind, type EntityKind, type Finding, type TargetSnapshot } from './types';

export interface Check { name: string; ok: boolean; detail?: string }
export interface RecordCheck { kind: EntityKind; key: string; status: 'ok' | 'ok_unmanaged' | 'mismatch' | 'missing'; checks: Check[] }
export interface VerifyReport {
  version: 1;
  generatedAt: string;
  sourceDigest: string;
  ok: boolean;
  records: RecordCheck[];
  ledgerFindings: Finding[];
  cutoverBlockers: Finding[];
  counts: { source: number; targetRows: number; ok: number; okUnmanaged: number; mismatch: number; missing: number };
}

const diffKeys = (a: unknown, b: unknown): string[] => {
  const x = (a ?? {}) as Record<string, unknown>; const y = (b ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => hashOf(x[k] ?? null) !== hashOf(y[k] ?? null)).sort();
};

/** Hedefteki gerçek durumu kaynakla alan alan karşılaştırır (salt-okunur). Import öncesi/sonrası raporun çekirdeği. */
export function verifyImport(bundle: SourceBundle, snap: TargetSnapshot, now: string): VerifyReport {
  const records: RecordCheck[] = [];
  for (const src of bundle.records) {
    const checks: Check[] = [];
    const ck = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, ...(detail ? { detail } : {}) });
    const item = snap.items.find((i) => i.entity_type === src.kind && i.source_key === src.key && i.state !== 'rolled_back');
    let missing = false;

    if (isRowKind(src.kind)) {
      const live = snap.rows[src.kind].find((r) => r.slug === src.key);
      if (!live) { missing = true; ck('exists', false, 'hedefte kayıt yok'); }
      else {
        ck('exists', true);
        ck('status_published', live.status === 'published', `durum '${live.status}'`);
        const same = docHash(src.kind, live.doc) === src.docHash;
        ck('content_equals_source', same, same ? undefined : `farklı alanlar: ${diffKeys(live.doc, src.doc).join(', ')}`);
        ck('no_pending_draft', !snap.drafts[src.kind].some((d) => d.entity_id === live.id));
        if (src.kind === 'project') {
          if (src.seo) ck('seo_equals_source', seoHashOf(live) === src.seoHash, 'seo_title/seo_description kaynakla aynı olmalı');
          else ck('seo_empty', !live.seo || (live.seo.seo_title === null && live.seo.seo_description === null), 'kaynakta SEO yok; hedefte de boş olmalı');
        }
        if (item) {
          ck('ledger_completed', item.state === 'completed', `ledger durumu '${item.state}'`);
          ck('ledger_points_to_entity', item.entity_id === live.id);
          ck('ledger_hash_matches_source', item.source_hash === src.docHash);
          if (src.kind === 'project' && src.seo) ck('ledger_seo_hash', item.seo_hash === src.seoHash);
        }
      }
    } else {
      const pub = snap.sitePublished.find((p) => p.key === src.key);
      const draft = snap.siteDrafts.find((d) => d.key === src.key);
      if (!pub) { missing = true; ck('exists', false, 'yayınlanmış belge yok'); }
      else {
        ck('exists', true);
        const same = docHash('site_content', pub.data) === src.docHash;
        ck('content_equals_source', same, same ? undefined : `farklı alanlar: ${diffKeys(pub.data, src.doc).join(', ')}`);
        ck('no_diverging_draft', !draft || docHash('site_content', draft.data) === src.docHash);
        if (item) {
          ck('ledger_completed', item.state === 'completed', `ledger durumu '${item.state}'`);
          ck('ledger_hash_matches_source', item.source_hash === src.docHash);
        }
      }
    }
    const failed = checks.some((c) => !c.ok);
    records.push({ kind: src.kind, key: src.key, checks, status: missing ? 'missing' : failed ? 'mismatch' : item ? 'ok' : 'ok_unmanaged' });
  }
  const ledgerFindings = auditProvenance(snap, now);
  const cutoverBlockers: Finding[] = [];
  for (const kind of ['project', 'lab_entry', 'note'] as const) {
    const keys = new Set(bundle.records.filter((r) => r.kind === kind).map((r) => r.key));
    for (const r of snap.rows[kind]) if (r.status === 'published' && !keys.has(r.slug)) {
      cutoverBlockers.push({ code: 'foreign_published_row', severity: 'warning', kind, key: r.slug, id: r.id, cutoverBlocker: true, message: `${kind} "${r.slug}": kaynakta olmayan YAYINLANMIŞ kayıt; cutover'da public'te görünür (3B-E öncesi çözülmeli).` });
    }
  }
  const n = (s: RecordCheck['status']) => records.filter((r) => r.status === s).length;
  return {
    version: 1, generatedAt: now, sourceDigest: bundle.sourceDigest,
    ok: records.every((r) => r.status === 'ok' || r.status === 'ok_unmanaged'),
    records, ledgerFindings, cutoverBlockers,
    counts: { source: bundle.records.length, targetRows: snap.rows.project.length + snap.rows.lab_entry.length + snap.rows.note.length + snap.sitePublished.length, ok: n('ok'), okUnmanaged: n('ok_unmanaged'), mismatch: n('mismatch'), missing: n('missing') },
  };
}
