/**
 * Mevcut dosya tabanlı içerikten (src/data/*) TEK SEFERLİK geçiş SQL'i üretir. Veritabanına BAĞLANMAZ,
 * yalnızca stdout'a SQL yazar. FAZ 3A'da çalıştırılması ve uygulanması ZORUNLU DEĞİL (canlıya geçiş FAZ 3B+).
 *
 *   npx tsx scripts/cms/generate-seed.ts > seed.sql            # içerik 'draft' olarak (güvenli varsayılan)
 *   npx tsx scripts/cms/generate-seed.ts --publish > seed.sql  # içerik 'published' olarak (kesme günü)
 *
 * Çıktıyı UYGULAMADAN önce inceleyin; Supabase SQL editor'de ya da `psql` ile ayrıcalıklı rolle çalıştırın
 * (service-role anahtarı uygulamaya/depoya girmez). Çıktıyı depoya commit ETMEYİN.
 * Yeniden çalıştırmak güvenlidir (idempotent): içerik sütunları güncellenir, status ve published_at'e dokunulmaz.
 */
import { labCategories, labEntries } from '@/data/lab';
import { currently } from '@/data/currently';
import { notes } from '@/data/notes';
import { projects } from '@/data/projects';
import { siteConfig } from '@/data/site';
import { socialLinks } from '@/data/social';
import { labEntryToInsert, noteToInsert, projectToInsert, siteContentToDocuments } from '@/lib/cms/mappers';
import type { ContentStatus } from '@/lib/cms/types';

type ColKind = 'text' | 'int' | 'bool' | 'text[]' | 'jsonb' | 'timestamptz';
interface Col {
  name: string;
  kind: ColKind;
}

const SEO: Col[] = [
  { name: 'cover_media_id', kind: 'text' },
  { name: 'seo_title', kind: 'text' },
  { name: 'seo_description', kind: 'text' },
  { name: 'seo_canonical_url', kind: 'text' },
  { name: 'seo_og_media_id', kind: 'text' },
  { name: 'seo_noindex', kind: 'bool' },
];

const PROJECT_COLS: Col[] = [
  { name: 'slug', kind: 'text' },
  { name: 'status', kind: 'text' },
  { name: 'sort_order', kind: 'int' },
  { name: 'title', kind: 'text' },
  { name: 'subtitle', kind: 'text' },
  { name: 'summary', kind: 'text' },
  { name: 'accent', kind: 'text' },
  { name: 'size', kind: 'text' },
  { name: 'graphic', kind: 'text' },
  { name: 'tags', kind: 'text[]' },
  { name: 'coming_soon', kind: 'bool' },
  { name: 'kind', kind: 'text' },
  { name: 'type_label', kind: 'text' },
  { name: 'category', kind: 'text' },
  { name: 'project_status_label', kind: 'text' },
  { name: 'project_status_accent', kind: 'text' },
  { name: 'case_study', kind: 'jsonb' },
  ...SEO,
];

const LAB_COLS: Col[] = [
  { name: 'slug', kind: 'text' },
  { name: 'status', kind: 'text' },
  { name: 'sort_order', kind: 'int' },
  { name: 'title', kind: 'text' },
  { name: 'short_title', kind: 'text' },
  { name: 'type', kind: 'text' },
  { name: 'experiment_status', kind: 'text' },
  { name: 'category', kind: 'text' },
  { name: 'summary', kind: 'text' },
  { name: 'description', kind: 'text' },
  { name: 'accent', kind: 'text' },
  { name: 'featured', kind: 'bool' },
  { name: 'year', kind: 'text' },
  { name: 'tags', kind: 'text[]' },
  { name: 'story', kind: 'jsonb' },
  ...SEO,
];

const NOTE_COLS: Col[] = [
  { name: 'slug', kind: 'text' },
  { name: 'status', kind: 'text' },
  { name: 'published_at', kind: 'timestamptz' },
  { name: 'title', kind: 'text' },
  { name: 'excerpt', kind: 'text' },
  { name: 'content', kind: 'jsonb' },
  { name: 'tags', kind: 'text[]' },
  { name: 'accent', kind: 'text' },
  { name: 'reading_time_minutes', kind: 'int' },
  ...SEO,
];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function render(kind: ColKind, v: unknown): string {
  if (v === null || v === undefined) return 'null';
  switch (kind) {
    case 'text':
      return q(String(v));
    case 'int':
      return String(Number(v));
    case 'bool':
      return v ? 'true' : 'false';
    case 'timestamptz':
      return `${q(String(v))}::timestamptz`;
    case 'text[]':
      return `array[${(v as string[]).map(q).join(', ')}]::text[]`;
    case 'jsonb':
      return `${q(JSON.stringify(v))}::jsonb`;
  }
}

/** idempotent upsert: status ve published_at güncellenmez. */
function upsert(table: string, conflict: string, cols: Col[], rows: Record<string, unknown>[]): string {
  const values = rows.map((r) => `  (${cols.map((c) => render(c.kind, r[c.name])).join(', ')})`).join(',\n');
  const skip = new Set([conflict, 'status', 'published_at']);
  const updates = cols.filter((c) => !skip.has(c.name)).map((c) => `${c.name} = excluded.${c.name}`);
  return [
    `insert into public.${table} (${cols.map((c) => c.name).join(', ')}) values`,
    values,
    `on conflict (${conflict}) do update set`,
    `  ${updates.join(',\n  ')};`,
  ].join('\n');
}

const publish = process.argv.includes('--publish');
const status: ContentStatus = publish ? 'published' : 'draft';
const now = new Date().toISOString();

const projectRows = projects.map((p, i) => ({ ...projectToInsert(p, i, status) }) as Record<string, unknown>);
const labRows = labEntries.map((e, i) => ({ ...labEntryToInsert(e, i, status) }) as Record<string, unknown>);
// Not yayın tarihi (tarih) her durumda korunur; yalnızca 'published' olduğunda anlamlıdır
const noteRows = notes.map((n) => ({ ...noteToInsert(n, status) }) as Record<string, unknown>);
const docs = Object.entries(siteContentToDocuments({ siteConfig, currently, socialLinks, labCategories }));
const siteRows = docs.map(([key, data]) => ({ key, data }) as Record<string, unknown>);
const SITE_COLS: Col[] = [
  { name: 'key', kind: 'text' },
  { name: 'data', kind: 'jsonb' },
];

const out: string[] = [
  `-- GENERATED by scripts/cms/generate-seed.ts at ${now} (${publish ? 'PUBLISHED' : 'DRAFT'} mode). DO NOT COMMIT.`,
  '-- Review before running. Run with a privileged role (SQL editor / psql), never from the app.',
  'begin;',
  '',
  '-- projects',
  upsert('projects', 'slug', PROJECT_COLS, projectRows),
  '',
  '-- lab_entries',
  upsert('lab_entries', 'slug', LAB_COLS, labRows),
  '',
  '-- notes',
  upsert('notes', 'slug', NOTE_COLS, noteRows),
  '',
  '-- site content (drafts)',
  upsert('site_content_drafts', 'key', SITE_COLS, siteRows),
];

if (publish) {
  out.push(
    '',
    '-- site content (published copy; normally only public.publish_site_content() writes here)',
    `insert into public.site_content_published (key, data) select key, data from public.site_content_drafts`,
    'on conflict (key) do update set data = excluded.data, published_at = now();',
  );
}

out.push('', 'commit;', '');
console.log(out.join('\n'));
