import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { CaseStudyProject } from '@/types';
import StatusPill from '@/components/ui/StatusPill';
import ProjectGraphic from '@/components/ui/ProjectGraphic';

export default function ProjectHero({ project }: { project: CaseStudyProject }) {
  return (
    <section aria-labelledby="project-title" className="dot-grid relative overflow-hidden bg-hero">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-8 w-[70%] max-w-[520px] text-[rgb(var(--card-accent))] opacity-20 sm:opacity-30"
      >
        <ProjectGraphic kind={project.graphic} />
      </div>

      <div className="shell relative py-12 sm:py-20 lg:py-28">
        <Link href="/#projects" className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> PROJELER
        </Link>

        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3 font-mono text-xs tracking-widest">
          <span className="text-muted">{project.index}</span>
          <span className="rounded-full border border-fg/30 px-3 py-1">{project.typeLabel}</span>
          {project.status && <StatusPill label={project.status.label} accent={project.status.accent} />}
        </div>

        <h1
          id="project-title"
          className="mt-6 font-display text-[clamp(2.5rem,12vw,9rem)] font-extrabold leading-[0.85] tracking-tighter"
        >
          {project.title}
        </h1>
        <p className="mt-5 font-mono text-xs tracking-[0.18em] text-muted sm:text-sm">{project.subtitle.toUpperCase()}</p>
        <p className="mt-8 max-w-2xl text-xl leading-snug sm:text-2xl">{project.description}</p>

        <ul className="mt-8 flex flex-wrap gap-2">
          {project.tags.map((t) => (
            <li key={t} className="rounded-full border border-fg/25 bg-surface/70 px-3 py-1 font-mono text-[11px] tracking-wider">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
