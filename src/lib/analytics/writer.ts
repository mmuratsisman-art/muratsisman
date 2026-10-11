/**
 * Yazıcı hesabı oturumu ve RPC çağrısı (SAF mantık; ağ bağımlılıkları enjekte edilir).
 *  - Oturum modül belleğinde tutulur; süresi dolmadan 60 sn önce yeniden giriş yapılır (autoRefreshToken kapalı).
 *  - Eşzamanlı istekler TEK giriş vaadini paylaşır (Auth uç noktasına yağmur yağmaz).
 *  - Giriş başarısızsa (ör. 429, yanlış parola) kısa süre "devre dışı": Auth/DB çağrısı yapılmaz, sayım düşer, site etkilenmez.
 *  - RPC yetki/oturum hatası verirse bir kez yeniden giriş denenir; 42501 (yazıcı iptal edildi) ise uzun süre devre dışı kalır.
 * Parola/e-posta/token bu modülde loglanmaz.
 */
export interface SignInResult {
  /** epoch ms */
  expiresAtMs: number;
}
export interface RpcOutcome {
  data: unknown;
  error: { code?: string; message?: string; status?: number } | null;
}
export type RecordResult = 'ok' | 'capped' | 'invalid' | 'error';

export interface SessionOptions {
  signIn: () => Promise<SignInResult | null>;
  now: () => number;
  skewMs?: number;
  failBackoffMs?: number;
}

export function createSession(o: SessionOptions) {
  const skew = o.skewMs ?? 60_000;
  const failBackoff = o.failBackoffMs ?? 120_000;
  let expiresAt = 0;
  let blockedUntil = 0;
  let inflight: Promise<boolean> | null = null;
  return {
    async ensure(): Promise<boolean> {
      const t = o.now();
      if (t < blockedUntil) return false;
      if (t < expiresAt - skew) return true;
      if (!inflight) {
        inflight = (async () => {
          try {
            const r = await o.signIn();
            if (!r) {
              blockedUntil = o.now() + failBackoff;
              return false;
            }
            expiresAt = r.expiresAtMs;
            return true;
          } catch {
            blockedUntil = o.now() + failBackoff;
            return false;
          } finally {
            inflight = null;
          }
        })();
      }
      return inflight;
    },
    invalidate(): void {
      expiresAt = 0;
    },
    block(ms: number): void {
      blockedUntil = o.now() + ms;
      expiresAt = 0;
    },
  };
}
export type WriterSession = ReturnType<typeof createSession>;

const isAuthFailure = (e: NonNullable<RpcOutcome['error']>): boolean =>
  e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt/i.test(e.message ?? '');

export function createRecorder(o: {
  session: WriterSession;
  rpc: (kind: string, path: string, bucket: number) => Promise<RpcOutcome>;
  revokedBlockMs?: number;
  onProblem?: (code: string) => void;
}) {
  const revokedBlock = o.revokedBlockMs ?? 600_000;
  const classify = (data: unknown): RecordResult => (data === 'ok' || data === 'capped' || data === 'invalid' ? data : 'error');
  return async function record(kind: string, path: string, bucket: number): Promise<RecordResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await o.session.ensure())) {
        o.onProblem?.('signin');
        return 'error';
      }
      let res: RpcOutcome;
      try {
        res = await o.rpc(kind, path, bucket);
      } catch {
        o.onProblem?.('rpc-throw');
        return 'error';
      }
      if (!res.error) return classify(res.data);
      if (res.error.code === '42501') {
        // yazıcı iptal edildi / yetkisiz: uzun süre yeniden denenmez
        o.session.block(revokedBlock);
        o.onProblem?.('forbidden');
        return 'error';
      }
      if (isAuthFailure(res.error) && attempt === 0) {
        o.session.invalidate();
        continue;
      }
      o.onProblem?.('rpc-error');
      return 'error';
    }
    return 'error';
  };
}

/** Sabit pencereli, örnek (instance) başına kaba hız sınırı: yalnızca DB çağrı patlamasını sınırlar. */
export function createLimiter(max: number, windowMs: number, now: () => number) {
  let start = 0;
  let count = 0;
  return {
    take(): boolean {
      const t = now();
      if (t - start >= windowMs) {
        start = t;
        count = 0;
      }
      if (count >= max) return false;
      count += 1;
      return true;
    },
  };
}

/** RPC 'capped' dönünce kısa süre DB çağrısı yapma (örnek başına, en iyi çaba). */
export function createCapMemory(ms: number, now: () => number) {
  let until = 0;
  return {
    isCapped: () => now() < until,
    mark: () => {
      until = now() + ms;
    },
  };
}
