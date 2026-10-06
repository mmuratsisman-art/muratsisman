export type Accent = 'blue' | 'green' | 'orange' | 'purple';

export interface NavItem { id: string; label: string; href: string }
export interface CurrentlyItem { id: string; label: string; value: string; accent: Accent }

export type ProjectGraphicKind = 'rings' | 'flow' | 'nodes' | 'dots';
export type ProjectSize = 'feature' | 'standard' | 'teaser';

/** Projenin niteliği: kartlarda ve detay sayfasında etiket olarak gösterilir. */
export type ProjectKind = 'personal' | 'work' | 'ai-experiment';

export interface ProjectStatus { label: string; accent: Accent }
export interface ProjectSeo { title: string; description: string }

/* ───── Case study içerik modeli (tamamen data-driven) ───── */

export interface ListItem { title: string; text: string }

export type CaseSectionData =
  | { id: string; heading: string; kind: 'prose'; body: string[] }
  | { id: string; heading: string; kind: 'list'; variant?: 'grid' | 'numbered'; items: ListItem[] };

export type DiagramKind = 'commerce' | 'migration' | 'ai-assist';

export interface DiagramStep { label: string; caption: string; chips?: string[] }
export interface CaseDiagram { kind: DiagramKind; heading: string; steps: DiagramStep[] }

/** AI LAB gibi koleksiyon sayfalarında öne çıkan vaka (ör. Heimdall). Yeni vaka = yeni kayıt. */
export interface FeaturedCaseData {
  id: string;
  name: string;
  typeLabel: string;
  accent: Accent;
  summary?: string;
  sections: CaseSectionData[];
  diagram: CaseDiagram;
  diagramAfter: string;
  tags: string[];
  note?: string;
}

export interface CaseStudy {
  sections: CaseSectionData[];
  tagsHeading?: string;
  tags: string[];
  diagram?: CaseDiagram;
  cases?: FeaturedCaseData[];
  /** Diyagram / vaka bloklarının hangi bölümden sonra render edileceği (section id). */
  slots?: { diagramAfter?: string; casesAfter?: string };
}

export interface Project {
  slug: string;
  index: string;
  title: string;
  subtitle: string;
  description: string;
  accent: Accent;
  size: ProjectSize;
  tags: string[];
  graphic: ProjectGraphicKind;
  comingSoon?: boolean;
  kind?: ProjectKind;
  typeLabel?: string;
  category?: string;
  status?: ProjectStatus;
  seo?: ProjectSeo;
  caseStudy?: CaseStudy;
}

export type CaseStudyProject = Project & {
  kind: ProjectKind;
  typeLabel: string;
  category: string;
  seo: ProjectSeo;
  caseStudy: CaseStudy;
};

/* ───── MURAT/LAB (deneyler) ───── */

export type LabType = 'EXPERIMENT' | 'PROTOTYPE' | 'CONCEPT';
export type LabStatus = 'ACTIVE' | 'EXPLORING' | 'PAUSED' | 'ARCHIVED';

/**
 * Sahibin yönettiği hikâye metni. Başlıklar (WHY IT EXISTS vb.) burada YOK:
 * bunlar şablonun parçası, bkz. components/lab/labTemplate.ts. Boş/eksik alan sayfada gösterilmez.
 */
export interface LabStory {
  why?: string[];
  how?: string[];
  learned?: string[];
  state?: string[];
}

export interface LabEntry {
  slug: string;
  title: string;
  shortTitle?: string;
  type: LabType;
  status: LabStatus;
  /** Tek cümle: liste ve meta description için. */
  summary: string;
  /** Detay sayfasında ilk (öne çıkan) paragraf. */
  description: string;
  tags: string[];
  year: string;
  accent: Accent;
  featured?: boolean;
  story: LabStory;
}

/* ───── Notes ───── */

export type NoteBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; items: string[] };

export interface NoteEntry {
  slug: string;
  title: string;
  excerpt: string;
  /** ISO tarih (YYYY-MM-DD) */
  publishedAt: string;
  /** Dakika. Opsiyonel: boşsa içerikten hesaplanır (bkz. lib/format.ts). */
  readingTime?: number;
  tags: string[];
  accent: Accent;
  content: NoteBlock[];
}

export interface LabCategory { id: string; label: string; accent: Accent }
export interface SocialLink { id: string; label: string; href: string }
