export interface Resp {
  status: number | 'ERR';
  ms: number;
  body: string;
  title: string | null;
  h1: string | null;
  cacheControl: string | null;
  nextCache: string | null;
  error?: string;
}

const strip = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export function extract(html: string): { title: string | null; h1: string | null } {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return { title: t ? strip(t[1]) : null, h1: h ? strip(h[1]) : null };
}

/** Zaman aşımlı GET. Yönlendirme izlenmez (durum kodu olduğu gibi gözlenir). */
export async function get(url: string, timeoutMs = 20000): Promise<Resp> {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'manual', signal: ac.signal, headers: { accept: 'text/html' } });
    const body = await r.text();
    const { title, h1 } = extract(body);
    return { status: r.status, ms: Date.now() - t0, body, title, h1, cacheControl: r.headers.get('cache-control'), nextCache: r.headers.get('x-nextjs-cache') };
  } catch (e) {
    return { status: 'ERR', ms: Date.now() - t0, body: '', title: null, h1: null, cacheControl: null, nextCache: null, error: ac.signal.aborted ? `zaman aşımı (${timeoutMs} ms)` : (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const fmtS = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
