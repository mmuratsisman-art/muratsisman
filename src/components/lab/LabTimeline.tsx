import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { LabEntry } from '@/types';
import { accentStyle } from '@/lib/accent';
import { pad } from '@/lib/format';
import LabStatusBadge from './LabStatusBadge';

/**
 * "Lab günlüğü": kart ızgarası değil, kesikli bir omurga boyunca dizilen kayıtlar.
 * Selected Projects'in bento düzeninden bilinçli olarak farklı.
 */
export default function LabTimeline({ entries }: { entries: LabEntry[] }) {
  return (
    <ol className="relative">
      {entries.map((e, i) => (
        <li key={e.slug} style={accentStyle(e.accent)} className="relative pb-14 pl-12 last:pb-0 md:pl-20">
          {i < entries.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[15px] top-10 h-[calc(100%-2.5rem)] w-0 border-l-2 border-dashed border-fg/30 md:left-[27px] md:top-16 md:h-[calc(100%-4rem)]"
            />
          )}
          <span
            aria-hidden
            className="absolute left-0 top-1 grid h-8 w-8 place-items-center rounded-full border-2 border-[rgb(var(--card-accent))] bg-bg font-mono text-[10px] font-bold md:h-14 md:w-14 md:text-xs"
          >
            {pad(i + 1)}
          </span>

          <Link href={`/lab/${e.slug}`} className="group block">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] tracking-widest text-muted">
              <span>EXP-{pad(i + 1)}</span>
              <span className="rounded-full border border-fg/30 px-2.5 py-0.5 text-fg">{e.type}</span>
              <span>{e.year}</span>
              <span className="text-fg">
                <LabStatusBadge status={e.status} />
              </span>
            </span>
            <h2 className="mt-3 break-words font-display text-[clamp(1.75rem,6vw,3.5rem)] font-extrabold leading-[0.95] tracking-tight decoration-[rgb(var(--card-accent))] decoration-4 underline-offset-8 group-hover:underline">
              {e.title}
              <ArrowUpRight className="ml-2 inline h-[0.6em] w-[0.6em] align-baseline transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
            </h2>
            <span className="mt-3 block max-w-2xl text-lg text-fg/80">{e.summary}</span>
            <span className="mt-4 flex flex-wrap gap-2">
              {e.tags.map((t) => (
                <span key={t} className="rounded-full border border-fg/25 px-3 py-1 font-mono text-[11px] tracking-wider">
                  {t}
                </span>
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
