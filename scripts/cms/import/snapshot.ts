import { hashOf, normTs, normTsOrNull } from './canonical';
import {
  ENTITY_KINDS, TABLES,
  type Doc, type DraftRow, type EntityKind, type ItemState, type LiveRow, type ProvItem, type ProvRun, type RowKind, type TargetSnapshot,
} from './types';

/** Hem SQL (salt-okunur anlık görüntü) hem PostgREST okuyucu aynı sütunları ister → aynı normalleşmiş veri. */
export const LIVE_COLS: Record<RowKind, string[]> = {
  project: ['id', 'slug', 'status', 'published_at', 'created_at', 'updated_at', 'created_by', 'sort_order', 'title', 'subtitle', 'summary', 'accent', 'size', 'graphic', 'tags', 'coming_soon', 'kind', 'type_label', 'category', 'project_status_label', 'project_status_accent', 'case_study', 'seo_title', 'seo_description'],
  lab_entry: ['id', 'slug', 'status', 'published_at', 'created_at', 'updated_at', 'created_by', 'sort_order', 'title', 'short_title', 'type', 'experiment_status', 'category', 'summary', 'description', 'accent', 'featured', 'year', 'tags', 'story'],
  note: ['id', 'slug', 'status', 'published_at', 'created_at', 'updated_at', 'created_by', 'title', 'excerpt', 'content', 'tags', 'accent', 'reading_time_minutes'],
};
export const DRAFT_COLS = ['entity_id', 'data', 'based_on_updated_at', 'created_at', 'updated_at', 'updated_by'];
export const SITE_DRAFT_COLS = ['key', 'data', 'updated_at', 'updated_by'];
export const SITE_PUB_COLS = ['key', 'data', 'published_at', 'published_by'];
export const ITEM_COLS = ['id', 'run_id', 'last_run_id', 'entity_type', 'source_key', 'source_path', 'source_hash', 'entity_id', 'state', 'seo_hash', 'last_error', 'created_at', 'updated_at', 'created_by'];
export const RUN_COLS = ['id', 'tool_version', 'source_digest', 'plan_digest', 'status', 'started_at', 'finished_at', 'created_by'];

const DOC_KEYS: Record<RowKind, string[]> = {
  project: ['slug', 'title', 'subtitle', 'summary', 'accent', 'size', 'graphic', 'tags', 'coming_soon', 'kind', 'type_label', 'category', 'project_status_label', 'project_status_accent', 'case_study', 'sort_order'],
  lab_entry: ['slug', 'title', 'short_title', 'type', 'experiment_status', 'category', 'summary', 'description', 'accent', 'featured', 'year', 'tags', 'story', 'sort_order'],
  note: ['slug', 'title', 'excerpt', 'content', 'tags', 'accent', 'reading_time_minutes', 'published_at'],
};

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const need = (cond: unknown, msg: string): void => { if (!cond) throw new Error(`Geçersiz hedef anlık görüntüsü: ${msg}`); };
const str = (v: unknown, what: string): string => { need(typeof v === 'string', `${what} metin olmalı`); return v as string; };
const strOrNull = (v: unknown, what: string): string | null => { need(v === null || v === undefined || typeof v === 'string', `${what} metin/null olmalı`); return (v ?? null) as string | null; };
const arr = (v: unknown, what: string): Raw[] => { need(Array.isArray(v), `${what} liste olmalı`); return (v as unknown[]).map((x, i) => { need(isObj(x), `${what}[${i}] nesne olmalı`); return x as Raw; }); };

/** Canlı satırdaki sütunlardan taslak-doc biçimini kurar. Not: published_at yalnızca notlarda doc'un parçasıdır. */
export function rowToDoc(kind: RowKind, row: Raw): Doc {
  const doc: Doc = {};
  for (const k of DOC_KEYS[kind]) {
    const v = row[k];
    doc[k] = v === undefined ? null : v;
  }
  if (kind === 'note') doc.published_at = normTsOrNull(row.published_at);
  return doc;
}

/** Karşılaştırma için doc'u kanonik hale getirir (zaman damgası biçimleri eşitlenir). */
export function normDoc(kind: EntityKind, doc: unknown): unknown {
  if (kind === 'note' && isObj(doc) && typeof doc.published_at === 'string') return { ...doc, published_at: normTs(doc.published_at) };
  return doc;
}
export const docHash = (kind: EntityKind, doc: unknown): string => hashOf(normDoc(kind, doc));

function normLive(kind: RowKind, r: Raw): LiveRow {
  const status = str(r.status, `${kind}.status`);
  need(status === 'draft' || status === 'preview' || status === 'published', `${kind}.status bilinmiyor`);
  return {
    id: str(r.id, `${kind}.id`),
    slug: str(r.slug, `${kind}.slug`),
    status: status as LiveRow['status'],
    published_at: normTsOrNull(r.published_at),
    created_at: normTs(str(r.created_at, `${kind}.created_at`)),
    updated_at: normTs(str(r.updated_at, `${kind}.updated_at`)),
    created_by: strOrNull(r.created_by, `${kind}.created_by`),
    doc: rowToDoc(kind, r),
    seo: kind === 'project' ? { seo_title: strOrNull(r.seo_title, 'seo_title'), seo_description: strOrNull(r.seo_description, 'seo_description') } : null,
  };
}
function normDraft(r: Raw, w: string): DraftRow {
  return {
    entity_id: str(r.entity_id, `${w}.entity_id`), data: r.data,
    based_on_updated_at: normTs(str(r.based_on_updated_at, `${w}.based_on_updated_at`)),
    created_at: normTs(str(r.created_at, `${w}.created_at`)), updated_at: normTs(str(r.updated_at, `${w}.updated_at`)),
    updated_by: strOrNull(r.updated_by, `${w}.updated_by`),
  };
}

/** Ham JSON (SQL çıktısı ya da PostgREST birleşimi) → doğrulanmış, normalleşmiş TargetSnapshot. Bozuk/eksik → hata. */
export function normalizeSnapshot(input: unknown): TargetSnapshot {
  need(isObj(input), 'kök nesne olmalı');
  const raw = input as Raw;
  need(raw.version === 1, 'version 1 olmalı');
  const prov = raw.provenanceTable === true;
  const rows = {} as Record<RowKind, LiveRow[]>;
  const drafts = {} as Record<RowKind, DraftRow[]>;
  for (const kind of ['project', 'lab_entry', 'note'] as const) {
    rows[kind] = arr(raw[TABLES[kind].live], TABLES[kind].live).map((r) => normLive(kind, r)).sort((a, b) => a.slug.localeCompare(b.slug));
    drafts[kind] = arr(raw[TABLES[kind].drafts], TABLES[kind].drafts).map((r) => normDraft(r, TABLES[kind].drafts)).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  }
  const siteDrafts = arr(raw.site_content_drafts, 'site_content_drafts').map((r) => ({ key: str(r.key, 'key'), data: r.data, updated_at: normTs(str(r.updated_at, 'updated_at')), updated_by: strOrNull(r.updated_by, 'updated_by') })).sort((a, b) => a.key.localeCompare(b.key));
  const sitePublished = arr(raw.site_content_published, 'site_content_published').map((r) => ({ key: str(r.key, 'key'), data: r.data, published_at: normTs(str(r.published_at, 'published_at')), published_by: strOrNull(r.published_by, 'published_by') })).sort((a, b) => a.key.localeCompare(b.key));
  let items: ProvItem[] = [];
  let runs: ProvRun[] = [];
  if (prov) {
    items = arr(raw.content_import_items, 'content_import_items').map((r) => {
      const t = str(r.entity_type, 'entity_type');
      need((ENTITY_KINDS as readonly string[]).includes(t), 'entity_type bilinmiyor');
      const state = str(r.state, 'state');
      need(['intent', 'created', 'published', 'completed', 'rolled_back'].includes(state), 'state bilinmiyor');
      return {
        id: str(r.id, 'item.id'), run_id: str(r.run_id, 'run_id'), last_run_id: str(r.last_run_id, 'last_run_id'), entity_type: t as EntityKind,
        source_key: str(r.source_key, 'source_key'), source_path: str(r.source_path, 'source_path'), source_hash: str(r.source_hash, 'source_hash'),
        entity_id: strOrNull(r.entity_id, 'entity_id'), state: state as ItemState, seo_hash: strOrNull(r.seo_hash, 'seo_hash'),
        last_error: strOrNull(r.last_error, 'last_error'), created_at: normTs(str(r.created_at, 'created_at')), updated_at: normTs(str(r.updated_at, 'updated_at')),
        created_by: strOrNull(r.created_by, 'created_by'),
      };
    }).sort((a, b) => (a.entity_type + a.source_key + a.id).localeCompare(b.entity_type + b.source_key + b.id));
    runs = arr(raw.content_import_runs, 'content_import_runs').map((r) => {
      const status = str(r.status, 'run.status');
      need(['running', 'completed', 'aborted'].includes(status), 'run.status bilinmiyor');
      return {
        id: str(r.id, 'run.id'), tool_version: str(r.tool_version, 'tool_version'), source_digest: str(r.source_digest, 'source_digest'), plan_digest: str(r.plan_digest, 'plan_digest'),
        status: status as ProvRun['status'], started_at: normTs(str(r.started_at, 'started_at')), finished_at: normTsOrNull(r.finished_at), created_by: strOrNull(r.created_by, 'created_by'),
      };
    }).sort((a, b) => a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id));
  }
  return { version: 1, capturedAt: str(raw.capturedAt ?? raw.captured_at, 'capturedAt'), provenanceTable: prov, rows, drafts, siteDrafts, sitePublished, items, runs };
}

export const emptySnapshot = (provenanceTable = true, capturedAt = '1970-01-01T00:00:00.000000Z'): TargetSnapshot => ({
  version: 1, capturedAt, provenanceTable, rows: { project: [], lab_entry: [], note: [] }, drafts: { project: [], lab_entry: [], note: [] },
  siteDrafts: [], sitePublished: [], items: [], runs: [],
});

/**
 * SALT-OKUNUR anlık görüntü SQL'i (yalnızca SELECT). Supabase SQL Editor'de çalıştırılır; tek hücrelik JSON çıktısı
 * dosyaya kaydedilip `dry-run --snapshot` ile verilir. Hiçbir şey yazmaz.
 */
export function snapshotSql(opts: { provenance: boolean } = { provenance: true }): string {
  const agg = (table: string, cols: string[], order: string) =>
    `(select coalesce(jsonb_agg(to_jsonb(t) order by ${order}), '[]'::jsonb) from (select ${cols.join(', ')} from public.${table}) t)`;
  const parts = [
    `'version', 1`,
    `'captured_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    `'provenanceTable', ${opts.provenance ? 'true' : 'false'}`,
    `'projects', ${agg('projects', LIVE_COLS.project, 't.slug')}`,
    `'lab_entries', ${agg('lab_entries', LIVE_COLS.lab_entry, 't.slug')}`,
    `'notes', ${agg('notes', LIVE_COLS.note, 't.slug')}`,
    `'project_drafts', ${agg('project_drafts', DRAFT_COLS, 't.entity_id')}`,
    `'lab_entry_drafts', ${agg('lab_entry_drafts', DRAFT_COLS, 't.entity_id')}`,
    `'note_drafts', ${agg('note_drafts', DRAFT_COLS, 't.entity_id')}`,
    `'site_content_drafts', ${agg('site_content_drafts', SITE_DRAFT_COLS, 't.key')}`,
    `'site_content_published', ${agg('site_content_published', SITE_PUB_COLS, 't.key')}`,
  ];
  if (opts.provenance) {
    parts.push(`'content_import_items', ${agg('content_import_items', ITEM_COLS, 't.entity_type, t.source_key, t.id')}`);
    parts.push(`'content_import_runs', ${agg('content_import_runs', RUN_COLS, 't.started_at, t.id')}`);
  }
  return [
    '-- MURAT/LAB FAZ 3B-B: SALT-OKUNUR hedef anlık görüntüsü (yalnızca SELECT, hiçbir şey yazmaz).',
    '-- Supabase SQL Editor\'de çalıştırın; tek hücrelik "snapshot" değerini (JSON) bir dosyaya kaydedin.',
    opts.provenance ? '-- 0006 uygulanmış olmalı. Uygulanmadıysa: sql-snapshot --no-provenance' : '-- --no-provenance: 0006 uygulanmamış hedef için (content_import_* tabloları okunmaz).',
    `select jsonb_pretty(jsonb_build_object(\n  ${parts.join(',\n  ')}\n)) as snapshot;`,
    '',
  ].join('\n');
}
