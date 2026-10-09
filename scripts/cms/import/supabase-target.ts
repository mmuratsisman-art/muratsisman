import { normalizeSnapshot, DRAFT_COLS, ITEM_COLS, LIVE_COLS, RUN_COLS, SITE_DRAFT_COLS, SITE_PUB_COLS } from './snapshot';
import type { ImportTarget, Res } from './target';
import { TABLES, type RowKind, type SeoPair, type TargetSnapshot } from './types';

/**
 * GERÇEK hedef: kullanıcının (admin) oturumu + yayınlanabilir (publishable/anon) anahtar. Service-role anahtarı KULLANILMAZ
 * ve reddedilir. Tüm yazmalar mevcut RLS/RPC kurallarından geçer. Parola/anahtar hiçbir yere yazdırılmaz.
 */
interface QueryResult { data: unknown; error: { code?: string; message?: string } | null }
interface Query extends PromiseLike<QueryResult> {
  select(cols?: string): Query; insert(v: unknown): Query; update(v: unknown): Query; delete(): Query;
  eq(c: string, v: unknown): Query; is(c: string, v: null): Query; order(c: string): Query; range(a: number, b: number): Query;
  single(): Query; maybeSingle(): Query;
}
interface Client {
  from(t: string): Query;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<QueryResult>;
  auth: { signInWithPassword(c: { email: string; password: string }): Promise<{ error: { message?: string } | null }> };
}

const PAGE = 1000;

export function assertNotServiceRole(key: string): void {
  if (key.startsWith('sb_secret_')) throw new Error('Service-role/secret anahtarı kullanılamaz. Yalnızca yayınlanabilir (publishable/anon) anahtar.');
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { role?: string };
      if (payload.role === 'service_role') throw new Error('Service-role anahtarı kullanılamaz. Yalnızca yayınlanabilir (anon/publishable) anahtar.');
    } catch (e) {
      if ((e as Error).message.startsWith('Service-role')) throw e;
    }
  }
}

export async function connectSupabase(env: { url: string; key: string; email: string; password: string }): Promise<ImportTarget> {
  assertNotServiceRole(env.key);
  if (!/^https:\/\//.test(env.url)) throw new Error('Supabase URL https:// ile başlamalı.');
  const spec = '@supabase/supabase-js'; // dinamik: yalnızca CLI çalışırken yüklenir (uygulama bundle'ına girmez)
  const mod = (await import(spec)) as { createClient: (u: string, k: string, o: unknown) => unknown };
  const client = mod.createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } }) as Client;
  const signed = await client.auth.signInWithPassword({ email: env.email, password: env.password });
  if (signed.error) throw new Error('Admin oturumu açılamadı.'); // ayrıntı/kimlik bilgisi yazdırılmaz
  const admin = await client.rpc('is_admin');
  if (admin.error || admin.data !== true) throw new Error('Bu oturum admin değil (admin_users). İşlem durduruldu.');
  return makeTarget(client);
}

const missingTable = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message ?? ''));

async function readAll(client: Client, table: string, cols: string[], order: string): Promise<unknown[]> {
  const r = await client.from(table).select(cols.join(',')).order(order).range(0, PAGE - 1);
  if (r.error) throw Object.assign(new Error(`${table} okunamadı: ${r.error.message ?? r.error.code}`), { pgError: r.error });
  const rows = r.data as unknown[];
  if (rows.length >= PAGE) throw new Error(`${table}: ${PAGE}+ satır; sayfalama desteklenmiyor (fail-closed)`);
  return rows;
}

export function makeTarget(client: Client): ImportTarget {
  const err = (e: { code?: string; message?: string } | null): string => `${e?.message ?? e?.code ?? 'bilinmeyen hata'}`;
  return {
    async readSnapshot(): Promise<TargetSnapshot> {
      const raw: Record<string, unknown> = { version: 1, capturedAt: new Date().toISOString().replace(/Z$/, '000Z') };
      for (const k of ['project', 'lab_entry', 'note'] as const) {
        raw[TABLES[k].live] = await readAll(client, TABLES[k].live, LIVE_COLS[k], 'slug');
        raw[TABLES[k].drafts] = await readAll(client, TABLES[k].drafts, DRAFT_COLS, 'entity_id');
      }
      raw.site_content_drafts = await readAll(client, 'site_content_drafts', SITE_DRAFT_COLS, 'key');
      raw.site_content_published = await readAll(client, 'site_content_published', SITE_PUB_COLS, 'key');
      try {
        raw.content_import_items = await readAll(client, 'content_import_items', ITEM_COLS, 'source_key');
        raw.content_import_runs = await readAll(client, 'content_import_runs', RUN_COLS, 'started_at');
        raw.provenanceTable = true;
      } catch (e) {
        const pg = (e as { pgError?: { code?: string; message?: string } }).pgError ?? null;
        if (!missingTable(pg)) throw e; // yalnızca "tablo yok" 0006'nın uygulanmadığı anlamına gelir; başka her hata fail-closed
        raw.provenanceTable = false;
      }
      return normalizeSnapshot(raw);
    },
    async rpc(name, args): Promise<Res<unknown>> {
      const r = await client.rpc(name, args);
      return r.error ? { ok: false, error: err(r.error) } : { ok: true, data: r.data };
    },
    async setProjectSeo(id: string, seo: SeoPair): Promise<Res> {
      const r = await client.from('projects').update({ seo_title: seo.seo_title, seo_description: seo.seo_description }).eq('id', id).is('seo_title', null).is('seo_description', null).select('id');
      if (r.error) return { ok: false, error: err(r.error) };
      return (r.data as unknown[]).length === 1 ? { ok: true, data: undefined } : { ok: false, error: 'SEO sütunları zaten dolu ya da kayıt yok (0 satır güncellendi)' };
    },
    async startRun(i): Promise<Res<string>> {
      const r = await client.from('content_import_runs').insert({ tool_version: i.toolVersion, source_digest: i.sourceDigest, plan_digest: i.planDigest }).select('id').single();
      return r.error ? { ok: false, error: err(r.error) } : { ok: true, data: (r.data as { id: string }).id };
    },
    async finishRun(id, status, summary): Promise<Res> {
      const r = await client.from('content_import_runs').update({ status, finished_at: new Date().toISOString(), summary }).eq('id', id).select('id');
      return r.error ? { ok: false, error: err(r.error) } : { ok: true, data: undefined };
    },
    async insertItem(i): Promise<Res<string>> {
      const r = await client.from('content_import_items').insert({ run_id: i.runId, last_run_id: i.runId, entity_type: i.kind, source_key: i.key, source_path: i.sourcePath, source_hash: i.sourceHash }).select('id').single();
      return r.error ? { ok: false, error: err(r.error) } : { ok: true, data: (r.data as { id: string }).id };
    },
    async updateItem(id, p): Promise<Res> {
      const patch: Record<string, unknown> = {};
      if (p.state !== undefined) patch.state = p.state;
      if (p.entityId !== undefined) patch.entity_id = p.entityId;
      if (p.seoHash !== undefined) patch.seo_hash = p.seoHash;
      if (p.lastError !== undefined) patch.last_error = p.lastError === null ? null : p.lastError.slice(0, 500);
      if (p.lastRunId !== undefined) patch.last_run_id = p.lastRunId;
      if (!Object.keys(patch).length) return { ok: true, data: undefined };
      const r = await client.from('content_import_items').update(patch).eq('id', id).select('id');
      if (r.error) return { ok: false, error: err(r.error) };
      return (r.data as unknown[]).length === 1 ? { ok: true, data: undefined } : { ok: false, error: 'ledger satırı güncellenemedi (0 satır)' };
    },
    async deleteRow(kind: RowKind, id, expectedUpdatedAt): Promise<Res<boolean>> {
      const r = await client.from(TABLES[kind].live).delete().eq('id', id).eq('updated_at', expectedUpdatedAt).select('id');
      return r.error ? { ok: false, error: err(r.error) } : { ok: true, data: (r.data as unknown[]).length === 1 };
    },
  };
}
