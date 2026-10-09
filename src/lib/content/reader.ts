import { ContentUnavailableError } from './errors';
import { LAB_COLS, NOTE_COLS, PROJECT_COLS, SITE_COLS } from './columns';

/** Public okuma sözleşmesi: ham satırları döndürür; HATA durumunda ContentUnavailableError FIRLATIR (boş dizi DÖNMEZ). */
export interface PublicReader {
  projects(): Promise<unknown[]>;
  labEntries(): Promise<unknown[]>;
  notes(): Promise<unknown[]>;
  siteDocs(): Promise<unknown[]>;
}

/** Test edilebilirlik için Supabase istemcisinin kullandığımız en küçük yüzeyi. */
export interface QueryClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, value: string): PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>;
    } & PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>;
  };
}

/**
 * Yalnızca YAYINLANMIŞ içerik tabloları okunur: projects, lab_entries, notes (status='published' filtresi AÇIKÇA eklenir; RLS ayrıca uygular)
 * ve site_content_published. *_drafts / site_content_drafts tablolarına ASLA dokunulmaz.
 */
export function supabaseReader(client: QueryClient): PublicReader {
  const run = async (table: string, cols: string, published: boolean): Promise<unknown[]> => {
    const q = client.from(table).select(cols);
    const res = await (published ? q.eq('status', 'published') : q);
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
