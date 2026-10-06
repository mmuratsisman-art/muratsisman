import type { CaseStudyProject, Project } from '@/types';
import { yakala } from './yakala';
import { migrationCenter } from './migration-center';
import { aiLab } from './ai-lab';

const comingSoon: Project = {
  slug: "coming-soon",
  index: "04",
  title: "COMING SOON",
  subtitle: "Yeni bir proje yolda.",
  description: "",
  accent: "orange",
  size: "teaser",
  tags: [],
  graphic: "dots",
  comingSoon: true,
};

/** Yeni proje eklemek: ./<slug>.ts dosyası oluştur, buraya ekle. */
export const projects: Project[] = [yakala, migrationCenter, aiLab, comingSoon];

export const hasCaseStudy = (p: Project): p is CaseStudyProject => !p.comingSoon && !!p.caseStudy;

export const caseStudyProjects = (): CaseStudyProject[] => projects.filter(hasCaseStudy);

export const getProject = (slug: string): Project | undefined => projects.find((p) => p.slug === slug);

/** Bir sonraki gerçek proje (coming-soon atlanır, sona gelince başa döner). */
export function getNextProject(slug: string): CaseStudyProject | undefined {
  const list = caseStudyProjects();
  const i = list.findIndex((p) => p.slug === slug);
  return i === -1 ? undefined : list[(i + 1) % list.length];
}
