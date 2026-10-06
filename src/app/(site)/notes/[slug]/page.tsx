import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { getNextNote, getNote, notes } from '@/data/notes';
import { accentStyle } from '@/lib/accent';
import { formatDate, formatReading, noteReadingMinutes } from '@/lib/format';
import NoteBody from '@/components/notes/NoteBody';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return notes.map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const note = getNote(slug);
  if (!note) return {};
  return {
    title: note.title,
    description: note.excerpt,
    alternates: { canonical: `/notes/${note.slug}` },
  };
}

export default async function NotePage({ params }: Params) {
  const { slug } = await params;
  const note = getNote(slug);
  if (!note) notFound();
  const next = getNextNote(note.slug);

  return (
    <div style={accentStyle(note.accent)}>
      <article className="bg-bg pb-20 pt-12 sm:pb-28 sm:pt-20">
        <header className="shell">
          <Link href="/notes" className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden /> NOTES
          </Link>
          <h1 className="mt-10 max-w-4xl break-words font-display text-[clamp(2rem,7vw,4.75rem)] font-extrabold leading-[1.02] tracking-tight">
            {note.title}
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-snug text-muted sm:text-2xl">{note.excerpt}</p>
          <span aria-hidden className="mt-8 block h-1 w-16 rounded-full bg-[rgb(var(--card-accent))]" />
        </header>

        <div className="shell mt-12 grid gap-8 lg:grid-cols-[11rem_minmax(0,40rem)] lg:gap-14">
          <aside aria-label="Not bilgisi" className="font-mono text-xs leading-relaxed tracking-widest text-muted lg:sticky lg:top-24 lg:self-start">
            <p>
              <time dateTime={note.publishedAt}>{formatDate(note.publishedAt)}</time>
            </p>
            <p className="mt-1">{formatReading(noteReadingMinutes(note))}</p>
            <ul className="mt-4 flex flex-wrap gap-2 lg:flex-col lg:gap-1.5">
              {note.tags.map((t) => (
                <li key={t} className="inline-flex items-center gap-2 text-fg">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--card-accent))]" />
                  {t}
                </li>
              ))}
            </ul>
          </aside>
          <div className="min-w-0">
            <NoteBody blocks={note.content} />
          </div>
        </div>
      </article>

      {next && next.slug !== note.slug && (
        <section aria-labelledby="next-note-title" className="bg-surface2 py-14 sm:py-20" style={accentStyle(next.accent)}>
          <div className="shell">
            <h2 id="next-note-title" className="font-mono text-xs font-normal tracking-widest text-muted">
              SONRAKİ NOT
            </h2>
            <Link
              href={`/notes/${next.slug}`}
              className="group mt-5 flex flex-col items-start gap-5 border-t-2 border-fg/25 pt-6 transition-colors hover:border-[rgb(var(--card-accent))] sm:flex-row sm:items-end sm:justify-between"
            >
              <span className="min-w-0 break-words font-display text-[clamp(1.5rem,5vw,3rem)] font-extrabold leading-[1.02] tracking-tight">
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
