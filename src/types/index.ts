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

export interface NoteItem {
  slug: string;
  title: string;
  category: 'AI' | 'Infrastructure' | 'Web' | 'Ideas';
  accent: Accent;
}
export interface LabCategory { id: string; label: string; accent: Accent }
export interface SocialLink { id: string; label: string; href: string }
