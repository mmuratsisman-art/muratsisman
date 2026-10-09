/** 3B-A2 regresyon betikleri için ortak yardımcılar: enjekte edilmiş (sahte) bağımlılıklarla çalışır; Next, Supabase ve veritabanı GEREKMEZ. */
import type { EntityDeps } from '@/lib/cms/admin/entity-actions';

export class Redirected extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}
export type RpcCall = { name: string; args: Record<string, unknown> };

export function harness(opts: { admin?: boolean; rpcError?: Record<string, string>; saveToken?: string } = {}) {
  const { admin = true, rpcError = {}, saveToken = '2026-10-06T10:00:00.123456+00:00' } = opts;
  const calls: RpcCall[] = [];
  let guardCalls = 0;
  const deps: EntityDeps = {
    requireAdmin: async () => {
      guardCalls += 1;
      return { kind: admin ? 'admin' : 'forbidden' };
    },
    callRpc: async <T>(name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const kind = rpcError[name];
      if (kind) return { ok: false as const, kind: kind as 'stale' };
      return { ok: true as const, data: (name.startsWith('save') ? saveToken : name.startsWith('create') ? '11111111-1111-4111-8111-111111111111' : null) as T };
    },
    redirect: (url: string): never => {
      throw new Redirected(url);
    },
  };
  return { deps, calls, guardCalls: () => guardCalls };
}

export function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

export async function outcome<S>(fn: () => Promise<S>): Promise<{ state: S | null; redirect: string | null }> {
  try {
    return { state: await fn(), redirect: null };
  } catch (e) {
    if (e instanceof Redirected) return { state: null, redirect: e.url };
    throw e;
  }
}

export const names = (calls: RpcCall[]) => calls.map((c) => c.name).join(',');

export function runner() {
  let passed = 0;
  const failures: string[] = [];
  return {
    async check(name: string, fn: () => void | Promise<void>) {
      try {
        await fn();
        passed += 1;
      } catch (e) {
        failures.push(`${name}: ${process.env.T_VERBOSE ? (e as Error).message.slice(0, 1800) : (e as Error).message.split('\n')[0]}`);
      }
    },
    finish(okMessage: string) {
      console.log(`${passed} kontrol geçti, ${failures.length} başarısız.`);
      if (failures.length) {
        for (const f of failures) console.log('  HATA', f);
        process.exit(1);
      }
      console.log(okMessage);
    },
  };
}
