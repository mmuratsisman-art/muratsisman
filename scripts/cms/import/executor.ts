import { applyToken, buildPlan } from './planner';
import { docHash } from './snapshot';
import { seoHashOf } from './audit';
import type { SourceBundle } from './source';
import type { ImportTarget } from './target';
import { TABLES, TOOL_VERSION, isRowKind, type Plan, type PlanItem, type RowKind, type SourceRecord, type TargetSnapshot } from './types';

export interface ItemResult {
  kind: string;
  key: string;
  decision: string;
  outcome: 'created' | 'resumed' | 'skipped' | 'failed' | 'not_attempted';
  stepsDone: string[];
  error?: string;
}
export interface ApplyResult {
  ok: boolean;
  refused: string | null;
  runId: string | null;
  freshPlanDigest: string | null;
  results: ItemResult[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const short = (s: string) => (s.length > 400 ? `${s.slice(0, 400)}…` : s);

export function diffPlans(a: Plan, b: Plan): string[] {
  const out: string[] = [];
  if (a.sourceDigest !== b.sourceDigest) out.push('kaynak (src/data) değişmiş');
  if (a.provenanceTable !== b.provenanceTable) out.push('0006 durumu değişmiş');
  const mb = new Map(b.items.map((i) => [`${i.kind}:${i.key}`, i]));
  for (const i of a.items) {
    const j = mb.get(`${i.kind}:${i.key}`);
    if (!j) out.push(`${i.kind} "${i.key}": plandan kaybolmuş`);
    else if (i.decision !== j.decision) out.push(`${i.kind} "${i.key}": karar ${i.decision} → ${j.decision}`);
    else if (i.targetFingerprint !== j.targetFingerprint) out.push(`${i.kind} "${i.key}": hedef durumu dry-run'dan beri değişmiş`);
  }
  if (!out.length && a.planDigest !== b.planDigest) out.push('plan özeti (digest) değişmiş');
  return out;
}

class Abort extends Error {}

export async function applyPlan(args: {
  target: ImportTarget;
  bundle: SourceBundle;
  approved: Plan;
  confirm: string;
  now?: () => string;
  /** test kancası: her adımdan SONRA çağrılır; throw ederek yarıda kesilmeyi simüle eder */
  afterStep?: (info: { kind: string; key: string; step: string }) => void | Promise<void>;
}): Promise<ApplyResult> {
  const { target, bundle, approved } = args;
  const now = args.now ?? (() => new Date().toISOString());
  const refuse = (why: string): ApplyResult => ({ ok: false, refused: why, runId: null, freshPlanDigest: null, results: [] });

  // ── 1) onay kapıları (hiçbir yazma yok)
  if (approved.toolVersion !== TOOL_VERSION) return refuse(`plan başka bir araç sürümüyle üretilmiş (${approved.toolVersion} ≠ ${TOOL_VERSION})`);
  if (!approved.canApply) return refuse(`onaylanan plan uygulanamaz: ${approved.blockers.length} engel var`);
  if (args.confirm !== applyToken(approved)) return refuse('onay belirteci (confirm) plan özetiyle eşleşmiyor');
  if (approved.sourceDigest !== bundle.sourceDigest) return refuse('kaynak (src/data) dry-run\'dan beri değişmiş');

  // ── 2) TOCTOU: hedef durumunu YENİDEN oku, planı yeniden kur, onaylananla birebir karşılaştır
  let fresh: TargetSnapshot;
  try { fresh = await target.readSnapshot(); } catch (e) { return refuse(`hedef okunamadı (fail-closed): ${short((e as Error).message)}`); }
  const freshPlan = buildPlan(bundle, fresh, { now: now() });
  if (!freshPlan.canApply) return { ...refuse(`güncel hedef durumunda plan uygulanamaz: ${freshPlan.blockers.join(' ; ')}`), freshPlanDigest: freshPlan.planDigest };
  const diffs = diffPlans(approved, freshPlan);
  if (diffs.length || freshPlan.planDigest !== approved.planDigest) {
    return { ...refuse(`hedef durum dry-run'dan beri değişmiş (fail-closed): ${diffs.join(' ; ') || 'digest farkı'}`), freshPlanDigest: freshPlan.planDigest };
  }

  // Yürütme, onaylanan dosyadan DEĞİL, az önce kaynaktan + güncel hedeften yeniden kurulan plandan yapılır
  // (onay dosyası yalnızca bir kapıdır; üzerinde oynanmış adımlar asla çalıştırılmaz).
  const work = freshPlan.items.filter((i) => i.steps.length > 0);
  const results: ItemResult[] = freshPlan.items.map((i) => ({
    kind: i.kind, key: i.key, decision: i.decision, outcome: i.steps.length ? 'not_attempted' : 'skipped', stepsDone: [],
  }));
  if (!work.length) return { ok: true, refused: null, runId: null, freshPlanDigest: freshPlan.planDigest, results };

  const run = await target.startRun({ toolVersion: TOOL_VERSION, sourceDigest: bundle.sourceDigest, planDigest: approved.planDigest });
  if (!run.ok) return { ...refuse(`koşu kaydı açılamadı: ${short(run.error)}`), freshPlanDigest: freshPlan.planDigest };
  const runId = run.data;

  let failure: string | null = null;
  for (const pi of work) {
    const res = results.find((r) => r.kind === pi.kind && r.key === pi.key)!;
    const src = bundle.records.find((r) => r.kind === pi.kind && r.key === pi.key)!;
    try {
      // her kayıt için yazmadan hemen önce o kaydın dilimini tekrar doğrula
      const snap = await target.readSnapshot();
      const cur = buildPlan(bundle, snap, { now: now() }).items.find((i) => i.kind === pi.kind && i.key === pi.key);
      if (!cur || cur.decision !== pi.decision || cur.targetFingerprint !== pi.targetFingerprint) {
        throw new Abort(`hedef durum yazmadan hemen önce değişmiş (${pi.kind} "${pi.key}")`);
      }
      await runItem({ target, pi, src, runId, res, afterStep: args.afterStep, now });
      res.outcome = pi.decision === 'CREATE' ? 'created' : 'resumed';
    } catch (e) {
      failure = short((e as Error).message);
      res.outcome = 'failed';
      res.error = failure;
      break;
    }
  }
  await target.finishRun(runId, failure ? 'aborted' : 'completed', {
    results: results.map((r) => ({ kind: r.kind, key: r.key, outcome: r.outcome })), error: failure,
  });
  return { ok: failure === null, refused: null, runId, freshPlanDigest: freshPlan.planDigest, results };
}

async function runItem(a: {
  target: ImportTarget; pi: PlanItem; src: SourceRecord; runId: string; res: ItemResult;
  afterStep?: (info: { kind: string; key: string; step: string }) => void | Promise<void>; now: () => string;
}): Promise<void> {
  const { target, pi, src, runId, res } = a;
  const must = <T>(r: { ok: true; data: T } | { ok: false; error: string }, what: string): T => {
    if (!r.ok) throw new Error(`${what}: ${short(r.error)}`);
    return r.data;
  };
  let itemId: string | null = null;
  let entityId: string | null = pi.entityId;
  const rowKind: RowKind | null = isRowKind(pi.kind) ? pi.kind : null;

  if (pi.decision === 'RESUME') {
    const snap = await target.readSnapshot();
    const it = snap.items.find((i) => i.entity_type === pi.kind && i.source_key === pi.key && i.state !== 'rolled_back');
    if (!it) throw new Error('ledger kaydı bulunamadı (resume)');
    itemId = it.id;
    must(await target.updateItem(itemId, { lastRunId: runId }), 'ledger last_run güncellenemedi');
  }
  const fail = async (e: unknown): Promise<never> => {
    if (itemId) await target.updateItem(itemId, { lastError: short(String((e as Error).message ?? e)) });
    throw e;
  };

  for (const step of pi.steps) {
    try {
      switch (step) {
        case 'intent': {
          itemId = must(await target.insertItem({ runId, kind: pi.kind, key: pi.key, sourcePath: pi.sourcePath, sourceHash: pi.sourceHash }), 'niyet kaydı yazılamadı');
          break;
        }
        case 'create': {
          const id = must(await target.rpc(TABLES[rowKind!].create, { p_data: src.doc }), `${TABLES[rowKind!].create} başarısız`);
          if (typeof id !== 'string' || !UUID.test(id)) throw new Error('create beklenmeyen kimlik döndürdü');
          entityId = id;
          break;
        }
        case 'record_created': {
          must(await target.updateItem(itemId!, entityId ? { state: 'created', entityId } : { state: 'created' }), 'ledger güncellenemedi (created)');
          break;
        }
        case 'publish': {
          must(await target.rpc(TABLES[rowKind!].publish, { p_id: entityId }), `${TABLES[rowKind!].publish} başarısız`);
          break;
        }
        case 'record_published': {
          must(await target.updateItem(itemId!, { state: 'published' }), 'ledger güncellenemedi (published)');
          break;
        }
        case 'seo': {
          const seo = src.seo!;
          const snap = await target.readSnapshot();
          const live = snap.rows.project.find((r) => r.id === entityId);
          if (!live) throw new Error('SEO adımı: proje bulunamadı');
          const cur = live.seo;
          if (cur && cur.seo_title === null && cur.seo_description === null) {
            must(await target.setProjectSeo(entityId!, seo), 'SEO yazılamadı');
          } else if (!(cur && cur.seo_title === seo.seo_title && cur.seo_description === seo.seo_description)) {
            throw new Error('SEO sütunları farklı bir değerle dolu; üzerine yazılmaz');
          }
          const after = (await target.readSnapshot()).rows.project.find((r) => r.id === entityId);
          if (!after || seoHashOf(after) !== src.seoHash) throw new Error('SEO yazıldıktan sonra doğrulama başarısız');
          must(await target.updateItem(itemId!, { seoHash: src.seoHash! }), 'ledger güncellenemedi (seo_hash)');
          break;
        }
        case 'save_draft': {
          must(await target.rpc('save_site_content_draft', { p_key: pi.key, p_data: src.doc, p_expected_draft_updated_at: null }), 'save_site_content_draft başarısız');
          break;
        }
        case 'publish_site': {
          const snap = await target.readSnapshot();
          const d = snap.siteDrafts.find((x) => x.key === pi.key);
          if (!d || docHash('site_content', d.data) !== pi.sourceHash) throw new Error('taslak, yayınlanmadan önce beklenen içerikte değil');
          must(await target.rpc('publish_site_content_draft', { p_key: pi.key, p_expected_draft_updated_at: d.updated_at }), 'publish_site_content_draft başarısız');
          break;
        }
        case 'verify_complete': {
          const snap = await target.readSnapshot();
          if (rowKind) {
            const live = snap.rows[rowKind].find((r) => r.id === entityId);
            if (!live) throw new Error('doğrulama: kayıt bulunamadı');
            if (live.status !== 'published') throw new Error(`doğrulama: durum '${live.status}' (published bekleniyordu)`);
            if (docHash(rowKind, live.doc) !== src.docHash) throw new Error('doğrulama: yayınlanan içerik kaynakla birebir aynı değil');
            if (snap.drafts[rowKind].some((d) => d.entity_id === live.id)) throw new Error('doğrulama: bekleyen taslak kaldı');
            if (src.seo && seoHashOf(live) !== src.seoHash) throw new Error('doğrulama: SEO alanları kaynakla aynı değil');
          } else {
            const pub = snap.sitePublished.find((p) => p.key === pi.key);
            if (!pub || docHash('site_content', pub.data) !== src.docHash) throw new Error('doğrulama: yayınlanan site belgesi kaynakla birebir aynı değil');
            const d = snap.siteDrafts.find((x) => x.key === pi.key);
            if (d && docHash('site_content', d.data) !== src.docHash) throw new Error('doğrulama: kaynaktan farklı bekleyen taslak var');
          }
          must(await target.updateItem(itemId!, { state: 'completed', lastError: null }), 'ledger güncellenemedi (completed)');
          break;
        }
        default:
          throw new Error(`bilinmeyen adım ${String(step)}`);
      }
      res.stepsDone.push(step);
      await a.afterStep?.({ kind: pi.kind, key: pi.key, step });
    } catch (e) {
      await fail(e);
    }
  }
}
