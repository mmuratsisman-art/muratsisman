import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Project } from '@/types';
import { accentStyle } from '@/lib/accent';

export default function NextProject({ project }: { project: Project }) {
  return (
    <section aria-labelledby="next-title" className="bg-bg py-16 sm:py-24">
      <div className="shell">
        <h2 id="next-title" className="font-mono text-xs font-normal tracking-widest text-muted">
          NEXT PROJECT
        </h2>
        <Link
          href={`/projects/${project.slug}`}
          style={accentStyle(project.accent)}
          className="group mt-6 flex flex-col items-start gap-6 border-t-2 border-fg/25 pt-8 transition-colors hover:border-[rgb(var(--card-accent))] sm:flex-row sm:items-end sm:justify-between"
        >
          <span className="min-w-0">
            <span className="block font-display text-[clamp(2.25rem,9vw,6rem)] font-extrabold leading-[0.9] tracking-tighter">
              {project.title}
            </span>
            <span className="mt-3 block text-lg text-muted">{project.subtitle}</span>
          </span>
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-fg/25 transition group-hover:border-transparent group-hover:bg-[rgb(var(--card-accent))] group-hover:text-ink">
            <ArrowUpRight className="h-6 w-6" aria-hidden />
          </span>
        </Link>
      </div>
    </section>
  );
}
