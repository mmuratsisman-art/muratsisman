import Link from 'next/link';
import type { NoteEntry } from '@/types';
import { accentStyle } from '@/lib/accent';
import { cn } from '@/lib/cn';
import { formatDate, formatReading, noteReadingMinutes } from '@/lib/format';

interface Props {
  note: NoteEntry;
  variant?: 'full' | 'compact';
  as?: 'h2' | 'h3';
  first?: boolean;
}

/** Editoryal not satırı: solda tarih/okuma süresi, sağda büyük başlık. Kart değil. */
export default function NoteRow({ note, variant = 'full', as: H = 'h2', first = false }: Props) {
  return (
    <li>
      <Link
        href={`/notes/${note.slug}`}
        style={accentStyle(note.accent)}
        className="group grid gap-3 py-8 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-10 md:py-10"
      >
        <span className="font-mono text-xs leading-relaxed tracking-widest text-muted">
          <time dateTime={note.publishedAt}>{formatDate(note.publishedAt)}</time>
          <span className="block">{formatReading(noteReadingMinutes(note))}</span>
        </span>
        <span className="min-w-0">
          <H
            className={cn(
              'break-words font-display font-extrabold leading-[1.02] tracking-tight decoration-[rgb(var(--card-accent))] decoration-4 underline-offset-[0.2em] group-hover:underline',
              first ? 'text-[clamp(2rem,6vw,4rem)]' : 'text-[clamp(1.5rem,4.5vw,2.5rem)]',
            )}
          >
            {note.title}
          </H>
          {variant === 'full' && <span className="mt-4 block max-w-2xl text-lg leading-relaxed text-fg/80">{note.excerpt}</span>}
          <span className="mt-4 flex flex-wrap gap-2">
            {note.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--card-accent))]" />
                {t}
              </span>
            ))}
          </span>
        </span>
      </Link>
    </li>
  );
}
