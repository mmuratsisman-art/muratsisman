/**
 * Değiştirilebilir sahte veri (fixture). Gerçek veritabanından HİÇBİR şey okunmaz:
 * satırlar, repodaki src/data/* içeriği + 3A mapper'larıyla (3B-E testleriyle aynı biçim) üretilir.
 */
import { projects } from '../../../src/data/projects';
import { labEntries, labCategories } from '../../../src/data/lab';
import { notes } from '../../../src/data/notes';
import { siteConfig } from '../../../src/data/site';
import { currently } from '../../../src/data/currently';
import { socialLinks } from '../../../src/data/social';
import { labEntryToInsert, noteToInsert, projectToInsert, siteContentToDocuments } from '../../../src/lib/cms/mappers';

export type Row = Record<string, unknown>;
export interface World {
  projects: Row[];
  lab_entries: Row[];
  notes: Row[];
  site_content_published: Row[];
}
export type Table = keyof World;
export const TABLES: Table[] = ['projects', 'lab_entries', 'notes', 'site_content_published'];

export const PROBE = { noteSlug: 'f0-probe-note', labSlug: 'f0-probe-lab', draftNoteSlug: 'f0-draft-note' } as const;
/** Sayfada aranacak sürüm işareti. */
export const mark = (v: string): string => `F0PROBE-${v}`;

const PUB = '2026-01-01T00:00:00Z';

/** Statik repo verisinde BULUNMAYAN, ayırt edilebilir bir dize (statik sızıntı tespiti için kullanılmaz; bkz. staticMarkers). */
export function staticMarkers(): string[] {
  return notes.map((n) => n.title).filter((t) => t.length > 12);
}

export function baseWorld(): World {
  const projectRows = projects.map((p, i) => ({ ...projectToInsert(p, i, 'published'), published_at: PUB }) as Row);
  const labRows = labEntries.map((e, i) => ({ ...labEntryToInsert(e, i, 'published'), published_at: PUB }) as Row);
  const noteRows = notes.map((n) => ({ ...noteToInsert(n, 'published') }) as Row);
  // Sürüm işaretli sahte kayıtlar (yalnız bu fixture'da var)
  const probeNote: Row = { ...noteToInsert(notes[0], 'published'), slug: PROBE.noteSlug, title: mark('v1'), excerpt: 'F0 ölçüm notu', published_at: '2090-01-01T00:00:00Z' };
  const draftNote: Row = { ...noteToInsert(notes[0], 'draft'), slug: PROBE.draftNoteSlug, title: 'F0 TASLAK NOT', published_at: null };
  const probeLab: Row = { ...labEntryToInsert(labEntries[0], 99, 'published'), slug: PROBE.labSlug, title: mark('v1') + ' LAB', published_at: PUB };
  const docs = siteContentToDocuments({ siteConfig, currently, socialLinks, labCategories });
  const site: Row[] = Object.entries(docs).map(([key, data]) => ({ key, data }));
  return { projects: projectRows, lab_entries: [...labRows, probeLab], notes: [...noteRows, probeNote, draftNote], site_content_published: site };
}

const find = (w: World, table: Table, slug: string): Row => {
  const r = w[table].find((x) => x.slug === slug);
  if (!r) throw new Error(`fixture: ${table}/${slug} yok`);
  return r;
};
export const setTitle = (w: World, table: 'notes' | 'lab_entries', slug: string, title: string): void => { find(w, table, slug).title = title; };
/** RLS taklidi: status 'published' dışındaki satırlar anon'a hiç dönmez. */
export const setStatus = (w: World, table: 'notes' | 'lab_entries' | 'projects', slug: string, status: 'draft' | 'preview' | 'published'): void => {
  const r = find(w, table, slug);
  r.status = status;
  if (status !== 'published') r.published_at = r.published_at ?? PUB;
};
export const removeSiteKey = (w: World, key: string): void => { w.site_content_published = w.site_content_published.filter((r) => r.key !== key); };
export const firstCaseStudySlug = (): string => {
  const p = projects.find((x) => !x.comingSoon && !!x.caseStudy);
  if (!p) throw new Error('fixture: vaka çalışması olan proje yok');
  return p.slug;
};
