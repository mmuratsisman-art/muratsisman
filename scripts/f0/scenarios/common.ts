import type { FakeSupabase } from '../fake-supabase/server';
import { baseWorld, PROBE, staticMarkers } from '../fake-supabase/fixtures';
import { get, sleep, type Resp } from '../lib/http';
import type { AppInstance } from '../lib/proc';
import type { Sandbox } from '../lib/sandbox';
import type { ScenarioResult } from '../lib/types';

export interface BuildInfo { code: number | null; output: string; ms: number; requests: { table: string | null; path: string }[] }

export interface StartOpts {
  /** Hangi varyant: 'cms' (cms build) veya 'static' (static build) */
  variant?: 'cms' | 'static';
  /** Çalışma zamanı CONTENT_SOURCE değeri (varsayılan: variant'a göre cms/static) */
  source?: string;
  /** true: .next/cache temizlenmez (yeniden başlatma testi) */
  keepCache?: boolean;
}

export interface Ctx {
  fake: FakeSupabase;
  ttl: number;
  quick: boolean;
  builds: { cms: BuildInfo | null; static: BuildInfo | null };
  sandboxes: { cms: Sandbox | null; static: Sandbox | null };
  /** Taze fixture + sıfırlanmış modlarla uygulamayı başlatır (cache temizlenir) */
  start(label: string, opts?: StartOpts): Promise<AppInstance>;
  probe(app: AppInstance, mode: 'real' | 'tag' | 'path'): Promise<{ status: number; body: string }>;
  /** Mutlak/ölçekli bekleme: ölçek 1 = gerçek zaman */
  wait(ms: number): Promise<void>;
}

export const noteUrl = (a: AppInstance): string => `${a.baseUrl}/notes/${PROBE.noteSlug}`;
export const verOf = (r: Resp): string | null => {
  const m = /F0PROBE-(v\d+)/.exec(r.h1 ?? '') ?? /F0PROBE-(v\d+)/.exec(r.body);
  return m ? m[1] : null;
};
export const staticLeak = (r: Resp): boolean => staticMarkers().some((t) => r.body.includes(t));
export const fresh = (ctx: Ctx): void => { ctx.fake.setWorld(baseWorld()); ctx.fake.resetModes(); ctx.fake.clearLog(); };
export const code = (r: Resp): string => String(r.status);

export function empty(id: string, title: string): ScenarioResult {
  return { id, title, status: 'PASS', checks: [], observations: [] };
}
export function notRun(id: string, title: string, reason: string): ScenarioResult {
  return { id, title, status: 'NOT RUN', checks: [], observations: [], notRunReason: reason };
}

/** Bir senaryoyu çalıştırır; beklenmeyen istisna → status FAIL (düzenek hatası), uygulama davranışı değil. */
export async function guarded(id: string, title: string, fn: (r: ScenarioResult) => Promise<void>): Promise<ScenarioResult> {
  const r = empty(id, title);
  try { await fn(r); } catch (e) { r.status = 'FAIL'; r.observations.push(`DÜZENEK İSTİSNASI: ${(e as Error).message}`); }
  return r;
}
export { get, sleep };
