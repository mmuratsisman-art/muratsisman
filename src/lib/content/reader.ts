import { ContentUnavailableError } from './errors';
import { LAB_COLS, NOTE_COLS, PROJECT_COLS, SITE_COLS } from './columns';

/** Public okuma sözleşmesi: ham satırları döndürür; HATA durumunda ContentUnavailableError FIRLATIR (boş dizi DÖNMEZ). */
export interface PublicReader {
  projects(): Promise<unknown[]>;
  labEntries(): Promise<unknown[]>;
  notes(): Promise<unknown[]>;
  siteDocs(): Promise<unknown[]>;
}

/** Sorgu sonucu (data/error). */
type QueryResult = { data: unknown[] | null; error: { code?: string } | null };
/** İptal edilebilen sorgu oluşturucu. `abortSignal` supabase-js/postgrest-js'te vardır; yoksa yalnızca zaman sınırı (Promise.race) uygulanır. */
type Query = PromiseLike<QueryResult> & { abortSignal?(signal: AbortSignal): Query };

/** Test edilebilirlik için Supabase istemcisinin kullandığımız en küçük yüzeyi. */
export interface QueryClient {
  from(table: string): {
    select(cols: string): { eq(col: string, value: string): Query } & Query;
  };
}

/** Sorgu başına TOPLAM süre sınırı (yeniden denemeler dâhil). Zaman aşımı → ContentUnavailableError('query', '<tablo>:timeout'). */
export const CMS_QUERY_TIMEOUT_MS = 8000;

/**
 * `work`'ü en çok `ms` içinde bitirir. Süre dolarsa HEM gerçek isteği iptal eder (AbortController → fetch) HEM de çağırana hemen hata döner
 * (`Promise.race` tek başına alttaki HTTP isteğini iptal etmez; abortSignal desteklenmeyen bir istemcide yalnızca bu ikincisi çalışır).
 */
export async function withDeadline<T>(ms: number, label: string, work: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ContentUnavailableError('query', `${label}:timeout`));
      ac.abort();
    }, ms);
  });
  try {
    const running = Promise.resolve(work(ac.signal));
    running.catch(() => undefined); // yarışı kaybeden istek sonradan hata verirse "unhandled rejection" olmasın
    return await Promise.race([running, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Yalnızca YAYINLANMIŞ içerik tabloları okunur: projects, lab_entries, notes (status='published' filtresi AÇIKÇA eklenir; RLS ayrıca uygular)
 * ve site_content_published. *_drafts / site_content_drafts tablolarına ASLA dokunulmaz.
 */
export function supabaseReader(client: QueryClient, opts: { timeoutMs?: number } = {}): PublicReader {
  const timeoutMs = opts.timeoutMs ?? CMS_QUERY_TIMEOUT_MS;
  const run = async (table: string, cols: string, published: boolean): Promise<unknown[]> => {
    const res = await withDeadline(timeoutMs, table, (signal) => {
      const q = client.from(table).select(cols);
      const filtered: Query = published ? q.eq('status', 'published') : q;
      return filtered.abortSignal ? filtered.abortSignal(signal) : filtered;
    });
    if (res.error) throw new ContentUnavailableError('query', `${table}:${res.error.code ?? 'unknown'}`);
    if (!Array.isArray(res.data)) throw new ContentUnavailableError('query', `${table}:no-data`);
    return res.data;
  };
  return {
    projects: () => run('projects', PROJECT_COLS, true),
    labEntries: () => run('lab_entries', LAB_COLS, true),
    notes: () => run('notes', NOTE_COLS, true),
    siteDocs: () => run('site_content_published', SITE_COLS, false),
  };
}
