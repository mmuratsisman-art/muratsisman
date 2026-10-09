import { hashOf } from './canonical';
import { seoHashOf } from './audit';
import { provenOwnedShell, type RowCtx } from './planner';
import { docHash } from './snapshot';
import type { ImportTarget } from './target';
import { isRowKind, type DraftRow, type EntityKind, type ProvItem, type RowKind, type TargetSnapshot } from './types';

export type RollbackDecision = 'DELETE' | 'LEDGER_ONLY' | 'SQL_MANUAL' | 'SKIP';
export interface RollbackItem {
  kind: EntityKind;
  key: string;
  itemId: string;
  entityId: string | null;
  decision: RollbackDecision;
  reasons: string[];
  expectedUpdatedAt: string | null;
  fingerprint: string;
}
export interface RollbackPlan {
  version: 1;
  generatedAt: string;
  items: RollbackItem[];
  planDigest: string;
  siteSql: string | null;
}
export const rollbackToken = (p: Pick<RollbackPlan, 'planDigest'>): string => `ROLLBACK-${p.planDigest.slice(0, 12)}`;

const dollar = (json: string): string => {
  if (json.includes('$json$')) throw new Error('JSON, SQL dolar-tırnak ayracını içeriyor; güvenli SQL üretilemedi');
  return `$json$${json}$json$::jsonb`;
};

/** Yalnızca ledger'daki (import'un kendi oluşturduğu) kayıtlar kapsama girer. QA/foreign kayıtlar ASLA listelenmez. */
export function planRollback(snap: TargetSnapshot, now: string): RollbackPlan {
  const items: RollbackItem[] = [];
  const siteStmts: string[] = [];

  for (const it of snap.items.filter((i) => i.state !== 'rolled_back')) {
    const base = { kind: it.entity_type, key: it.source_key, itemId: it.id };
    const mk = (decision: RollbackDecision, reasons: string[], entityId: string | null, expectedUpdatedAt: string | null, slice: unknown): RollbackItem =>
      ({ ...base, entityId, decision, reasons, expectedUpdatedAt, fingerprint: hashOf({ it: [it.id, it.state, it.entity_id, it.updated_at], slice }) });

    if (isRowKind(it.entity_type)) {
      const kind: RowKind = it.entity_type;
      const live = it.entity_id ? snap.rows[kind].find((r) => r.id === it.entity_id) : snap.rows[kind].find((r) => r.slug === it.source_key);
      const draft: DraftRow | undefined = live ? snap.drafts[kind].find((d) => d.entity_id === live.id) : undefined;
      const run = snap.runs.find((r) => r.id === it.last_run_id);
      const slice = live ? { id: live.id, status: live.status, updated_at: live.updated_at, doc: docHash(kind, live.doc), draft: draft ? [draft.updated_at, docHash(kind, draft.data)] : null, seo: live.seo } : null;

      if (!live) {
        items.push(mk('LEDGER_ONLY', [it.entity_id ? 'entity_already_gone: kayıt zaten yok; yalnızca ledger kapatılır' : 'nothing_created: niyet kaydı var, kayıt hiç oluşturulmamış'], it.entity_id, null, slice));
        continue;
      }
      if (it.entity_id && live.id !== it.entity_id) { items.push(mk('SKIP', ['provenance_points_elsewhere'], live.id, null, slice)); continue; }

      const ctx: RowCtx = { live, draft, claims: [], item: it as ProvItem, run };
      if (it.state === 'intent' || it.state === 'created') {
        const proof = provenOwnedShell(kind, it.source_hash, ctx);
        items.push(proof.ok ? mk('DELETE', ['import_shell: bu koşunun oluşturduğu taslak kabuğu (kanıtlandı)'], live.id, live.updated_at, slice) : mk('SKIP', [`ownership_unproven: ${proof.why}`], live.id, null, slice));
        continue;
      }
      // published | completed
      const why: string[] = [];
      if (live.status !== 'published') why.push(`status_changed: durum '${live.status}'`);
      if (draft) why.push('pending_draft: bekleyen taslak var (admin çalışması)');
      if (docHash(kind, live.doc) !== it.source_hash) why.push('modified_since_import: içerik import\'tan sonra değişmiş');
      if (kind === 'project' && it.seo_hash !== null && seoHashOf(live) !== it.seo_hash) why.push('seo_modified_since_import');
      items.push(why.length ? mk('SKIP', why, live.id, null, slice) : mk('DELETE', ['unchanged_since_import: içerik import\'tan beri değişmemiş'], live.id, live.updated_at, slice));
    } else {
      const pub = snap.sitePublished.find((p) => p.key === it.source_key);
      const draft = snap.siteDrafts.find((d) => d.key === it.source_key);
      const slice = { pub: pub ? [pub.published_at, docHash('site_content', pub.data)] : null, draft: draft ? [draft.updated_at, docHash('site_content', draft.data)] : null };
      if (!pub && !draft) { items.push(mk('LEDGER_ONLY', ['entity_already_gone'], null, null, slice)); continue; }
      const pubOk = !pub || docHash('site_content', pub.data) === it.source_hash;
      const draftOk = !draft || docHash('site_content', draft.data) === it.source_hash;
      if (!pubOk || !draftOk) { items.push(mk('SKIP', [`modified_since_import: ${!pubOk ? 'yayınlanmış belge' : 'taslak'} değişmiş`], null, null, slice)); continue; }
      items.push(mk('SQL_MANUAL', ['site_published_has_no_delete_grant: korumalı SQL elle çalıştırılır'], null, null, slice));
      const key = it.source_key.replace(/'/g, "''");
      const json = JSON.stringify(pub ? pub.data : draft!.data);
      siteStmts.push(
        `-- ${it.source_key}\n`
        + `do $$ declare n int; begin\n`
        + `  delete from public.site_content_drafts where key = '${key}' and data = ${dollar(json)};\n`
        + (pub ? `  delete from public.site_content_published where key = '${key}' and data = ${dollar(json)};\n  get diagnostics n = row_count;\n  if n <> 1 then raise exception 'FAIL site_content_published %: beklenen içerikle eşleşen satır bulunamadı (değişmiş olabilir); hiçbir şey silinmedi', '${key}'; end if;\n` : '')
        + `end $$;\n`
        + `update public.content_import_items set state = 'rolled_back', last_error = 'rolled back via manual SQL' where id = '${it.id}' and state <> 'rolled_back';`,
      );
    }
  }
  const siteSql = siteStmts.length
    ? ['-- MURAT/LAB FAZ 3B-B: site belgeleri için KORUMALI geri alma SQL\'i. ELLE çalıştırılır (SQL Editor, postgres rolü).',
       '-- Her silme, içeriğin import ettiğimizle BİREBİR aynı olması koşuluna bağlıdır; değişmişse işlem durur ve hiçbir şey silinmez.',
       '-- Önce rollback-plan raporunu inceleyin. Tek transaction.', 'begin;', ...siteStmts, 'commit;', ''].join('\n')
    : null;

  const digestBody = items.map((i) => [i.kind, i.key, i.decision, i.reasons, i.fingerprint]);
  return { version: 1, generatedAt: now, items, planDigest: hashOf(digestBody), siteSql };
}

export interface RollbackResult { ok: boolean; refused: string | null; results: { kind: string; key: string; outcome: string; error?: string }[] }

export async function applyRollback(args: { target: ImportTarget; approved: RollbackPlan; confirm: string; now?: () => string }): Promise<RollbackResult> {
  const { target, approved } = args;
  const now = args.now ?? (() => new Date().toISOString());
  const refuse = (why: string): RollbackResult => ({ ok: false, refused: why, results: [] });
  if (args.confirm !== rollbackToken(approved)) return refuse('onay belirteci (confirm) plan özetiyle eşleşmiyor');
  let snap: TargetSnapshot;
  try { snap = await target.readSnapshot(); } catch (e) { return refuse(`hedef okunamadı (fail-closed): ${(e as Error).message}`); }
  const fresh = planRollback(snap, now());
  if (fresh.planDigest !== approved.planDigest) return refuse('hedef durum rollback planından beri değişmiş (fail-closed); planı yeniden üretin');

  const results: RollbackResult['results'] = [];
  for (const it of approved.items) {
    if (it.decision === 'SKIP' || it.decision === 'SQL_MANUAL') { results.push({ kind: it.kind, key: it.key, outcome: it.decision === 'SKIP' ? 'skipped' : 'manual_sql' }); continue; }
    try {
      if (it.decision === 'DELETE') {
        const d = await target.deleteRow(it.kind as RowKind, it.entityId!, it.expectedUpdatedAt!);
        if (!d.ok) throw new Error(d.error);
        if (!d.data) throw new Error('kayıt silinmeden önce değişmiş (updated_at eşleşmedi); silinmedi');
      }
      const u = await target.updateItem(it.itemId, { state: 'rolled_back', lastError: null });
      if (!u.ok) throw new Error(`ledger güncellenemedi: ${u.error}`);
      results.push({ kind: it.kind, key: it.key, outcome: it.decision === 'DELETE' ? 'deleted' : 'ledger_closed' });
    } catch (e) {
      results.push({ kind: it.kind, key: it.key, outcome: 'failed', error: (e as Error).message });
      return { ok: false, refused: null, results };
    }
  }
  return { ok: true, refused: null, results };
}
