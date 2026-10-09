import { Fragment } from 'react';
import type { CaseStudyProject, Project } from '@/types';
import { accentStyle } from '@/lib/accent';
import ProjectHero from '@/components/project/ProjectHero';
import SectionShell from '@/components/project/SectionShell';
import SectionBody from '@/components/project/SectionBody';
import FlowDiagram from '@/components/project/FlowDiagram';
import FeaturedCase from '@/components/project/FeaturedCase';
import TagList from '@/components/project/TagList';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Proje detay önizlemesi: public sayfa (`app/(site)/projects/[slug]/page.tsx`) ile AYNI bileşenler ve aynı sıra.
 * Fark: "Sonraki proje" bölümü yoktur (diğer projelerin taslakları okunmaz/sızdırılmaz).
 */
export function CaseStudyPreview({ project }: { project: CaseStudyProject }) {
  const cs = project.caseStudy;
  const tagsIndex = cs.sections.length;
  return (
    <div style={accentStyle(project.accent)}>
      <ProjectHero project={project} />

      {cs.sections.map((s, i) => (
        <Fragment key={s.id}>
          <SectionShell id={s.id} heading={s.heading} num={pad(i + 1)} tone={i % 2 === 0 ? 'base' : 'alt'}>
            <SectionBody section={s} />
          </SectionShell>
          {cs.slots?.diagramAfter === s.id && cs.diagram && <FlowDiagram diagram={cs.diagram} id="flow" />}
          {cs.slots?.casesAfter === s.id && cs.cases?.map((c) => <FeaturedCase key={c.id} c={c} />)}
        </Fragment>
      ))}

      <SectionShell id="tags" heading={cs.tagsHeading ?? 'TECH / CONCEPT TAGS'} num={pad(tagsIndex + 1)} tone={tagsIndex % 2 === 0 ? 'base' : 'alt'}>
        <TagList tags={cs.tags} />
      </SectionShell>
    </div>
  );
}

/** "Çok yakında" projelerin public detay sayfası yoktur; yalnızca ana sayfadaki teaser kartı vardır. */
export function ComingSoonPreview({ project }: { project: Project }) {
  return (
    <div style={accentStyle(project.accent)} className="shell py-16">
      <p className="font-mono text-xs tracking-widest text-muted">{project.index} · COMING SOON</p>
      <h1 className="mt-4 break-words font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">{project.title}</h1>
      <p className="mt-3 text-xl text-muted">{project.subtitle}</p>
      <p className="mt-8 max-w-xl rounded-xl border border-dashed border-fg/25 px-4 py-3 text-sm text-muted">
        “Çok yakında” projelerinin public sitede detay sayfası yoktur (yalnızca ana sayfada teaser kartı). Burada yalnızca kart bilgileri gösterilir.
      </p>
    </div>
  );
}
