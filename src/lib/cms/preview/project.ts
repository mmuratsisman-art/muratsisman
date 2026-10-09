import type { CaseStudy, CaseStudyProject, Project } from '@/types';
import { projectDocToFormValues } from '../admin/project-form';
import { validateCaseStudy } from '../validate/case-study';
import { validateProjectInput, type ProjectDoc } from '../validate/projects';
import { pad2 } from './common';

/**
 * ProjectDoc (CMS editör belgesi) → public `Project` modeli.
 * `recordToProject` (mappers.ts) ile aynı alan eşlemesi; tek fark: CMS belgesinde `seo_*` YOKTUR → `seo` hiç üretilmez.
 *   summary→description · coming_soon→comingSoon · type_label→typeLabel · case_study→caseStudy · sort_order→index (sıra+1, 2 hane)
 */
export function docToProject(doc: ProjectDoc, caseStudy: CaseStudy | null): Project {
  const p: Project = {
    slug: doc.slug,
    index: pad2(doc.sort_order + 1),
    title: doc.title,
    subtitle: doc.subtitle,
    description: doc.summary,
    accent: doc.accent,
    size: doc.size,
    tags: doc.tags,
    graphic: doc.graphic,
  };
  if (doc.coming_soon) p.comingSoon = true;
  if (doc.kind) p.kind = doc.kind;
  if (doc.type_label) p.typeLabel = doc.type_label;
  if (doc.category) p.category = doc.category;
  if (doc.project_status_label && doc.project_status_accent) p.status = { label: doc.project_status_label, accent: doc.project_status_accent };
  if (caseStudy) p.caseStudy = caseStudy;
  return p;
}

/**
 * Public bileşenler (ProjectHero, NextProject…) `CaseStudyProject` tipi ister; bu tip `seo` zorunlu kılar.
 * Bu bileşenler `seo` alanını HİÇ okumaz (components/ altında `.seo` kullanımı yok; testle doğrulanır).
 * Bu yüzden `seo` yalnızca TİP gereği ve boş değerlerle doldurulur; ekrana veya metadata'ya ASLA yansıtılmaz — SEO uydurulmaz.
 */
export const NO_SEO_FOR_PREVIEW = { title: '', description: '' } as const;

export type ProjectPreviewModel =
  | { kind: 'case-study'; project: CaseStudyProject; warnings: string[] }
  | { kind: 'coming-soon'; project: Project; warnings: string[] }
  | { kind: 'unrenderable'; project: Project; problems: string[]; warnings: string[] };

const FIELD_NAME: Record<string, string> = {
  title: 'Başlık', slug: 'Slug', summary: 'Özet', kind: 'Proje türü', type_label: 'Tür etiketi', category: 'Kategori', case_study: 'Case study',
  subtitle: 'Alt başlık', tags: 'Etiketler', sort_order: 'Sıra', project_status_label: 'Durum etiketi', project_status_accent: 'Durum rengi',
};

/** "Bu haliyle yayınlanır mıydı?" — yalnızca bilgilendirme; önizlemeyi ENGELLEMEZ. */
export function publishWarnings(doc: ProjectDoc): string[] {
  const res = validateProjectInput(projectDocToFormValues(doc), 'publish');
  if (res.ok) return [];
  return Object.entries(res.errors).map(([k, msg]) => `${FIELD_NAME[k] ?? k}: ${msg}`);
}

export function buildProjectPreview(doc: ProjectDoc): ProjectPreviewModel {
  const warnings = publishWarnings(doc);

  if (doc.coming_soon) {
    return { kind: 'coming-soon', project: docToProject(doc, null), warnings };
  }

  const problems: string[] = [];
  let caseStudy: CaseStudy | null = null;
  if (doc.case_study === null) {
    problems.push('Case study yok: public sitede bu proje için detay sayfası oluşmaz (404).');
  } else {
    // Güvenilmeyen jsonb: bileşenlere vermeden önce şekli doğrula (bozuk şekil render'ı çökertebilir).
    const v = validateCaseStudy(doc.case_study);
    if (v.ok) caseStudy = v.value;
    else problems.push(`Case study geçersiz, önizleme çizilemiyor: ${v.error}`);
  }

  const project = docToProject(doc, caseStudy);
  if (caseStudy === null) return { kind: 'unrenderable', project, problems, warnings };

  // Public tip sözleşmesi: kind/typeLabel/category zorunlu. Eksikse UYDURMAYIZ; boş bırakır ve uyarırız.
  const renderable: CaseStudyProject = {
    ...project,
    kind: project.kind as CaseStudyProject['kind'], // eksikse undefined kalır (uydurma değer yok); bileşenler okumaz
    typeLabel: project.typeLabel ?? '',
    category: project.category ?? '',
    seo: { ...NO_SEO_FOR_PREVIEW },
    caseStudy,
  };
  // 'kind' yalnızca tip gereği; ProjectHero/NextProject tarafından okunmaz. Eksikse uyarıda belirtilir (publishWarnings).
  return { kind: 'case-study', project: renderable, warnings };
}
