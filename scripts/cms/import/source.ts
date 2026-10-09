import { labCategories as realLabCategories, labEntries as realLabEntries } from '@/data/lab';
import { currently as realCurrently } from '@/data/currently';
import { navigation as realNavigation } from '@/data/navigation';
import { notes as realNotes } from '@/data/notes';
import { projects as realProjects } from '@/data/projects';
import { siteConfig as realSiteConfig } from '@/data/site';
import { socialLinks as realSocial } from '@/data/social';
import type { CurrentlyItem, LabCategory, LabEntry, NavItem, NoteEntry, Project, SocialLink } from '@/types';
import { siteContentToDocuments } from '@/lib/cms/mappers';
import { SITE_CONTENT_KEYS, type SiteContentKey } from '@/lib/cms/types';
import { labDocToFormValues } from '@/lib/cms/admin/lab-form';
import { noteDocToFormValues } from '@/lib/cms/admin/note-form';
import { projectDocToFormValues } from '@/lib/cms/admin/project-form';
import { validateLabInput, type LabDoc } from '@/lib/cms/validate/lab';
import { validateNoteInput, type NoteDoc } from '@/lib/cms/validate/notes';
import { validateProjectInput, type ProjectDoc } from '@/lib/cms/validate/projects';
import { validateSiteDoc } from '@/lib/cms/validate/site';
import { canonicalize, hashOf, sha256 } from './canonical';
import { docHash } from './snapshot';
import { LAB_MAP, NOTE_MAP, NOT_IMPORTED_BY_DESIGN, PROJECT_MAP, SITE_CONFIG_MAP, type FieldRule } from './mapping';
import { KIND_ORDER, type Doc, type SeoPair, type SourceRecord } from './types';

export interface SourceInput {
  projects: Project[];
  labEntries: LabEntry[];
  notes: NoteEntry[];
  siteConfig: typeof realSiteConfig;
  currently: CurrentlyItem[];
  socialLinks: SocialLink[];
  labCategories: LabCategory[];
  navigation: NavItem[];
}
export const realSourceInput = (): SourceInput => ({
  projects: realProjects, labEntries: realLabEntries, notes: realNotes, siteConfig: realSiteConfig,
  currently: realCurrently, socialLinks: realSocial, labCategories: realLabCategories, navigation: realNavigation,
});

/** Gerçek kaynak dosya yolları (bilgi amaçlı; testte dosyanın var olduğu ve slug'ı içerdiği doğrulanır). */
const PROJECT_FILES: Record<string, string> = {
  yakala: 'src/data/projects/yakala.ts',
  'migration-center': 'src/data/projects/migration-center.ts',
  'ai-lab': 'src/data/projects/ai-lab.ts',
  'coming-soon': 'src/data/projects/index.ts',
};
const NOTE_FILES: Record<string, string> = {
  'kullanisli-ai-asistani': 'src/data/notes/useful-ai-assistant.ts',
  'otomasyon-surtunmeyi-azaltmali': 'src/data/notes/automation-friction.ts',
  'buyuk-kurmadan-once-kucuk-kurmak': 'src/data/notes/building-small.ts',
};
const SITE_FILES: Record<SiteContentKey, string> = {
  site_meta: 'src/data/site.ts', hero: 'src/data/site.ts', about: 'src/data/site.ts', contact: 'src/data/site.ts',
  lab_intro: 'src/data/site.ts', lab_page: 'src/data/site.ts', notes_page: 'src/data/site.ts',
  currently: 'src/data/currently.ts', social: 'src/data/social.ts', lab_categories: 'src/data/lab/categories.ts',
};
export const sourcePathOf = (kind: 'project' | 'lab_entry' | 'note', slug: string): string =>
  (kind === 'project' ? PROJECT_FILES[slug] : kind === 'note' ? NOTE_FILES[slug] : undefined) ??
  `src/data/${kind === 'project' ? 'projects' : kind === 'lab_entry' ? 'lab' : 'notes'}/${slug}.ts`;
export const siteSourcePath = (key: SiteContentKey): string => SITE_FILES[key];

export interface SourceBundle {
  records: SourceRecord[];
  sourceDigest: string;
  notImported: { source: string; reason: string; count: number }[];
  /** kaynak seviyesinde hatalar (kopya slug, eşlenmemiş alan …) */
  globalErrors: string[];
}

function unmapped(obj: object, rules: Record<string, FieldRule>, label: string): string[] {
  return Object.keys(obj).filter((k) => !(k in rules)).map((k) => `${label}: eşlenmemiş kaynak alanı "${k}"`);
}

const issues = (errors: Record<string, string>): string[] => Object.entries(errors).map(([k, v]) => `${k}: ${v}`);

export function buildSource(input: SourceInput = realSourceInput()): SourceBundle {
  const records: SourceRecord[] = [];
  const globalErrors: string[] = [];

  // ── Projects
  input.projects.forEach((p, i) => {
    const errs = unmapped(p, PROJECT_MAP, `project ${p.slug}`);
    if (p.index !== String(i + 1).padStart(2, '0')) errs.push(`project ${p.slug}: index "${p.index}" dizi konumu + 1 ile uyuşmuyor (sort_order'dan türetilemez)`);
    const mapped: ProjectDoc = {
      slug: p.slug, title: p.title, subtitle: p.subtitle, summary: p.description, accent: p.accent, size: p.size, graphic: p.graphic,
      tags: p.tags, coming_soon: p.comingSoon === true, kind: p.kind ?? null, type_label: p.typeLabel ?? null, category: p.category ?? null,
      project_status_label: p.status?.label ?? null, project_status_accent: p.status?.accent ?? null, case_study: p.caseStudy ?? null, sort_order: i,
    };
    const v = validateProjectInput(projectDocToFormValues(mapped) as Record<string, string>, 'publish');
    let doc: Doc = mapped as unknown as Doc;
    if (!v.ok) errs.push(...issues(v.errors).map((e) => `project ${p.slug}: ${e}`));
    else {
      doc = v.value as unknown as Doc;
      if (canonicalize(v.value) !== canonicalize(mapped)) errs.push(`project ${p.slug}: doğrulayıcı çıktısı kaynak ile birebir aynı değil (kayıplı dönüşüm)`);
    }
    const seo: SeoPair | null = p.seo ? { seo_title: p.seo.title, seo_description: p.seo.description } : null;
    records.push({ kind: 'project', key: p.slug, sourcePath: sourcePathOf('project', p.slug), order: i, doc, docHash: docHash('project', doc), seo, seoHash: seo ? hashOf(seo) : null, validation: { ok: errs.length === 0, errors: errs } });
  });

  // ── Lab
  input.labEntries.forEach((e, i) => {
    const errs = unmapped(e, LAB_MAP, `lab ${e.slug}`);
    const mapped: LabDoc = {
      slug: e.slug, title: e.title, short_title: e.shortTitle ?? null, type: e.type, experiment_status: e.status, category: null, summary: e.summary,
      description: e.description, accent: e.accent, featured: e.featured === true, year: e.year, tags: e.tags, story: e.story, sort_order: i,
    };
    const v = validateLabInput(labDocToFormValues(mapped) as Record<string, string>, 'publish');
    let doc: Doc = mapped as unknown as Doc;
    if (!v.ok) errs.push(...issues(v.errors).map((m) => `lab ${e.slug}: ${m}`));
    else {
      doc = v.value as unknown as Doc;
      if (canonicalize(v.value) !== canonicalize(mapped)) errs.push(`lab ${e.slug}: doğrulayıcı çıktısı kaynak ile birebir aynı değil (kayıplı dönüşüm)`);
    }
    records.push({ kind: 'lab_entry', key: e.slug, sourcePath: sourcePathOf('lab_entry', e.slug), order: i, doc, docHash: docHash('lab_entry', doc), seo: null, seoHash: null, validation: { ok: errs.length === 0, errors: errs } });
  });

  // ── Notes (sıra: published_at desc, notes/index.ts ile aynı; sort_order yok)
  input.notes.forEach((n, i) => {
    const errs = unmapped(n, NOTE_MAP, `note ${n.slug}`);
    const mapped: NoteDoc = {
      slug: n.slug, title: n.title, excerpt: n.excerpt, content: n.content, tags: n.tags, accent: n.accent,
      reading_time_minutes: n.readingTime ?? null, published_at: `${n.publishedAt}T00:00:00Z`,
    };
    const v = validateNoteInput(noteDocToFormValues(mapped) as Record<string, string>, 'publish');
    let doc: Doc = mapped as unknown as Doc;
    if (!v.ok) errs.push(...issues(v.errors).map((m) => `note ${n.slug}: ${m}`));
    else {
      doc = v.value as unknown as Doc;
      if (canonicalize(v.value) !== canonicalize(mapped)) errs.push(`note ${n.slug}: doğrulayıcı çıktısı kaynak ile birebir aynı değil (kayıplı dönüşüm)`);
    }
    records.push({ kind: 'note', key: n.slug, sourcePath: sourcePathOf('note', n.slug), order: i, doc, docHash: docHash('note', doc), seo: null, seoHash: null, validation: { ok: errs.length === 0, errors: errs } });
  });
  const dates = input.notes.map((n) => n.publishedAt);
  if (new Set(dates).size !== dates.length) globalErrors.push('notes: aynı yayın tarihine sahip notlar var; sıra (published_at desc) belirsiz olur');
  if (dates.some((d, i) => i > 0 && dates[i - 1] < d)) globalErrors.push('notes: kaynak dizisi published_at azalan sırada değil');

  // ── Site
  const siteErrs = unmapped(input.siteConfig, SITE_CONFIG_MAP, 'siteConfig');
  const docs = siteContentToDocuments({ siteConfig: input.siteConfig, currently: input.currently, socialLinks: input.socialLinks, labCategories: input.labCategories });
  SITE_CONTENT_KEYS.forEach((key, i) => {
    const errs: string[] = key === 'site_meta' ? [...siteErrs] : [];
    const raw = JSON.parse(JSON.stringify(docs[key])) as unknown;
    const v = validateSiteDoc(key, raw);
    let doc: Doc = raw as Doc;
    if (!v.ok) errs.push(`site ${key}: ${v.error}`);
    else {
      doc = v.value as unknown as Doc;
      if (canonicalize(v.value) !== canonicalize(raw)) errs.push(`site ${key}: doğrulayıcı çıktısı kaynak ile birebir aynı değil (kayıplı dönüşüm)`);
    }
    records.push({ kind: 'site_content', key, sourcePath: siteSourcePath(key), order: i, doc, docHash: docHash('site_content', doc), seo: null, seoHash: null, validation: { ok: errs.length === 0, errors: errs } });
  });

  // ── Genel denetimler
  for (const kind of ['project', 'lab_entry', 'note', 'site_content'] as const) {
    const keys = records.filter((r) => r.kind === kind).map((r) => r.key);
    if (new Set(keys).size !== keys.length) globalErrors.push(`${kind}: kaynakta tekrar eden anahtar/slug var`);
  }

  records.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.order - b.order);
  const sourceDigest = sha256(canonicalize(records.map((r) => [r.kind, r.key, r.docHash, r.seoHash])));
  return {
    records,
    sourceDigest,
    notImported: NOT_IMPORTED_BY_DESIGN.map((n) => ({ ...n, count: input.navigation.length })),
    globalErrors,
  };
}
