/**
 * Sahte Supabase (PostgREST taklidi). YALNIZCA 127.0.0.1'e bağlanır; hiçbir dış isteğe aracılık etmez.
 * Orkestratör ile AYNI süreçtedir: kontrol (fixture/mod değişikliği) süreç içi fonksiyon çağrısıdır, ağ üzerinden kontrol uç noktası YOKTUR.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { LAB_COLS, NOTE_COLS, PROJECT_COLS, SITE_COLS } from '../../../src/lib/content/columns';
import { FAKE_KEY } from '../lib/config';
import { baseWorld, TABLES, type Row, type Table, type World } from './fixtures';

export type Mode = 'ok' | 'http500' | 'http503' | 'drop' | 'hang' | 'malformed' | 'null' | 'unauthorized' | 'empty' | 'slow';

export interface LogEntry {
  seq: number;
  at: number;
  method: string;
  path: string;
  table: string | null;
  select: string | null;
  statusFilter: string | null;
  mode: Mode;
  httpStatus: number | 'dropped' | 'hung';
}

const COLS: Record<Table, string[]> = {
  projects: PROJECT_COLS.split(',').map((s) => s.trim()),
  lab_entries: LAB_COLS.split(',').map((s) => s.trim()),
  notes: NOTE_COLS.split(',').map((s) => s.trim()),
  site_content_published: SITE_COLS.split(',').map((s) => s.trim()),
};

export interface FakeSupabase {
  url: string;
  port: number;
  world: World;
  log: LogEntry[];
  violations: string[];
  /** Kümülatif sayaçlar (clearLog'dan etkilenmez) */
  stats: { contentQueries: number; noStatusFilter: number; total: number };
  setWorld(w: World): void;
  setMode(table: Table | '*', mode: Mode, slowMs?: number): void;
  resetModes(): void;
  countSince(seq: number, table?: Table): number;
  lastSeq(): number;
  clearLog(): void;
  releaseHung(): void;
  close(): Promise<void>;
}

export async function startFakeSupabase(world: World = baseWorld()): Promise<FakeSupabase> {
  const modes = new Map<string, { mode: Mode; slowMs: number }>();
  const hung = new Set<http.ServerResponse>();
  const t0 = Date.now();
  let seq = 0;
  const state = { world };
  const log: LogEntry[] = [];
  const violations: string[] = [];
  const stats = { contentQueries: 0, noStatusFilter: 0, total: 0 };

  const modeFor = (table: string | null) => modes.get(table ?? '') ?? modes.get('*') ?? { mode: 'ok' as Mode, slowMs: 0 };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
    const table = m ? m[1] : null;
    const entry: LogEntry = { seq: ++seq, at: Date.now() - t0, method: req.method ?? '?', path: u.pathname, table, select: u.searchParams.get('select'), statusFilter: u.searchParams.get('status'), mode: 'ok', httpStatus: 0 };
    log.push(entry);
    stats.total += 1;
    const finish = (status: number, body: string, headers: Record<string, string> = {}) => {
      entry.httpStatus = status;
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
      res.end(body);
    };
    const violate = (v: string) => violations.push(`#${entry.seq} ${v}`);

    // 1) Yalnızca REST okuma uç noktası beklenir. (/auth/v1 vb. beklenmeyen → ihlal olarak DEĞİL, bilgi olarak kaydedilir.)
    if (!m) { violate(`beklenmeyen-uç-nokta ${u.pathname}`); return finish(404, JSON.stringify({ message: 'f0: unexpected endpoint' })); }
    if (req.method !== 'GET') { violate(`yazma/okuma dışı yöntem ${req.method} ${u.pathname}`); return finish(405, '{"message":"f0: read-only"}'); }

    // 2) Anahtar: yalnızca SAHTE publishable anahtar kabul edilir (service-role biçimi kesinlikle reddedilir).
    const apikey = req.headers['apikey'];
    const auth = String(req.headers['authorization'] ?? '');
    if (apikey !== FAKE_KEY || (auth && auth !== `Bearer ${FAKE_KEY}`)) { violate('geçersiz-anahtar'); return finish(401, '{"message":"Invalid API key"}'); }

    // 3) Tablo allowlist: taslak tablolar vb. → ihlal
    if (!TABLES.includes(table as Table)) { violate(`yasak-tablo ${table}`); return finish(404, '{"code":"PGRST205","message":"f0: table not allowed"}'); }
    const t = table as Table;
    if (t !== 'site_content_published') { stats.contentQueries += 1; if (entry.statusFilter !== 'eq.published') stats.noStatusFilter += 1; }

    // 4) select: '*' veya bilinmeyen kolon → ihlal
    const sel = u.searchParams.get('select');
    if (!sel || sel.includes('*')) { violate(`select-yıldız/eksik ${t}`); return finish(400, '{"message":"f0: explicit select required"}'); }
    const cols = sel.split(',').map((s) => s.trim());
    const unknown = cols.filter((c) => !COLS[t].includes(c));
    if (unknown.length) { violate(`bilinmeyen-kolon ${t}:${unknown.join('|')}`); return finish(400, '{"message":"f0: unknown column"}'); }

    const { mode, slowMs } = modeFor(t);
    entry.mode = mode;
    const respondRows = () => {
      // RLS taklidi: projects/lab/notes için filtre YOKSA bile yalnız published döner
      let rows: Row[] = state.world[t];
      if (t !== 'site_content_published') rows = rows.filter((r) => r.status === 'published');
      const out = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
      finish(200, JSON.stringify(out), { 'content-range': `0-${Math.max(out.length - 1, 0)}/*` });
    };
    switch (mode) {
      case 'ok': return respondRows();
      case 'slow': return void setTimeout(respondRows, slowMs);
      case 'http500': return finish(500, '{"message":"f0: injected 500"}');
      case 'http503': return finish(503, '{"message":"f0: injected 503"}');
      case 'unauthorized': return finish(401, '{"code":"PGRST301","message":"JWT expired"}');
      case 'malformed': return finish(200, '[{"slug": "x", ');
      case 'null': return finish(200, 'null');
      case 'empty': return finish(200, '[]', { 'content-range': '*/0' });
      case 'drop': entry.httpStatus = 'dropped'; return void req.socket.destroy();
      case 'hang': entry.httpStatus = 'hung'; hung.add(res); return;
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve); // YALNIZ loopback
  });
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    get world() { return state.world; },
    log,
    violations,
    stats,
    setWorld(w) { state.world = w; },
    setMode(table, mode, slowMs = 0) { modes.set(table, { mode, slowMs }); },
    resetModes() { modes.clear(); },
    countSince(s, table) { return log.filter((e) => e.seq > s && e.table !== null && (!table || e.table === table)).length; },
    lastSeq() { return seq; },
    clearLog() { log.length = 0; },
    releaseHung() { for (const r of hung) r.destroy(); hung.clear(); },
    close() {
      for (const r of hung) r.destroy();
      hung.clear();
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  } as FakeSupabase;
}
