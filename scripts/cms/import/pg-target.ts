import { execFileSync } from 'node:child_process';
import { normalizeSnapshot, snapshotSql } from './snapshot';
import type { ImportTarget, Res } from './target';
import type { RowKind, SeoPair, TargetSnapshot } from './types';
import { TABLES } from './types';

/**
 * TEST hedefi: gerçek bir PostgreSQL'e `psql` ile bağlanır. Her çağrı, PostgREST isteği gibi TEK bir transaction'dır ve
 * `authenticated` rolü + admin JWT claim'i ile çalışır (RLS ve is_admin() gerçekten devrededir). Üretimde KULLANILMAZ.
 */
export interface PgConfig { host: string; port: number; db: string; userId: string; superUser?: string }

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const dq = (s: string) => `$q$${s}$q$`;

export function psql(cfg: PgConfig, sql: string, opts: { asSuper?: boolean } = {}): { ok: true; out: string } | { ok: false; error: string } {
  const claims = JSON.stringify({ sub: cfg.userId, role: 'authenticated' });
  const pre = opts.asSuper ? '' : `set local request.jwt.claims = ${q(claims)};\nset local role authenticated;\n`;
  const script = `begin;\n${pre}${sql}\ncommit;\n`;
  try {
    const out = execFileSync('psql', ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.superUser ?? 'postgres', '-d', cfg.db, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: script, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = (e as { stderr?: string }).stderr ?? String(e);
    const m = /ERROR:\s+(.*)/.exec(err);
    return { ok: false, error: (m ? m[1] : err).trim().split('\n')[0] };
  }
}

export function pgTarget(cfg: PgConfig): ImportTarget & { raw(sql: string): string; asAdmin(sql: string): string } {
  const one = <T>(sql: string): Res<T> => {
    const r = psql(cfg, sql);
    if (!r.ok) return r;
    try { return { ok: true, data: (r.out === '' ? null : JSON.parse(r.out)) as T }; } catch { return { ok: true, data: r.out as unknown as T }; }
  };
  const done = (sql: string): Res => { const r = psql(cfg, sql); return r.ok ? { ok: true, data: undefined } : r; };
  return {
    raw(sql) { const r = psql(cfg, sql, { asSuper: true }); if (!r.ok) throw new Error(r.error); return r.out; },
    asAdmin(sql) { const r = psql(cfg, sql); if (!r.ok) throw new Error(r.error); return r.out; },
    async readSnapshot(): Promise<TargetSnapshot> {
      const has = psql(cfg, `select to_regclass('public.content_import_items') is not null;`);
      if (!has.ok) throw new Error(has.error);
      const sql = snapshotSql({ provenance: has.out === 't' }).replace(/jsonb_pretty\(/, '(').replace(/ as snapshot;/, ' as snapshot;');
      const r = psql(cfg, sql);
      if (!r.ok) throw new Error(r.error);
      return normalizeSnapshot(JSON.parse(r.out));
    },
    async rpc(name, args) {
      const call = Object.entries(args).map(([k, v]) => `${k} => ${v === null ? 'null' : typeof v === 'string' ? `${dq(v)}` : `${dq(JSON.stringify(v))}::jsonb`}`).join(', ');
      // metin parametreleri (uuid/timestamptz/text) dolar-tırnaklı literal olarak verilir; PG örtük dönüşüm yapar
      return one(`select public.${name}(${call})::text;`);
    },
    async setProjectSeo(id, seo: SeoPair) {
      const r = psql(cfg, `update public.projects set seo_title = ${dq(seo.seo_title)}, seo_description = ${dq(seo.seo_description)} where id = ${dq(id)} and seo_title is null and seo_description is null returning id;`);
      if (!r.ok) return r;
      return r.out.includes(id) ? { ok: true, data: undefined } : { ok: false, error: 'SEO sütunları zaten dolu ya da kayıt yok (0 satır güncellendi)' };
    },
    async startRun(i) {
      return one<string>(`insert into public.content_import_runs (tool_version, source_digest, plan_digest) values (${dq(i.toolVersion)}, ${dq(i.sourceDigest)}, ${dq(i.planDigest)}) returning to_jsonb(id);`);
    },
    async finishRun(id, status, summary) {
      return done(`update public.content_import_runs set status = ${dq(status)}, finished_at = now(), summary = ${dq(JSON.stringify(summary))}::jsonb where id = ${dq(id)};`);
    },
    async insertItem(i) {
      return one<string>(`insert into public.content_import_items (run_id, last_run_id, entity_type, source_key, source_path, source_hash) values (${dq(i.runId)}, ${dq(i.runId)}, ${dq(i.kind)}, ${dq(i.key)}, ${dq(i.sourcePath)}, ${dq(i.sourceHash)}) returning to_jsonb(id);`);
    },
    async updateItem(id, p) {
      const sets: string[] = [];
      if (p.state !== undefined) sets.push(`state = ${dq(p.state)}`);
      if (p.entityId !== undefined) sets.push(`entity_id = ${dq(p.entityId)}`);
      if (p.seoHash !== undefined) sets.push(`seo_hash = ${dq(p.seoHash)}`);
      if (p.lastError !== undefined) sets.push(`last_error = ${p.lastError === null ? 'null' : dq(p.lastError.slice(0, 500))}`);
      if (p.lastRunId !== undefined) sets.push(`last_run_id = ${dq(p.lastRunId)}`);
      if (!sets.length) return { ok: true, data: undefined };
      const r = psql(cfg, `update public.content_import_items set ${sets.join(', ')} where id = ${dq(id)} returning id;`);
      if (!r.ok) return r;
      return r.out.includes(id) ? { ok: true, data: undefined } : { ok: false, error: 'ledger satırı güncellenemedi (0 satır)' };
    },
    async deleteRow(kind: RowKind, id, expectedUpdatedAt) {
      const r = psql(cfg, `delete from public.${TABLES[kind].live} where id = ${dq(id)} and updated_at = ${dq(expectedUpdatedAt)}::timestamptz returning id;`);
      if (!r.ok) return r;
      return { ok: true, data: r.out.includes(id) };
    },
  };
}
