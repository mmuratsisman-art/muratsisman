import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashOf } from './canonical';
import { pgTarget, type PgConfig } from './pg-target';

/** Yerel, geçici PostgreSQL için test altyapısı (üretim DB'sine ASLA bağlanmaz). */
export const ADMIN = '00000000-0000-0000-0000-0000000000a1';
export const OTHER_ADMIN = '00000000-0000-0000-0000-0000000000a3';
export const NON_ADMIN = '00000000-0000-0000-0000-0000000000b2';

const ROOT = process.cwd();
const MIGRATIONS = ['0001_cms_schema', '0002_cms_rls', '0004_faz3b_drafts_and_publish', '0005_faz3b_projects_site_content', '0006_faz3b_content_import_provenance'];

export interface PgEnv { host: string; port: number; superUser: string }
export function pgEnv(): PgEnv | null {
  const host = process.env.PG_TEST_HOST; const port = Number(process.env.PG_TEST_PORT ?? '');
  if (!host || !port) return null;
  return { host, port, superUser: process.env.PG_TEST_USER ?? 'postgres' };
}
const sh = (env: PgEnv, db: string, args: string[], input?: string): string =>
  execFileSync('psql', ['-h', env.host, '-p', String(env.port), '-U', env.superUser, '-d', db, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

export function buildTemplate(env: PgEnv, name = 'muratlab_3bb_tmpl'): string {
  sh(env, 'postgres', ['-c', `drop database if exists ${name}`]);
  sh(env, 'postgres', ['-c', `create database ${name}`]);
  sh(env, name, ['-f', join(ROOT, 'scripts/cms/import/test-fixtures/supabase-stub.sql')]);
  for (const m of MIGRATIONS) sh(env, name, ['-f', join(ROOT, `supabase/migrations/${m}.sql`)]);
  return name;
}
let n = 0;
export function scenarioDb(env: PgEnv, tmpl: string, userId = ADMIN, seedUsers = true) {
  const db = `muratlab_3bb_s${process.pid}_${++n}`;
  sh(env, 'postgres', ['-c', `create database ${db} template ${tmpl}`]);
  if (seedUsers) sh(env, db, ['-c', `insert into auth.users (id, aud, role, email) values ('${ADMIN}','authenticated','authenticated','admin@example.test'),('${OTHER_ADMIN}','authenticated','authenticated','admin2@example.test'),('${NON_ADMIN}','authenticated','authenticated','user@example.test'); insert into public.admin_users (user_id) values ('${ADMIN}'),('${OTHER_ADMIN}');`]);
  const cfg: PgConfig = { host: env.host, port: env.port, db, userId, superUser: env.superUser };
  const target = pgTarget(cfg);
  return {
    db, cfg, target,
    as(userIdOther: string) { return pgTarget({ ...cfg, userId: userIdOther }); },
    sql: (q: string): string => sh(env, db, [], q).trim(),
    /** anon rolüyle (public site) salt-okunur sorgu */
    anon: (q: string): string => sh(env, db, [], `begin;\nset local role anon;\n${q}\ncommit;`).trim(),
    file: (f: string): string => sh(env, db, ['-f', f]),
    /** hata beklenen SQL: {ok:false,error} döner */
    try: (q: string): { ok: boolean; error?: string } => { try { sh(env, db, [], q); return { ok: true }; } catch (e) { const m = /ERROR:\s+(.*)/.exec((e as { stderr?: string }).stderr ?? ''); return { ok: false, error: m ? m[1] : String(e) }; } },
    json: <T>(q: string): T[] => JSON.parse(sh(env, db, [], `select coalesce(jsonb_agg(t), '[]') from (${q}) t;`)) as T[],
    /** tüm ilgili tabloların kanonik özeti: "hiçbir şey yazılmadı" kanıtı (zaman damgaları dahil) */
    fingerprint(): string {
      const tables = ['projects', 'lab_entries', 'notes', 'project_drafts', 'lab_entry_drafts', 'note_drafts', 'site_content_drafts', 'site_content_published', 'content_import_runs', 'content_import_items'];
      const parts = tables.map((t) => JSON.parse(sh(env, db, [], `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]') from public.${t} t;`)) as unknown);
      return hashOf(parts);
    },
    drop() { sh(env, 'postgres', ['-c', `drop database if exists ${db}`]); },
  };
}
export const readFile = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
