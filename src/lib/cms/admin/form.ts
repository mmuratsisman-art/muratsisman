export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Yalnızca beklenen alanları, yalnızca metin olarak okur. Bilinmeyen/ek alanlar (rol, isAdmin, vb.) yok sayılır. */
export function readFields(fd: FormData, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = fd.get(k);
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/** Zaman damgası token'ı: ISO benzeri ve makul uzunlukta olmalı (Date'e ÇEVRİLMEZ: mikrosaniye hassasiyeti korunur). */
export const isTimestampToken = (v: string): boolean => /^\d{4}-\d{2}-\d{2}[T ][0-9:.]+(Z|[+-]\d{2}(:?\d{2})?)?$/.test(v) && v.length <= 40;
