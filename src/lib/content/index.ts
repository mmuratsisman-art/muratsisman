import { createPublicClient } from '@/lib/supabase/public';
import { nextCache } from './cache';
import { ContentUnavailableError } from './errors';
import { createContentProvider } from './provider';
import { supabaseReader, type QueryClient } from './reader';
import { getContentSource } from './source';
import { staticContent } from './static';

/**
 * Public sayfaların TEK veri giriş noktası. Sayfalar/bileşenler `@/data/*` yerine buradan okur.
 *   CONTENT_SOURCE=static (varsayılan) → src/data/* (bugünkü davranış)
 *   CONTENT_SOURCE=cms                 → Supabase yayınlanmış içeriği; hata → ContentUnavailableError (statik içeriğe DÖNÜLMEZ)
 */
const provider = createContentProvider({
  source: () => getContentSource(),
  reader: () => supabaseReader(createPublicClient() as unknown as QueryClient),
  cache: nextCache,
  staticContent,
  onError: (code, detail) => console.error('[content] okuma başarısız', { code, detail }),
  onSkip: (entity, slug) => console.error('[content] geçersiz yayınlanmış kayıt atlandı', { entity, slug }),
});

export const {
  getProjects, getProject, getCaseStudyProjects, getNextProject,
  getLabEntries, getLabEntry, getFeaturedLabEntries, getNextLabEntry,
  getNotes, getNote, getLatestNotes, getNextNote,
  getSiteContent, getChromeIdentity, staticParamSlugs,
} = provider;

export { ContentUnavailableError };
