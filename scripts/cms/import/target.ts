import type { RowKind, SeoPair, TargetSnapshot } from './types';

export type Res<T = void> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Import'un TEK dış dünya sınırı. Gerçek uygulama (supabase-target.ts) kullanıcının admin oturumuyla çalışır;
 * testler gerçek PostgreSQL üzerinde aynı arayüzü (pg-target.ts) kullanır. Service-role YOKTUR.
 */
export interface ImportTarget {
  /** Tüm ilgili tabloların güncel, normalleşmiş görüntüsü. Okuma hatası → throw (fail-closed). */
  readSnapshot(): Promise<TargetSnapshot>;
  /** Yalnızca mevcut yaşam döngüsü RPC'leri (create_*, publish_*, save_site_content_draft, publish_site_content_draft). */
  rpc(name: string, args: Record<string, unknown>): Promise<Res<unknown>>;
  /** KORUMALI: yalnızca seo_title ve seo_description ikisi de NULL ise yazar; aksi halde 0 satır → hata. */
  setProjectSeo(id: string, seo: SeoPair): Promise<Res>;
  startRun(input: { toolVersion: string; sourceDigest: string; planDigest: string }): Promise<Res<string>>;
  finishRun(id: string, status: 'completed' | 'aborted', summary: Record<string, unknown>): Promise<Res>;
  insertItem(input: { runId: string; kind: string; key: string; sourcePath: string; sourceHash: string }): Promise<Res<string>>;
  updateItem(id: string, patch: { state?: string; entityId?: string; seoHash?: string; lastError?: string | null; lastRunId?: string }): Promise<Res>;
  /** KORUMALI silme: `id` VE `updated_at` eşleşmezse 0 satır (başkası değiştirmiş) → data=false. */
  deleteRow(kind: RowKind, id: string, expectedUpdatedAt: string): Promise<Res<boolean>>;
}
