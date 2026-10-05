import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Project } from '@/types';
import { accentVar } from '@/lib/accent';
import { cn } from '@/lib/cn';
import ProjectGraphic from './ProjectGraphic';

const sizeClass: Record<Project['size'], string> = {
  feature: 'md:col-span-7 md:row-span-2 min-h-[380px] md:min-h-[460px]',
  standard: 'md:col-span-5 min-h-[220px]',
  teaser: 'md:col-span-12 min-h-[150px] border-dashed',
};

const graphicClass: Record<Project['size'], string> = {
  feature: 'w-[62%] max-w-[380px] -right-8 -top-8',
  standard: 'w-[46%] max-w-[200px] -right-4 -top-4',
  teaser: 'w-[130px] right-6 top-1/2 -translate-y-1/2',
};

export default function ProjectCard({ project }: { project: Project }) {
  const style = { ['--card-accent' as string]: accentVar[project.accent] } as CSSProperties;
  const base = cn('group project-card relative flex flex-col overflow-hidden rounded-3xl border border-fg/15 bg-card p-6 sm:p-8', sizeClass[project.size]);

  const content = (
    <>
      <div className={cn('pointer-events-none absolute opacity-80', graphicClass[project.size])} style={{ color: 'rgb(var(--card-accent))' }}>
        <ProjectGraphic kind={project.graphic} />
      </div>

      <div className="relative flex items-start justify-between gap-4">
        <span className="font-mono text-xs tracking-widest text-muted">{project.comingSoon ? 'SOON' : project.index}</span>
        {!project.comingSoon && (
          <span className="grid h-11 w-11 place-items-center rounded-full border border-fg/25 transition group-hover:border-transparent group-hover:bg-[rgb(var(--card-accent))] group-hover:text-ink">
            <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </span>
        )}
      </div>

      <div className="relative mt-auto pt-10">
        <h3 className={cn('font-display font-extrabold leading-none tracking-tight', project.size === 'feature' ? 'text-5xl sm:text-7xl' : 'text-3xl sm:text-4xl')}>
          {project.title}
        </h3>
        <p className="mt-3 text-base text-muted sm:text-lg">{project.subtitle}</p>
        {project.size === 'feature' && project.description && <p className="mt-4 max-w-md text-base">{project.description}</p>}
        {project.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {project.tags.map((t) => (
              <li key={t} className="rounded-full border border-fg/20 px-3 py-1 font-mono text-[11px] tracking-wider">{t}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  if (project.comingSoon) {
    return <div className={base} style={style}>{content}</div>;
  }
  return (
    <Link href={`/projects/${project.slug}`} className={base} style={style} aria-label={`${project.title} — ${project.subtitle}`}>
      {content}
    </Link>
  );
}
