export const TOOL_VERSION = '3b-b.1';

export type EntityKind = 'project' | 'lab_entry' | 'note' | 'site_content';
export const ENTITY_KINDS: readonly EntityKind[] = ['project', 'lab_entry', 'note', 'site_content'];
export const KIND_ORDER: Record<EntityKind, number> = { project: 0, lab_entry: 1, note: 2, site_content: 3 };
export type RowKind = Exclude<EntityKind, 'site_content'>;
export const isRowKind = (k: EntityKind): k is RowKind => k !== 'site_content';

export const TABLES: Record<RowKind, { live: string; drafts: string; create: string; publish: string }> = {
  project: { live: 'projects', drafts: 'project_drafts', create: 'create_project', publish: 'publish_project' },
  lab_entry: { live: 'lab_entries', drafts: 'lab_entry_drafts', create: 'create_lab_entry', publish: 'publish_lab_entry' },
  note: { live: 'notes', drafts: 'note_drafts', create: 'create_note', publish: 'publish_note' },
};

export type Doc = Record<string, unknown>;
export interface SeoPair { seo_title: string; seo_description: string }

export interface SourceRecord {
  kind: EntityKind;
  /** slug (project | lab_entry | note) veya site içeriği anahtarı */
  key: string;
  sourcePath: string;
  /** dizideki konum (sıra korunur) */
  order: number;
  /** RPC'ye gönderilecek taslak dokümanı (hedef doğrulayıcı çıktısı) */
  doc: Doc;
  docHash: string;
  seo: SeoPair | null;
  seoHash: string | null;
  validation: { ok: boolean; errors: string[] };
}

/* ───── Hedef (Supabase) anlık görüntüsü ───── */

export interface LiveRow {
  id: string;
  slug: string;
  status: 'draft' | 'preview' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  /** hedefte düzenlenebilir alanların doc biçimi */
  doc: Doc;
  /** yalnızca projeler */
  seo: { seo_title: string | null; seo_description: string | null } | null;
}
export interface DraftRow { entity_id: string; data: unknown; based_on_updated_at: string; created_at: string; updated_at: string; updated_by: string | null }
export interface SiteDraftRow { key: string; data: unknown; updated_at: string; updated_by: string | null }
export interface SitePubRow { key: string; data: unknown; published_at: string; published_by: string | null }

export type ItemState = 'intent' | 'created' | 'published' | 'completed' | 'rolled_back';
export interface ProvItem {
  id: string;
  run_id: string;
  last_run_id: string;
  entity_type: EntityKind;
  source_key: string;
  source_path: string;
  source_hash: string;
  entity_id: string | null;
  state: ItemState;
  seo_hash: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}
export interface ProvRun {
  id: string;
  tool_version: string;
  source_digest: string;
  plan_digest: string;
  status: 'running' | 'completed' | 'aborted';
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
}

export interface TargetSnapshot {
  version: 1;
  capturedAt: string;
  /** 0006 uygulanmış mı (content_import_* tabloları var mı) */
  provenanceTable: boolean;
  rows: Record<RowKind, LiveRow[]>;
  drafts: Record<RowKind, DraftRow[]>;
  siteDrafts: SiteDraftRow[];
  sitePublished: SitePubRow[];
  items: ProvItem[];
  runs: ProvRun[];
}

/* ───── Plan ───── */

export type Decision = 'CREATE' | 'RESUME' | 'SKIP_IMPORTED' | 'SKIP_IDENTICAL_UNMANAGED' | 'CONFLICT' | 'UNVERIFIABLE';
export type SeoPlan = 'NONE' | 'APPLY' | 'DONE' | 'CONFLICT' | 'NOT_MANAGED';
export type Step = 'intent' | 'create' | 'record_created' | 'publish' | 'record_published' | 'seo' | 'verify_complete'
  | 'save_draft' | 'publish_site';

export interface PlanItem {
  kind: EntityKind;
  key: string;
  sourcePath: string;
  sourceHash: string;
  decision: Decision;
  reasons: string[];
  entityId: string | null;
  /** RESUME: ledger durumu */
  resumeFrom: ItemState | null;
  seo: SeoPlan;
  steps: Step[];
  /** hedefin bu kayda ait dilimi (satır + taslak + ledger + taslak slug iddiaları); TOCTOU karşılaştırması için */
  targetFingerprint: string;
}
export type Severity = 'info' | 'warning' | 'blocker';
export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  kind?: EntityKind;
  key?: string;
  id?: string;
  /** 3B-E (cutover) öncesi çözülmesi gereken engel */
  cutoverBlocker?: boolean;
}
export interface Plan {
  version: 1;
  toolVersion: string;
  generatedAt: string;
  sourceDigest: string;
  snapshotCapturedAt: string;
  provenanceTable: boolean;
  items: PlanItem[];
  findings: Finding[];
  counts: {
    source: number;
    targetBefore: number;
    create: number;
    resume: number;
    skip: number;
    conflict: number;
    unverifiable: number;
  };
  canApply: boolean;
  blockers: string[];
  planDigest: string;
}
