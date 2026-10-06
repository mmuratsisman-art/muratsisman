import { Fragment } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { caseStudyProjects, getNextProject, getProject, hasCaseStudy } from '@/data/projects';
import { accentStyle } from '@/lib/accent';
import ProjectHero from '@/components/project/ProjectHero';
import SectionShell from '@/components/project/SectionShell';
import SectionBody from '@/components/project/SectionBody';
import FlowDiagram from '@/components/project/FlowDiagram';
import FeaturedCase from '@/components/project/FeaturedCase';
import TagList from '@/components/project/TagList';
import NextProject from '@/components/project/NextProject';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return caseStudyProjects().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project || !hasCaseStudy(project)) return {};
  return {
    title: project.seo.title,
    description: project.seo.description,
    // metadataBase (layout) ile https://muratsisman.com.tr/projects/<slug> olarak çözülür
    alternates: { canonical: `/projects/${project.slug}` },
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export default async function ProjectPage({ params }: Params) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project || !hasCaseStudy(project)) notFound();

  const cs = project.caseStudy;
  const next = getNextProject(project.slug);
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

      <SectionShell
        id="tags"
        heading={cs.tagsHeading ?? 'TECH / CONCEPT TAGS'}
        num={pad(tagsIndex + 1)}
        tone={tagsIndex % 2 === 0 ? 'base' : 'alt'}
      >
        <TagList tags={cs.tags} />
      </SectionShell>

      {next && <NextProject project={next} />}
    </div>
  );
}
