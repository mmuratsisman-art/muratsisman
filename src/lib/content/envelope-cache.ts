import type { CacheAdapter } from './cache';

/**
 * Sert yaş sınırlı önbellek (FAZ 3B-F1: M02 / M03 / M05).
 *
 * Neden: `unstable_cache({ revalidate })` stale-while-revalidate çalışır. Süre dolunca İLK istek eski veriyi alır, yenileme arka planda
 * yapılır; yenileme başarısız olursa eski kayıt sonsuza dek sunulur (F0 M05: 150 sn boyunca 200/eski). Bu sınıf iki süre ayırır:
 *   - yumuşak (soft, `softSeconds`): `unstable_cache`'in revalidate süresi. Aşılırsa eski veri hâlâ sunulabilir, yenileme arka planda başlar.
 *   - sert (hard, `hardSeconds`): veri bundan eskiyse ASLA sunulmaz; sorgu eşzamanlı yapılır. Başarısızsa HATA fırlatılır (eski içeriğe dönülmez).
 *
 * Veri bir zarfa (`{ at, data }`) sarılır; `at` = sorgunun BAŞLADIĞI an (muhafazakâr: veri en az bu kadar eskidir).
 *
 * Sonraki isteklere yansıma:
 *   1. Sorgu sonuçları, aynı anahtar için sürüm içi bir "tek uçuş" (in-flight) tablosunda tekilleştirilir. `unstable_cache`'in arka plan yenilemesi
 *      ile sert-sınır sorgusu aynı anda çalışırsa TEK sorgu yapılır ve sonuç ikisine de verilir.
 *   2. Başarılı her sorgu süreç içi bir "son sonuç" kaydına da yazılır. Kalıcı önbellek kaydı (arka plan yazımı) bir şekilde yenilenmediyse,
 *      istek daha yeni olan kaydı kullanır → süresi dolmuş zarf sürekli yeniden okunup her istekte sorgu tetiklemez (en çok sert sınırda bir kez).
 *   3. `revalidateTag` davranışı değişmez: etiket geçersizleşince `unstable_cache` miss verir, `load()` yeni zarf üretir (`at` daha yeni → kazanır).
 *      Miss'te sorgu HATA verirse hata yayılır; son sonuç kaydı yedek olarak KULLANILMAZ.
 */
export interface Envelope<T> { at: number; data: T }

/** `unstable_cache` ile uyumlu en küçük yüzey (testte taklit edilebilsin diye). */
export type CacheStore = <T>(fn: () => Promise<T>, keyParts: string[], options: { revalidate: number; tags: string[] }) => () => Promise<T>;

export interface EnvelopeCacheOptions {
  store: CacheStore;
  softSeconds: number;
  hardSeconds: number;
  /** Anahtar öneki; zarf biçimi değişince eski kayıtlarla karışmaması için sürümlü. */
  keyPrefix: string;
  /** Ortak etiket (her kayda eklenir). */
  baseTag: string;
  now?: () => number;
}

const isEnvelope = (v: unknown): v is Envelope<unknown> =>
  typeof v === 'object' && v !== null && typeof (v as { at?: unknown }).at === 'number' && Number.isFinite((v as { at: number }).at) && 'data' in v;

export function createEnvelopeCache(o: EnvelopeCacheOptions): CacheAdapter & { clearLocal(): void } {
  if (!(o.softSeconds > 0 && o.hardSeconds > o.softSeconds)) throw new Error('envelope-cache: 0 < soft < hard olmalı');
  const now = o.now ?? Date.now;
  const hardMs = o.hardSeconds * 1000;
  const inflight = new Map<string, Promise<Envelope<unknown>>>();
  const latest = new Map<string, Envelope<unknown>>();
  /** clearLocal() çağrısından ÖNCE başlayan sorgular son sonuç kaydına yazmaz (geç gelen eski sonuç yeni durumu ezmesin). */
  let epoch = 0;

  /** Tek uçuş: aynı anahtar için eşzamanlı çağrılar TEK sorguyu paylaşır. Hata paylaşılır ama saklanmaz. */
  function fetchOnce<T>(key: string, fn: () => Promise<T>): Promise<Envelope<T>> {
    const running = inflight.get(key);
    if (running) return running as Promise<Envelope<T>>;
    const startedAt = now();
    const myEpoch = epoch;
    const p: Promise<Envelope<T>> = (async () => {
      const data = await fn();
      const env: Envelope<T> = { at: startedAt, data };
      const prev = latest.get(key);
      if (myEpoch === epoch && (!prev || prev.at <= env.at)) latest.set(key, env);
      return env;
    })();
    inflight.set(key, p);
    const release = () => { if (inflight.get(key) === p) inflight.delete(key); };
    p.then(release, release);
    return p;
  }

  return {
    wrap<T>(key: string, tags: string[], fn: () => Promise<T>): () => Promise<T> {
      const cached = o.store<Envelope<T>>(() => fetchOnce(key, fn), [o.keyPrefix, key], { revalidate: o.softSeconds, tags: [o.baseTag, ...tags] });
      return async () => {
        // Miss (ilk istek / etiket geçersiz) → fetchOnce çalışır; hata AYNEN yayılır. Stale → eski zarf döner, arka plan yenilemesi başlar.
        const stored = await cached();
        const candidates: Envelope<unknown>[] = [];
        if (isEnvelope(stored)) candidates.push(stored);
        const l = latest.get(key);
        if (l) candidates.push(l);
        const best = candidates.length === 0 ? undefined : candidates.reduce((a, b) => (b.at > a.at ? b : a));
        if (best && now() - best.at < hardMs) return best.data as T;
        // Sert sınır aşıldı (ya da zarf geçersiz): eşzamanlı sorgu. Hata → fırlatılır; eski veri DÖNMEZ.
        const fresh = await fetchOnce(key, fn);
        return fresh.data;
      };
    },
    clearLocal() {
      epoch += 1;
      inflight.clear();
      latest.clear();
    },
  };
}
