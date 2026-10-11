import { analyticsStatus, type AnalyticsEnv } from './config';
import { visitorBucket, istanbulDay } from './bucket';
import { checkHitRequest, parseHitBody, type HeaderReader } from './guard';
import type { HitKind } from './paths';
import type { RecordResult } from './writer';

/**
 * /api/hit orkestrasyonu (SAF; bağımlılıklar enjekte edilir → testlenebilir). Her koşulda hata FIRLATMAZ.
 * Sıra (en ucuzdan pahalıya): etkinleştirme kapısı → istek süzgeçleri → gövde → yol/slug doğrulama → hız sınırı/tavan belleği → kova → RPC.
 * IP ve User-Agent yalnızca kovayı hesaplamak için kullanılır; hiçbir yere yazılmaz/loglanmaz.
 */
export interface HitDeps {
  env: AnalyticsEnv;
  now: () => Date;
  /** page: yol, showcase: slug. Yayınlanmış içerik varlığı (RPC ayrıca yeniden doğrular). */
  exists: (kind: HitKind, path: string) => Promise<boolean>;
  record: (kind: HitKind, path: string, bucket: number) => Promise<RecordResult>;
  limiter: { take(): boolean };
  cap: { isCapped(): boolean; mark(): void };
}
export interface HitInput {
  method: string;
  headers: HeaderReader;
  requestUrl: string;
  readBody: () => Promise<string>;
  ip: string;
  userAgent: string;
}
export type HitOutcome = { recorded: boolean; reason: string };

export async function processHit(i: HitInput, d: HitDeps): Promise<HitOutcome> {
  const st = analyticsStatus(d.env);
  if (!st.enabled) return { recorded: false, reason: 'disabled' };

  const g = checkHitRequest({ method: i.method, headers: i.headers, requestUrl: i.requestUrl });
  if (!g.ok) return { recorded: false, reason: g.reason };

  let text: string;
  try {
    text = await i.readBody();
  } catch {
    return { recorded: false, reason: 'body' };
  }
  const hit = parseHitBody(text);
  if (!hit) return { recorded: false, reason: 'payload' };

  let known = false;
  try {
    known = await d.exists(hit.kind, hit.path);
  } catch {
    known = false;
  }
  if (!known) return { recorded: false, reason: 'unknown-path' };

  if (d.cap.isCapped()) return { recorded: false, reason: 'capped-memory' };
  if (!d.limiter.take()) return { recorded: false, reason: 'rate' };

  const bucket = hit.kind === 'page' ? visitorBucket(d.env.ANALYTICS_HASH_SECRET as string, istanbulDay(d.now()), i.ip, i.userAgent) : 0;
  const res = await d.record(hit.kind, hit.path, bucket);
  if (res === 'capped') d.cap.mark();
  return { recorded: res === 'ok', reason: res };
}
