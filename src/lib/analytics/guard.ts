import { normalizePagePath, normalizeShowcaseSlug, type HitKind } from './paths';

/**
 * /api/hit için ucuz, SAF istek süzgeçleri. Bunlar yalnızca sıradan kötüye kullanımı eler: başlıklar betikle taklit edilebilir.
 * Gerçek savunma katmanları: Vercel WAF hız sınırı (elle kurulur), RPC içi doğrulama ve günlük tavanlar (bkz. docs/cms/ANALYTICS.md).
 */
export const MAX_BODY_BYTES = 512;

export interface HeaderReader {
  get(name: string): string | null;
}
export type GuardReason = 'method' | 'privacy' | 'content-type' | 'size' | 'origin' | 'bot';
export type GuardResult = { ok: true } | { ok: false; reason: GuardReason };

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|requests|httpclient|axios|node-fetch|undici|go-http|okhttp|java\/|libwww|scrapy|phantom|puppeteer|playwright|selenium|facebookexternalhit|whatsapp|telegram|discord|slack|embedly/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim().length < 12) return true; // boş/çok kısa UA gerçek tarayıcı değildir
  return BOT_UA.test(ua);
}

export function checkHitRequest(i: { method: string; headers: HeaderReader; requestUrl: string }): GuardResult {
  const h = i.headers;
  if (i.method !== 'POST') return { ok: false, reason: 'method' };
  // Gizlilik tercihi: Global Privacy Control / Do Not Track gönderen ziyaretçi SAYILMAZ.
  if (h.get('sec-gpc') === '1' || h.get('dnt') === '1') return { ok: false, reason: 'privacy' };
  const ct = (h.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (ct !== 'application/json' && ct !== 'text/plain') return { ok: false, reason: 'content-type' };
  const cl = h.get('content-length');
  if (cl !== null && (!/^\d+$/.test(cl) || Number(cl) > MAX_BODY_BYTES)) return { ok: false, reason: 'size' };
  const origin = h.get('origin');
  let sameOrigin = false;
  if (origin) {
    try {
      sameOrigin = new URL(origin).origin === new URL(i.requestUrl).origin;
    } catch {
      sameOrigin = false;
    }
  }
  const sfs = h.get('sec-fetch-site');
  if (!sameOrigin || (sfs !== null && sfs !== 'same-origin')) return { ok: false, reason: 'origin' };
  if (isBotUserAgent(h.get('user-agent'))) return { ok: false, reason: 'bot' };
  return { ok: true };
}

export interface ParsedHit {
  kind: HitKind;
  /** page → normalize edilmiş yol; showcase → proje slug'ı */
  path: string;
}

/** Gövde: {"k":"p"|"s","p":"<yol|slug>"}; başka anahtar KABUL EDİLMEZ. */
export function parseHitBody(text: string): ParsedHit | null {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 2 || !keys.includes('k') || !keys.includes('p')) return null;
  if (o.k === 'p') {
    const path = normalizePagePath(o.p);
    return path ? { kind: 'page', path } : null;
  }
  if (o.k === 's') {
    const slug = normalizeShowcaseSlug(o.p);
    return slug ? { kind: 'showcase', path: slug } : null;
  }
  return null;
}

/** Tarayıcı tarafı: gizlilik tercihi (GPC/DNT) bildiriyor mu? */
export function browserOptedOut(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined, win?: { doNotTrack?: string | null }): boolean {
  if (!nav) return true;
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || nav.doNotTrack === 'yes' || win?.doNotTrack === '1';
}
