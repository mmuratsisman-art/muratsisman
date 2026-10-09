import type { CacheStore } from '../../../src/lib/content/envelope-cache';

/** Elle ilerletilen saat (ms). */
export function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; }, set: (v: number) => { t = v; } };
}

export interface Deferred<T> { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void }
export function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * `unstable_cache`'in BEKLENEN modeli (Next'in KENDİSİ DEĞİL; gerçek davranış F0 ile Next üzerinde ölçülür):
 *  - kayıt yaşı < revalidate → olduğu gibi döner
 *  - kayıt yaşı ≥ revalidate (stale) → ESKİ değer döner, arka planda fn çalışır; başarılıysa kayıt yenilenir, hata yutulur
 *  - etiket geçersiz → miss: fn çalışır, hata YAYILIR
 *  - fn hata fırlatırsa kayıt yazılmaz
 * Bilinçli olarak MUHAFAZAKÂR: arka plan tetiği her okumada çalışır (Next'te istek başına tekilleştirilir).
 */
export function fakeUnstableCache(clock: { now(): number }, o: { bgTriggers?: boolean; bgWrites?: boolean } = {}) {
  const bgTriggers = o.bgTriggers ?? true;
  const bgWrites = o.bgWrites ?? true;
  const entries = new Map<string, { v: unknown; at: number; tags: string[]; invalid: boolean }>();
  const pending: Promise<unknown>[] = [];
  const store: CacheStore = (fn, keyParts, options) => () => {
    const k = keyParts.join('|');
    const e = entries.get(k);
    if (e && !e.invalid) {
      if (clock.now() - e.at < options.revalidate * 1000) return Promise.resolve(e.v as never);
      if (bgTriggers) {
        const job = fn().then((v) => { if (bgWrites) entries.set(k, { v, at: clock.now(), tags: options.tags, invalid: false }); }).catch(() => undefined);
        pending.push(job);
      }
      return Promise.resolve(e.v as never);
    }
    return fn().then((v) => { entries.set(k, { v, at: clock.now(), tags: options.tags, invalid: false }); return v; });
  };
  return {
    store,
    invalidateTag(tag: string) { for (const e of entries.values()) if (e.tags.includes(tag)) e.invalid = true; },
    /** Kayda ham (zarf olmayan) değer yazar: eski biçim/bozuk kayıt simülasyonu. */
    poison(keyParts: string[], v: unknown, tags: string[]) { entries.set(keyParts.join('|'), { v, at: clock.now(), tags, invalid: false }); },
    async settle() { await Promise.allSettled(pending.splice(0)); },
  };
}
