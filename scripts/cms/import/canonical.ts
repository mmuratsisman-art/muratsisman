import { createHash } from 'node:crypto';

/** Kanonik JSON: anahtarlar sıralı, `undefined` düşer, JSON gidiş-dönüşünden geçer (jsonb ile aynı veri modeli). */
export function canonicalize(value: unknown): string {
  const v = JSON.parse(JSON.stringify(value === undefined ? null : value)) as unknown;
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x !== null && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, walk(o[k])]));
    }
    return x;
  };
  return JSON.stringify(walk(v));
}

export const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
export const hashOf = (value: unknown): string => sha256(canonicalize(value));

const TS = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

/**
 * Zaman damgasını mikrosaniye hassasiyetiyle 'YYYY-MM-DDTHH:MM:SS.ffffffZ' biçimine getirir.
 * PostgREST ve SQL (to_jsonb) çıktıları aynı kanonik biçime iner; parmak izi karşılaştırması buna dayanır.
 * Tanınmayan biçim → hata (fail-closed).
 */
export function normTs(input: string): string {
  const m = TS.exec(input);
  if (!m) throw new Error(`Tanınmayan zaman damgası biçimi: "${input.slice(0, 40)}"`);
  const [, y, mo, d, h, mi, s, frac, off] = m;
  const micros = (frac ?? '').padEnd(6, '0');
  let offsetMin = 0;
  if (off !== 'Z') {
    const sign = off.startsWith('-') ? -1 : 1;
    const digits = off.slice(1).replace(':', '');
    offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || '0'));
  }
  const base = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - offsetMin * 60_000;
  const iso = new Date(base).toISOString().slice(0, 19);
  return `${iso}.${micros}Z`;
}
export const normTsOrNull = (v: unknown): string | null => (typeof v === 'string' ? normTs(v) : null);
