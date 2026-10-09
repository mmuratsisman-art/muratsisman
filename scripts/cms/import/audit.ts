import { docHash } from './snapshot';
import { hashOf } from './canonical';
import { isRowKind, type EntityKind, type Finding, type LiveRow, type RowKind, type TargetSnapshot } from './types';

const STALE_RUN_MS = 60 * 60 * 1000;

export const liveById = (snap: TargetSnapshot, kind: RowKind, id: string): LiveRow | undefined => snap.rows[kind].find((r) => r.id === id);
export const seoHashOf = (live: LiveRow): string | null =>
  live.seo && live.seo.seo_title !== null && live.seo.seo_description !== null ? hashOf({ seo_title: live.seo.seo_title, seo_description: live.seo.seo_description }) : null;

/**
 * Provenance (ledger) ↔ gerçek CMS kayıtları tutarsızlık denetimi. Salt-okunur, yalnızca anlık görüntüye bakar.
 * Ledger KANIT'tır, otorite değil: burada bulunan her bulgu insan incelemesi içindir, hiçbiri otomatik düzeltilmez.
 */
export function auditProvenance(snap: TargetSnapshot, now: string): Finding[] {
  const out: Finding[] = [];
  if (!snap.provenanceTable) return out;
  const add = (f: Finding) => out.push(f);

  for (const run of snap.runs) {
    if (run.status === 'running' && Date.parse(now) - Date.parse(run.started_at) > STALE_RUN_MS) {
      add({ code: 'ledger_run_stale', severity: 'warning', message: `Koşu ${run.id} 'running' durumunda takılı kalmış (yarım kesilmiş olabilir).`, id: run.id });
    }
  }

  for (const it of snap.items) {
    if (it.state === 'rolled_back') continue;
    const kind: EntityKind = it.entity_type;
    const base = { kind, key: it.source_key };
    const lastRun = snap.runs.find((r) => r.id === it.last_run_id);
    if (it.state !== 'completed' && lastRun && lastRun.status !== 'running') {
      add({ ...base, code: 'ledger_item_stuck', severity: 'warning', message: `${kind} "${it.source_key}": ledger durumu '${it.state}' (tamamlanmamış); koşu ${lastRun.status}. Dry-run RESUME veya UNVERIFIABLE belirler.` });
    }

    if (isRowKind(kind)) {
      if (it.entity_id === null) {
        const bySlug = snap.rows[kind].find((r) => r.slug === it.source_key);
        add({ ...base, code: 'ledger_intent_open', severity: 'info', message: `${kind} "${it.source_key}": niyet kaydı açık, entity_id yok${bySlug ? '; aynı slug ile bir kayıt VAR (sahiplik kanıtlanmalı)' : ' (create henüz yapılmamış ya da geri alınmış)'}.` });
        continue;
      }
      const live = liveById(snap, kind, it.entity_id);
      if (!live) {
        add({ ...base, code: 'ledger_entity_missing', severity: 'warning', id: it.entity_id, message: `${kind} "${it.source_key}": ledger ${it.entity_id} id'li kayıt CMS'te yok (silinmiş olabilir).` });
        continue;
      }
      if (live.slug !== it.source_key) {
        add({ ...base, code: 'ledger_slug_mismatch', severity: 'warning', id: live.id, message: `${kind} "${it.source_key}": CMS kaydının slug'ı "${live.slug}" (ledger ile uyuşmuyor).` });
      }
      if (it.state === 'completed') {
        if (docHash(kind, live.doc) !== it.source_hash) add({ ...base, code: 'ledger_content_modified', severity: 'info', id: live.id, message: `${kind} "${it.source_key}": içerik import'tan sonra değişmiş (admin düzenlemesi olabilir). Dokunulmaz.` });
        if (live.status !== 'published') add({ ...base, code: 'ledger_status_changed', severity: 'info', id: live.id, message: `${kind} "${it.source_key}": durum '${live.status}' (yayında değil).` });
        if (snap.drafts[kind].some((d) => d.entity_id === live.id)) add({ ...base, code: 'ledger_pending_draft', severity: 'info', id: live.id, message: `${kind} "${it.source_key}": bekleyen taslak var (admin çalışması).` });
        if (kind === 'project' && it.seo_hash !== null && seoHashOf(live) !== it.seo_hash) add({ ...base, code: 'ledger_seo_mismatch', severity: 'warning', id: live.id, message: `project "${it.source_key}": SEO alanları ledger'daki doğrulanmış değerle uyuşmuyor.` });
        if (kind === 'project' && it.seo_hash === null && live.seo && (live.seo.seo_title !== null || live.seo.seo_description !== null)) add({ ...base, code: 'ledger_seo_unrecorded', severity: 'info', id: live.id, message: `project "${it.source_key}": ledger SEO kaydı yok ama SEO sütunları dolu.` });
      }
    } else {
      const pub = snap.sitePublished.find((p) => p.key === it.source_key);
      const draft = snap.siteDrafts.find((d) => d.key === it.source_key);
      if (it.state === 'completed') {
        if (!pub) add({ ...base, code: 'ledger_site_published_missing', severity: 'warning', message: `site "${it.source_key}": ledger tamamlandı diyor ama yayınlanmış satır yok.` });
        else if (docHash('site_content', pub.data) !== it.source_hash) add({ ...base, code: 'ledger_content_modified', severity: 'info', message: `site "${it.source_key}": yayınlanmış belge import'tan sonra değişmiş. Dokunulmaz.` });
        if (draft && docHash('site_content', draft.data) !== it.source_hash) add({ ...base, code: 'ledger_pending_draft', severity: 'info', message: `site "${it.source_key}": bekleyen değişiklik var (admin çalışması).` });
      }
    }
  }
  return out;
}
