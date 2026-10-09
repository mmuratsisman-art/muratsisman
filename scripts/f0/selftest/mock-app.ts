/**
 * MOCK uygulama — YALNIZCA düzenek mantığını (senaryo kodu, rapor, zamanlama) sınamak içindir.
 * Next.js DEĞİLDİR; "stale-while-revalidate" ve "etiketle sert miss" davranışı, Next için BEKLENEN modelin kodlanmış hâlidir.
 * Bu mock'un sonuçları Next davranışının KANITI sayılmaz (rapor "MOCK" olarak etiketlenir).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { notes as staticNotes } from '../../../src/data/notes';
import { FAKE_KEY } from '../lib/config';

interface Entry { value: unknown; at: number }

export interface MockApp { baseUrl: string; port: number; close(): Promise<void> }

const disk = new Map<string, Map<string, Entry>>(); // "disk" önbelleği (yeniden başlatmadan sağ çıkar)

export async function startMockApp(opts: { fakeUrl: string; ttlMs: number; source: string; variantBuiltAs: 'cms' | 'static'; token: string; diskKey: string; keepCache: boolean }): Promise<MockApp> {
  if (!opts.keepCache) disk.delete(opts.diskKey);
  const store = disk.get(opts.diskKey) ?? new Map<string, Entry>();
  disk.set(opts.diskKey, store);
  const refreshing = new Set<string>();
  const inflight = new Set<Promise<unknown>>(); // arka plan yenilemeleri: close() bunları BEKLER (örnekler arası istek sızıntısı olmasın)

  const fetchRows = (table: string, cols: string): Promise<Record<string, unknown>[]> =>
    new Promise((resolve, reject) => {
      const u = new URL(`${opts.fakeUrl}/rest/v1/${table}`);
      u.searchParams.set('select', cols);
      if (table !== 'site_content_published') u.searchParams.set('status', 'eq.published');
      http.get(u, { headers: { apikey: FAKE_KEY, authorization: `Bearer ${FAKE_KEY}` } }, (res) => {
        let b = '';
        res.on('data', (d: Buffer) => { b += d.toString(); });
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try { const j = JSON.parse(b) as unknown; if (!Array.isArray(j)) return reject(new Error('null')); resolve(j as Record<string, unknown>[]); } catch { reject(new Error('json')); }
        });
      }).on('error', reject); // NOT: zaman aşımı YOK (gerçek public istemcide de yok → M06 hang ölçümü)
    });

  const COLS: Record<string, string> = { notes: 'slug, status, title', lab_entries: 'slug, status, title', projects: 'slug, status, title', site_content_published: 'key, data' };
  async function cached(table: string): Promise<Record<string, unknown>[]> {
    const e = store.get(table);
    const now = Date.now();
    if (e && now - e.at < opts.ttlMs) return e.value as Record<string, unknown>[];
    if (e) { // SWR: eskiyi döndür, arka planda yenile; yenileme hatası yalnızca yutulur
      if (!refreshing.has(table)) {
        refreshing.add(table);
        const job = fetchRows(table, COLS[table]).then((v) => store.set(table, { value: v, at: Date.now() })).catch(() => undefined).finally(() => { refreshing.delete(table); inflight.delete(job); });
        inflight.add(job);
      }
      return e.value as Record<string, unknown>[];
    }
    const v = await fetchRows(table, COLS[table]); // soğuk: hata YAYILIR, önbelleğe yazılmaz
    store.set(table, { value: v, at: Date.now() });
    return v;
  }

  const page = (title: string, h1: string, extra = ''): string => `<!doctype html><html><head><title>${title}</title></head><body><h1>${h1}</h1>${extra}</body></html>`;
  const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const send = (code: number, body: string) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-cache, no-store, max-age=0, must-revalidate', 'x-nextjs-cache': 'MOCK' }); res.end(body); };
    if (u.pathname === '/manifest.webmanifest') { res.writeHead(200, { 'content-type': 'application/json' }); return void res.end('{}'); }
    if (u.pathname === '/f0-probe/revalidate' && req.method === 'POST') {
      if (req.headers['x-f0-token'] !== opts.token) { res.writeHead(403); return void res.end('forbidden'); }
      const mode = u.searchParams.get('mode');
      if (mode === 'tag' || mode === 'real') store.clear(); // etiket: sert miss
      res.writeHead(200, { 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ ok: true, mode }));
    }
    try {
      if (opts.source !== 'cms' && opts.source !== 'static') return send(500, page('Hata', 'Hata', 'Tekrar dene (geçersiz kaynak)'));
      const staticMode = opts.source === 'static' || opts.variantBuiltAs === 'static';
      if (staticMode) { // static içerik: DB'ye dokunmaz
        if (u.pathname === '/notes' || u.pathname === '/') return send(200, page('Notes', 'Notes', staticNotes.map((n) => `<li>${n.title}</li>`).join('')));
        return send(404, page('404', '404'));
      }
      let site: Record<string, unknown>[] | null = null;
      try { site = await cached('site_content_published'); } catch { site = null; }
      const m = /^\/(notes|lab|projects)\/([^/]+)$/.exec(u.pathname);
      const table = (t: string) => (t === 'notes' ? 'notes' : t === 'lab' ? 'lab_entries' : 'projects');
      if (m) {
        if (!SLUG.test(m[2]) || m[2].length > 80) return send(404, page('404', '404'));
        const titleRows = await cached(table(m[1]));
        const metaTitle = String((titleRows.find((r) => r.slug === m[2]) ?? {}).title ?? '');
        const bodyRows = await cached(table(m[1]));
        const row = bodyRows.find((r) => r.slug === m[2]);
        if (!row) return send(404, page('404', '404'));
        if (!site) return send(500, page('Hata', 'Hata', 'Tekrar dene'));
        return send(200, page(`${metaTitle} — MURAT/LAB`, String(row.title)));
      }
      if (u.pathname === '/' || u.pathname === '/notes' || u.pathname === '/lab') {
        if (!site) return send(500, page('Hata', 'Hata', 'Tekrar dene'));
        const rows = await cached(u.pathname === '/lab' ? 'lab_entries' : 'notes');
        return send(200, page('Liste', 'Liste', rows.map((r) => `<li>${String(r.title)}</li>`).join('')));
      }
      return send(404, page('404', '404'));
    } catch {
      return send(500, page('Hata', 'Hata', 'Tekrar dene'));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { baseUrl: `http://127.0.0.1:${port}`, port, close: async () => {
      await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
      // uçuştaki yenilemeler sahte sunucuya ulaşıp tamamlanana kadar bekle (en çok 5 sn; hang modunda kalanlar bırakılır)
      await Promise.race([Promise.allSettled([...inflight]), new Promise<void>((r) => setTimeout(r, 5000).unref())]);
    } };
}
