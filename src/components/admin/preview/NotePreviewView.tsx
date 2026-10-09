import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { NoteEntry } from '@/types';
import { accentStyle } from '@/lib/accent';
import { formatDate, formatReading } from '@/lib/format';
import NoteBody from '@/components/notes/NoteBody';

/**
 * Not önizleme görünümü. Public sayfa `app/(site)/notes/[slug]/page.tsx` düzenini izler (gövde: ortak NoteBody).
 * "Sonraki not" bölümü yoktur. Yayın tarihi atanmamışsa tarih UYDURULMAZ.
 */
export default function NotePreviewView({ note, hasDate, readingMinutes }: { note: NoteEntry; hasDate: boolean; readingMinutes: number }) {
  return (
    <div style={accentStyle(note.accent)}>
      <article className="bg-bg pb-20 pt-12 sm:pb-28 sm:pt-20">
        <header className="shell">
          <Link href="/notes" className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden /> NOTES
          </Link>
          <h1 className="mt-10 max-w-4xl break-words font-display text-[clamp(2rem,7vw,4.75rem)] font-extrabold leading-[1.02] tracking-tight">{note.title}</h1>
          <p className="mt-6 max-w-2xl text-xl leading-snug text-muted sm:text-2xl">{note.excerpt}</p>
          <span aria-hidden className="mt-8 block h-1 w-16 rounded-full bg-[rgb(var(--card-accent))]" />
        </header>

        <div className="shell mt-12 grid gap-8 lg:grid-cols-[11rem_minmax(0,40rem)] lg:gap-14">
          <aside aria-label="Not bilgisi" className="font-mono text-xs leading-relaxed tracking-widest text-muted lg:sticky lg:top-24 lg:self-start">
            <p>{hasDate ? <time dateTime={note.publishedAt}>{formatDate(note.publishedAt)}</time> : 'Yayın tarihi yok (yayınlanınca atanır)'}</p>
            <p className="mt-1">{formatReading(readingMinutes)}</p>
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
            {note.content.length > 0 ? <NoteBody blocks={note.content} /> : <p className="text-sm text-muted">(içerik boş)</p>}
          </div>
        </div>
      </article>
    </div>
  );
}
