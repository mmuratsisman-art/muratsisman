import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { getLabEntries, getLabEntry, getNextLabEntry, staticParamSlugs } from '@/lib/content';
import { ensureDynamicIfCms } from '@/lib/content/dynamic';
import { accentStyle } from '@/lib/accent';
import { pad } from '@/lib/format';
import LabStatusBadge from '@/components/lab/LabStatusBadge';
import { LAB_EXPLORING_LABEL, LAB_STORY_SLOTS } from '@/components/lab/labTemplate';

type Params = { params: Promise<{ slug: string }> };

const isCmsBuild = (process.env.CONTENT_SOURCE ?? '').trim().toLowerCase() === 'cms';
export const generateStaticParams = isCmsBuild
  ? undefined
  : () => staticParamSlugs('lab').map((slug) => ({ slug }));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getLabEntry(slug);
  if (!entry) return {};
  return {
    title: entry.title,
    description: entry.summary,
    alternates: { canonical: `/lab/${entry.slug}` },
  };
}

export default async function LabEntryPage({ params }: Params) {
  await ensureDynamicIfCms();
  const { slug } = await params;
  const entry = await getLabEntry(slug);
  if (!entry) notFound();

  const labEntries = await getLabEntries();
  const index = labEntries.findIndex((e) => e.slug === entry.slug);
  const next = await getNextLabEntry(entry.slug);
  // Şablon sırası + sahibin metni; boş alanlar atlanır
  const story = LAB_STORY_SLOTS.map((slot) => ({ ...slot, body: entry.story[slot.key] ?? [] })).filter((slot) => slot.body.length > 0);

  return (
    <div style={accentStyle(entry.accent)}>
      <header className="dot-grid relative overflow-hidden bg-hero">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border-[3px] border-[rgb(var(--card-accent))] opacity-50 sm:h-96 sm:w-96" />
        <div aria-hidden className="pointer-events-none absolute right-14 top-40 h-5 w-5 rounded-full bg-[rgb(var(--card-accent))] sm:right-36 sm:top-52" />
        <div className="shell relative py-12 sm:py-20">
          <Link href="/lab" className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden /> LAB
          </Link>
          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3 font-mono text-xs tracking-widest">
            <span className="text-muted">EXP-{pad(index + 1)}</span>
            <span className="rounded-full border border-fg/30 px-3 py-1">{entry.type}</span>
            <LabStatusBadge status={entry.status} />
          </div>
          <h1 className="mt-6 break-words font-display text-[clamp(1.75rem,8.5vw,6rem)] font-extrabold leading-[0.9] tracking-tighter">
            {entry.title}
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-snug sm:text-2xl">{entry.summary}</p>
        </div>
      </header>

      <div className="bg-bg">
        <div className="shell grid gap-10 py-12 sm:py-16 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
          <aside aria-label="Deney özeti" className="lg:sticky lg:top-24 lg:self-start">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 font-mono text-xs tracking-widest lg:grid-cols-1">
              <div>
                <dt className="text-muted">TYPE</dt>
                <dd className="mt-1">{entry.type}</dd>
              </div>
              <div>
                <dt className="text-muted">STATUS</dt>
                <dd className="mt-1">
                  <LabStatusBadge status={entry.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">YEAR</dt>
                <dd className="mt-1">{entry.year}</dd>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <dt className="text-muted">TAGS</dt>
                <dd className="mt-2">
                  <ul className="flex flex-wrap gap-2">
                    {entry.tags.map((t) => (
                      <li key={t} className="rounded-full border border-fg/25 px-3 py-1 text-[11px] tracking-wider">
                        {t}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </aside>

          <div className="min-w-0 max-w-2xl space-y-12">
            <section aria-labelledby="exploring-title">
              <p aria-hidden className="font-mono text-xs tracking-widest text-muted">01</p>
              <h2 id="exploring-title" className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {LAB_EXPLORING_LABEL}
              </h2>
              <p className="mt-4 text-xl font-medium leading-snug sm:text-2xl">{entry.description}</p>
            </section>

            {story.map((s, i) => (
              <section key={s.key} aria-labelledby={`${s.key}-title`}>
                <p aria-hidden className="font-mono text-xs tracking-widest text-muted">{pad(i + 2)}</p>
                <h2 id={`${s.key}-title`} className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {s.label}
                </h2>
                <div className="mt-4 space-y-4">
                  {s.body.map((p, j) => (
                    <p key={j} className="text-lg leading-relaxed text-fg/85">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      {next && (
        <section aria-labelledby="next-lab-title" className="bg-surface2 py-14 sm:py-20" style={accentStyle(next.accent)}>
          <div className="shell">
            <h2 id="next-lab-title" className="font-mono text-xs font-normal tracking-widest text-muted">
              SONRAKİ DENEY
            </h2>
            <Link
              href={`/lab/${next.slug}`}
              className="group mt-5 flex flex-col items-start gap-5 border-t-2 border-fg/25 pt-6 transition-colors hover:border-[rgb(var(--card-accent))] sm:flex-row sm:items-end sm:justify-between"
            >
              <span className="min-w-0 break-words font-display text-[clamp(1.75rem,6vw,3.5rem)] font-extrabold leading-[0.95] tracking-tight">
                {next.title}
              </span>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-fg/25 transition group-hover:border-transparent group-hover:bg-[rgb(var(--card-accent))] group-hover:text-ink">
                <ArrowUpRight className="h-5 w-5" aria-hidden />
              </span>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
