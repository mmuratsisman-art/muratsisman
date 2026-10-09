import { hashOf } from './canonical';
import { auditProvenance, seoHashOf } from './audit';
import { docHash } from './snapshot';
import type { SourceBundle } from './source';
import {
  KIND_ORDER, TOOL_VERSION, isRowKind,
  type Decision, type DraftRow, type EntityKind, type Finding, type LiveRow, type Plan, type PlanItem, type ProvItem, type ProvRun,
  type RowKind, type SeoPlan, type SourceRecord, type Step, type TargetSnapshot,
} from './types';

export interface PlanOptions { now: string; toolVersion?: string }

type Raw = Record<string, unknown>;
const dataSlug = (d: DraftRow): string | null => (typeof d.data === 'object' && d.data !== null && typeof (d.data as Raw).slug === 'string' ? ((d.data as Raw).slug as string) : null);

const ROW_CREATE: Step[] = ['create', 'record_created', 'publish', 'record_published'];
const SITE_CREATE: Step[] = ['save_draft', 'record_created', 'publish_site', 'record_published'];

function diffFields(a: unknown, b: unknown): string[] {
  const x = (a ?? {}) as Raw; const y = (b ?? {}) as Raw;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => hashOf(x[k] ?? null) !== hashOf(y[k] ?? null)).sort();
}
const looksLikeQa = (slug: string, title: unknown): boolean => /(^|-)(test|qa|t3b\w*|faz-3b)(-|$)/i.test(slug) || (typeof title === 'string' && /\b(test|qa)\b/i.test(title));

export interface RowCtx {
  live: LiveRow | undefined;
  draft: DraftRow | undefined;
  claims: { id: string; updated_at: string }[];
  item: ProvItem | undefined;
  run: ProvRun | undefined;
}

function rowFingerprint(kind: RowKind, c: RowCtx): string {
  return hashOf({
    live: c.live ? { id: c.live.id, status: c.live.status, published_at: c.live.published_at, updated_at: c.live.updated_at, created_by: c.live.created_by, doc: docHash(kind, c.live.doc), seo: c.live.seo } : null,
    draft: c.draft ? { updated_at: c.draft.updated_at, based: c.draft.based_on_updated_at, data: docHash(kind, c.draft.data) } : null,
    claims: c.claims.map((x) => [x.id, x.updated_at]).sort(),
    item: c.item ? { id: c.item.id, state: c.item.state, entity_id: c.item.entity_id, hash: c.item.source_hash, seo: c.item.seo_hash, updated_at: c.item.updated_at, last_run: c.item.last_run_id } : null,
  });
}

/** Bu import koşusuna ait olduğu KANITLANAN yarım kalmış satır mı? (ledger niyeti + içerik + oluşturan + zaman penceresi) */
export function provenOwnedShell(kind: RowKind, sourceHash: string, c: RowCtx): { ok: boolean; why: string } {
  const { live, draft, item, run } = c;
  if (!live || !draft || !item || !run) return { ok: false, why: 'ledger/koşu/taslak eksik' };
  if (live.status !== 'draft' || live.published_at !== null) return { ok: false, why: 'kayıt taslak kabuğu değil (yayınlanmış/önizlemede)' };
  if (item.source_hash !== sourceHash) return { ok: false, why: 'ledger kaynak hash\'i beklenen belgeyle uyuşmuyor' };
  if (docHash(kind, draft.data) !== item.source_hash) return { ok: false, why: 'taslak içeriği import ettiğimiz belgeyle birebir aynı değil (başkası düzenlemiş olabilir)' };
  if (!live.created_by || live.created_by !== run.created_by) return { ok: false, why: 'kaydı oluşturan kullanıcı koşuyu başlatanla aynı değil' };
  if (live.created_at < run.started_at) return { ok: false, why: 'kayıt koşudan önce oluşturulmuş' };
  return { ok: true, why: '' };
}

function planRow(kind: RowKind, src: SourceRecord, snap: TargetSnapshot): PlanItem {
  const live = snap.rows[kind].find((r) => r.slug === src.key);
  const draft = live ? snap.drafts[kind].find((d) => d.entity_id === live.id) : undefined;
  const claims = snap.drafts[kind].filter((d) => dataSlug(d) === src.key && d.entity_id !== live?.id).map((d) => ({ id: d.entity_id, updated_at: d.updated_at }));
  const item = snap.items.find((i) => i.entity_type === kind && i.source_key === src.key && i.state !== 'rolled_back');
  const run = item ? snap.runs.find((r) => r.id === item.last_run_id) : undefined;
  const ctx: RowCtx = { live, draft, claims, item, run };
  const fp = rowFingerprint(kind, ctx);

  const out = (decision: Decision, reasons: string[], extra: Partial<PlanItem> = {}): PlanItem => ({
    kind, key: src.key, sourcePath: src.sourcePath, sourceHash: src.docHash, decision, reasons, entityId: live?.id ?? item?.entity_id ?? null,
    resumeFrom: null, seo: 'NONE', steps: [], targetFingerprint: fp, ...extra,
  });
  const seoPlanFor = (l: LiveRow | undefined): { seo: SeoPlan; conflict: boolean } => {
    if (!src.seo) return { seo: 'NONE', conflict: false };
    if (!l || !l.seo || (l.seo.seo_title === null && l.seo.seo_description === null)) return { seo: 'APPLY', conflict: false };
    if (l.seo.seo_title === src.seo.seo_title && l.seo.seo_description === src.seo.seo_description) return { seo: 'DONE', conflict: false };
    return { seo: 'CONFLICT', conflict: true };
  };
  const seoStep: Step[] = kind === 'project' && src.seo ? ['seo'] : [];
  const tail: Step[] = [...seoStep, 'verify_complete'];

  if (claims.length) return out('CONFLICT', [`draft_slug_claim: başka bir kaydın bekleyen taslağı bu slug'ı kullanıyor (${claims.length})`]);

  // ───── hedefte kayıt YOK
  if (!live) {
    if (!item) return out('CREATE', [], { steps: ['intent', ...ROW_CREATE, ...tail], seo: seoPlanFor(undefined).seo });
    if (item.source_hash !== src.docHash) return out('CONFLICT', ['source_drift: ledger kaydı eski kaynak hash\'i taşıyor']);
    if (item.entity_id === null && item.state === 'intent') {
      return out('RESUME', ['resume_intent_no_entity: niyet kaydı var, kayıt henüz oluşturulmamış'], { resumeFrom: 'intent', steps: [...ROW_CREATE, ...tail], seo: seoPlanFor(undefined).seo });
    }
    return out('UNVERIFIABLE', [`entity_missing: ledger ${item.entity_id ?? '-'} id'li kayıt (durum ${item.state}) CMS'te yok; otomatik yeniden oluşturulmaz`]);
  }

  // ───── hedefte kayıt VAR
  if (item) {
    if (item.source_hash !== src.docHash) return out('CONFLICT', ['source_drift: kaynak, import edildiğinden beri değişmiş; üzerine yazılmaz']);

    if (item.entity_id === null) {
      // yarım kalmış create: kayıt var ama ledger entity_id yazılamadan kesilmiş
      if (item.state !== 'intent') return out('UNVERIFIABLE', ['ledger tutarsız: entity_id yok ama durum intent değil']);
      const proof = provenOwnedShell(kind, src.docHash, ctx);
      if (!proof.ok) return out('UNVERIFIABLE', [`ownership_unproven: aynı slug'lı kayıt bu koşuya ait olarak kanıtlanamadı (${proof.why})`]);
      const s = seoPlanFor(live);
      if (s.conflict) return out('CONFLICT', ['seo_conflict: SEO sütunları farklı bir değerle dolu']);
      return out('RESUME', ['resume_adopt_intent: niyet + taslak içeriği + oluşturan + zaman penceresi ile sahiplik kanıtlandı'], { resumeFrom: 'intent', steps: ['record_created', 'publish', 'record_published', ...tail], seo: s.seo });
    }
    if (item.entity_id !== live.id) return out('UNVERIFIABLE', [`provenance_points_elsewhere: ledger ${item.entity_id} diyor, slug'ı taşıyan kayıt ${live.id}`]);

    if (item.state === 'completed') {
      const reasons: string[] = [];
      if (docHash(kind, live.doc) !== item.source_hash) reasons.push('modified_since_import: içerik import\'tan sonra değişmiş');
      if (live.status !== 'published') reasons.push(`status_changed: durum '${live.status}'`);
      if (draft) reasons.push('pending_draft: bekleyen taslak var');
      if (kind === 'project' && item.seo_hash !== null && seoHashOf(live) !== item.seo_hash) reasons.push('seo_modified_since_import');
      return out('SKIP_IMPORTED', reasons.length ? reasons : ['already_imported']);
    }
    if (item.state === 'created' && live.status === 'published' && !draft && docHash(kind, live.doc) === item.source_hash
        && !!run && !!live.created_by && live.created_by === run.created_by && live.created_at >= run.started_at) {
      // publish tamamlanmış, yalnızca ledger 'published' yazılamadan kesilmiş
      const s = seoPlanFor(live);
      if (s.conflict) return out('CONFLICT', ['seo_conflict: SEO sütunları farklı bir değerle dolu']);
      return out('RESUME', ['resume_created_already_published: yayın yapılmış, ledger güncellenecek'], { resumeFrom: 'created', steps: ['record_published', ...tail], seo: s.seo });
    }
    if (item.state === 'created') {
      const proof = provenOwnedShell(kind, src.docHash, ctx);
      if (!proof.ok) return out('UNVERIFIABLE', [`ownership_unproven: yarım kalmış kayıt kanıtlanamadı (${proof.why})`]);
      const s = seoPlanFor(live);
      if (s.conflict) return out('CONFLICT', ['seo_conflict: SEO sütunları farklı bir değerle dolu']);
      return out('RESUME', ['resume_created: yayınlama adımından devam'], { resumeFrom: 'created', steps: ['publish', 'record_published', ...tail], seo: s.seo });
    }
    if (item.state === 'published') {
      if (live.status !== 'published' || draft || docHash(kind, live.doc) !== item.source_hash) {
        return out('UNVERIFIABLE', ['ownership_unproven: yayınlanmış kayıt kaynakla birebir aynı değil ya da bekleyen taslağı var']);
      }
      const s = seoPlanFor(live);
      if (s.conflict) return out('CONFLICT', ['seo_conflict: SEO sütunları farklı bir değerle dolu']);
      return out('RESUME', ['resume_published: SEO/doğrulama adımından devam'], { resumeFrom: 'published', steps: tail, seo: s.seo });
    }
    return out('UNVERIFIABLE', [`beklenmeyen ledger durumu '${item.state}'`]);
  }

  // ledger yok → bu kayıt bizim DEĞİL; asla sahiplenilmez
  const same = live.status === 'published' && !draft && docHash(kind, live.doc) === src.docHash;
  if (same) return out('SKIP_IDENTICAL_UNMANAGED', ['identical_unmanaged: içerik kaynakla birebir aynı ama import tarafından oluşturulmamış; sahiplenilmez']);
  const fields = diffFields(live.doc, src.doc);
  const why = [`slug_exists_different: slug hedefte başka bir kayıtta (durum '${live.status}'${draft ? ', bekleyen taslak var' : ''}; farklı alanlar: ${fields.join(', ') || '-'})`];
  if (looksLikeQa(live.slug, live.doc.title)) why.push('qa_like: kayıt QA/test kaydına benziyor; silinmez/değiştirilmez');
  return out('CONFLICT', why);
}

function planSite(src: SourceRecord, snap: TargetSnapshot): PlanItem {
  const draft = snap.siteDrafts.find((d) => d.key === src.key);
  const pub = snap.sitePublished.find((p) => p.key === src.key);
  const item = snap.items.find((i) => i.entity_type === 'site_content' && i.source_key === src.key && i.state !== 'rolled_back');
  const run = item ? snap.runs.find((r) => r.id === item.last_run_id) : undefined;
  const fp = hashOf({
    draft: draft ? { updated_at: draft.updated_at, by: draft.updated_by, data: docHash('site_content', draft.data) } : null,
    pub: pub ? { published_at: pub.published_at, data: docHash('site_content', pub.data) } : null,
    item: item ? { id: item.id, state: item.state, hash: item.source_hash, updated_at: item.updated_at, last_run: item.last_run_id } : null,
  });
  const out = (decision: Decision, reasons: string[], extra: Partial<PlanItem> = {}): PlanItem => ({
    kind: 'site_content', key: src.key, sourcePath: src.sourcePath, sourceHash: src.docHash, decision, reasons, entityId: null,
    resumeFrom: null, seo: 'NONE', steps: [], targetFingerprint: fp, ...extra,
  });
  const dHash = draft ? docHash('site_content', draft.data) : null;
  const pHash = pub ? docHash('site_content', pub.data) : null;

  if (!item) {
    if (!draft && !pub) return out('CREATE', [], { steps: ['intent', ...SITE_CREATE, 'verify_complete'] });
    if (pHash === src.docHash && (!draft || dHash === src.docHash)) return out('SKIP_IDENTICAL_UNMANAGED', ['identical_unmanaged: yayınlanmış belge kaynakla birebir aynı ama import tarafından oluşturulmamış; sahiplenilmez']);
    const why: string[] = [];
    if (pub && pHash !== src.docHash) why.push('published_exists_different: hedefte farklı yayınlanmış belge var (üzerine yazılmaz)');
    if (draft && dHash !== src.docHash) why.push('draft_exists_different: hedefte farklı bir taslak var (üzerine yazılmaz)');
    if (draft && dHash === src.docHash && !pub) why.push('unmanaged_draft: kaynakla aynı ama import\'a ait olmayan taslak var; sahiplenilmez');
    if (draft && dHash === src.docHash && pub && pHash !== src.docHash) why.push('unmanaged_draft_identical');
    return out('CONFLICT', why.length ? why : ['site belgesi hedefte zaten var']);
  }
  if (item.source_hash !== src.docHash) return out('CONFLICT', ['source_drift: kaynak, import edildiğinden beri değişmiş; üzerine yazılmaz']);
  const ownDraft = !!draft && dHash === item.source_hash && !!run && !!run.created_by && draft.updated_by === run.created_by && draft.updated_at >= run.started_at;

  if (item.state === 'completed') {
    const reasons: string[] = [];
    if (!pub) reasons.push('published_missing');
    else if (pHash !== item.source_hash) reasons.push('modified_since_import: yayınlanmış belge değişmiş');
    if (draft && dHash !== item.source_hash) reasons.push('pending_draft: bekleyen değişiklik var');
    return out('SKIP_IMPORTED', reasons.length ? reasons : ['already_imported']);
  }
  if (item.state === 'intent') {
    if (!draft && !pub) return out('RESUME', ['resume_intent_no_entity: niyet kaydı var, taslak henüz kaydedilmemiş'], { resumeFrom: 'intent', steps: [...SITE_CREATE, 'verify_complete'] });
    if (ownDraft && !pub) return out('RESUME', ['resume_adopt_intent: niyet + taslak içeriği + yazan kullanıcı + zaman penceresi ile sahiplik kanıtlandı'], { resumeFrom: 'intent', steps: ['record_created', 'publish_site', 'record_published', 'verify_complete'] });
    return out('UNVERIFIABLE', ['ownership_unproven: taslak/yayın satırı bu koşuya ait olarak kanıtlanamadı']);
  }
  if (item.state === 'created') {
    if (ownDraft && !pub) return out('RESUME', ['resume_created: yayınlama adımından devam'], { resumeFrom: 'created', steps: ['publish_site', 'record_published', 'verify_complete'] });
    if (ownDraft && pHash === item.source_hash) return out('RESUME', ['resume_created: yayın yapılmış, ledger güncellenecek'], { resumeFrom: 'created', steps: ['record_published', 'verify_complete'] });
    return out('UNVERIFIABLE', ['ownership_unproven: taslak bu koşuya ait olarak kanıtlanamadı']);
  }
  if (item.state === 'published') {
    if (pHash === item.source_hash && (!draft || dHash === item.source_hash)) return out('RESUME', ['resume_published: doğrulama adımından devam'], { resumeFrom: 'published', steps: ['verify_complete'] });
    return out('UNVERIFIABLE', ['ownership_unproven: yayınlanmış belge kaynakla birebir aynı değil']);
  }
  return out('UNVERIFIABLE', [`beklenmeyen ledger durumu '${item.state}'`]);
}

/** Hedefte kaynakta olmayan satırlar + sıra çakışmaları (cutover riski). */
function globalFindings(bundle: SourceBundle, snap: TargetSnapshot): Finding[] {
  const out: Finding[] = [];
  const srcKeys = (k: RowKind) => new Set(bundle.records.filter((r) => r.kind === k).map((r) => r.key));
  for (const kind of ['project', 'lab_entry', 'note'] as const) {
    const keys = srcKeys(kind);
    const foreign = snap.rows[kind].filter((r) => !keys.has(r.slug));
    for (const r of foreign.filter((x) => x.status === 'published')) {
      out.push({
        code: 'foreign_published_row', severity: 'warning', kind, key: r.slug, id: r.id, cutoverBlocker: true,
        message: `${kind} "${r.slug}": kaynakta olmayan YAYINLANMIŞ kayıt (QA/test olabilir). CONTENT_SOURCE=supabase olduğunda public sitede görünür. 3B-E ÖNCESİ çözülmeli. Silinmez/değiştirilmez.`,
      });
    }
    const hidden = foreign.filter((x) => x.status !== 'published');
    if (hidden.length) {
      out.push({ code: 'foreign_nonpublished_rows', severity: 'info', kind, message: `${kind}: kaynakta olmayan ${hidden.length} yayınlanmamış kayıt (taslak/önizleme): ${hidden.map((h) => h.slug).join(', ')}. Public'te görünmez (RLS). Dokunulmaz.` });
    }
  }
  // sıra çakışmaları: yayınlanmış (veya yayınlanacak) projeler/lablar
  for (const kind of ['project', 'lab_entry'] as const) {
    const bySort = new Map<number, string[]>();
    const add = (n: unknown, slug: string) => { if (typeof n === 'number') bySort.set(n, [...(bySort.get(n) ?? []), slug]); };
    const keys = srcKeys(kind);
    for (const r of snap.rows[kind]) if (r.status === 'published' && !keys.has(r.slug)) add(r.doc.sort_order, r.slug);
    for (const s of bundle.records.filter((x) => x.kind === kind)) add(s.doc.sort_order, s.key);
    for (const [n, slugs] of bySort) if (slugs.length > 1) out.push({ code: 'sort_order_tie', severity: 'warning', kind, message: `${kind}: sort_order ${n} birden fazla yayınlanmış/yayınlanacak kayıtta: ${slugs.join(', ')} (liste sırası belirsiz kalır).` });
  }
  return out;
}

export function buildPlan(bundle: SourceBundle, snap: TargetSnapshot, opts: PlanOptions): Plan {
  const toolVersion = opts.toolVersion ?? TOOL_VERSION;
  const items: PlanItem[] = bundle.records.map((r) => (isRowKind(r.kind) ? planRow(r.kind, r, snap) : planSite(r, snap)));
  items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  const findings: Finding[] = [...globalFindings(bundle, snap), ...auditProvenance(snap, opts.now)];
  const blockers: string[] = [];
  if (!snap.provenanceTable) blockers.push('provenance_table_missing: 0006 migration hedefte uygulanmamış; apply yapılamaz (dry-run serbest).');
  for (const e of bundle.globalErrors) blockers.push(`source_invalid: ${e}`);
  for (const r of bundle.records) for (const e of r.validation.errors) blockers.push(`source_invalid: ${e}`);
  for (const i of items) if (i.decision === 'CONFLICT' || i.decision === 'UNVERIFIABLE') blockers.push(`${i.decision} ${i.kind} "${i.key}": ${i.reasons.join(' | ')}`);

  const targetBefore = snap.rows.project.length + snap.rows.lab_entry.length + snap.rows.note.length
    + new Set([...snap.siteDrafts.map((d) => d.key), ...snap.sitePublished.map((p) => p.key)]).size;
  const count = (d: Decision) => items.filter((i) => i.decision === d).length;
  const planDigest = hashOf({
    toolVersion, sourceDigest: bundle.sourceDigest, provenanceTable: snap.provenanceTable,
    items: items.map((i) => [i.kind, i.key, i.decision, i.reasons, i.entityId, i.resumeFrom, i.seo, i.steps, i.targetFingerprint]),
    blockers,
    // hedefteki YENİ/KALKAN her bulgu (ör. araya giren yayınlanmış yabancı kayıt) onayı geçersiz kılar
    findings: findings.map((f) => [f.code, f.kind ?? '', f.key ?? '', f.id ?? '']),
  });
  return {
    version: 1, toolVersion, generatedAt: opts.now, sourceDigest: bundle.sourceDigest, snapshotCapturedAt: snap.capturedAt, provenanceTable: snap.provenanceTable,
    items, findings,
    counts: { source: bundle.records.length, targetBefore, create: count('CREATE'), resume: count('RESUME'), skip: count('SKIP_IMPORTED') + count('SKIP_IDENTICAL_UNMANAGED'), conflict: count('CONFLICT'), unverifiable: count('UNVERIFIABLE') },
    canApply: blockers.length === 0, blockers, planDigest,
  };
}

export const applyToken = (plan: Pick<Plan, 'planDigest'>): string => `APPLY-${plan.planDigest.slice(0, 12)}`;
