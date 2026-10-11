import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getProject, getLabEntry, getNote } from '@/lib/content';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { createCapMemory, createLimiter, createRecorder, createSession, type RpcOutcome } from './writer';
import type { HitDeps } from './hit';
import { splitPagePath, type HitKind } from './paths';

/**
 * /api/hit için gerçek bağımlılıklar (YALNIZCA sunucu). Service-role anahtarı KULLANILMAZ: yazıcı hesabı sıradan bir `authenticated`
 * kullanıcıdır; yetkisi yalnızca veritabanındaki analytics_writers kaydından ve record_hit() fonksiyonundan gelir.
 * Modül düzeyinde tek örnek (sıcak çağrılar arasında oturum ve sayaçlar paylaşılır).
 */
let client: SupabaseClient | null = null;
function writerClient(): SupabaseClient | null {
  if (client) return client;
  const env = getSupabaseEnv();
  if (!env) return null;
  client = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

const session = createSession({
  now: () => Date.now(),
  signIn: async () => {
    const c = writerClient();
    const email = process.env.ANALYTICS_WRITER_EMAIL;
    const password = process.env.ANALYTICS_WRITER_PASSWORD;
    if (!c || !email || !password) return null;
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error || !data.session) return null;
    return { expiresAtMs: (data.session.expires_at ?? Math.floor(Date.now() / 1000) + 300) * 1000 };
  },
});

const record = createRecorder({
  session,
  rpc: async (kind, path, bucket): Promise<RpcOutcome> => {
    const c = writerClient();
    if (!c) return { data: null, error: { message: 'not configured' } };
    const r = await c.rpc('record_hit', { p_kind: kind, p_path: path, p_bucket: bucket });
    return { data: r.data, error: r.error ? { code: r.error.code, message: r.error.message, status: r.status } : null };
  },
  onProblem: (code) => console.warn('[analytics] yazma başarısız', { code }),
});

async function exists(kind: HitKind, path: string): Promise<boolean> {
  if (kind === 'showcase') return Boolean((await getProject(path))?.caseStudy?.showcase);
  const { section, slug } = splitPagePath(path);
  if (!section || !slug) return true; // '/', '/lab', '/notes'
  if (section === 'projects') return Boolean(await getProject(slug));
  if (section === 'lab') return Boolean(await getLabEntry(slug));
  return Boolean(await getNote(slug));
}

export function runtimeDeps(): HitDeps {
  return {
    env: process.env,
    now: () => new Date(),
    exists,
    record,
    limiter: sharedLimiter,
    cap: sharedCap,
  };
}
const sharedLimiter = createLimiter(120, 60_000, () => Date.now());
const sharedCapMemory = createCapMemory(300_000, () => Date.now());
const sharedCap = { isCapped: () => sharedCapMemory.isCapped(), mark: () => sharedCapMemory.mark() };
