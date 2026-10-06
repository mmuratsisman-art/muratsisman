import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { siteConfig } from '@/data/site';
import { featuredLabEntries, labCategories } from '@/data/lab';
import { dotClass } from '@/lib/accent';
import { pad } from '@/lib/format';
import SectionHeading from '@/components/ui/SectionHeading';
import LabStatusBadge from '@/components/lab/LabStatusBadge';

export default function Lab() {
  const entries = featuredLabEntries(3);
  return (
    <section id="lab" aria-labelledby="lab-title" className="on-color bg-lab py-20 text-white sm:py-28">
      <div className="shell">
        <SectionHeading id="lab-title" eyebrow="MURAT/LAB" title="LAB" />
        <p className="max-w-2xl text-xl leading-snug sm:text-3xl">
          {siteConfig.lab.lines.map((l) => (
            <span key={l} className="block">{l}</span>
          ))}
        </p>

        <ul className="mt-8 flex flex-wrap gap-2.5">
          {labCategories.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass[c.accent]}`} aria-hidden />
              {c.label}
            </li>
          ))}
        </ul>

        <ol className="mt-12 border-b border-white/30">
          {entries.map((e, i) => (
            <li key={e.slug}>
              <Link
                href={`/lab/${e.slug}`}
                className="group grid gap-2 border-t border-white/30 py-5 transition-colors hover:bg-white/5 md:grid-cols-[6rem_minmax(0,1fr)_auto] md:items-center md:gap-6"
              >
                <span className="font-mono text-xs tracking-widest text-white/90">EXP-{pad(i + 1)}</span>
                <span className="min-w-0">
                  <span className="block break-words font-display text-2xl font-bold leading-tight sm:text-3xl">{e.shortTitle ?? e.title}</span>
                  <span className="mt-1 block text-white/90">{e.summary}</span>
                </span>
                <span className="mt-2 flex items-center gap-4 md:mt-0">
                  <LabStatusBadge status={e.status} onColor />
                  <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ol>

        <Link
          href="/lab"
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-acid px-6 py-3.5 font-semibold text-ink transition hover:-translate-y-0.5"
        >
          Tüm deneyler
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
