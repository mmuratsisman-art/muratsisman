/** Küçük, bağımlılıksız şema doğrulama yardımcıları (case_study ve site içeriği doğrulayıcıları paylaşır). */
export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** İlk birkaç sorunu biriktirir; kullanıcıya yol (path) + Türkçe mesaj olarak gösterilir. */
export class Issues {
  private readonly list: string[] = [];
  add(path: string, msg: string) {
    if (this.list.length < 4) this.list.push(`${path}: ${msg}`);
  }
  get any() {
    return this.list.length > 0;
  }
  text() {
    return this.list.join(' · ');
  }
}

export function keysOk(o: Obj, allowed: readonly string[], path: string, iss: Issues) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) iss.add(path, `bilinmeyen alan "${k}"`);
}

export function str(o: Obj, k: string, path: string, iss: Issues, max: number, required = true): string | undefined {
  const v = o[k];
  if (v === undefined) {
    if (required) iss.add(`${path}.${k}`, 'zorunlu');
    return undefined;
  }
  if (typeof v !== 'string') return void iss.add(`${path}.${k}`, 'metin olmalı');
  if (required && v.trim() === '') return void iss.add(`${path}.${k}`, 'boş olamaz');
  if (v.length > max) return void iss.add(`${path}.${k}`, `en fazla ${max} karakter`);
  return v;
}

export function strList(v: unknown, path: string, iss: Issues, opts: { min: number; max: number; item: number }): string[] | undefined {
  if (!Array.isArray(v)) return void iss.add(path, 'liste olmalı');
  if (v.length < opts.min || v.length > opts.max) return void iss.add(path, `${opts.min}–${opts.max} öğe olmalı`);
  const out: string[] = [];
  v.forEach((x, i) => {
    if (typeof x !== 'string' || x.trim() === '') iss.add(`${path}[${i}]`, 'boş olmayan metin olmalı');
    else if (x.length > opts.item) iss.add(`${path}[${i}]`, `en fazla ${opts.item} karakter`);
    else out.push(x);
  });
  return out;
}

/** Güvenli bağlantı: '#...' | '/yol' | https://... | mailto:... (javascript:, http:, protokolsüz '//' vb. reddedilir). */
export function isSafeHref(v: string): boolean {
  if (v !== v.trim() || /\s/.test(v) || v.length > 300) return false;
  if (v.startsWith('#')) return true;
  if (v.startsWith('/')) return !v.startsWith('//');
  if (v.startsWith('mailto:')) return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (v.startsWith('https://')) {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }
  return false;
}
