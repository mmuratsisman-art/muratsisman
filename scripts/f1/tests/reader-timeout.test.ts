import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentUnavailableError } from '../../../src/lib/content/errors';
import { CMS_QUERY_TIMEOUT_MS, supabaseReader, withDeadline, type QueryClient } from '../../../src/lib/content/reader';

type Res = { data: unknown[] | null; error: { code?: string } | null };

/** Yanıt vermeyen sahte istemci. `honorAbort`: abortSignal'i gerçekten dinler (supabase-js'te fetch'in yaptığı gibi) ve sayaçlar tutar. */
function hangingClient(o: { honorAbort: boolean }) {
  const seen = { aborted: 0, started: 0, selects: [] as string[] };
  const mk = (table: string): never => {
    seen.started += 1;
    let signal: AbortSignal | undefined;
    const thenable = {
      abortSignal(s: AbortSignal) { signal = s; return thenable; },
      then<T1 = Res, T2 = never>(onOk?: (v: Res) => T1 | PromiseLike<T1>, onErr?: (e: unknown) => T2 | PromiseLike<T2>) {
        const p = new Promise<Res>((resolve) => {
          if (o.honorAbort) signal?.addEventListener('abort', () => { seen.aborted += 1; resolve({ data: null, error: { code: 'ABORT' } }); });
          // honorAbort=false: asla çözülmez
        });
        return p.then(onOk, onErr);
      },
    };
    seen.selects.push(table);
    return thenable as never;
  };
  const client = { from: (table: string) => ({ select: () => Object.assign(mk(table), { eq: () => mk(table) }) }) } as unknown as QueryClient;
  return { client, seen };
}
const expectTimeout = (e: unknown, table: string): boolean => e instanceof ContentUnavailableError && e.code === 'query' && e.detail === `${table}:timeout`;

test('sınır sabiti 8 sn ve iki ardışık sorgunun toplamı F0 kabul sınırının (20 sn) altında', () => {
  assert.equal(CMS_QUERY_TIMEOUT_MS, 8000);
  assert.ok(2 * CMS_QUERY_TIMEOUT_MS < 20000);
});

test('yanıt vermeyen sorgu: ContentUnavailableError(query, <tablo>:timeout) + GERÇEK abort sinyali tetiklenir', async () => {
  const h = hangingClient({ honorAbort: true });
  const reader = supabaseReader(h.client, { timeoutMs: 60 });
  const t0 = Date.now();
  await assert.rejects(() => reader.notes(), (e) => expectTimeout(e, 'notes'));
  const ms = Date.now() - t0;
  assert.ok(ms >= 55 && ms < 500, `süre ${ms} ms`);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.seen.aborted, 1, 'alttaki isteğe iptal sinyali gitmeli (Promise.race tek başına iptal etmez)');
});

test('abortSignal desteklemeyen istemcide de zaman sınırı çalışır (yalnızca race), işlenmemiş reddetme yok', async () => {
  const never = { from: () => ({ select: () => Object.assign(new Promise(() => undefined), { eq: () => new Promise(() => undefined) }) }) } as unknown as QueryClient;
  const unhandled: unknown[] = [];
  const onU = (e: unknown) => unhandled.push(e);
  process.on('unhandledRejection', onU);
  try {
    await assert.rejects(() => supabaseReader(never, { timeoutMs: 40 }).projects(), (e) => expectTimeout(e, 'projects'));
    await new Promise((r) => setTimeout(r, 30));
  } finally { process.off('unhandledRejection', onU); }
  assert.deepEqual(unhandled, []);
});

test('hızlı başarılı sorgu zamanlayıcıyı temizler ve veriyi döner; hata kodu eşlemesi değişmedi', async () => {
  const ok = { from: () => ({ select: () => Object.assign(Promise.resolve({ data: [{ a: 1 }], error: null }), { eq: () => Promise.resolve({ data: [{ a: 1 }], error: null }) }) }) } as unknown as QueryClient;
  assert.deepEqual(await supabaseReader(ok, { timeoutMs: 5000 }).notes(), [{ a: 1 }]);
  const err = { from: () => ({ select: () => Object.assign(Promise.resolve({ data: null, error: { code: 'PGRST301' } }), { eq: () => Promise.resolve({ data: null, error: { code: 'PGRST301' } }) }) }) } as unknown as QueryClient;
  await assert.rejects(() => supabaseReader(err, { timeoutMs: 5000 }).notes(), (e) => e instanceof ContentUnavailableError && e.detail === 'notes:PGRST301');
  const nul = { from: () => ({ select: () => Object.assign(Promise.resolve({ data: null, error: null }), { eq: () => Promise.resolve({ data: null, error: null }) }) }) } as unknown as QueryClient;
  await assert.rejects(() => supabaseReader(nul, { timeoutMs: 5000 }).notes(), (e) => e instanceof ContentUnavailableError && e.detail === 'notes:no-data');
});

test('yeniden deneme döngüsü sinyali dinliyorsa zaman aşımından sonra yeni deneme BAŞLAMAZ', async () => {
  let attempts = 0;
  const retrying = async (signal: AbortSignal): Promise<Res> => {
    for (let i = 0; i < 40; i++) { // üst sınır: abort mekanizması bozulursa test TAKILMAK yerine başarısız olsun
      if (signal.aborted) return { data: null, error: { code: 'ABORT' } };
      attempts += 1;
      await new Promise((r) => setTimeout(r, 15)); // backoff
    }
    return { data: null, error: { code: 'GAVE-UP' } };
  };
  await assert.rejects(() => withDeadline(60, 'notes', (s) => retrying(s)), (e) => expectTimeout(e, 'notes'));
  const at = attempts;
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(attempts <= at + 1, `zaman aşımından sonra ${attempts - at} yeni deneme`);
});

test('iki ardışık sorgu (site belgesi + içerik) toplam süresi 2×sınır + küçük pay ile sınırlı', async () => {
  const h = hangingClient({ honorAbort: true });
  const reader = supabaseReader(h.client, { timeoutMs: 50 });
  const t0 = Date.now();
  await assert.rejects(() => reader.siteDocs());
  await assert.rejects(() => reader.notes());
  const ms = Date.now() - t0;
  assert.ok(ms >= 95 && ms < 400, `süre ${ms} ms`);
});

test('yalnızca YAYINLANMIŞ tablolar sorgulanır (status=published filtresi korunur)', async () => {
  const calls: string[] = [];
  const spy = { from: (t: string) => ({ select: () => Object.assign(Promise.resolve({ data: [], error: null }), { eq: (c: string, v: string) => { calls.push(`${t}:${c}=${v}`); return Promise.resolve({ data: [], error: null }); } }) }) } as unknown as QueryClient;
  const r = supabaseReader(spy, { timeoutMs: 1000 });
  await r.projects(); await r.labEntries(); await r.notes(); await r.siteDocs();
  assert.deepEqual(calls, ['projects:status=published', 'lab_entries:status=published', 'notes:status=published']);
});
